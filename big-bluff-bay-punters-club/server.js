const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const FIXTURES = [
  { id: 'f1', date: 'Sat 15 Feb', event: 'Big Bluff Sprint', track: 'Bay Park' },
  { id: 'f2', date: 'Wed 19 Feb', event: 'Midweek Mile', track: 'Harbour Downs' },
  { id: 'f3', date: 'Sat 22 Feb', event: 'The Bluff Cup', track: 'Big Bluff Bay' }
];

const sessions = new Map();

app.use(express.json());
app.use(express.static(__dirname));

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const store = {
      users: [
        {
          id: crypto.randomUUID(),
          username: 'admin',
          passwordHash: hashPassword('admin123'),
          role: 'admin',
          createdAt: Date.now()
        }
      ],
      tips: [
        tipSeed('Macca', 'R3', 'Storm Ledger', '$4.20', 'Strong late speed.', 'approved'),
        tipSeed('Jess', 'R5', 'Bayline Belle', '$6.00', 'Great barrier draw.', 'approved'),
        tipSeed('Rico', 'R7', 'Cash Cascade', '$5.50', 'Handles soft track.', 'approved')
      ]
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  }
}

function tipSeed(member, race, horse, odds, reason, status) {
  return { id: crypto.randomUUID(), member, race, horse, odds, reason, status, createdAt: Date.now() - Math.floor(Math.random() * 5000000) };
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, saved) {
  const [salt, hash] = saved.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role };
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });

  const session = sessions.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.user = session.user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/api/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!/^[a-zA-Z0-9_\-]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-24 chars: letters, numbers, _ or -' });
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
    passwordHash: hashPassword(password),
    role: 'member',
    createdAt: Date.now()
  };

  store.users.push(user);
  writeStore(store);
  res.status(201).json({ ok: true, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const store = readStore();
  const user = store.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    user: publicUser(user),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  });

  res.json({ ok: true, token, user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/fixtures', (_req, res) => res.json({ fixtures: FIXTURES }));

app.get('/api/tips', (req, res) => {
  const status = String(req.query.status || 'approved');
  const store = readStore();

  if (status === 'all') return res.json({ tips: store.tips.sort((a, b) => b.createdAt - a.createdAt) });
  res.json({ tips: store.tips.filter((t) => t.status === status).sort((a, b) => b.createdAt - a.createdAt) });
});

app.post('/api/tips', auth, (req, res) => {
  const race = String(req.body.race || '').trim();
  const horse = String(req.body.horse || '').trim();
  const odds = String(req.body.odds || '').trim();
  const reason = String(req.body.reason || '').trim();

  if (!race || !horse || !odds || !reason) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const store = readStore();
  const tip = {
    id: crypto.randomUUID(),
    member: req.user.username,
    race,
    horse,
    odds,
    reason,
    status: req.user.role === 'admin' ? 'approved' : 'pending',
    createdAt: Date.now()
  };

  store.tips.push(tip);
  writeStore(store);
  res.status(201).json({ ok: true, tip });
});

app.patch('/api/tips/:id', auth, adminOnly, (req, res) => {
  const status = String(req.body.status || '').trim();
  if (!['approved', 'removed', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const store = readStore();
  const idx = store.tips.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tip not found' });

  store.tips[idx].status = status;
  writeStore(store);
  res.json({ ok: true, tip: store.tips[idx] });
});

app.get('/api/ladder', (_req, res) => {
  const store = readStore();
  const score = new Map();

  for (const tip of store.tips) {
    if (tip.status !== 'approved') continue;
    const curr = score.get(tip.member) || { member: tip.member, wins: 0, roi: 0 };
    curr.wins += 1;
    curr.roi += 2.5;
    score.set(tip.member, curr);
  }

  const ladder = [...score.values()]
    .sort((a, b) => b.wins - a.wins)
    .map((row, i) => ({ rank: i + 1, member: row.member, wins: row.wins, roi: `+${row.roi.toFixed(1)}%` }));

  res.json({ ladder });
});

app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

ensureStore();
app.listen(PORT, () => {
  console.log(`Big Bluff Bay V3 running: http://localhost:${PORT}`);
  console.log('Demo admin login: admin / admin123');
});
