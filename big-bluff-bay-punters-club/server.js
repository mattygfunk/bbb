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
const TIP_EDIT_CUTOFF_HOUR = Number(process.env.TIP_EDIT_CUTOFF_HOUR || 11);
const TIP_TIMEZONE = process.env.TIP_TIMEZONE || 'Australia/Perth';

const DEFAULT_FIXTURES = [
  { id: 'f1', date: 'Sat 14 Feb, 3:19 PM', event: 'Next Meet', track: 'Pinjarra' }
];

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const store = {
      users: [{ id: crypto.randomUUID(), username: 'admin', passwordHash: adminHash, role: 'admin', createdAt: Date.now() }],
      fixtures: DEFAULT_FIXTURES,
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
  if (changed) fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function seedTip(member, race, selection, status) {
  return { id: crypto.randomUUID(), member, race, selection, status, createdAt: Date.now() - Math.floor(Math.random() * 5000000) };
}

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function getHourInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hour12: false, timeZone: tz }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value || 0);
}

function canEditTipsNow() {
  return getHourInTz(TIP_TIMEZONE) < TIP_EDIT_CUTOFF_HOUR;
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

  app.put('/api/fixtures/:id', auth, adminOnly, (req, res) => {
    const id = req.params.id;
    const date = String(req.body.date || '').trim();
    const event = String(req.body.event || '').trim();
    const track = String(req.body.track || '').trim();
    if (!date || !event || !track) return res.status(400).json({ error: 'date, event, and track are required' });

    const store = readStore();
    const idx = (store.fixtures || []).findIndex((f) => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Fixture not found' });

    store.fixtures[idx] = { ...store.fixtures[idx], date, event, track };
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
    const validRaces = new Set(['R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12']);
    if (!validRaces.has(race)) return res.status(400).json({ error: 'Race must be R1 to R12' });
    if (!selection) return res.status(400).json({ error: 'Selection is required' });

    const store = readStore();
    const existingIdx = store.tips.findIndex((t) => t.member === req.user.username && t.race === race && t.status !== 'removed');

    if (existingIdx >= 0) {
      if (!canEditTipsNow()) {
        return res.status(403).json({ error: `Tips can only be edited before ${TIP_EDIT_CUTOFF_HOUR}:00 (${TIP_TIMEZONE})` });
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
      createdAt: Date.now()
    };
    store.tips.push(tip);
    writeStore(store);
    return res.status(201).json({ ok: true, tip });
  });

  app.patch('/api/tips/:id', auth, adminOnly, (req, res) => {
    const status = String(req.body.status || '').trim();
    if (!['pending', 'approved', 'removed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const store = readStore();
    const idx = store.tips.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Tip not found' });

    store.tips[idx].status = status;
    writeStore(store);
    return res.json({ ok: true, tip: store.tips[idx] });
  });

  app.get('/api/ladder', (_req, res) => {
    const store = readStore();
    const score = new Map();
    for (const tip of store.tips) {
      if (tip.status !== 'approved') continue;
      const row = score.get(tip.member) || { member: tip.member, wins: 0, roi: 0 };
      row.wins += 1;
      row.roi += 2.5;
      score.set(tip.member, row);
    }
    const ladder = [...score.values()]
      .sort((a, b) => b.wins - a.wins)
      .map((r, i) => ({ rank: i + 1, member: r.member, wins: r.wins, roi: `+${r.roi.toFixed(1)}%` }));
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

if (require.main === module) start();
module.exports = { createApp, ensureStore };
