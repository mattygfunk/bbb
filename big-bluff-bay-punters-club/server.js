const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');
const TIP_EDIT_DEADLINE_ISO = process.env.TIP_EDIT_DEADLINE_ISO || '2026-02-14T15:00:00+11:00';

const DEFAULT_FIXTURES = [
  { id: 'f1', date: 'Sat 14 Feb, 3:19 PM', event: 'Next Meet', track: 'Pinjarra', raceCount: 12 }
];

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const store = {
      users: [{ id: crypto.randomUUID(), username: 'admin', passwordHash: adminHash, role: 'admin', createdAt: Date.now() }],
      fixtures: DEFAULT_FIXTURES,
      raceResults: {},
      bossesBet: { legs: [], selections: {}, updatedAt: null, updatedBy: null },
      buyInVotes: {},
      archiveRounds: [],
      tipEditDeadlineMs: null,
      tips: [
        seedTip('Macca', 'R3', 'Storm Ledger', 'approved'),
        seedTip('Jess', 'R5', 'Bayline Belle', 'approved'),
        seedTip('Rico', 'R7', 'Cash Cascade', 'approved')
      ]
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    return;
  }

  // Lightweight migration from v3 scrypt hash format (salt:hash hex)
  const store = readStore();
  let changed = false;
  for (const user of store.users || []) {
    if (typeof user.passwordHash === 'string' && /^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(user.passwordHash)) {
      user.passwordHash = bcrypt.hashSync('admin123', 10);
      changed = true;
    }
  }
  if (!Array.isArray(store.fixtures) || store.fixtures.length === 0) {
    store.fixtures = DEFAULT_FIXTURES;
    changed = true;
  }
  for (const f of store.fixtures || []) {
    if (typeof f.raceCount !== 'number' || Number.isNaN(f.raceCount)) {
      f.raceCount = 12;
      changed = true;
    }
  }
  if (!store.raceResults || typeof store.raceResults !== 'object') {
    store.raceResults = {};
    changed = true;
  }
  if (!store.bossesBet || typeof store.bossesBet !== 'object') {
    store.bossesBet = { legs: [], selections: {}, updatedAt: null, updatedBy: null };
    changed = true;
  }
  if (!store.buyInVotes || typeof store.buyInVotes !== 'object') {
    store.buyInVotes = {};
    changed = true;
  }
  if (!Array.isArray(store.archiveRounds)) {
    store.archiveRounds = [];
    changed = true;
  }
  if (typeof store.tipEditDeadlineMs !== 'number') {
    store.tipEditDeadlineMs = null;
    changed = true;
  }
  // V6 migration: legacy pending tips become approved (auto-accept behavior)
  for (const tip of store.tips || []) {
    if (tip.status === 'pending') {
      tip.status = 'approved';
      changed = true;
    }
    if (typeof tip.paid !== 'boolean') {
      tip.paid = false;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function seedTip(member, race, selection, status) {
  return { id: crypto.randomUUID(), member, race, selection, status, paid: false, createdAt: Date.now() - Math.floor(Math.random() * 5000000) };
}

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function parseRunnerList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseSubs(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [scratched, substitute] = pair.split('>').map((v) => String(v || '').trim());
      return { scratched, substitute };
    })
    .filter((x) => x.scratched && x.substitute);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

function applySub(selection, raceResult) {
  const subs = raceResult?.substitutions || [];
  const hit = subs.find((s) => String(s.scratched) === String(selection));
  return hit ? String(hit.substitute) : String(selection);
}

function computeBossesBetProgress(store) {
  const bb = store.bossesBet || { legs: [], selections: {} };
  const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
  const allRaces = Array.from({ length: raceCount }, (_, i) => `R${i + 1}`);
  const activeLegs = new Set(Array.isArray(bb.legs) && bb.legs.length ? bb.legs : allRaces);

  const result = allRaces.map((race) => {
    const inMulti = activeLegs.has(race);
    const pick = String(bb.selections?.[race] || '').trim();
    const rr = store.raceResults?.[race];
    if (!inMulti) return { race, selection: pick, inMulti: false, status: 'inactive' };
    if (!pick) return { race, selection: '', inMulti: true, status: 'pending' };
    if (!rr) return { race, selection: pick, inMulti: true, status: 'pending' };
    const eff = applySub(pick, rr);
    const placed = [...(rr.first || []), ...(rr.second || []), ...(rr.third || [])].map(String).includes(eff);
    return { race, selection: pick, effectiveSelection: eff, inMulti: true, status: placed ? 'placed' : 'missed' };
  });

  const active = result.filter((l) => l.inMulti);
  const anyMiss = active.some((l) => l.status === 'missed');
  const allPlaced = active.length > 0 && active.every((l) => l.status === 'placed');
  const allResolved = active.every((l) => l.status === 'placed' || l.status === 'missed');
  const overall = anyMiss ? 'lost' : allPlaced && allResolved ? 'landed' : 'live';

  return { ...bb, legs: [...activeLegs], progress: result, overall };
}

function computeLadder(store) {
  const score = new Map();

  const addPoints = (member, pts, isWinner) => {
    const row = score.get(member) || { member, points: 0, winners: 0 };
    row.points += pts;
    if (isWinner) row.winners += 1;
    score.set(member, row);
  };

  for (const tip of store.tips || []) {
    if (tip.status !== 'approved') continue;
    const race = String(tip.race || '');
    const rr = store.raceResults?.[race];
    if (!rr) continue;

    const sel = applySub(String(tip.selection || tip.horse || ''), rr);
    const isWinner = (rr.first || []).map(String).includes(sel);
    let pts = 0;
    if (isWinner) pts = 3;
    else if ((rr.second || []).map(String).includes(sel)) pts = 2;
    else if ((rr.third || []).map(String).includes(sel)) pts = 1;
    addPoints(String(tip.member || 'Unknown'), pts, isWinner);
  }

  return [...score.values()]
    .sort((a, b) => b.points - a.points || b.winners - a.winners || a.member.localeCompare(b.member))
    .map((r, i) => ({ rank: i + 1, member: r.member, points: r.points, winners: r.winners, correct: r.winners }));
}

function getLastScoredRace(store) {
  const races = Object.entries(store.raceResults || {})
    .filter(([, rr]) => Array.isArray(rr?.first) || Array.isArray(rr?.second) || Array.isArray(rr?.third))
    .filter(([, rr]) => (rr.first || []).length || (rr.second || []).length || (rr.third || []).length)
    .map(([race]) => Number(String(race || 'R0').slice(1)))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!races.length) return null;
  const max = Math.max(...races);
  return `R${max}`;
}

