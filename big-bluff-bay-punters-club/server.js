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
const META_PAGE_ID = process.env.META_PAGE_ID || '';
const META_INSTAGRAM_USER_ID = process.env.META_INSTAGRAM_USER_ID || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const SOCIAL_CACHE_TTL_MS = Number(process.env.SOCIAL_CACHE_TTL_MS || 15 * 60 * 1000);

const DEFAULT_FIXTURES = [
  { id: 'f1', date: 'Sat 14 Feb, 3:19 PM', event: 'Next Meet', track: 'Pinjarra', raceCount: 12 }
];

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const store = {
      users: [{ id: crypto.randomUUID(), username: 'admin', passwordHash: adminHash, role: 'admin', createdAt: Date.now(), profile: normalizeUserProfile({}) }],
      fixtures: DEFAULT_FIXTURES,
      raceResults: {},
      bossesBet: { legs: [], selections: {}, updatedAt: null, updatedBy: null },
      buyInVotes: {},
      archiveRounds: [],
      tipEditDeadlineMs: null,
      entryFee: 20,
      jackpotCarry: 0,
      lastJackpotWinner: '',
      socialFeedCache: { updatedAt: 0, items: [] },
      pokerResults: [],
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
    if (ensureUserProfile(user)) {
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
  if (typeof store.entryFee !== 'number' || !Number.isFinite(store.entryFee) || store.entryFee <= 0) {
    store.entryFee = 20;
    changed = true;
  }
  if (typeof store.jackpotCarry !== 'number' || !Number.isFinite(store.jackpotCarry) || store.jackpotCarry < 0) {
    store.jackpotCarry = 0;
    changed = true;
  }
  if (typeof store.lastJackpotWinner !== 'string') {
    store.lastJackpotWinner = '';
    changed = true;
  }
  if (!store.socialFeedCache || typeof store.socialFeedCache !== 'object') {
    store.socialFeedCache = { updatedAt: 0, items: [] };
    changed = true;
  }
  if (!Array.isArray(store.pokerResults)) {
    store.pokerResults = [];
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

function normalizeUserProfile(profile = {}) {
  const settings = profile && typeof profile.settings === 'object' ? profile.settings : {};
  const theme = ['system', 'light', 'dark'].includes(String(settings.theme || '')) ? String(settings.theme) : 'system';
  return {
    bio: String(profile.bio || '').slice(0, 280),
    profilePic: String(profile.profilePic || '').slice(0, 2048),
    settings: {
      emailNotifications: Boolean(settings.emailNotifications),
      publicProfile: Boolean(settings.publicProfile),
      theme
    }
  };
}

function ensureUserProfile(user) {
  if (!user || typeof user !== 'object') return false;
  const normalized = normalizeUserProfile(user.profile || {});
  const current = JSON.stringify(user.profile || {});
  const next = JSON.stringify(normalized);
  if (current !== next) {
    user.profile = normalized;
    return true;
  }
  return false;
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

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
  return r.json();
}

async function fetchSocialFeedItems() {
  if (!META_ACCESS_TOKEN) return [];
  const out = [];

  if (META_PAGE_ID) {
    const fbUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(META_PAGE_ID)}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=6&access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;
    const fb = await fetchJson(fbUrl).catch(() => ({ data: [] }));
    (fb.data || []).forEach((p) => {
      out.push({
        id: `fb-${p.id || crypto.randomUUID()}`,
        source: 'facebook',
        text: String(p.message || '').slice(0, 260),
        image: p.full_picture || '',
        permalink: p.permalink_url || 'https://www.facebook.com/profile.php?id=61566153111980',
        timestamp: p.created_time || new Date().toISOString()
      });
    });
  }

  if (META_INSTAGRAM_USER_ID) {
    const igUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(META_INSTAGRAM_USER_ID)}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=6&access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;
    const ig = await fetchJson(igUrl).catch(() => ({ data: [] }));
    (ig.data || []).forEach((m) => {
      out.push({
        id: `ig-${m.id || crypto.randomUUID()}`,
        source: 'instagram',
        text: String(m.caption || '').slice(0, 260),
        image: m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url || '') : (m.media_url || ''),
        permalink: m.permalink || 'https://www.instagram.com/bigbluffbay/',
        timestamp: m.timestamp || new Date().toISOString()
      });
    });
  }

  return out
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);
}


function normalizeArchivedRounds(store) {
  const rounds = Array.isArray(store.archiveRounds) ? [...store.archiveRounds] : [];
  rounds.sort((a, b) => Number(a.archivedAt || 0) - Number(b.archivedAt || 0));
  return rounds.map((round, idx) => ({
    ...round,
    weekNumber: idx + 1,
    weekLabel: `Week ${idx + 1}`
  }));
}

