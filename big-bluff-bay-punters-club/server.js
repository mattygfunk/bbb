const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { registerPokerRoutes, ensurePokerV2Store } = require('./poker-system');

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

const TRACKS = {
  greyhounds: {
    id: 'greyhounds',
    slug: 'greyhounds',
    name: 'Greyhounds',
    accent: '#4aa3ff',
    raceDay: 3,
    defaultOpenHour: 9,
    defaultOpenMinute: 0,
    defaultLockHour: 18,
    defaultLockMinute: 0,
    defaultRaceCount: 10,
    defaultTrackLabel: 'Sandown Park'
  },
  thoroughbreds: {
    id: 'thoroughbreds',
    slug: 'thoroughbreds',
    name: 'Thoroughbreds',
    accent: '#eab308',
    raceDay: 6,
    defaultOpenHour: 9,
    defaultOpenMinute: 0,
    defaultLockHour: 15,
    defaultLockMinute: 0,
    defaultRaceCount: 12,
    defaultTrackLabel: 'Caulfield'
  }
};

function normalizeTrackId(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'thoroughbreds';
  if (raw === 'greyhound' || raw === 'dogs') return 'greyhounds';
  if (raw === 'thoroughbred' || raw === 'horses') return 'thoroughbreds';
  return TRACKS[raw] ? raw : 'thoroughbreds';
}

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const store = {
      users: [{ id: crypto.randomUUID(), username: 'admin', passwordHash: adminHash, role: 'admin', createdAt: Date.now(), profile: normalizeUserProfile({}) }],
      fixtures: DEFAULT_FIXTURES,
      raceResults: {},
      bossesBet: { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, legItems: [], legs: [], selections: {}, updatedAt: null, updatedBy: null },
      buyInVotes: {},
      archiveRounds: [],
      tipEditDeadlineMs: null,
      entryFee: 20,
      jackpotCarry: 0,
      lastJackpotWinner: '',
      socialFeedCache: { updatedAt: 0, items: [] },
      pokerResults: [],
      pokerPlayers: [],
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
  if (!store.raceRunners || typeof store.raceRunners !== 'object') {
    store.raceRunners = {};
    changed = true;
  }
  if (!store.bossesBet || typeof store.bossesBet !== 'object') {
    store.bossesBet = { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, stake: '', potentialReturn: '', legItems: [], legs: [], selections: {}, updatedAt: null, updatedBy: null };
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
  if (!Array.isArray(store.pokerPlayers)) {
    store.pokerPlayers = [];
    changed = true;
  }
  if (ensurePokerV2Store(store)) {
    changed = true;
  }
  if (ensurePuntersClubStore(store)) {
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


function normalizePokerPlayerPool(store) {
  const seen = new Set();
  const out = [];
  const source = [
    ...(Array.isArray(store?.pokerPlayers) ? store.pokerPlayers : []),
    ...((store?.pokerResults || []).map((r) => r?.player))
  ];
  for (const raw of source) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizeUserProfile(profile = {}) {
  const settings = profile && typeof profile.settings === 'object' ? profile.settings : {};
  const theme = ['system', 'light', 'dark'].includes(String(settings.theme || '')) ? String(settings.theme) : 'system';
  const email = String(profile.email || '').trim().slice(0, 254).toLowerCase();
  return {
    bio: String(profile.bio || '').slice(0, 280),
    email,
    profilePic: String(profile.profilePic || '').slice(0, 250000),
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

function parseImportedRunners({ text = '', raceNumber = 1 }) {
  const input = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  if (!input) return [];
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const headerRe = /^[A-Z0-9' .&-]+\s*\((\d{1,2})\)$/;

  const blocks = [];
  let current = [];
  const push = () => { if (current.length) blocks.push(current), current = []; };
  for (const line of lines) {
    if (headerRe.test(line) && current.length) push();
    current.push(line);
  }
  push();

  const toNum = (v) => {
    const n = Number(String(v || '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  return blocks.map((block, idx) => {
    const warnings = [];
    const rawBlock = block.join('\n');
    const first = String(block[0] || '');
    const hm = first.match(/^(.*)\((\d{1,2})\)$/);
    const horseName = hm ? String(hm[1] || '').trim() : null;
    const barrier = hm ? Number(hm[2]) : null;
    if (!horseName) warnings.push('Missing horse name');
    if (!barrier) warnings.push('Missing barrier');

    const participantsRaw = String(block[1] || '').trim() || null;
    let jockeyRaw = null;
    let trainerRaw = null;
    const split = participantsRaw ? participantsRaw.match(/^(.+?)(T[A-Z].*)$/i) : null;
    if (split) {
      jockeyRaw = String(split[1] || '').trim() || null;
      trainerRaw = String(split[2] || '').trim() || null;
    }

    const formLine = String(block[2] || '');
    const formTokens = formLine.split(/\s+/).filter(Boolean);
    const form = formTokens[0] && /[0-9xX-]/.test(formTokens[0]) ? formTokens[0] : null;
    const nums = formTokens.map(toNum).filter((n) => n != null);
    const weightKg = nums[0] ?? null;
    const rating = nums[1] ?? null;
    if (!form) warnings.push('Missing form');

    const tail = block.slice(3).join(' ');
    const scrCount = (tail.match(/\bSCR\b/gi) || []).length;
    const allNums = (tail.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
    const isScratched = scrCount >= 2;
    const prices = isScratched
      ? { win: null, place: null, alt1: null, alt2: null }
      : { win: allNums[0] ?? null, place: allNums[1] ?? null, alt1: allNums[2] ?? null, alt2: allNums[3] ?? null };
    if (!isScratched && prices.win == null && prices.place == null) warnings.push('No prices detected');

    const confidence = (!horseName || !barrier)
      ? 'low'
      : ((form && (isScratched || prices.place != null)) ? 'high' : 'medium');

    return {
      raceNumber: Number(raceNumber || 1),
      runnerNumber: idx + 1,
      horseName,
      barrier,
      jockeyRaw,
      trainerRaw,
      participantsRaw,
      form,
      weightKg,
      rating,
      prices,
      isScratched,
      warnings,
      confidence,
      rawBlock
    };
  });
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

const BOSSES_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    track: { type: ['string', 'null'] },
    meet: { type: ['string', 'null'] },
    status: { type: ['string', 'null'], enum: ['LIVE', 'WON', 'LOST', 'VOID', null] },
    stake_aud: { type: ['number', 'null'] },
    potential_return_aud: { type: ['number', 'null'] },
    freeroll_prize_aud: { type: ['number', 'null'] },
    eligibility_note: { type: ['string', 'null'] },
    legs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          leg: { type: 'number' },
          race: { type: ['number', 'null'] },
          selection: { type: ['string', 'null'] },
          bet_type: { type: 'string', enum: ['WIN', 'PLACE', 'TOP3', 'TOP2', 'EACHWAY', 'UNKNOWN'] },
          odds: { type: ['number', 'null'] },
          result: { type: 'string', enum: ['Pending', 'Won', 'Lost'] }
        },
        required: ['leg', 'race', 'selection', 'bet_type', 'odds', 'result'],
        additionalProperties: false
      }
    },
    raw_text_snippet: { type: ['string', 'null'] }
  },
  required: ['track', 'meet', 'status', 'stake_aud', 'potential_return_aud', 'freeroll_prize_aud', 'eligibility_note', 'legs', 'raw_text_snippet'],
  additionalProperties: false
};

async function readRawBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Upload too large (max 10MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipartImage(buffer, contentType = '') {
  const m = /boundary=(.+)$/i.exec(contentType);
  if (!m) return null;
  const boundary = `--${m[1]}`;
  const raw = buffer.toString('latin1');
  const parts = raw.split(boundary).slice(1, -1);
  for (const part of parts) {
    const idx = part.indexOf('\r\n\r\n');
    if (idx < 0) continue;
    const headerText = part.slice(0, idx);
    const bodyText = part.slice(idx + 4, part.lastIndexOf('\r\n'));
    const hasFilename = /filename="([^"]+)"/i.exec(headerText);
    const ct = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || '';
    if (!hasFilename) continue;
    if (!/^image\/(png|jpe?g|webp)$/i.test(ct)) continue;
    return { buffer: Buffer.from(bodyText, 'latin1'), contentType: ct };
  }
  return null;
}

function safeJsonExtract(text = '') {
  try { return JSON.parse(text); } catch {}
  const block = String(text || '').match(/\{[\s\S]*\}$/);
  if (block) {
    try { return JSON.parse(block[0]); } catch {}
  }
  return null;
}

function normalizeExtractDraft(incoming) {
  const x = incoming && typeof incoming === 'object' ? incoming : {};
  const allowedStatus = new Set(['LIVE', 'WON', 'LOST', 'VOID']);
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const legs = Array.isArray(x.legs) ? x.legs : [];
  return {
    track: x.track == null ? null : String(x.track),
    meet: x.meet == null ? null : String(x.meet),
    status: allowedStatus.has(String(x.status || '').toUpperCase()) ? String(x.status).toUpperCase() : null,
    stake_aud: toNum(x.stake_aud),
    potential_return_aud: toNum(x.potential_return_aud),
    freeroll_prize_aud: toNum(x.freeroll_prize_aud),
    eligibility_note: x.eligibility_note == null ? null : String(x.eligibility_note),
    legs: legs.map((l, i) => ({
      leg: Number(l?.leg || i + 1),
      race: toNum(l?.race),
      selection: l?.selection == null ? null : String(l.selection),
      bet_type: ['WIN', 'PLACE', 'TOP3', 'TOP2', 'EACHWAY', 'UNKNOWN'].includes(String(l?.bet_type || '').toUpperCase()) ? String(l.bet_type).toUpperCase() : 'UNKNOWN',
      odds: toNum(l?.odds),
      result: ['Pending', 'Won', 'Lost'].includes(String(l?.result || '')) ? String(l.result) : 'Pending'
    })),
    raw_text_snippet: x.raw_text_snippet == null ? null : String(x.raw_text_snippet)
  };
}

function compareBossesDrafts(a, b) {
  const diffs = [];
  const fields = ['track', 'meet', 'status', 'stake_aud', 'potential_return_aud'];
  for (const f of fields) {
    const av = a?.[f] ?? null;
    const bv = b?.[f] ?? null;
    if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push({ field: f, pass1: av, pass2: bv });
  }
  const maxLegs = Math.max(a?.legs?.length || 0, b?.legs?.length || 0);
  for (let i = 0; i < maxLegs; i += 1) {
    const l1 = a?.legs?.[i] || null;
    const l2 = b?.legs?.[i] || null;
    if (!l1 || !l2) {
      diffs.push({ field: `legs[${i}]`, pass1: l1, pass2: l2 });
      continue;
    }
    for (const lf of ['race', 'selection', 'bet_type', 'odds']) {
      if (JSON.stringify(l1?.[lf] ?? null) !== JSON.stringify(l2?.[lf] ?? null)) {
        diffs.push({ field: `legs[${i}].${lf}`, pass1: l1?.[lf] ?? null, pass2: l2?.[lf] ?? null });
      }
    }
  }
  return diffs;
}

function mergeBossesDrafts(pass1, pass2, diffs) {
  const conflictFields = new Set((diffs || []).map((d) => d.field));
  const pick = (field, v1, v2) => (conflictFields.has(field) ? null : (v1 ?? v2 ?? null));
  const merged = {
    track: pick('track', pass1.track, pass2.track),
    meet: pick('meet', pass1.meet, pass2.meet),
    status: pick('status', pass1.status, pass2.status),
    stake_aud: pick('stake_aud', pass1.stake_aud, pass2.stake_aud),
    potential_return_aud: pick('potential_return_aud', pass1.potential_return_aud, pass2.potential_return_aud),
    freeroll_prize_aud: pass1.freeroll_prize_aud ?? pass2.freeroll_prize_aud ?? null,
    eligibility_note: pass1.eligibility_note ?? pass2.eligibility_note ?? null,
    legs: [],
    raw_text_snippet: [pass1.raw_text_snippet, pass2.raw_text_snippet].filter(Boolean).join('\n---\n') || null
  };
  const maxLegs = Math.max(pass1.legs.length, pass2.legs.length);
  for (let i = 0; i < maxLegs; i += 1) {
    const l1 = pass1.legs[i] || null;
    const l2 = pass2.legs[i] || null;
    merged.legs.push({
      leg: Number((l1?.leg ?? l2?.leg ?? i + 1)),
      race: conflictFields.has(`legs[${i}].race`) ? null : (l1?.race ?? l2?.race ?? null),
      selection: conflictFields.has(`legs[${i}].selection`) ? null : (l1?.selection ?? l2?.selection ?? null),
      bet_type: conflictFields.has(`legs[${i}].bet_type`) ? 'UNKNOWN' : (l1?.bet_type ?? l2?.bet_type ?? 'UNKNOWN'),
      odds: conflictFields.has(`legs[${i}].odds`) ? null : (l1?.odds ?? l2?.odds ?? null),
      result: (l1?.result || l2?.result || 'Pending')
    });
  }
  return merged;
}

async function openAiExtractBosses(imageDataUrl, pass = 1) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured on server.');
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';

  const promptBase = `Extract Bosses Multi betting-slip data into STRICT JSON only.\nIf unknown/unclear use null. Do NOT guess race numbers. Keep runner prefixes like #4.\nSchema: ${JSON.stringify(BOSSES_EXTRACT_SCHEMA)}.`;
  const prompt = pass === 1
    ? `${promptBase}\nPass 1: visual-first extraction.`
    : `${promptBase}\nPass 2: independent verification. Be conservative and mark uncertain fields null.`;

  const body = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ],
    temperature: 0
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || 'Vision extraction failed');
  const raw = data?.choices?.[0]?.message?.content || '{}';
  const parsed = safeJsonExtract(raw);
  if (!parsed) throw new Error('Could not parse extraction JSON');
  return normalizeExtractDraft(parsed);
}

function applySub(selection, raceResult) {
  const subs = raceResult?.substitutions || [];
  const hit = subs.find((s) => String(s.scratched) === String(selection));
  return hit ? String(hit.substitute) : String(selection);
}

function computeBossesBetProgress(store, trackId = 'thoroughbreds') {
  const tId = normalizeTrackId(trackId);
  const trackData = getTrackData(store, tId);
  const bb = trackData.bossesBet || { legs: [], selections: {} };
  const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[tId].defaultRaceCount || 12);
  const allRaces = Array.from({ length: raceCount }, (_, i) => `R${i + 1}`);
  const activeLegs = new Set(Array.isArray(bb.legs) && bb.legs.length ? bb.legs : allRaces);
  const legItems = Array.isArray(bb.legItems) ? bb.legItems : [];

  const result = allRaces.map((race) => {
    const inMulti = activeLegs.has(race);
    const pick = String(bb.selections?.[race] || '').trim();
    const rr = trackData.raceResults?.[race];
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
  const computedOverall = anyMiss ? 'lost' : allPlaced && allResolved ? 'won' : 'live';

  const statusRaw = String(bb.status || '').toLowerCase();
  const allowed = new Set(['live','won','lost','void']);
  const status = allowed.has(statusRaw) ? statusRaw : computedOverall;

  const normalizedLegItems = legItems.map((item, idx) => ({
    legNumber: Number(item?.legNumber || idx + 1),
    race: String(item?.race || `R${idx + 1}`),
    selection: String(item?.selection || ''),
    betType: 'PLACE',
    odds: item?.odds == null ? '' : String(item.odds),
    result: String(item?.result || 'PENDING').toUpperCase()
  }));

  const progressByRace = new Map(result.map((r) => [String(r.race || '').toUpperCase(), String(r.status || 'pending').toLowerCase()]));
  const resolvedLegItems = normalizedLegItems.map((item) => {
    const raceKey = String(item.race || '').toUpperCase();
    const raceStatus = progressByRace.get(raceKey);
    const derivedResult = raceStatus === 'placed' ? 'WON' : raceStatus === 'missed' ? 'LOST' : raceStatus === 'pending' ? 'PENDING' : String(item.result || 'PENDING').toUpperCase();
    const fallbackSelection = String(bb?.selections?.[raceKey] || '').trim();
    return {
      ...item,
      selection: String(item.selection || '').trim() || fallbackSelection || '',
      result: derivedResult || 'PENDING'
    };
  });

  const manual = Number(store?.tipEditDeadlineMs || 0);
  const fallback = new Date(TIP_EDIT_DEADLINE_ISO).getTime();
  const effectiveLock = manual > 0 ? manual : (Number.isFinite(fallback) ? fallback : null);

  return {
    ...bb,
    trackId: tId,
    title: String(bb.title || 'Bosses Multi'),
    weekKey: String(trackData?.fixtures?.[0]?.date || bb.weekKey || ''),
    meet: String(trackData?.fixtures?.[0]?.track || bb.meet || ''),
    freerollPrize: Number(bb.freerollPrize || 0),
    eligibilityNote: String(bb.eligibilityNote || 'Eligible = all players who entered tips this week before lock.'),
    status,
    lockTime: Number(bb.lockTime || 0) || effectiveLock || null,
    stake: '$25',
    updatedAt: Number(bb.updatedAt || 0) || null,
    updatedBy: String(bb.updatedBy || ''),
    legs: [...activeLegs],
    progress: result,
    legItems: resolvedLegItems,
    overall: status
  };
}


function defaultTrackData(trackId) {
  const t = TRACKS[trackId] || TRACKS.thoroughbreds;
  return {
    fixtures: [{ id: `pc-${trackId}-f1`, date: '', event: `${t.name} Meet`, track: t.defaultTrackLabel, raceCount: t.defaultRaceCount }],
    raceResults: {},
    raceRunners: {},
    bossesBet: { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, legItems: [], legs: [], selections: {}, updatedAt: null, updatedBy: null }
  };
}

function getTrackJackpotCarry(store, trackId = 'thoroughbreds') {
  const tId = normalizeTrackId(trackId);
  ensurePuntersClubStore(store);
  const byTrack = store.puntersClub?.jackpotCarryByTrack || {};
  if (typeof byTrack[tId] === 'number' && Number.isFinite(byTrack[tId]) && byTrack[tId] >= 0) {
    return Number(byTrack[tId]);
  }
  if (tId === 'thoroughbreds') {
    const legacy = Number(store.jackpotCarry || 0);
    return Number.isFinite(legacy) && legacy >= 0 ? legacy : 0;
  }
  return 0;
}

function setTrackJackpotCarry(store, trackId = 'thoroughbreds', amount = 0) {
  const tId = normalizeTrackId(trackId);
  ensurePuntersClubStore(store);
  const safe = Math.max(0, Math.round(Number(amount || 0) * 100) / 100);
  if (!store.puntersClub.jackpotCarryByTrack || typeof store.puntersClub.jackpotCarryByTrack !== 'object') {
    store.puntersClub.jackpotCarryByTrack = {};
  }
  store.puntersClub.jackpotCarryByTrack[tId] = safe;
  if (tId === 'thoroughbreds') {
    store.jackpotCarry = safe;
  }
  return safe;
}

function ensurePuntersClubStore(store) {
  if (!store.puntersClub || typeof store.puntersClub !== 'object') {
    store.puntersClub = { rounds: [], claims: [], payoutAudit: [], paymentAudit: [], leaderboardCache: {}, settings: { nextRoundOpensAt: null }, tracks: {}, schedule: {}, banterByTrack: {} };
  }
  let changed = false;
  if (!Array.isArray(store.puntersClub.rounds)) { store.puntersClub.rounds = []; changed = true; }
  if (!Array.isArray(store.puntersClub.claims)) { store.puntersClub.claims = []; changed = true; }
  if (!Array.isArray(store.puntersClub.payoutAudit)) { store.puntersClub.payoutAudit = []; changed = true; }
  if (!Array.isArray(store.puntersClub.paymentAudit)) { store.puntersClub.paymentAudit = []; changed = true; }
  if (!store.puntersClub.leaderboardCache || typeof store.puntersClub.leaderboardCache !== 'object') { store.puntersClub.leaderboardCache = {}; changed = true; }
  if (!store.puntersClub.settings || typeof store.puntersClub.settings !== 'object') { store.puntersClub.settings = { nextRoundOpensAt: null }; changed = true; }
  if (!store.puntersClub.tracks || typeof store.puntersClub.tracks !== 'object') { store.puntersClub.tracks = {}; changed = true; }
  if (!store.puntersClub.schedule || typeof store.puntersClub.schedule !== 'object') { store.puntersClub.schedule = {}; changed = true; }
  if (!store.puntersClub.jackpotCarryByTrack || typeof store.puntersClub.jackpotCarryByTrack !== 'object') { store.puntersClub.jackpotCarryByTrack = {}; changed = true; }
  if (!store.puntersClub.banterByTrack || typeof store.puntersClub.banterByTrack !== 'object') { store.puntersClub.banterByTrack = {}; changed = true; }

  Object.keys(TRACKS).forEach((trackId) => {
    if (!store.puntersClub.tracks[trackId] || typeof store.puntersClub.tracks[trackId] !== 'object') {
      store.puntersClub.tracks[trackId] = defaultTrackData(trackId);
      changed = true;
    }
    const td = store.puntersClub.tracks[trackId];
    if (!Array.isArray(td.fixtures) || !td.fixtures.length) { td.fixtures = defaultTrackData(trackId).fixtures; changed = true; }
    if (!td.raceResults || typeof td.raceResults !== 'object') { td.raceResults = {}; changed = true; }
    if (!td.raceRunners || typeof td.raceRunners !== 'object') { td.raceRunners = {}; changed = true; }
    if (!td.bossesBet || typeof td.bossesBet !== 'object') { td.bossesBet = defaultTrackData(trackId).bossesBet; changed = true; }
    if (!Array.isArray(td.bossesBet.legItems)) { td.bossesBet.legItems = []; changed = true; }
    if (typeof td.bossesBet.title !== 'string') { td.bossesBet.title = 'Bosses Multi'; changed = true; }
    if (typeof td.bossesBet.status !== 'string') { td.bossesBet.status = 'live'; changed = true; }
    if (typeof td.bossesBet.eligibilityNote !== 'string') { td.bossesBet.eligibilityNote = 'Eligible = all players who entered tips this week before lock.'; changed = true; }
    if (typeof td.bossesBet.freerollPrize !== 'number') { td.bossesBet.freerollPrize = Number(td.bossesBet.freerollPrize || 0); changed = true; }

    if (trackId === 'thoroughbreds') {
      if (Array.isArray(store.fixtures) && store.fixtures.length) {
        const looksUnmigrated = !Array.isArray(td.fixtures) || !td.fixtures.length || String(td.fixtures?.[0]?.id || '').startsWith('pc-thoroughbreds-');
        if (looksUnmigrated) { td.fixtures = JSON.parse(JSON.stringify(store.fixtures)); changed = true; }
      }
      if (store.raceResults && typeof store.raceResults === 'object' && Object.keys(store.raceResults).length && (!td.raceResults || !Object.keys(td.raceResults).length)) {
        td.raceResults = JSON.parse(JSON.stringify(store.raceResults));
        changed = true;
      }
      if (store.raceRunners && typeof store.raceRunners === 'object' && Object.keys(store.raceRunners).length && (!td.raceRunners || !Object.keys(td.raceRunners).length)) {
        td.raceRunners = JSON.parse(JSON.stringify(store.raceRunners));
        changed = true;
      }
      if (store.bossesBet && typeof store.bossesBet === 'object') {
        const hasLegacyBosses = (Array.isArray(store.bossesBet.legs) && store.bossesBet.legs.length) || Object.keys(store.bossesBet.selections || {}).length;
        const hasTrackBosses = (Array.isArray(td.bossesBet?.legs) && td.bossesBet.legs.length) || Object.keys(td.bossesBet?.selections || {}).length;
        if (hasLegacyBosses && !hasTrackBosses) {
          td.bossesBet = JSON.parse(JSON.stringify(store.bossesBet));
          changed = true;
        }
      }
    }

    if (!store.puntersClub.schedule[trackId] || typeof store.puntersClub.schedule[trackId] !== 'object') {
      const t = TRACKS[trackId];
      store.puntersClub.schedule[trackId] = {
        raceDay: t.raceDay,
        openHour: t.defaultOpenHour,
        openMinute: t.defaultOpenMinute,
        lockHour: t.defaultLockHour,
        lockMinute: t.defaultLockMinute
      };
      changed = true;
    }
    if (typeof store.puntersClub.jackpotCarryByTrack[trackId] !== 'number' || !Number.isFinite(store.puntersClub.jackpotCarryByTrack[trackId]) || store.puntersClub.jackpotCarryByTrack[trackId] < 0) {
      const fallback = trackId === 'thoroughbreds' ? Number(store.jackpotCarry || 0) : 0;
      store.puntersClub.jackpotCarryByTrack[trackId] = Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
      changed = true;
    }
    if (!Array.isArray(store.puntersClub.banterByTrack[trackId])) {
      store.puntersClub.banterByTrack[trackId] = [];
      changed = true;
    }
  });

  if (typeof store.puntersClub.settings.nextRoundOpensAt !== 'number' && store.puntersClub.settings.nextRoundOpensAt !== null) {
    store.puntersClub.settings.nextRoundOpensAt = null;
    changed = true;
  }
  const thCarry = Number(store.puntersClub.jackpotCarryByTrack?.thoroughbreds || 0);
  if (typeof store.jackpotCarry !== 'number' || !Number.isFinite(store.jackpotCarry) || store.jackpotCarry < 0 || Math.abs(store.jackpotCarry - thCarry) > 0.000001) {
    store.jackpotCarry = thCarry;
    changed = true;
  }

  for (const r of store.puntersClub.rounds) {
    if (!r.trackId) { r.trackId = 'thoroughbreds'; changed = true; }
  }
  for (const c of store.puntersClub.claims) {
    if (!c.trackId) { c.trackId = 'thoroughbreds'; changed = true; }
  }

  return changed;
}

function getCurrentRound(store, { autoCreate = true, trackId = 'thoroughbreds' } = {}) {
  ensurePuntersClubStore(store);
  const tId = normalizeTrackId(trackId);
  const rounds = store.puntersClub.rounds;
  let open = rounds.find((r) => normalizeTrackId(r.trackId) === tId && String(r.status || '').toLowerCase() === 'open');
  if (!open && autoCreate) {
    const trackRounds = rounds.filter((r) => normalizeTrackId(r.trackId) === tId);
    open = {
      id: crypto.randomUUID(),
      trackId: tId,
      label: `${TRACKS[tId].name} Round ${trackRounds.length + 1}`,
      status: 'open',
      createdAt: Date.now(),
      entryFee: Number(store.entryFee || 20),
      payments: [],
      entries: [],
      payouts: []
    };
    rounds.unshift(open);
  }
  return open || null;
}

function getDefaultNextRoundOpenAtMs(trackId = 'thoroughbreds', store = null) {
  const tId = normalizeTrackId(trackId);
  const now = new Date();
  const t = TRACKS[tId] || TRACKS.thoroughbreds;
  const sched = store?.puntersClub?.schedule?.[tId] || {};
  const day = Number.isFinite(Number(sched.raceDay)) ? Number(sched.raceDay) : t.raceDay;
  const hour = Number.isFinite(Number(sched.openHour)) ? Number(sched.openHour) : t.defaultOpenHour;
  const minute = Number.isFinite(Number(sched.openMinute)) ? Number(sched.openMinute) : t.defaultOpenMinute;

  const diff = (day - now.getDay() + 7) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + diff);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
  return next.getTime();
}

function getLatestClosedRound(store, trackId = 'thoroughbreds') {
  const tId = normalizeTrackId(trackId);
  return (store.puntersClub?.rounds || []).find((r) => normalizeTrackId(r.trackId) === tId && String(r.status || '').toLowerCase() === 'closed') || null;
}

function pickLarrikinLine() {
  const lines = [
    'That was a proper clinic — shout the winner a snag.',
    'Round wrapped. Wallets lighter, banter heavier.',
    'Too good. The rest of us are chasing shadows.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function getTrackData(store, trackId = 'thoroughbreds') {
  ensurePuntersClubStore(store);
  const tId = normalizeTrackId(trackId);
  return store.puntersClub.tracks[tId] || defaultTrackData(tId);
}

function getTipsForTrack(store, trackId = 'thoroughbreds', { includeRemoved = false } = {}) {
  const tId = normalizeTrackId(trackId);
  return (store.tips || []).filter((tip) => {
    const tipTrack = normalizeTrackId(tip.trackId || 'thoroughbreds');
    if (tipTrack !== tId) return false;
    if (!includeRemoved && tip.status === 'removed') return false;
    return true;
  });
}

function buildRoundSnapshot(store, round) {
  const trackId = normalizeTrackId(round?.trackId);
  const ladder = computeLadder(store, { trackId });
  const top10 = ladder.slice(0, 10);
  const top3 = ladder.slice(0, 3);
  const { paidMembers, freeMembers, currentRoundPot, rollover, totalPot } = computeJackpotTierData(store, { trackId, autoCreate: false });
  const trackData = getTrackData(store, trackId);
  const finalFixtures = Array.isArray(trackData.fixtures) ? JSON.parse(JSON.stringify(trackData.fixtures || [])) : [];
  const tipsFeed = getTipsForTrack(store, trackId);
  const winnerMember = String(round?.winner?.member || top3?.[0]?.member || '').trim() || 'tofu';
  const snapshot = {
    finalLeaderboard: ladder.slice(0, 100),
    finalTop10: top10,
    finalTop3: top3,
    finalPotAmount: Math.round(Number(totalPot || 0) * 100) / 100,
    finalCounts: { entries: Number(freeMembers || 0), paidEntries: Number(paidMembers || 0) },
    finalFixtures,
    finalTipsFeed: tipsFeed,
    finalJackpot: { currentRoundPot, rollover, totalPot },
    winner: {
      member: winnerMember,
      payout: Number(round?.winner?.payout || totalPot || 0),
      notes: String(round?.winner?.notes || pickLarrikinLine())
    }
  };
  return snapshot;
}

function syncCurrentRoundEntries(store, opts = {}) {
  const trackId = normalizeTrackId(opts.trackId);
  const round = getCurrentRound(store, { ...opts, trackId });
  if (!round) return null;
  const byMember = new Map();
  getTipsForTrack(store, trackId).forEach((tip) => {
    const member = String(tip.member || '').trim();
    if (!member) return;
    if (!byMember.has(member)) byMember.set(member, { member, tips: 0, tier: 'FREE', paid: false });
    const row = byMember.get(member);
    row.tips += 1;
    if (tip.paid) { row.tier = 'JACKPOT'; row.paid = true; }
  });
  round.entries = [...byMember.values()];
  const existingPaid = new Set((round.payments || []).filter((p) => p.verified).map((p) => String(p.member || '').toLowerCase()));
  for (const row of round.entries) {
    if (row.paid && !existingPaid.has(String(row.member || '').toLowerCase())) {
      round.payments.push({ id: crypto.randomUUID(), member: row.member, amount: Number(round.entryFee || 20), verified: true, method: 'legacy-paid-flag', reference: '', verifiedAt: Date.now(), verifiedBy: 'system' });
      existingPaid.add(String(row.member || '').toLowerCase());
    }
  }
  return round;
}

function computeLadderCached(store, roundId = 'live', trackId = 'thoroughbreds') {
  ensurePuntersClubStore(store);
  const tId = normalizeTrackId(trackId);
  const trackData = getTrackData(store, tId);
  const raceSig = Object.keys(trackData.raceResults || {}).sort().map((race) => {
    const rr = trackData.raceResults[race] || {};
    return `${race}:${(rr.first||[]).join('|')}/${(rr.second||[]).join('|')}/${(rr.third||[]).join('|')}`;
  }).join(';');
  const tipsSig = getTipsForTrack(store, tId).filter((t)=>t.status==='approved').map((t)=>`${t.member}:${t.race}:${t.selection}:${t.paid?'1':'0'}`).sort().join(';');
  const cacheKey = `${tId}:${roundId}`;
  const signature = `${raceSig}#${tipsSig}`;
  const hit = store.puntersClub.leaderboardCache[cacheKey];
  if (hit && hit.signature === signature) return hit.data;
  const data = computeLadder(store, { trackId: tId });
  store.puntersClub.leaderboardCache[cacheKey] = { signature, data, updatedAt: Date.now() };
  return data;
}

function computeJackpotTierData(store, opts = {}) {
  const trackId = normalizeTrackId(opts.trackId);
  const round = syncCurrentRoundEntries(store, { ...opts, trackId });
  const paidMembers = new Set((round?.entries || []).filter((e) => e.tier === 'JACKPOT').map((e) => String(e.member || '').toLowerCase())).size;
  const freeMembers = new Set((round?.entries || []).map((e) => String(e.member || '').toLowerCase())).size;
  const entryFee = Number(round?.entryFee || store.entryFee || 20);
  const currentRoundPot = paidMembers * entryFee;
  const rollover = getTrackJackpotCarry(store, trackId);
  const totalPot = currentRoundPot + rollover;
  return { round, paidMembers, freeMembers, entryFee, currentRoundPot, rollover, totalPot };
}

function computeLadder(store, opts = {}) {
  const trackId = normalizeTrackId(opts.trackId);
  const trackData = getTrackData(store, trackId);
  const trackTips = getTipsForTrack(store, trackId, { includeRemoved: true });
  const score = new Map();

  const ensureMember = (member) => {
    const key = String(member || 'Unknown').trim() || 'Unknown';
    if (!score.has(key)) score.set(key, { member: key, points: 0, winners: 0 });
    return key;
  };

  const addPoints = (member, pts, isWinner) => {
    const key = ensureMember(member);
    const row = score.get(key);
    row.points += pts;
    if (isWinner) row.winners += 1;
    score.set(key, row);
  };

  // Ensure anyone who has entered approved tips appears on the live ladder,
  // even before any race results are posted.
  for (const tip of trackTips) {
    if (tip.status !== 'approved') continue;
    ensureMember(tip.member);
  }

  for (const tip of trackTips || []) {
    if (tip.status !== 'approved') continue;
    const race = String(tip.race || '');
    const rr = trackData.raceResults?.[race];
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

function getLastScoredRace(store, trackId = 'thoroughbreds') {
  const trackData = getTrackData(store, trackId);
  const races = Object.entries(trackData.raceResults || {})
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

function normalizeMilestoneRounds(store) {
  const archived = normalizeArchivedRounds(store);
  const closed = (store.puntersClub?.rounds || [])
    .filter((r) => String(r.status || '').toLowerCase() === 'closed')
    .map((r) => {
      const snap = r.snapshot || {};
      const topWinner = snap?.winner?.member || r?.winner?.member || '';
      const payout = Number(snap?.winner?.payout ?? r?.winner?.payout ?? snap?.finalPotAmount ?? 0);
      const tips = Array.isArray(snap.finalTipsFeed) ? snap.finalTipsFeed : [];
      return {
        id: r.id,
        archivedAt: Number(r.closedAt || r.updatedAt || Date.now()),
        fixture: (Array.isArray(snap.finalFixtures) && snap.finalFixtures[0]) ? snap.finalFixtures[0] : { date: '' },
        tips,
        ladder: Array.isArray(snap.finalLeaderboard) ? snap.finalLeaderboard : [],
        jackpot: {
          outrightWinner: String(topWinner || '').trim() || null,
          roundPool: Number(snap?.finalJackpot?.currentRoundPot || 0),
          previousCarry: Number(snap?.finalJackpot?.rollover || 0),
          rolloverToNextWeek: 0
        },
        winner: {
          member: String(topWinner || '').trim() || null,
          payout
        },
        label: r.label
      };
    });

  const merged = [...archived, ...closed]
    .sort((a, b) => Number(a.archivedAt || 0) - Number(b.archivedAt || 0));

  return merged.map((round, idx) => ({
    ...round,
    weekNumber: idx + 1,
    weekLabel: round.weekLabel || round.label || `Week ${idx + 1}`
  }));
}

function computeMilestonesData(store) {
  const rounds = normalizeMilestoneRounds(store);
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
      const roundPool = Number(round?.jackpot?.roundPool || 0);
      const previousCarry = Number(round?.jackpot?.previousCarry || 0);
      const explicitPayout = Number(round?.winner?.payout);
      return {
        member: winner,
        weekNumber: round.weekNumber,
        weekLabel: round.weekLabel,
        archivedAt: Number(round.archivedAt || 0),
        points: Number(ladderEntry?.points || 0),
        winners: Number(ladderEntry?.winners || 0),
        prize: Number.isFinite(explicitPayout) && explicitPayout > 0 ? explicitPayout : (roundPool + previousCarry)
      };
    })
    .filter(Boolean);

  const winnerHistory = [...rounds].reverse().map((round) => {
    const winner = String(round?.jackpot?.outrightWinner || '').trim();
    const roundPool = Number(round?.jackpot?.roundPool || 0);
    const previousCarry = Number(round?.jackpot?.previousCarry || 0);
    const rolloverToNextWeek = Number(round?.jackpot?.rolloverToNextWeek || 0);
    const explicitPayout = Number(round?.winner?.payout);
    const computedPrize = winner ? (roundPool + previousCarry) : (rolloverToNextWeek || (roundPool + previousCarry));
    const prize = winner && Number.isFinite(explicitPayout) && explicitPayout > 0 ? explicitPayout : computedPrize;
    const ladderEntry = winner
      ? (round.ladder || []).find((r) => String(r.member || '').trim().toLowerCase() === winner.toLowerCase()) || null
      : null;
    return {
      member: winner || 'No outright winner (rollover)',
      weekNumber: round.weekNumber,
      weekLabel: round.weekLabel,
      archivedAt: Number(round.archivedAt || 0),
      points: Number(ladderEntry?.points || 0),
      winners: Number(ladderEntry?.winners || 0),
      prize,
      rolledOver: !winner
    };
  });

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

  const featuredWinner = [...winnersChrono].reverse()[0] || null;
  const latestRound = rounds.length ? rounds[rounds.length - 1] : null;
  const latestRoundSummary = latestRound ? {
    weekNumber: latestRound.weekNumber,
    weekLabel: latestRound.weekLabel,
    archivedAt: Number(latestRound.archivedAt || 0),
    raceDate: String(latestRound?.fixture?.date || ''),
    outrightWinner: String(latestRound?.jackpot?.outrightWinner || '').trim() || null,
    rolloverToNextWeek: Number(latestRound?.jackpot?.rolloverToNextWeek || 0),
    roundPool: Number(latestRound?.jackpot?.roundPool || 0),
    previousCarry: Number(latestRound?.jackpot?.previousCarry || 0)
  } : null;

  return {
    featuredWinner,
    latestRound: latestRoundSummary,
    winnerHistory,
    streakLeaderboard: milestoneRows.map((r, i) => ({ rank: i + 1, ...r })),
    generatedAt: Date.now()
  };
}

function computeMemberBreakdown(store, memberName, opts = {}) {
  const trackId = normalizeTrackId(opts.trackId);
  const trackData = getTrackData(store, trackId);
  const target = String(memberName || '').trim().toLowerCase();
  if (!target) return { member: memberName, totalPoints: 0, winners: 0, races: [] };

  const rows = [];
  let totalPoints = 0;
  let winners = 0;

  const myTips = getTipsForTrack(store, trackId, { includeRemoved: true })
    .filter((t) => t.status === 'approved' && String(t.member || '').trim().toLowerCase() === target)
    .sort((a, b) => Number(String(a.race || 'R0').slice(1)) - Number(String(b.race || 'R0').slice(1)));

  for (const tip of myTips) {
    const race = String(tip.race || '');
    const rr = trackData.raceResults?.[race];
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
    const isLocalHost = canonicalHost === 'localhost' || canonicalHost === '127.0.0.1';

    if (!isLocalHost && (!isSecure || hostNoPort !== canonicalHost)) {
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    }
    return next();
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use('/api', (req, res, next) => {
    const isGet = String(req.method || '').toUpperCase() === 'GET';
    const hasAuth = Boolean(req.headers.authorization);
    const path = String(req.path || '');
    const cacheablePublicGet = isGet && !hasAuth && (
      path.startsWith('/punters/overview') ||
      path.startsWith('/fixtures') ||
      path.startsWith('/ladder') ||
      path.startsWith('/milestones') ||
      path.startsWith('/jackpot') ||
      path.startsWith('/poker/dashboard') ||
      path.startsWith('/poker/results') ||
      path.startsWith('/social-feed')
    );

    if (cacheablePublicGet) {
      res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60, stale-if-error=300');
      res.setHeader('Vary', 'Accept-Encoding');
      return next();
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'Authorization, Accept-Encoding');
    return next();
  });
  app.use(express.json({ limit: '350kb' }));
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
    const email = String(req.body.email || '').trim().toLowerCase();
    const recoveryCode = String(req.body.recoveryCode || '').trim();

    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-24 chars using letters, numbers, _ or -' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (recoveryCode && recoveryCode.length < 4) {
      return res.status(400).json({ error: 'Recovery code must be at least 4 characters' });
    }

    const store = readStore();
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      recoveryCodeHash: recoveryCode ? bcrypt.hashSync(recoveryCode, 10) : null,
      role: 'member',
      createdAt: Date.now(),
      profile: normalizeUserProfile({ email })
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

  app.post('/api/password-recovery/reset', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const recoveryCode = String(req.body?.recoveryCode || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!username || !recoveryCode || !newPassword) {
      return res.status(400).json({ error: 'Username, recovery code, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const store = readStore();
    const user = (store.users || []).find((u) => String(u.username || '').toLowerCase() === username.toLowerCase());
    if (!user || !user.recoveryCodeHash || !bcrypt.compareSync(recoveryCode, user.recoveryCodeHash)) {
      return res.status(401).json({ error: 'Recovery details are invalid' });
    }

    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    writeStore(store);
    return res.json({ ok: true, message: 'Password reset. You can log in now.' });
  });

  app.post('/api/password-recovery/set', auth, (req, res) => {
    const recoveryCode = String(req.body?.recoveryCode || '').trim();
    if (recoveryCode.length < 4) return res.status(400).json({ error: 'Recovery code must be at least 4 characters' });
    const store = readStore();
    const user = (store.users || []).find((u) => String(u.id || '') === String(req.user.sub || ''));
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.recoveryCodeHash = bcrypt.hashSync(recoveryCode, 10);
    writeStore(store);
    return res.json({ ok: true });
  });

  app.post('/api/logout', auth, (_req, res) => res.json({ ok: true }));
  app.get('/api/me', auth, (req, res) => {
    const store = readStore();
    const user = store.users.find((u) => u.id === req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { id: user.id, username: user.username, role: user.role, profile: normalizeUserProfile(user.profile) } });
  });

  app.get('/api/users', auth, adminOnly, (_req, res) => {
    const store = readStore();
    const users = (store.users || [])
      .map((u) => ({ id: u.id, username: u.username, role: u.role || 'member', createdAt: Number(u.createdAt || 0) }))
      .sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    return res.json({ users, count: users.length });
  });

  app.patch('/api/users/:id/role', auth, adminOnly, (req, res) => {
    const store = readStore();
    const id = String(req.params.id || '').trim();
    const role = String(req.body?.role || '').trim().toLowerCase();
    if (!id) return res.status(400).json({ error: 'User id is required' });
    if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Role must be admin or member' });

    const user = (store.users || []).find((u) => String(u.id || '') === id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = role;
    writeStore(store);
    return res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
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
    const email = req.body?.email;
    const profilePic = req.body?.profilePic;
    const settings = req.body?.settings;
    const next = normalizeUserProfile({
      ...normalizeUserProfile(user.profile),
      ...(bio !== undefined ? { bio } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(profilePic !== undefined ? { profilePic } : {}),
      ...(settings && typeof settings === 'object' ? { settings: { ...normalizeUserProfile(user.profile).settings, ...settings } } : {})
    });

    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const isHttp = /^https?:\/\//i.test(next.profilePic);
    const isSitePath = next.profilePic.startsWith('/');
    const isDataImage = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(next.profilePic);
    if (next.profilePic && !isHttp && !isSitePath && !isDataImage) {
      return res.status(400).json({ error: 'Profile pic must be an absolute URL, site-relative path, or uploaded image.' });
    }
    if (isDataImage && next.profilePic.length > 220000) {
      return res.status(400).json({ error: 'Uploaded avatar is too large. Please use a smaller image.' });
    }

    user.profile = next;
    writeStore(store);
    return res.json({ ok: true, profile: next });
  });

  app.get('/api/fixtures', (req, res) => {
    const store = readStore();
    const trackKey = req.query.track || req.query.trackId;
    const trackId = normalizeTrackId(trackKey);
    const fixtures = trackKey ? (getTrackData(store, trackId).fixtures || []) : (store.fixtures || []);
    return res.json({ trackId, fixtures });
  });

  app.get('/api/results', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackKey = req.query.track || req.query.trackId;
    const trackId = normalizeTrackId(trackKey);
    const raceResults = trackKey ? (getTrackData(store, trackId).raceResults || {}) : (store.raceResults || {});
    return res.json({ trackId, raceResults });
  });

  app.get('/api/race-runners', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackKey = req.query.track || req.query.trackId;
    const trackId = normalizeTrackId(trackKey);
    const raceRunners = trackKey ? (getTrackData(store, trackId).raceRunners || {}) : (store.raceRunners || {});
    return res.json({ trackId, raceRunners });
  });

  app.get('/api/bosses-bet', (req, res) => {
    const store = readStore();
    const trackKey = req.query.track || req.query.trackId;
    const trackId = normalizeTrackId(trackKey);
    const bossesBet = trackKey ? computeBossesBetProgress(store, trackId) : computeBossesBetProgress(store, 'thoroughbreds');
    return res.json({ trackId, bossesBet });
  });

  app.post('/api/admin/extract-bosses-multi', auth, adminOnly, async (req, res) => {
    try {
      const ct = String(req.headers['content-type'] || '');
      let imageBuf = null;
      let imageType = 'image/png';

      if (ct.includes('multipart/form-data')) {
        const raw = await readRawBody(req, 10 * 1024 * 1024);
        const parsed = parseMultipartImage(raw, ct);
        if (!parsed?.buffer?.length) return res.status(400).json({ error: 'No image file found in multipart upload.' });
        imageBuf = parsed.buffer;
        imageType = parsed.contentType || imageType;
      } else if (ct.includes('application/json')) {
        const dataUrl = String(req.body?.imageDataUrl || '');
        const m = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
        if (!m) return res.status(400).json({ error: 'Provide imageDataUrl as data:image/...;base64,...' });
        imageType = m[1];
        imageBuf = Buffer.from(m[2], 'base64');
      } else {
        return res.status(415).json({ error: 'Unsupported content type. Use multipart/form-data or JSON imageDataUrl.' });
      }

      if (!imageBuf || !imageBuf.length) return res.status(400).json({ error: 'Image upload is empty.' });
      if (imageBuf.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 10MB).' });

      const imageDataUrl = `data:${imageType};base64,${imageBuf.toString('base64')}`;
      const [pass1, pass2] = await Promise.all([
        openAiExtractBosses(imageDataUrl, 1),
        openAiExtractBosses(imageDataUrl, 2)
      ]);
      const diffs = compareBossesDrafts(pass1, pass2);
      const mergedDraft = mergeBossesDrafts(pass1, pass2, diffs);
      const verified = diffs.length === 0;

      return res.json({ pass1, pass2, mergedDraft, diffs, verified });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Could not extract screenshot.' });
    }
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
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));

    const legsRaw = Array.isArray(req.body.legs) ? req.body.legs : ['R9', 'R10', 'R11', 'R12'];
    const legs = legsRaw.map((r) => String(r).toUpperCase()).filter((r) => validRaces.has(r));
    if (!legs.length) return res.status(400).json({ error: 'At least one valid leg is required' });

    const selections = {};
    const inSel = req.body.selections && typeof req.body.selections === 'object' ? req.body.selections : {};
    legs.forEach((race) => { selections[race] = String(inSel[race] || '').trim(); });

    const allowedStatus = new Set(['live', 'won', 'lost', 'void']);
    const statusRaw = String(req.body?.status || '').trim().toLowerCase();
    const status = allowedStatus.has(statusRaw) ? statusRaw : 'live';

    const legItemsIn = Array.isArray(req.body?.legItems) ? req.body.legItems : [];
    const legItems = legItemsIn
      .map((item, idx) => ({
        legNumber: Number(item?.legNumber || idx + 1),
        race: String(item?.race || '').toUpperCase(),
        selection: String(item?.selection || '').trim(),
        betType: 'PLACE',
        odds: item?.odds == null ? '' : String(item.odds).trim(),
        result: String(item?.result || 'PENDING').trim().toUpperCase()
      }))
      .filter((item) => item.race && validRaces.has(item.race));

    trackData.bossesBet = {
      title: String(req.body?.title || 'Bosses Multi').trim() || 'Bosses Multi',
      weekKey: String(req.body?.weekKey || '').trim(),
      meet: String(trackData?.fixtures?.[0]?.track || '').trim(),
      status,
      freerollPrize: Math.max(0, Number(req.body?.freerollPrize || 0) || 0),
      eligibilityNote: String(req.body?.eligibilityNote || 'Eligible = all players who entered tips this week before lock.').trim() || 'Eligible = all players who entered tips this week before lock.',
      lockTime: Number(req.body?.lockTime || 0) || null,
      stake: '$25',
      potentialReturn: String(req.body?.potentialReturn || '').trim(),
      legItems,
      legs,
      selections,
      updatedAt: Date.now(),
      updatedBy: req.user.username
    };

    if (trackId === 'thoroughbreds') {
      store.bossesBet = trackData.bossesBet;
    }

    writeStore(store);
    return res.json({ ok: true, trackId, bossesBet: computeBossesBetProgress(store, trackId) });
  });

  app.delete('/api/bosses-bet', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    trackData.bossesBet = { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, stake: '', potentialReturn: '', legItems: [], legs: [], selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };
    if (trackId === 'thoroughbreds') {
      store.bossesBet = trackData.bossesBet;
    }
    writeStore(store);
    return res.json({ ok: true, trackId, bossesBet: computeBossesBetProgress(store, trackId) });
  });

  app.delete('/api/bosses-bet/results', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const allRaces = Array.from({ length: raceCount }, (_, i) => `R${i + 1}`);

    // Hard reset selected meet results + bosses selections to avoid stale "missed" states.
    trackData.raceResults = {};
    trackData.raceRunners = {};
    trackData.bossesBet = { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, stake: '', potentialReturn: '', legItems: [], legs: allRaces, selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };

    if (trackId === 'thoroughbreds') {
      store.raceResults = {};
      store.raceRunners = {};
      store.bossesBet = trackData.bossesBet;
    }

    writeStore(store);
    return res.json({ ok: true, trackId, clearedLegs: allRaces, bossesBet: computeBossesBetProgress(store, trackId) });
  });

  app.put('/api/results/:race', auth, adminOnly, (req, res) => {
    const race = String(req.params.race || '').toUpperCase();
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });

    const first = parseRunnerList(req.body.first);
    const second = parseRunnerList(req.body.second);
    const third = parseRunnerList(req.body.third);
    const substitutions = parseSubs(req.body.substitutions);

    if (!trackData.raceResults || typeof trackData.raceResults !== 'object') trackData.raceResults = {};
    trackData.raceResults[race] = {
      first,
      second,
      third,
      substitutions,
      updatedAt: Date.now(),
      updatedBy: req.user.username
    };

    if (trackId === 'thoroughbreds') {
      store.raceResults = trackData.raceResults;
    }

    writeStore(store);
    return res.json({ ok: true, trackId, race, result: trackData.raceResults[race] });
  });

  app.delete('/api/results/:race', auth, adminOnly, (req, res) => {
    const race = String(req.params.race || '').toUpperCase();
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });

    if (!trackData.raceResults || typeof trackData.raceResults !== 'object') trackData.raceResults = {};
    delete trackData.raceResults[race];
    if (trackId === 'thoroughbreds') {
      store.raceResults = trackData.raceResults;
    }
    writeStore(store);
    return res.json({ ok: true, trackId, race, removed: true });
  });

  app.post('/api/race-runners/parse', auth, adminOnly, (req, res) => {
    const raceNumber = Number(req.body?.raceNumber || 1);
    const text = String(req.body?.text || '');
    if (!text.trim()) return res.status(400).json({ error: 'Paste text is required' });
    const runners = parseImportedRunners({ text, raceNumber });
    return res.json({ ok: true, raceNumber, runners, warningsCount: runners.reduce((n, r) => n + (r.warnings || []).length, 0) });
  });

  app.put('/api/race-runners/:race', auth, adminOnly, (req, res) => {
    const race = String(req.params.race || '').toUpperCase();
    const overwrite = Boolean(req.body?.overwrite);
    const source = String(req.body?.source || 'manual-paste').trim() || 'manual-paste';
    const notes = String(req.body?.notes || '').trim();
    const runners = Array.isArray(req.body?.runners) ? req.body.runners : [];

    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const raceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });
    if (!runners.length) return res.status(400).json({ error: 'No parsed runners to save' });

    if (!trackData.raceRunners || typeof trackData.raceRunners !== 'object') trackData.raceRunners = {};
    if (trackData.raceRunners[race] && !overwrite) {
      return res.status(409).json({ error: `${race} already has imported runners`, needsOverwrite: true });
    }

    trackData.raceRunners[race] = {
      importedAt: new Date().toISOString(),
      importedBy: req.user.username,
      source,
      notes,
      runners
    };

    if (trackId === 'thoroughbreds') {
      store.raceRunners = trackData.raceRunners;
    }

    writeStore(store);
    return res.json({ ok: true, trackId, race, raceRunners: trackData.raceRunners[race] });
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
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const idx = (trackData.fixtures || []).findIndex((f) => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Fixture not found' });

    trackData.fixtures[idx] = { ...trackData.fixtures[idx], date, event, track, raceCount };
    if (trackId === 'thoroughbreds') {
      store.fixtures = trackData.fixtures;
    }
    writeStore(store);
    return res.json({ ok: true, trackId, fixture: trackData.fixtures[idx] });
  });

  app.get('/api/tips', (req, res) => {
    const status = String(req.query.status || 'approved');
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const store = readStore();
    const sorted = [...(store.tips || [])]
      .filter((t) => normalizeTrackId(t.trackId || 'thoroughbreds') === trackId)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (status === 'all') return res.json({ trackId, tips: sorted });
    return res.json({ trackId, tips: sorted.filter((t) => t.status === status) });
  });

  function buildSimpleNextTipState(req, store) {
    const requestedTrackId = normalizeTrackId(req.query.track || req.query.trackId || req.query.trackSlug);
    const tipsArr = Array.isArray(store?.tips) ? store.tips.filter((t) => t && typeof t === 'object') : [];
    const usableTips = tipsArr.filter((t) => String(t.status || '') !== 'removed');
    const trackTips = usableTips.filter((t) => normalizeTrackId(t.trackId || 'thoroughbreds') === requestedTrackId);
    const baseTips = trackTips.length ? trackTips : usableTips;

    const userKey = String(req.user?.username || '').trim().toLowerCase();
    const mine = baseTips
      .filter((t) => String(t.member || '').trim().toLowerCase() === userKey)
      .sort((a, b) => Number(String(a.race || 'R999').replace('R', '')) - Number(String(b.race || 'R999').replace('R', '')));

    const trackData = getTrackData(store, requestedTrackId);
    const fixtureRaceCount = Number(trackData?.fixtures?.[0]?.raceCount || TRACKS[requestedTrackId]?.defaultRaceCount || 12);
    const raceCount = Number.isFinite(fixtureRaceCount) && fixtureRaceCount > 0 ? fixtureRaceCount : 12;

    const mineSet = new Set(mine.map((t) => String(t.race || '').toUpperCase()));
    const settledSet = new Set(
      Object.keys(trackData?.raceResults || {})
        .map((race) => String(race || '').toUpperCase())
        .filter((race) => /^R\d+$/.test(race))
    );

    let nextRace = null;
    for (let i = 1; i <= raceCount; i += 1) {
      const race = `R${i}`;
      if (!settledSet.has(race)) { nextRace = race; break; }
    }

    const allComplete = !nextRace;
    if (!nextRace) nextRace = `R${raceCount}`;

    const tip = mine.find((t) => String(t.race || '').toUpperCase() === nextRace) || null;
    const raceTips = baseTips.filter((t) => String(t.race || '').toUpperCase() === nextRace);
    const enteredMembers = new Set(raceTips.map((t) => String(t.member || '').trim().toLowerCase()).filter(Boolean));

    const editable = canEditTipsNow(store);
    const round = getCurrentRound(store, { autoCreate: false, trackId: requestedTrackId });
    const lockAtMs = Number(round?.lockAt || 0) || Number(getEffectiveTipEditDeadlineMs(store) || 0) || null;
    const fixture = (
      (Array.isArray(store?.puntersClub?.tracks?.[requestedTrackId]?.fixtures) && store.puntersClub.tracks[requestedTrackId].fixtures[0])
      || (Array.isArray(store?.fixtures) && store.fixtures[0])
      || null
    );
    const userHasTip = Boolean(tip);
    const othersCount = userHasTip ? Math.max(0, enteredMembers.size - 1) : enteredMembers.size;
    const venue = String(fixture?.track || fixture?.event || fixture?.venue || '').trim();

    return {
      requestedTrackId,
      roundStatus: allComplete ? 'CLOSED' : 'OPEN',
      allComplete,
      editable,
      lockAtMs,
      fixture,
      venue,
      nextRace,
      tip,
      userHasTip,
      othersCount
    };
  }

  app.get('/api/punters/next-tip', auth, (req, res) => {
    try {
      const store = readStore();
      const s = buildSimpleNextTipState(req, store);
      return res.json({
        trackId: s.requestedTrackId,
        trackName: TRACKS[s.requestedTrackId]?.name || s.requestedTrackId,
        roundStatus: s.roundStatus,
        editable: s.editable,
        statusBadge: s.allComplete ? 'Closed' : (s.editable ? 'Editable' : 'Locked'),
        fixture: s.fixture,
        venue: s.venue,
        nextRace: s.nextRace,
        startAtMs: null,
        lockAtMs: s.lockAtMs,
        countdownToMs: s.lockAtMs,
        hasTip: s.userHasTip,
        tip: s.tip ? {
          race: String(s.tip.race || s.nextRace),
          selection: String(s.tip.selection || ''),
          runnerName: String(s.tip.runnerName || s.tip.horseName || '')
        } : null,
        missingTip: !s.userHasTip,
        allComplete: s.allComplete
      });
    } catch (err) {
      console.error('[next-tip] failed', err?.stack || err);
      return res.status(200).json({
        roundStatus: 'ERROR',
        hasTip: false,
        allComplete: false,
        editable: false,
        statusBadge: 'Syncing'
      });
    }
  });

  app.get('/api/punters/next-tip-summary', auth, (req, res) => {
    try {
      const store = readStore();
      const s = buildSimpleNextTipState(req, store);
      return res.json({
        roundStatus: s.roundStatus,
        trackId: s.requestedTrackId,
        trackName: TRACKS[s.requestedTrackId]?.name || s.requestedTrackId,
        venue: s.venue,
        raceNumber: s.nextRace,
        startTime: null,
        lockTime: s.lockAtMs,
        userHasTip: s.userHasTip,
        userPick: s.tip ? {
          race: String(s.tip.race || s.nextRace),
          selection: String(s.tip.selection || ''),
          runnerName: String(s.tip.runnerName || s.tip.horseName || '')
        } : null,
        canEdit: s.editable,
        othersCount: s.othersCount,
        ladderRank: null,
        ladderRankAvailable: false,
        state: s.allComplete ? 'ROUND_COMPLETE' : (s.userHasTip ? (s.editable ? 'EDITABLE' : 'LOCKED') : 'MISSING_TIP')
      });
    } catch (err) {
      console.error('[next-tip-summary] failed', err?.stack || err);
      return res.status(200).json({
        roundStatus: 'ERROR',
        state: 'ERROR',
        userHasTip: false,
        canEdit: false,
        othersCount: 0,
        ladderRankAvailable: false
      });
    }
  });

  app.post('/api/tips', auth, (req, res) => {
    const race = String(req.body.race || '').trim().toUpperCase();
    const selection = String(req.body.selection || req.body.horse || '').trim();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const store = readStore();
    let openRound = getCurrentRound(store, { autoCreate: false, trackId });
    const adminOverride = Boolean(req.body?.adminOverride) && req.user?.role === 'admin';
    if (!openRound && (store.puntersClub?.rounds || []).filter((r)=>normalizeTrackId(r.trackId)===trackId).length === 0) {
      openRound = getCurrentRound(store, { autoCreate: true, trackId });
    }
    if (!openRound && !adminOverride) {
      return res.status(403).json({ error: 'Round finished ✅. Tips are locked until next round opens.' });
    }
    const raceCount = Number(getTrackData(store, trackId)?.fixtures?.[0]?.raceCount || TRACKS[trackId].defaultRaceCount || 12);
    const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
    if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });
    if (!selection) return res.status(400).json({ error: 'Selection is required' });

    const matches = (store.tips || [])
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => normalizeTrackId(t.trackId || 'thoroughbreds') === trackId && t.member === req.user.username && t.race === race && t.status !== 'removed')
      .sort((a, b) => Number(b.t.updatedAt || b.t.createdAt || 0) - Number(a.t.updatedAt || a.t.createdAt || 0));

    if (matches.length > 0) {
      if (!canEditTipsNow(store)) {
        return res.status(403).json({ error: `Tips can only be edited until ${TIP_EDIT_DEADLINE_ISO}` });
      }

      const primary = matches[0];
      store.tips[primary.idx] = { ...store.tips[primary.idx], selection, status: 'approved', updatedAt: Date.now() };

      // Defensive dedupe: if legacy duplicates exist for same member/race,
      // retire older ones so future edits and displays are consistent.
      for (let i = 1; i < matches.length; i += 1) {
        const old = matches[i];
        store.tips[old.idx] = { ...store.tips[old.idx], status: 'removed', updatedAt: Date.now() };
      }

      writeStore(store);
      return res.json({ ok: true, tip: store.tips[primary.idx], updated: true, deduped: Math.max(0, matches.length - 1) });
    }

    const tip = {
      id: crypto.randomUUID(),
      member: req.user.username,
      race,
      selection,
      status: 'approved',
      paid: false,
      trackId,
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
      const tipTrack = normalizeTrackId(store.tips[idx]?.trackId || 'thoroughbreds');
      const raceCount = Number(getTrackData(store, tipTrack)?.fixtures?.[0]?.raceCount || TRACKS[tipTrack].defaultRaceCount || 12);
      const validRaces = new Set(Array.from({ length: raceCount }, (_, i) => `R${i + 1}`));
      if (!validRaces.has(race)) return res.status(400).json({ error: `Race must be between R1 and R${raceCount}` });
      store.tips[idx].race = race;
    }

    writeStore(store);
    return res.json({ ok: true, tip: store.tips[idx] });
  });

  app.get('/api/ladder', (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const ladder = computeLadder(store, { trackId });
    const { round } = computeJackpotTierData(store, { trackId });
    const jackpotEligible = new Set(
      (round?.entries || [])
        .filter((e) => String(e?.tier || '').toUpperCase() === 'JACKPOT')
        .map((e) => String(e.member || '').trim().toLowerCase())
    );
    const ladderWithTier = (ladder || []).map((row) => ({
      ...row,
      tier: jackpotEligible.has(String(row.member || '').trim().toLowerCase()) ? 'JACKPOT' : 'FREE'
    }));
    const afterRace = getLastScoredRace(store, trackId);
    return res.json({ trackId, ladder: ladderWithTier, afterRace });
  });


  app.get('/api/milestones', (_req, res) => {
    const store = readStore();
    return res.json(computeMilestonesData(store));
  });

  app.get('/api/jackpot', (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const { paidMembers, freeMembers, entryFee, currentRoundPot, rollover, totalPot, round } = computeJackpotTierData(store, { trackId });
    writeStore(store);
    return res.json({
      trackId,
      entryFee,
      paidMembers,
      freeMembers,
      currentRoundPot,
      rollover,
      jackpotCarry: rollover,
      totalPot,
      tiers: { free: freeMembers, jackpotEligible: paidMembers, entryFee },
      roundId: round?.id || null,
      lastWinner: store.lastJackpotWinner || ''
    });
  });

  app.put('/api/jackpot', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const rollover = Number(req.body?.rollover);
    if (!Number.isFinite(rollover) || rollover < 0) {
      return res.status(400).json({ error: 'Rollover must be a non-negative number' });
    }
    const jackpotCarry = setTrackJackpotCarry(store, trackId, rollover);
    writeStore(store);
    return res.json({ ok: true, trackId, jackpotCarry, rollover: jackpotCarry });
  });

  app.get('/api/punters/tracks', (_req, res) => {
    return res.json({ tracks: Object.values(TRACKS) });
  });

  app.get('/api/punters/overview', (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const tier = String(req.query.tier || 'free').toLowerCase();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);

    const openRound = getCurrentRound(store, { autoCreate: false, trackId });
    const closedRound = getLatestClosedRound(store, trackId);
    const trackSettings = store.puntersClub?.settings?.[trackId] || {};
    const nextRoundOpensAt = Number(trackSettings.nextRoundOpensAt || 0) || getDefaultNextRoundOpenAtMs(trackId, store);

    let round = openRound;
    let paidMembers = 0;
    let freeMembers = 0;
    let entryFee = Number(store.entryFee || 20);
    let currentRoundPot = 0;
    let rollover = getTrackJackpotCarry(store, trackId);
    let totalPot = rollover;
    let ladder = [];
    let tipsFeed = [];
    let fixtures = Array.isArray(trackData.fixtures) ? trackData.fixtures : [];
    let raceRunners = trackData.raceRunners || {};
    let recap = null;
    let winnerBanner = null;
    let frozen = false;

    if (openRound) {
      const live = computeJackpotTierData(store, { autoCreate: false, trackId });
      round = live.round;
      paidMembers = live.paidMembers;
      freeMembers = live.freeMembers;
      entryFee = live.entryFee;
      currentRoundPot = live.currentRoundPot;
      totalPot = live.totalPot;
      ladder = computeLadderCached(store, round.id, trackId);
      tipsFeed = getTipsForTrack(store, trackId);
    } else if (closedRound && closedRound.snapshot) {
      const snap = closedRound.snapshot;
      round = closedRound;
      frozen = true;
      paidMembers = Number(snap.finalCounts?.paidEntries || 0);
      freeMembers = Number(snap.finalCounts?.entries || 0);
      currentRoundPot = Number(snap.finalJackpot?.currentRoundPot || snap.finalPotAmount || 0);
      rollover = Number(snap.finalJackpot?.rollover || getTrackJackpotCarry(store, trackId) || 0);
      totalPot = Number(snap.finalPotAmount || snap.finalJackpot?.totalPot || 0);
      ladder = Array.isArray(snap.finalTop10) ? snap.finalTop10 : [];
      tipsFeed = Array.isArray(snap.finalTipsFeed) ? snap.finalTipsFeed : [];
      fixtures = Array.isArray(snap.finalFixtures) ? snap.finalFixtures : [];
      raceRunners = (snap.finalRaceRunners || snap.raceRunners || raceRunners || {});
      const winner = snap.winner || { member: 'tofu', payout: totalPot, notes: pickLarrikinLine() };
      winnerBanner = {
        member: winner.member || 'tofu',
        dateRange: `${new Date(Number(closedRound.createdAt || Date.now())).toLocaleDateString('en-AU')} - ${new Date(Number(closedRound.closedAt || Date.now())).toLocaleDateString('en-AU')}`,
        pot: Number(winner.payout || totalPot || 0),
        oneLiner: String(winner.notes || pickLarrikinLine())
      };
      recap = {
        winner: winner.member || 'tofu',
        top3: Array.isArray(snap.finalTop3) ? snap.finalTop3 : [],
        totalEntries: Number(snap.finalCounts?.entries || 0),
        paidEntries: Number(snap.finalCounts?.paidEntries || 0),
        finalPot: Number(snap.finalPotAmount || 0),
        statusText: 'Next round opens Friday afternoon'
      };
    } else {
      round = getCurrentRound(store, { autoCreate: true, trackId });
      const live = computeJackpotTierData(store, { autoCreate: false, trackId });
      paidMembers = live.paidMembers;
      freeMembers = live.freeMembers;
      entryFee = live.entryFee;
      currentRoundPot = live.currentRoundPot;
      totalPot = live.totalPot;
      ladder = computeLadderCached(store, round.id, trackId);
      tipsFeed = getTipsForTrack(store, trackId);
    }

    const masked = tier !== 'paid';
    const ladderView = (ladder || []).map((row, idx) => {
      const isEligible = !!(round?.entries || []).find((e) => String(e.member || '').toLowerCase() === String(row.member || '').toLowerCase() && e.tier === 'JACKPOT');
      if (!masked) return { ...row, tier: isEligible ? 'JACKPOT' : 'FREE' };
      const maskedName = idx < 3 ? row.member : `${String(row.member || '').slice(0, 1)}***`;
      return { ...row, member: maskedName, masked: true, tier: isEligible ? 'JACKPOT' : 'FREE', points: isEligible ? row.points : null, winners: isEligible ? row.winners : null };
    });

    const pastRounds = (store.puntersClub.rounds || [])
      .filter((r) => normalizeTrackId(r.trackId) === trackId && String(r.status || '').toLowerCase() === 'closed')
      .sort((a, b) => Number(b.closedAt || 0) - Number(a.closedAt || 0))
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        label: r.label,
        closedAt: r.closedAt,
        winner: r?.snapshot?.winner?.member || r?.winner?.member || '—'
      }));

    const banterWall = (store.puntersClub?.banterByTrack?.[trackId] || [])
      .slice(0, 40)
      .map((row) => ({
        id: row.id,
        member: String(row.member || 'Punter'),
        tip: String(row.tip || ''),
        brag: String(row.brag || ''),
        createdAt: Number(row.createdAt || Date.now())
      }));

    return res.json({
      track: { id: trackId, name: TRACKS[trackId]?.name || trackId, accent: TRACKS[trackId]?.accent || '#999' },
      tracks: Object.values(TRACKS),
      round: { id: round?.id, trackId, label: round?.label, status: String(round?.status || 'open').toUpperCase(), createdAt: round?.createdAt, closedAt: round?.closedAt || null },
      tiers: { free: freeMembers, jackpotEligible: paidMembers, entryFee },
      jackpot: { currentRoundPot, rollover, totalPot, tieRule: 'Top-point ties roll over to next round.' },
      ladder: ladderView,
      fixtures,
      raceRunners,
      tipsFeed,
      frozen,
      finalLabel: frozen ? 'Final results (Round closed)' : '',
      winnerBanner,
      recap,
      nextRoundOpensAt,
      nextRoundTeaser: !openRound ? { title: 'Next Punters Club opens Friday afternoon', venue: 'Venue TBA' } : null,
      pastRounds,
      banterWall,
      generatedAt: Date.now()
    });
  });

  app.post('/api/punters/banter', auth, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const tip = String(req.body?.tip || '').trim().slice(0, 140);
    const brag = String(req.body?.brag || '').trim().slice(0, 280);
    if (!tip && !brag) return res.status(400).json({ error: 'Add a tip or brag line.' });

    const openRound = getCurrentRound(store, { autoCreate: false, trackId });
    const locked = !canEditTipsNow(store) || String(openRound?.status || '').toLowerCase() === 'closed';
    if (!locked) return res.status(400).json({ error: 'Banter opens after lock.' });

    const item = {
      id: crypto.randomUUID(),
      member: String(req.user?.username || 'Punter').slice(0, 64),
      tip,
      brag,
      createdAt: Date.now()
    };
    const wall = Array.isArray(store.puntersClub.banterByTrack?.[trackId]) ? store.puntersClub.banterByTrack[trackId] : [];
    wall.unshift(item);
    store.puntersClub.banterByTrack[trackId] = wall.slice(0, 120);
    writeStore(store);
    return res.status(201).json({ ok: true, item });
  });

  app.get('/api/punters/rounds', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    syncCurrentRoundEntries(store, { trackId });
    writeStore(store);
    const rounds = (store.puntersClub.rounds || []).filter((r) => normalizeTrackId(r.trackId) === trackId);
    return res.json({ trackId, rounds });
  });

  app.post('/api/punters/rounds', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const count = (store.puntersClub.rounds || []).filter((r)=>normalizeTrackId(r.trackId)===trackId).length;
    const label = String(req.body?.label || '').trim() || `${TRACKS[trackId].name} Round ${count + 1}`;
    const round = { id: crypto.randomUUID(), trackId, label, status: 'open', createdAt: Date.now(), entryFee: Number(req.body?.entryFee || store.entryFee || 20), payments: [], entries: [], payouts: [] };
    store.puntersClub.rounds.unshift(round);
    writeStore(store);
    return res.status(201).json({ ok: true, round });
  });

  app.patch('/api/punters/rounds/:id', auth, adminOnly, (req, res) => {
    const store = readStore();
    const id = String(req.params.id || '');
    const round = (store.puntersClub?.rounds || []).find((r) => String(r.id) === id);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    const status = String(req.body?.status || '').toLowerCase();
    if (!['open', 'closed', 'settled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    round.status = status;
    round.updatedAt = Date.now();
    writeStore(store);
    return res.json({ ok: true, round });
  });

  app.post('/api/punters/rounds/:id/publish-winner', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const id = String(req.params.id || '');
    const round = (store.puntersClub?.rounds || []).find((r) => String(r.id) === id);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    const winnerMember = String(req.body?.winner || round?.winner?.member || '').trim();
    if (!winnerMember) return res.status(400).json({ error: 'winner is required' });
    const payout = Number(req.body?.payout);
    const notes = String(req.body?.notes || '').trim();

    round.winner = {
      member: winnerMember,
      payout: Number.isFinite(payout) && payout >= 0 ? payout : Number(round?.winner?.payout || 0),
      notes: notes || String(round?.winner?.notes || pickLarrikinLine()),
      publishedAt: Date.now(),
      publishedBy: req.user.username
    };

    if (round.snapshot && typeof round.snapshot === 'object') {
      round.snapshot.winner = {
        member: round.winner.member,
        payout: round.winner.payout,
        notes: round.winner.notes
      };
    }

    round.updatedAt = Date.now();
    writeStore(store);
    return res.json({ ok: true, round });
  });

  app.post('/api/punters/rounds/:id/close', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const id = String(req.params.id || '');
    const round = (store.puntersClub?.rounds || []).find((r) => String(r.id) === id);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    if (String(round.status || '').toLowerCase() === 'closed') return res.json({ ok: true, round, alreadyClosed: true });

    const trackId = normalizeTrackId(round.trackId);
    syncCurrentRoundEntries(store, { autoCreate: false, trackId });
    if (!round.winner || !String(round.winner.member || '').trim()) {
      const winnerMember = String(req.body?.winner || 'tofu').trim() || 'tofu';
      const payout = Number(req.body?.payout || 0);
      const notes = String(req.body?.notes || '').trim();
      round.winner = {
        member: winnerMember,
        payout: Number.isFinite(payout) && payout >= 0 ? payout : 0,
        notes: notes || pickLarrikinLine()
      };
    }

    round.status = 'closed';
    round.closedAt = Date.now();
    round.nextRoundOpensAt = Number(req.body?.nextRoundOpensAt || store.puntersClub?.settings?.[trackId]?.nextRoundOpensAt || getDefaultNextRoundOpenAtMs(trackId, store));
    round.snapshot = buildRoundSnapshot(store, round);
    if (!store.puntersClub.settings[trackId] || typeof store.puntersClub.settings[trackId] !== 'object') store.puntersClub.settings[trackId] = {};
    store.puntersClub.settings[trackId].nextRoundOpensAt = round.nextRoundOpensAt;

    writeStore(store);
    return res.json({ ok: true, round });
  });

  app.post('/api/punters/rounds/:id/recompute-snapshot', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const id = String(req.params.id || '');
    const round = (store.puntersClub?.rounds || []).find((r) => String(r.id) === id);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    round.snapshot = buildRoundSnapshot(store, round);
    round.updatedAt = Date.now();
    writeStore(store);
    return res.json({ ok: true, round });
  });

  app.post('/api/punters/rounds/open-next', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const existingOpen = getCurrentRound(store, { autoCreate: false, trackId });
    if (existingOpen) return res.json({ ok: true, round: existingOpen, alreadyOpen: true });
    const rounds = store.puntersClub.rounds || [];
    const round = {
      id: crypto.randomUUID(),
      trackId,
      label: String(req.body?.label || `${TRACKS[trackId].name} Round ${rounds.filter((r)=>normalizeTrackId(r.trackId)===trackId).length + 1}`).trim(),
      status: 'open',
      createdAt: Date.now(),
      entryFee: Number(req.body?.entryFee || store.entryFee || 20),
      payments: [], entries: [], payouts: []
    };
    rounds.unshift(round);
    if (!store.puntersClub.settings[trackId] || typeof store.puntersClub.settings[trackId] !== 'object') store.puntersClub.settings[trackId] = {};
    store.puntersClub.settings[trackId].nextRoundOpensAt = Number(req.body?.nextRoundOpensAt || getDefaultNextRoundOpenAtMs(trackId, store));
    writeStore(store);
    return res.status(201).json({ ok: true, round });
  });

  app.put('/api/punters/settings', auth, adminOnly, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const nextRoundOpensAt = Number(req.body?.nextRoundOpensAt || 0);
    if (!Number.isFinite(nextRoundOpensAt) || nextRoundOpensAt <= 0) {
      return res.status(400).json({ error: 'Valid nextRoundOpensAt timestamp is required' });
    }
    if (!store.puntersClub.settings[trackId] || typeof store.puntersClub.settings[trackId] !== 'object') store.puntersClub.settings[trackId] = {};
    store.puntersClub.settings[trackId].nextRoundOpensAt = Math.trunc(nextRoundOpensAt);
    const sched = req.body?.schedule;
    if (sched && typeof sched === 'object') {
      store.puntersClub.schedule[trackId] = {
        ...(store.puntersClub.schedule[trackId] || {}),
        ...sched
      };
    }
    writeStore(store);
    return res.json({ ok: true, trackId, settings: store.puntersClub.settings[trackId], schedule: store.puntersClub.schedule[trackId] });
  });

  app.get('/api/punters/results/:roundId', (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const roundId = String(req.params.roundId || '');
    const requestedTrackId = req.query.track || req.query.trackId ? normalizeTrackId(req.query.track || req.query.trackId) : null;
    const round = (store.puntersClub.rounds || []).find((r) => String(r.id) === roundId);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    const trackId = normalizeTrackId(round.trackId);
    if (requestedTrackId && requestedTrackId !== trackId) return res.status(404).json({ error: 'Round not found for track' });
    return res.json({ trackId, round, snapshot: round.snapshot || null });
  });

  app.post('/api/punters/payments/verify', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const round = syncCurrentRoundEntries(store, { trackId });
    const member = String(req.body?.member || '').trim();
    if (!member) return res.status(400).json({ error: 'member is required' });
    const amount = Number(req.body?.amount || round.entryFee || store.entryFee || 20);
    const payment = {
      id: crypto.randomUUID(), member, amount, verified: true,
      method: String(req.body?.method || 'payid').slice(0, 40),
      reference: String(req.body?.reference || '').slice(0, 120),
      verifiedAt: Date.now(), verifiedBy: req.user.username
    };
    round.payments.push(payment);
    round.entries = (round.entries || []).map((e) => String(e.member || '').toLowerCase() === member.toLowerCase() ? { ...e, tier: 'JACKPOT', paid: true } : e);
    for (const tip of store.tips || []) {
      if (normalizeTrackId(tip.trackId || 'thoroughbreds') !== trackId) continue;
      if (String(tip.member || '').toLowerCase() === member.toLowerCase() && tip.status !== 'removed') tip.paid = true;
    }
    store.puntersClub.paymentAudit.push({ action: 'verify', trackId, paymentId: payment.id, member, amount, at: Date.now(), by: req.user.username });
    writeStore(store);
    return res.json({ ok: true, payment });
  });

  app.post('/api/punters/claims', auth, (req, res) => {
    const store = readStore();
    ensurePuntersClubStore(store);
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    let openRound = getCurrentRound(store, { autoCreate: false, trackId });
    const adminOverride = Boolean(req.body?.adminOverride) && req.user?.role === 'admin';
    if (!openRound && (store.puntersClub?.rounds || []).filter((r) => normalizeTrackId(r.trackId) === trackId).length === 0) {
      openRound = getCurrentRound(store, { autoCreate: true, trackId });
    }
    if (!openRound && !adminOverride) {
      return res.status(403).json({ error: 'Round finished ✅. Upgrade/payment claims are closed for this round.' });
    }
    const claim = {
      id: crypto.randomUUID(),
      member: req.user.username,
      trackId,
      roundId: String(req.body?.roundId || openRound?.id || ''),
      amount: Number(req.body?.amount || 0),
      status: 'pending',
      note: String(req.body?.note || '').slice(0, 180),
      createdAt: Date.now()
    };
    store.puntersClub.claims.unshift(claim);
    writeStore(store);
    return res.status(201).json({ ok: true, claim });
  });

  app.get('/api/punters/claims', auth, adminOnly, (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const claims = (store.puntersClub?.claims || []).filter((c) => normalizeTrackId(c.trackId) === trackId);
    return res.json({ trackId, claims });
  });

  app.post('/api/punters/payouts/verify', auth, adminOnly, (req, res) => {
    const store = readStore();
    const claimId = String(req.body?.claimId || '').trim();
    const claim = (store.puntersClub?.claims || []).find((c) => String(c.id) === claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    claim.status = 'paid';
    claim.paidAt = Date.now();
    claim.paidBy = req.user.username;
    const audit = { id: crypto.randomUUID(), claimId, member: claim.member, amount: Number(claim.amount || 0), at: Date.now(), by: req.user.username };
    store.puntersClub.payoutAudit.unshift(audit);
    writeStore(store);
    return res.json({ ok: true, audit, claim });
  });

  app.get('/api/punters/audit', auth, adminOnly, (_req, res) => {
    const store = readStore();
    return res.json({
      payments: store.puntersClub?.paymentAudit || [],
      payouts: store.puntersClub?.payoutAudit || []
    });
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

  app.get('/api/poker-results', (req, res) => {
    const store = readStore();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const results = (store.pokerResults || [])
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        player: String(r.player || ''),
        points: Number(r.points || 0),
        finalTable: Boolean(r.finalTable),
        cashed: Boolean(r.cashed),
        eventName: String(r.eventName || ''),
        createdAt: Number(r.createdAt || 0)
      }));
    return res.json({ results, count: results.length });
  });



  app.get('/api/poker-players', (_req, res) => {
    const store = readStore();
    const players = normalizePokerPlayerPool(store);
    return res.json({ players, count: players.length });
  });

  app.post('/api/poker-players/import', auth, adminOnly, (req, res) => {
    const store = readStore();
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    const existing = new Set((store.pokerPlayers || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
    let added = 0;
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      store.pokerPlayers.push(name);
      added += 1;
    }
    store.pokerPlayers = normalizePokerPlayerPool(store);
    writeStore(store);
    return res.json({ ok: true, added, total: store.pokerPlayers.length });
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
    store.pokerPlayers = Array.isArray(store.pokerPlayers) ? store.pokerPlayers : [];
    store.pokerResults.push(...added);
    for (const row of added) {
      const name = String(row.player || '').trim();
      if (!name) continue;
      if (!store.pokerPlayers.some((n) => String(n || '').trim().toLowerCase() === name.toLowerCase())) {
        store.pokerPlayers.push(name);
      }
    }
    store.pokerPlayers = normalizePokerPlayerPool(store);
    writeStore(store);
    return res.status(201).json({ ok: true, added: added.length });
  });

  registerPokerRoutes(app, { readStore, writeStore, auth, adminOnly });

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
    const trackId = normalizeTrackId(req.body?.trackId || req.query.track || req.query.trackId);
    const trackData = getTrackData(store, trackId);
    const fixture = (trackData.fixtures || [])[0] || null;
    const tips = getTipsForTrack(store, trackId);

    if (!fixture && !tips.length && !Object.keys(trackData.raceResults || {}).length) {
      return res.status(400).json({ error: 'Nothing to archive yet' });
    }

    const ladder = computeLadder(store, { trackId });
    const entryFee = Number(store.entryFee || 20);
    const paidMembers = new Set(tips.filter((t) => t.paid).map((t) => String(t.member || ''))).size;
    const roundPool = paidMembers * entryFee;
    const previousCarry = getTrackJackpotCarry(store, trackId);

    const first = ladder[0];
    const second = ladder[1];
    // Policy: equal top points = jackpot rollover (no winner tie-breakers).
    const outright = !!first && (!second || first.points > second.points);

    const snapshot = {
      id: crypto.randomUUID(),
      trackId,
      archivedAt: Date.now(),
      archivedBy: req.user.username,
      fixture,
      tips,
      raceResults: trackData.raceResults || {},
      raceRunners: trackData.raceRunners || {},
      finalRaceRunners: trackData.raceRunners || {},
      bossesBet: trackData.bossesBet || { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, legItems: [], legs: [], selections: {} },
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
      setTrackJackpotCarry(store, trackId, 0);
      store.lastJackpotWinner = String(first?.member || '');
    } else {
      setTrackJackpotCarry(store, trackId, previousCarry + roundPool);
    }

    store.tips = (store.tips || []).filter((t) => normalizeTrackId(t.trackId || 'thoroughbreds') !== trackId);
    trackData.raceResults = {};
    trackData.raceRunners = {};
    trackData.bossesBet = { title: 'Bosses Multi', weekKey: '', meet: '', status: 'live', freerollPrize: 0, eligibilityNote: 'Eligible = all players who entered tips this week before lock.', lockTime: null, stake: '', potentialReturn: '', legItems: [], legs: [], selections: {}, updatedAt: Date.now(), updatedBy: req.user.username };
    if (trackId === 'thoroughbreds') {
      store.raceResults = {};
      store.raceRunners = {};
      store.bossesBet = trackData.bossesBet;
    }
    store.buyInVotes = {};

    writeStore(store);
    return res.json({
      ok: true,
      trackId,
      archivedRoundId: snapshot.id,
      tipsArchived: tips.length,
      fixture: fixture?.event || null,
      outrightWinner: outright ? first?.member || null : null,
      rolloverToNextWeek: getTrackJackpotCarry(store, trackId)
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

  app.put('/api/tips/edit-deadline', auth, adminOnly, (req, res) => {
    const store = readStore();
    const deadlineMs = Number(req.body?.deadlineMs || 0);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      return res.status(400).json({ error: 'Valid deadlineMs is required' });
    }
    store.tipEditDeadlineMs = Math.trunc(deadlineMs);
    writeStore(store);
    return res.json({ ok: true, deadlineMs: store.tipEditDeadlineMs, deadlineIso: new Date(store.tipEditDeadlineMs).toISOString() });
  });

  app.get('/api/ladder/:member', (req, res) => {
    const store = readStore();
    const trackId = normalizeTrackId(req.query.track || req.query.trackId);
    const member = String(req.params.member || '').trim();
    if (!member) return res.status(400).json({ error: 'Member is required' });

    const exists = getTipsForTrack(store, trackId).some(
      (t) => String(t.member || '').trim().toLowerCase() === member.toLowerCase() && t.status !== 'removed'
    );
    if (!exists) return res.status(404).json({ error: 'Member not found' });

    const breakdown = computeMemberBreakdown(store, member, { trackId });
    return res.json({ trackId, breakdown });
  });

  app.get('/api/profile-summary/:member', (req, res) => {
    const store = readStore();
    const member = String(req.params.member || '').trim();
    if (!member) return res.status(400).json({ error: 'Member is required' });

    const normalized = member.toLowerCase();
    const user = (store.users || []).find((u) => String(u.username || '').trim().toLowerCase() === normalized);
    const displayName = user?.username || member;

    const puntersBreakdown = computeMemberBreakdown(store, displayName);
    const hasPuntersHistory = (puntersBreakdown.races || []).length > 0;

    const pokerResults = (store.pokerResults || [])
      .filter((r) => String(r.player || '').trim().toLowerCase() === normalized)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        eventName: String(r.eventName || ''),
        points: Number(r.points || 0),
        finalTable: Boolean(r.finalTable),
        cashed: Boolean(r.cashed),
        createdAt: Number(r.createdAt || 0)
      }));

    const pokerStats = pokerResults.reduce((acc, row) => {
      acc.events += 1;
      acc.points += Number(row.points || 0);
      if (row.finalTable) acc.finalTables += 1;
      if (row.cashed) acc.cashes += 1;
      return acc;
    }, { events: 0, points: 0, finalTables: 0, cashes: 0 });

    return res.json({
      member: displayName,
      profile: user ? normalizeUserProfile(user.profile) : normalizeUserProfile({}),
      punters: {
        hasHistory: hasPuntersHistory,
        breakdown: puntersBreakdown
      },
      poker: {
        stats: pokerStats,
        results: pokerResults
      }
    });
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
    const targetUrl = `https://${host}/punters-club`;
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

  app.get(['/profile', '/profile/:member'], (_req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
  app.get('/punters-club', (_req, res) => res.sendFile(path.join(__dirname, 'punters-club.html')));
  app.get('/punters-club/greyhounds', (_req, res) => res.sendFile(path.join(__dirname, 'punters-track.html')));
  app.get('/punters-club/thoroughbreds', (_req, res) => res.sendFile(path.join(__dirname, 'punters-track.html')));
  app.get('/punters-club/results/:roundId', (_req, res) => res.sendFile(path.join(__dirname, 'punters-results.html')));
  app.get('/punters-club/:track/results/:roundId', (_req, res) => res.sendFile(path.join(__dirname, 'punters-results.html')));
  app.get(['/punters', '/punters/', '/punters.html'], (_req, res) => res.redirect(302, '/punters-club/thoroughbreds'));

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