function computeMemberBreakdown(store, memberName) {
  const target = String(memberName || '').trim().toLowerCase();
  if (!target) return { member: memberName, totalPoints: 0, winners: 0, races: [] };

  const rows = [];
  let totalPoints = 0;
  let winners = 0;

  const myTips = (store.tips || [])
    .filter((t) => t.status === 'approved' && String(t.member || '').trim().toLowerCase() === target)
    .sort((a, b) => Number(String(a.race || 'R0').slice(1)) - Number(String(b.race || 'R0').slice(1)));

  for (const tip of myTips) {
    const race = String(tip.race || '');
    const rr = store.raceResults?.[race];
    const selection = String(tip.selection || tip.horse || '');
    if (!rr) {
      rows.push({ race, selection, points: 0, outcome: 'pending' });
      continue;
    }

    const eff = applySub(selection, rr);
    const first = (rr.first || []).map(String);
    const second = (rr.second || []).map(String);
    const third = (rr.third || []).map(String);

    let points = 0;
    let outcome = 'missed';
    if (first.includes(eff)) { points = 3; outcome = 'winner'; winners += 1; }
    else if (second.includes(eff)) { points = 2; outcome = 'second'; }
    else if (third.includes(eff)) { points = 1; outcome = 'third'; }

    totalPoints += points;
    rows.push({ race, selection, effectiveSelection: eff, points, outcome });
  }

  return { member: memberName, totalPoints, winners, races: rows };
}

function getMelbourneOffsetMinutes(dateLike) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Melbourne',
    timeZoneName: 'shortOffset'
  }).formatToParts(dateLike);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
  const m = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm);
}

function getMelbourneParts(dateLike) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(dateLike);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday')
  };
}