function computeMilestonesData(store) {
  const rounds = normalizeArchivedRounds(store);
  const streakThresholds = [4, 8, 12, 26, 52];
  const winThresholds = [3, 5, 10];

  const stats = new Map();
  const ensure = (member) => {
    const key = String(member || '').trim();
    if (!key) return null;
    if (!stats.has(key)) stats.set(key, { member: key, currentStreak: 0, bestStreak: 0, totalWins: 0, backToBackWins: 0, hasBackToBack: false });
    return stats.get(key);
  };

  for (const round of rounds) {
    const participants = new Set((round.tips || []).map((t) => String(t.member || '').trim()).filter(Boolean));
    participants.forEach((m) => ensure(m));

    for (const row of stats.values()) {
      if (participants.has(row.member)) {
        row.currentStreak += 1;
        if (row.currentStreak > row.bestStreak) row.bestStreak = row.currentStreak;
      } else {
        row.currentStreak = 0;
      }
    }

    const winner = String(round?.jackpot?.outrightWinner || '').trim();
    if (winner) ensure(winner).totalWins += 1;
  }

  const openParticipants = new Set((store.tips || []).filter((t) => t.status !== 'removed').map((t) => String(t.member || '').trim()).filter(Boolean));
  if (openParticipants.size) {
    openParticipants.forEach((m) => ensure(m));
    for (const row of stats.values()) {
      if (openParticipants.has(row.member)) {
        row.currentStreak += 1;
        if (row.currentStreak > row.bestStreak) row.bestStreak = row.currentStreak;
      } else {
        row.currentStreak = 0;
      }
    }
  }

  const winnersChrono = rounds
    .map((round) => {
      const winner = String(round?.jackpot?.outrightWinner || '').trim();
      if (!winner) return null;
      const ladderEntry = (round.ladder || []).find((r) => String(r.member || '').trim().toLowerCase() === winner.toLowerCase()) || null;
      return {
        member: winner,
        weekNumber: round.weekNumber,
        weekLabel: round.weekLabel,
        archivedAt: Number(round.archivedAt || 0),
        points: Number(ladderEntry?.points || 0),
        winners: Number(ladderEntry?.winners || 0)
      };
    })
    .filter(Boolean);

  for (let i = 0; i < winnersChrono.length; i += 1) {
    const current = winnersChrono[i];
    const prev = winnersChrono[i - 1];
    if (prev && prev.member.toLowerCase() === current.member.toLowerCase()) {
      const row = ensure(current.member);
      row.hasBackToBack = true;
      row.backToBackWins += 1;
    }
  }

  const milestoneRows = [...stats.values()].map((row) => {
    const badges = [];
    streakThresholds.forEach((n) => { if (row.bestStreak >= n) badges.push(`Streak ${n} Weeks`); });
    if (row.totalWins >= 1) badges.push('Weekly Winner');
    if (row.hasBackToBack) badges.push('Back-to-Back Winner');
    winThresholds.forEach((n) => { if (row.totalWins >= n) badges.push(`${n}-Time Winner`); });

    return {
      member: row.member,
      currentStreak: row.currentStreak,
      bestStreak: row.bestStreak,
      totalWins: row.totalWins,
      badges
    };
  }).sort((a, b) => b.currentStreak - a.currentStreak || b.bestStreak - a.bestStreak || b.totalWins - a.totalWins || a.member.localeCompare(b.member));

  const winnerHistory = [...winnersChrono].reverse();
  const featuredWinner = winnerHistory[0] || null;

  return {
    featuredWinner,
    winnerHistory,
    streakLeaderboard: milestoneRows.map((r, i) => ({ rank: i + 1, ...r })),
    generatedAt: Date.now()
  };
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


function getRangeStartMs(range) {
  const now = new Date();
  if (range === 'all') return 0;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));

  if (range === 'month') {
    return Date.UTC(y, m - 1, 1, 0, 0, 0);
  }

  // week = rolling last 7 days (includes Sunday events immediately)
  return now.getTime() - (7 * 24 * 60 * 60 * 1000);
}

