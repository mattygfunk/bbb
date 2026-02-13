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
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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

function canEditTipsNow() {
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
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '200kb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.use(express.static(__dirname));

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: '5.0.0' }));

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
    const activeLegs = new Set(Array.isArray(store.bossesBet?.legs) && store.bossesBet.legs.length ? store.bossesBet.legs : allRaces);

    if (!store.raceResults || typeof store.raceResults !== 'object') store.raceResults = {};
    for (const race of activeLegs) delete store.raceResults[race];

    writeStore(store);
    return res.json({ ok: true, clearedLegs: [...activeLegs], bossesBet: computeBossesBetProgress(store) });
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
      if (!canEditTipsNow()) {
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

    writeStore(store);
    return res.json({ ok: true, tip: store.tips[idx] });
  });

  app.get('/api/ladder', (_req, res) => {
    const store = readStore();
    const score = new Map();

    const addPoints = (member, pts) => {
      const row = score.get(member) || { member, points: 0, correct: 0 };
      row.points += pts;
      if (pts > 0) row.correct += 1;
      score.set(member, row);
    };

    for (const tip of store.tips || []) {
      if (tip.status !== 'approved') continue;
      const race = String(tip.race || '');
      const rr = store.raceResults?.[race];
      if (!rr) continue;

      const sel = applySub(String(tip.selection || tip.horse || ''), rr);
      let pts = 0;
      if ((rr.first || []).map(String).includes(sel)) pts = 3;
      else if ((rr.second || []).map(String).includes(sel)) pts = 2;
      else if ((rr.third || []).map(String).includes(sel)) pts = 1;
      addPoints(String(tip.member || 'Unknown'), pts);
    }

    const ladder = [...score.values()]
      .sort((a, b) => b.points - a.points || b.correct - a.correct || a.member.localeCompare(b.member))
      .map((r, i) => ({ rank: i + 1, member: r.member, points: r.points, correct: r.correct }));
    return res.json({ ladder });
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