function nextSaturdayNoonMelbourneMs() {
  const now = new Date();
  const nowParts = getMelbourneParts(now);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const nowIdx = weekdays.indexOf(nowParts.weekday);
  const satIdx = 6;
  let addDays = (satIdx - nowIdx + 7) % 7;
  if (addDays === 0 && nowParts.hour >= 12) addDays = 7;

  const targetProbeUtc = new Date(now.getTime() + addDays * 24 * 60 * 60 * 1000);
  const targetParts = getMelbourneParts(targetProbeUtc);

  const offsetMin = getMelbourneOffsetMinutes(new Date(Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day, 12, 0, 0)));
  return Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day, 12, 0, 0) - offsetMin * 60 * 1000;
}

function canEditTipsNow(store) {
  const manual = Number(store?.tipEditDeadlineMs || 0);
  if (manual > 0) return Date.now() <= manual;
  const deadline = new Date(TIP_EDIT_DEADLINE_ISO).getTime();
  if (Number.isNaN(deadline)) return true;
  return Date.now() <= deadline;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    const isSecure = req.secure || xfProto === 'https';
    const host = String(req.headers.host || '');
    if (!host) return next();

    const hostNoPort = host.split(':')[0].toLowerCase();
    const canonicalHost = hostNoPort.startsWith('www.') ? hostNoPort.slice(4) : hostNoPort;

    if (!isSecure || hostNoPort !== canonicalHost) {
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    }
    return next();
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '200kb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.use(express.static(__dirname));

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: '5.0.1' }));

  app.post('/api/register', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-24 chars using letters, numbers, _ or -' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const store = readStore();
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'member',
      createdAt: Date.now()
    };

    store.users.push(user);
    writeStore(store);
    return res.status(201).json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post('/api/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const store = readStore();
    const user = store.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const safeUser = { id: user.id, username: user.username, role: user.role };
    return res.json({ ok: true, token: issueToken(safeUser), user: safeUser });
  });

  app.post('/api/logout', auth, (_req, res) => res.json({ ok: true }));
  app.get('/api/me', auth, (req, res) => res.json({ user: { id: req.user.sub, username: req.user.username, role: req.user.role } }));

  app.get('/api/fixtures', (_req, res) => {
    const store = readStore();
    return res.json({ fixtures: store.fixtures || [] });
  });

  app.get('/api/results', auth, adminOnly, (_req, res) => {
    const store = readStore();
    return res.json({ raceResults: store.raceResults || {} });
  });

  app.get('/api/bosses-bet', (_req, res) => {
    const store = readStore();
    return res.json({ bossesBet: computeBossesBetProgress(store) });
  });

  function getBuyInVotePayload(req) {
    const store = readStore();
    const votes = store.buyInVotes || {};
    const counts = { '10': 0, '20': 0, '30': 0 };
    Object.values(votes).forEach((v) => {
      const key = String(v);
      if (counts[key] !== undefined) counts[key] += 1;
    });

    let myVote = null;
    const token = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    if (token) {
      try {
        const u = jwt.verify(token, JWT_SECRET);
        myVote = votes[String(u.username || '').toLowerCase()] || null;
      } catch {}
    }

    return { counts, myVote };
  }

  function saveBuyInVote(req, res) {
    const amount = String(req.body.amount || '').trim();
    if (!['10', '20', '30'].includes(amount)) return res.status(400).json({ error: 'Amount must be 10, 20, or 30' });

    const store = readStore();
    if (!store.buyInVotes || typeof store.buyInVotes !== 'object') store.buyInVotes = {};
    store.buyInVotes[String(req.user.username || '').toLowerCase()] = amount;
    writeStore(store);

    const counts = { '10': 0, '20': 0, '30': 0 };
    Object.values(store.buyInVotes).forEach((v) => {
      const key = String(v);
      if (counts[key] !== undefined) counts[key] += 1;
    });

    return res.json({ ok: true, myVote: amount, counts });
  }

  // canonical routes
  app.get('/api/buyin-votes', (req, res) => res.json(getBuyInVotePayload(req)));
  app.get('/api/buyin-votes/me', auth, (req, res) => {
    const store = readStore();
    const votes = store.buyInVotes || {};
    const counts = { '10': 0, '20': 0, '30': 0 };
    Object.values(votes).forEach((v) => {
      const key = String(v);
      if (counts[key] !== undefined) counts[key] += 1;
    });
    const myVote = votes[String(req.user.username || '').toLowerCase()] || null;
    return res.json({ counts, myVote });
  });
  app.post('/api/buyin-votes', auth, saveBuyInVote);
  // compatibility aliases
  app.get('/api/buyin-vote', (req, res) => res.json(getBuyInVotePayload(req)));
  app.get('/api/buy-in-votes', (req, res) => res.json(getBuyInVotePayload(req)));
  app.get('/api/buyin-vote/me', auth, (req, res) => {
    const store = readStore();
    const myVote = (store.buyInVotes || {})[String(req.user.username || '').toLowerCase()] || null;
    return res.json({ myVote });
  });
  app.post('/api/buyin-vote', auth, saveBuyInVote);
  app.post('/api/buy-in-votes', auth, saveBuyInVote);

  app.put('/api/bosses-bet', auth, adminOnly, (req, res) => {
    const store = readStore();
    const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));

    const legsRaw = Array.isArray(req.body.legs) ? req.body.legs : ['R9', 'R10', 'R11', 'R12'];
    const legs = legsRaw.map((r) => String(r).toUpperCase()).filter((r) => validRaces.has(r));
    if (!legs.length) return res.status(400).json({ error: 'At least one valid leg is required' });

    const selections = {};
    const inSel = req.body.selections && typeof req.body.selections === 'object' ? req.body.selections : {};
    legs.forEach((race) => { selections[race] = String(inSel[race] || '').trim(); });

    store.bossesBet = {
      legs,
      selections,
      updatedAt: Date.now(),
      updatedBy: req.user.username
    };

    writeStore(store);
    return res.json({ ok: true, bossesBet: computeBossesBetProgress(store) });
  });

  app.delete('/api/bosses-bet', auth, adminOnly, (req, res) => {
    const store = readStore();
    store.bossesBet = { legs: [], selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };
    writeStore(store);
    return res.json({ ok: true, bossesBet: computeBossesBetProgress(store) });
  });

  app.delete('/api/bosses-bet/results', auth, adminOnly, (req, res) => {
    const store = readStore();
    const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
    const allRaces = Array.from({ length: raceCount }, (_, i) => `R${i + 1}`);

    // Hard reset all meet results + bosses selections to avoid stale "missed" states.
    store.raceResults = {};
    store.bossesBet = { legs: allRaces, selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };

    writeStore(store);
    return res.json({ ok: true, clearedLegs: allRaces, bossesBet: computeBossesBetProgress(store) });
  });

  app.put('/api/results/:race', auth, adminOnly, (req, res) => {
    const race = String(req.params.race || '').toUpperCase();
    const store = readStore();
    const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });

    const first = parseRunnerList(req.body.first);
    const second = parseRunnerList(req.body.second);
    const third = parseRunnerList(req.body.third);
    const substitutions = parseSubs(req.body.substitutions);

    if (!store.raceResults || typeof store.raceResults !== 'object') store.raceResults = {};
    store.raceResults[race] = {
      first,
      second,
      third,
      substitutions,
      updatedAt: Date.now(),
      updatedBy: req.user.username
    };

    writeStore(store);
    return res.json({ ok: true, race, result: store.raceResults[race] });
  });

  app.delete('/api/results/:race', auth, adminOnly, (req, res) => {
    const race = String(req.params.race || '').toUpperCase();
    const store = readStore();
    const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });

    if (!store.raceResults || typeof store.raceResults !== 'object') store.raceResults = {};
    delete store.raceResults[race];
    writeStore(store);
    return res.json({ ok: true, race, removed: true });
  });

  app.put('/api/fixtures/:id', auth, adminOnly, (req, res) => {
    const id = req.params.id;
    const date = String(req.body.date || '').trim();
    const event = String(req.body.event || '').trim();
    const track = String(req.body.track || '').trim();
    const raceCount = Number(req.body.raceCount || 12);
    if (!date || !event || !track) return res.status(400).json({ error: 'date, event, and track are required' });
    if (!Number.isInteger(raceCount) || raceCount < 1 || raceCount > 24) return res.status(400).json({ error: 'raceCount must be 1-24' });

    const store = readStore();
    const idx = (store.fixtures || []).findIndex((f) => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Fixture not found' });

    store.fixtures[idx] = { ...store.fixtures[idx], date, event, track, raceCount };
    writeStore(store);
    return res.json({ ok: true, fixture: store.fixtures[idx] });
  });

  app.get('/api/tips', (req, res) => {
    const status = String(req.query.status || 'approved');
    const store = readStore();
    const sorted = [...store.tips].sort((a, b) => b.createdAt - a.createdAt);
    if (status === 'all') return res.json({ tips: sorted });
    return res.json({ tips: sorted.filter((t) => t.status === status) });
  });

  app.post('/api/tips', auth, (req, res) => {
    const race = String(req.body.race || '').trim().toUpperCase();
    const selection = String(req.body.selection || req.body.horse || '').trim();
    const store = readStore();
    const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });
    if (!selection) return res.status(400).json({ error: 'Selection is required' });

    const existingIdx = store.tips.findIndex((t) => t.member === req.user.username && t.race === race && t.status !== 'removed');

    if (existingIdx >= 0) {
      if (!canEditTipsNow(store)) {
        return res.status(403).json({ error: `Tips can only be edited until ${TIP_EDIT_DEADLINE_ISO}` });
      }
      store.tips[existingIdx] = { ...store.tips[existingIdx], selection, status: 'approved', updatedAt: Date.now() };
      writeStore(store);
      return res.json({ ok: true, tip: store.tips[existingIdx], updated: true });
    }

    const tip = {
      id: crypto.randomUUID(),
      member: req.user.username,
      race,
      selection,
      status: 'approved',
      paid: false,
      createdAt: Date.now()
    };
    store.tips.push(tip);
    writeStore(store);
    return res.status(201).json({ ok: true, tip });
  });

  app.patch('/api/tips/:id', auth, adminOnly, (req, res) => {
    const store = readStore();
    const idx = store.tips.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Tip not found' });

    if (typeof req.body.status !== 'undefined') {
      const status = String(req.body.status || '').trim();
      if (!['pending', 'approved', 'removed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      store.tips[idx].status = status;
    }

    if (typeof req.body.paid !== 'undefined') {
      store.tips[idx].paid = Boolean(req.body.paid);
    }

    if (typeof req.body.selection !== 'undefined') {
      const selection = String(req.body.selection || '').trim();
      if (!selection) return res.status(400).json({ error: 'Selection is required' });
      store.tips[idx].selection = selection;
    }

    if (typeof req.body.race !== 'undefined') {
      const race = String(req.body.race || '').trim().toUpperCase();
      const raceCount = Number(store.fixtures?.[0]?.raceCount || 12);
      const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
      if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });
      store.tips[idx].race = race;
    }

    writeStore(store);
    return res.json({ ok: true, tip: store.tips[idx] });
  });

  app.get('/api/ladder', (_req, res) => {
    const store = readStore();
    const ladder = computeLadder(store);
    const afterRace = getLastScoredRace(store);
    return res.json({ ladder, afterRace });
  });

  app.post('/api/archive-round', auth, adminOnly, (req, res) => {
    const store = readStore();
    const fixture = (store.fixtures || [])[0] || null;
    const tips = (store.tips || []).filter((t) => t.status !== 'removed');

    if (!fixture && !tips.length && !Object.keys(store.raceResults || {}).length) {
      return res.status(400).json({ error: 'Nothing to archive yet' });
    }

    const snapshot = {
      id: crypto.randomUUID(),
      archivedAt: Date.now(),
      archivedBy: req.user.username,
      fixture,
      tips,
      raceResults: store.raceResults || {},
      bossesBet: store.bossesBet || { legs: [], selections: {} },
      ladder: computeLadder(store)
    };

    store.archiveRounds = Array.isArray(store.archiveRounds) ? store.archiveRounds : [];
    store.archiveRounds.unshift(snapshot);

    store.tips = [];
    store.raceResults = {};
    store.bossesBet = { legs: [], selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };
    store.buyInVotes = {};

    writeStore(store);
    return res.json({ ok: true, archivedRoundId: snapshot.id, tipsArchived: tips.length, fixture: fixture?.event || null });
  });

  app.post('/api/tips/unlock-saturday-noon', auth, adminOnly, (req, res) => {
    const store = readStore();
    const deadlineMs = nextSaturdayNoonMelbourneMs();
    store.tipEditDeadlineMs = deadlineMs;
    writeStore(store);
    return res.json({ ok: true, deadlineMs, deadlineIso: new Date(deadlineMs).toISOString() });
  });

  app.get('/api/ladder/:member', (req, res) => {
    const store = readStore();
    const member = String(req.params.member || '').trim();
    if (!member) return res.status(400).json({ error: 'Member is required' });

    const exists = (store.tips || []).some(
      (t) => String(t.member || '').trim().toLowerCase() === member.toLowerCase() && t.status !== 'removed'
    );
    if (!exists) return res.status(404).json({ error: 'Member not found' });

    const breakdown = computeMemberBreakdown(store, member);
    return res.json({ breakdown });
  });

  app.get('/api/leaderboard-image.svg', (_req, res) => {
    const store = readStore();
    const ladder = computeLadder(store).slice(0, 10);
    const rows = ladder.length ? ladder : [{ rank: '-', member: 'No results yet', points: 0, winners: 0 }];
    const height = 170 + rows.length * 46;
    const rowSvg = rows.map((r, i) => {
      const y = 148 + i * 46;
      const bg = i % 2 === 0 ? '#131a1f' : '#10161b';
      return `<rect x="24" y="${y - 28}" width="912" height="38" rx="8" fill="${bg}"/>\n`
        + `<text x="46" y="${y}" fill="#d2a94b" font-size="18" font-family="Arial">${r.rank}</text>\n`
        + `<text x="120" y="${y}" fill="#f3f5f7" font-size="18" font-family="Arial">${String(r.member).replace(/[<&>]/g, '')}</text>\n`
        + `<text x="690" y="${y}" fill="#f3f5f7" font-size="18" font-family="Arial">${r.points}</text>\n`
        + `<text x="820" y="${y}" fill="#f3f5f7" font-size="18" font-family="Arial">${r.winners ?? r.correct ?? 0}</text>`;
    }).join('\n');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1418"/>
      <stop offset="100%" stop-color="#1d252c"/>
    </linearGradient>
  </defs>
  <rect width="960" height="${height}" fill="url(#bg)"/>
  <text x="30" y="54" fill="#f7efe0" font-size="32" font-weight="700" font-family="Arial">Big Bluff Bay — Live Leaderboard</text>
  <text x="30" y="82" fill="#9fb0bf" font-size="16" font-family="Arial">Share this snapshot to your Messenger group</text>
  <text x="46" y="120" fill="#8ba0b1" font-size="15" font-family="Arial">#</text>
  <text x="120" y="120" fill="#8ba0b1" font-size="15" font-family="Arial">Punter</text>
  <text x="690" y="120" fill="#8ba0b1" font-size="15" font-family="Arial">Points</text>
  <text x="820" y="120" fill="#8ba0b1" font-size="15" font-family="Arial">Winners</text>
  ${rowSvg}
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(svg);
  });

  app.get('/share/leaderboard', (req, res) => {
    const host = req.headers.host || 'bigbluffbay.au';
    const imageUrl = `https://${host}/api/leaderboard-image.svg`;
    const targetUrl = `https://${host}/punters.html`;
    const html = `<!doctype html><html><head>
<meta charset="utf-8" />
<meta property="og:title" content="Big Bluff Bay Leaderboard" />
<meta property="og:description" content="Latest points and winners. Tap to view full leaderboard." />
<meta property="og:type" content="website" />
<meta property="og:url" content="${targetUrl}" />
<meta property="og:image" content="${imageUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0; url=${targetUrl}" />
</head><body>Redirecting to <a href="${targetUrl}">${targetUrl}</a></body></html>`;
    return res.send(html);
  });

  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  return app;
}

function start() {
  ensureStore();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Big Bluff Bay V5 running: http://localhost:${PORT}`);
    console.log('Demo admin login: admin / admin123');
  });
}

start();
module.exports = { createApp, ensureStore };