function computePokerLeaderboard(store, range = 'all') {
  const startMs = getRangeStartMs(range);
  const rows = (store.pokerResults || []).filter((r) => Number(r.createdAt || 0) >= startMs);
  const map = new Map();
  for (const r of rows) {
    const player = String(r.player || '').trim();
    if (!player) continue;
    const row = map.get(player) || { player, points: 0, finalTables: 0, cashes: 0 };
    row.points += Number(r.points || 0);
    if (r.finalTable) row.finalTables += 1;
    if (r.cashed) row.cashes += 1;
    map.set(player, row);
  }
  return [...map.values()]
    .sort((a, b) => b.points - a.points || b.finalTables - a.finalTables || b.cashes - a.cashes || a.player.localeCompare(b.player))
    .map((r, i) => ({ rank: i + 1, ...r }));
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
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.use(express.static(__dirname, {
    etag: true,
    setHeaders: (res, filePath) => {
      const lower = String(filePath || '').toLowerCase();
      const isHtml = lower.endsWith('.html');
      const isStaticAsset = /\.(css|js|svg|png|jpg|jpeg|webp|gif|woff2?)$/.test(lower);

      if (isHtml) {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
        return;
      }
      if (isStaticAsset) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }));

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
      createdAt: Date.now(),
      profile: normalizeUserProfile({})
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

    const safeUser = { id: user.id, username: user.username, role: user.role, profile: normalizeUserProfile(user.profile) };
    return res.json({ ok: true, token: issueToken(safeUser), user: safeUser });
  });

  app.post('/api/logout', auth, (_req, res) => res.json({ ok: true }));
  app.get('/api/me', auth, (req, res) => {
    const store = readStore();
    const user = store.users.find((u) => u.id === req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { id: user.id, username: user.username, role: user.role, profile: normalizeUserProfile(user.profile) } });
  });


  app.get('/api/profile', auth, (req, res) => {
    const store = readStore();
    const user = store.users.find((u) => u.id === req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ profile: normalizeUserProfile(user.profile), username: user.username });
  });

  app.put('/api/profile', auth, (req, res) => {
    const store = readStore();
    const user = store.users.find((u) => u.id === req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bio = req.body?.bio;
    const profilePic = req.body?.profilePic;
    const settings = req.body?.settings;
    const next = normalizeUserProfile({
      ...normalizeUserProfile(user.profile),
      ...(bio !== undefined ? { bio } : {}),
      ...(profilePic !== undefined ? { profilePic } : {}),
      ...(settings && typeof settings === 'object' ? { settings: { ...normalizeUserProfile(user.profile).settings, ...settings } } : {})
    });

    if (next.profilePic && !/^https?:\/\//i.test(next.profilePic) && !next.profilePic.startsWith('/')) {
      return res.status(400).json({ error: 'Profile pic must be an absolute URL or site-relative path.' });
    }

    user.profile = next;
    writeStore(store);
    return res.json({ ok: true, profile: next });
  });

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


  app.get('/api/milestones', (_req, res) => {
    const store = readStore();
    return res.json(computeMilestonesData(store));
  });

  app.get('/api/jackpot', (_req, res) => {
    const store = readStore();
    const entryFee = Number(store.entryFee || 20);
    const tipRows = (store.tips || []).filter((t) => t.status !== 'removed');
    const paidMembers = new Set(tipRows.filter((t) => t.paid).map((t) => String(t.member || ''))).size;
    const currentRoundPot = paidMembers * entryFee;
    const rollover = Number(store.jackpotCarry || 0);
    const totalPot = currentRoundPot + rollover;
    return res.json({
      entryFee,
      paidMembers,
      currentRoundPot,
      rollover,
      totalPot,
      lastWinner: store.lastJackpotWinner || ''
    });
  });

  app.put('/api/jackpot', auth, adminOnly, (req, res) => {
    const store = readStore();
    const rollover = Number(req.body?.rollover);
    if (!Number.isFinite(rollover) || rollover < 0) {
      return res.status(400).json({ error: 'Rollover must be a non-negative number' });
    }
    store.jackpotCarry = Math.round(rollover * 100) / 100;
    writeStore(store);
    return res.json({ ok: true, jackpotCarry: store.jackpotCarry });
  });


  app.get('/api/poker-leaderboard', (req, res) => {
    const store = readStore();
    const range = String(req.query.range || 'all').toLowerCase();
    if (!['week', 'month', 'all'].includes(range)) return res.status(400).json({ error: 'range must be week, month, or all' });

    const startMs = getRangeStartMs(range);
    const rows = (store.pokerResults || []).filter((r) => Number(r.createdAt || 0) >= startMs);
    const leaderboard = computePokerLeaderboard(store, range);
    const totalPlayers = new Set(rows.map((r) => String(r.player || '').trim()).filter(Boolean)).size;

    return res.json({
      range,
      leaderboard,
      stats: {
        events: rows.length,
        players: totalPlayers
      },
      updatedAt: Date.now()
    });
  });

  app.post('/api/poker-results', auth, adminOnly, (req, res) => {
    const store = readStore();
    const input = Array.isArray(req.body?.results) ? req.body.results : [req.body];
    const added = [];
    for (const item of input) {
      const player = String(item?.player || '').trim();
      if (!player) continue;
      added.push({
        id: crypto.randomUUID(),
        player,
        points: Number(item?.points || 0),
        finalTable: Boolean(item?.finalTable),
        cashed: Boolean(item?.cashed),
        eventName: String(item?.eventName || '').trim(),
        createdAt: Number(item?.createdAt || Date.now()),
        createdBy: req.user.username
      });
    }
    store.pokerResults = Array.isArray(store.pokerResults) ? store.pokerResults : [];
    store.pokerResults.push(...added);
    writeStore(store);
    return res.status(201).json({ ok: true, added: added.length });
  });

  app.get('/api/social-feed', async (_req, res) => {
    const store = readStore();
    const now = Date.now();
    const cache = store.socialFeedCache || { updatedAt: 0, items: [] };
    const cacheFresh = (now - Number(cache.updatedAt || 0)) < SOCIAL_CACHE_TTL_MS;

    if (cacheFresh && (cache.items || []).length) {
      return res.json({ items: cache.items, source: 'cache', updatedAt: cache.updatedAt });
    }

    const live = await fetchSocialFeedItems();
    if (live.length) {
      store.socialFeedCache = { updatedAt: now, items: live };
      writeStore(store);
      return res.json({ items: live, source: 'live', updatedAt: now });
    }

    const fallback = (cache.items || []).length ? cache.items : [
      {
        id: 'fallback-fb',
        source: 'facebook',
        text: 'Follow Big Bluff Bay on Facebook for latest race-day updates.',
        image: '',
        permalink: 'https://www.facebook.com/profile.php?id=61566153111980',
        timestamp: new Date().toISOString()
      },
      {
        id: 'fallback-ig',
        source: 'instagram',
        text: 'Follow Big Bluff Bay on Instagram for highlights and club news.',
        image: '',
        permalink: 'https://www.instagram.com/bigbluffbay/',
        timestamp: new Date().toISOString()
      }
    ];

    return res.json({ items: fallback, source: (cache.items || []).length ? 'cache' : 'fallback', updatedAt: Number(cache.updatedAt || 0) || now });
  });

  app.post('/api/archive-round', auth, adminOnly, (req, res) => {
    const store = readStore();
    const fixture = (store.fixtures || [])[0] || null;
    const tips = (store.tips || []).filter((t) => t.status !== 'removed');

    if (!fixture && !tips.length && !Object.keys(store.raceResults || {}).length) {
      return res.status(400).json({ error: 'Nothing to archive yet' });
    }

    const ladder = computeLadder(store);
    const entryFee = Number(store.entryFee || 20);
    const paidMembers = new Set(tips.filter((t) => t.paid).map((t) => String(t.member || ''))).size;
    const roundPool = paidMembers * entryFee;
    const previousCarry = Number(store.jackpotCarry || 0);

    const first = ladder[0];
    const second = ladder[1];
    const outright = !!first && (!second || first.points > second.points || (first.points === second.points && first.winners > second.winners));

    const snapshot = {
      id: crypto.randomUUID(),
      archivedAt: Date.now(),
      archivedBy: req.user.username,
      fixture,
      tips,
      raceResults: store.raceResults || {},
      bossesBet: store.bossesBet || { legs: [], selections: {} },
      ladder,
      jackpot: {
        entryFee,
        paidMembers,
        roundPool,
        previousCarry,
        outrightWinner: outright ? first?.member || null : null,
        rolloverToNextWeek: outright ? 0 : (previousCarry + roundPool)
      }
    };

    store.archiveRounds = Array.isArray(store.archiveRounds) ? store.archiveRounds : [];
    store.archiveRounds.unshift(snapshot);

    if (outright) {
      store.jackpotCarry = 0;
      store.lastJackpotWinner = String(first?.member || '');
    } else {
      store.jackpotCarry = previousCarry + roundPool;
    }

    store.tips = [];
    store.raceResults = {};
    store.bossesBet = { legs: [], selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };
    store.buyInVotes = {};

    writeStore(store);
    return res.json({
      ok: true,
      archivedRoundId: snapshot.id,
      tipsArchived: tips.length,
      fixture: fixture?.event || null,
      outrightWinner: outright ? first?.member || null : null,
      rolloverToNextWeek: Number(store.jackpotCarry || 0)
    });
  });

  app.post('/api/tips/unlock-saturday-noon', auth, adminOnly, (req, res) => {
    const store = readStore();
    const deadlineMs = nextSaturdayNoonMelbourneMs();
    store.tipEditDeadlineMs = deadlineMs;
    writeStore(store);
    return res.json({ ok: true, deadlineMs, deadlineIso: new Date(deadlineMs).toISOString() });
  });

  app.get('/api/tips/edit-deadline', (_req, res) => {
    const store = readStore();
    const manual = Number(store.tipEditDeadlineMs || 0);
    const fallback = new Date(TIP_EDIT_DEADLINE_ISO).getTime();
    const effective = manual > 0 ? manual : fallback;
    return res.json({
      manualDeadlineMs: manual || null,
      effectiveDeadlineMs: Number.isFinite(effective) ? effective : null,
      editableNow: canEditTipsNow(store)
    });
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
