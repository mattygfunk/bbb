const path = require('path');
const crypto = require('crypto');

function canonicalizeName(input) {
  return String(input || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeAliasForMatch(input) {
  return canonicalizeName(input).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (!s) return t.length;
  if (!t) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const c = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
    }
  }
  return dp[s.length][t.length];
}

function pointsToDecString(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const tenths = Math.round(n * 10);
  return (tenths / 10).toFixed(1);
}

function pointsDecToNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function ensurePokerV2Store(store) {
  let changed = false;
  const now = Date.now();
  if (!store.pokerV2 || typeof store.pokerV2 !== 'object') {
    store.pokerV2 = {};
    changed = true;
  }

  const v2 = store.pokerV2;
  if (!Array.isArray(v2.players)) { v2.players = []; changed = true; }
  if (!Array.isArray(v2.playerAliases)) { v2.playerAliases = []; changed = true; }
  if (!Array.isArray(v2.events)) { v2.events = []; changed = true; }
  if (!Array.isArray(v2.seasons)) { v2.seasons = []; changed = true; }
  if (!Array.isArray(v2.results)) { v2.results = []; changed = true; }
  if (!Array.isArray(v2.auditLogs)) { v2.auditLogs = []; changed = true; }

  // seed default season/event if empty
  if (!v2.seasons.length) {
    const sid = crypto.randomUUID();
    v2.seasons.push({ id: sid, name: 'Season 1', startAt: now - 90 * 86400000, endAt: null, isActive: true, createdAt: now, updatedAt: now });
    changed = true;
  }
  if (!v2.events.length) {
    v2.events.push(
      { id: crypto.randomUUID(), name: 'Nightly 500gtd', type: 'nightly', startAt: now, buyIn: null, gtd: 500, isActive: true, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), name: 'Nightly 700gtd', type: 'nightly', startAt: now, buyIn: null, gtd: 700, isActive: true, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), name: 'Sunday 1300gtd', type: 'special', startAt: now, buyIn: null, gtd: 1300, isActive: true, createdAt: now, updatedAt: now }
    );
    changed = true;
  }

  // migrate legacy names pool
  const playerByCanonical = new Map(v2.players.map((p) => [String(p.canonicalName || ''), p]));
  const ensurePlayerFromName = (displayName, source = 'migration') => {
    const clean = String(displayName || '').trim();
    if (!clean) return null;
    const canonicalName = canonicalizeName(clean);
    let player = playerByCanonical.get(canonicalName);
    if (!player) {
      player = { id: crypto.randomUUID(), displayName: clean, canonicalName, deletedAt: null, createdAt: now, updatedAt: now };
      v2.players.push(player);
      playerByCanonical.set(canonicalName, player);
      changed = true;
    }
    const aliasExists = v2.playerAliases.some((a) => String(a.playerId) === player.id && canonicalizeName(a.alias) === canonicalName);
    if (!aliasExists) {
      v2.playerAliases.push({ id: crypto.randomUUID(), playerId: player.id, alias: clean, source, createdAt: now });
      changed = true;
    }
    return player;
  };

  for (const n of store.pokerPlayers || []) ensurePlayerFromName(n, 'legacy-pool');

  const firstSeasonId = (v2.seasons.find((s) => s.isActive) || v2.seasons[0] || {}).id || null;
  const eventNameToId = new Map(v2.events.map((e) => [String(e.name || '').toLowerCase(), e.id]));

  for (const row of store.pokerResults || []) {
    const key = String(row.id || '');
    if (key && v2.results.some((r) => String(r.legacyId || '') === key)) continue;
    const player = ensurePlayerFromName(row.player, 'legacy-result');
    if (!player) continue;

    let eventId = null;
    const eventName = String(row.eventName || '').trim();
    if (eventName) {
      eventId = eventNameToId.get(eventName.toLowerCase()) || null;
      if (!eventId) {
        eventId = crypto.randomUUID();
        v2.events.push({ id: eventId, name: eventName, type: 'special', startAt: Number(row.createdAt || now), buyIn: null, gtd: null, isActive: true, createdAt: now, updatedAt: now });
        eventNameToId.set(eventName.toLowerCase(), eventId);
        changed = true;
      }
    }

    v2.results.push({
      id: crypto.randomUUID(),
      legacyId: key || null,
      playerId: player.id,
      eventId,
      seasonId: firstSeasonId,
      date: Number(row.createdAt || now),
      points: pointsToDecString(row.points) || '0.0',
      finish: Number.isFinite(Number(row.eventRank)) ? Number(row.eventRank) : null,
      finalTable: Boolean(row.finalTable),
      cashed: Boolean(row.cashed),
      notes: '',
      screenshotRef: '',
      createdBy: String(row.createdBy || 'system'),
      createdAt: Number(row.createdAt || now),
      official: true
    });
    changed = true;
  }

  return changed;
}

function createPokerService(readStore, writeStore) {
  function getStore() {
    const store = readStore();
    ensurePokerV2Store(store);
    return store;
  }

  function save(store) {
    writeStore(store);
  }

  function activeSeason(store) {
    return (store.pokerV2.seasons || []).find((s) => s.isActive) || store.pokerV2.seasons[0] || null;
  }

  function playerLookup(store) {
    const players = (store.pokerV2.players || []).filter((p) => !p.deletedAt);
    const byId = new Map(players.map((p) => [p.id, p]));
    const byCanonical = new Map(players.map((p) => [p.canonicalName, p]));
    const aliasMap = new Map();
    for (const a of store.pokerV2.playerAliases || []) {
      const k = canonicalizeName(a.alias);
      const p = byId.get(a.playerId);
      if (p) aliasMap.set(k, p);
      const reduced = normalizeAliasForMatch(a.alias);
      if (p && reduced) aliasMap.set(reduced, p);
    }
    return { players, byId, byCanonical, aliasMap };
  }

  function findOrCreatePlayer(store, name, source = 'entry') {
    const display = String(name || '').trim().replace(/\s+/g, ' ');
    if (!display) return null;
    const canonical = canonicalizeName(display);
    const reduced = normalizeAliasForMatch(display);
    const look = playerLookup(store);
    let player = look.byCanonical.get(canonical) || look.aliasMap.get(canonical) || look.aliasMap.get(reduced);
    if (!player) {
      player = { id: crypto.randomUUID(), displayName: display, canonicalName: canonical, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now() };
      store.pokerV2.players.push(player);
      store.pokerV2.playerAliases.push({ id: crypto.randomUUID(), playerId: player.id, alias: display, source, createdAt: Date.now() });
      return player;
    }
    if (!store.pokerV2.playerAliases.some((a) => a.playerId === player.id && canonicalizeName(a.alias) === canonical)) {
      store.pokerV2.playerAliases.push({ id: crypto.randomUUID(), playerId: player.id, alias: display, source, createdAt: Date.now() });
    }
    return player;
  }

  function likelyDuplicates(store, name) {
    const candidate = normalizeAliasForMatch(name);
    if (!candidate) return [];
    return (store.pokerV2.players || [])
      .filter((p) => !p.deletedAt)
      .map((p) => ({ p, score: levenshtein(candidate, normalizeAliasForMatch(p.displayName || p.canonicalName)) }))
      .filter((x) => x.score > 0 && x.score <= 2)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((x) => ({ id: x.p.id, displayName: x.p.displayName, score: x.score }));
  }

  function resolveEvent(store, eventId, eventName, actor = 'system') {
    if (eventId) {
      const e = (store.pokerV2.events || []).find((x) => x.id === eventId);
      if (e) return e;
    }
    const clean = String(eventName || '').trim();
    if (!clean) return null;
    let e = (store.pokerV2.events || []).find((x) => String(x.name || '').toLowerCase() === clean.toLowerCase());
    if (!e) {
      e = { id: crypto.randomUUID(), name: clean, type: 'special', startAt: Date.now(), buyIn: null, gtd: null, isActive: true, createdAt: Date.now(), updatedAt: Date.now() };
      store.pokerV2.events.push(e);
      store.pokerV2.auditLogs.unshift({ id: crypto.randomUUID(), action: 'event.create', entityType: 'event', entityId: e.id, beforeJSON: null, afterJSON: JSON.stringify(e), actor, createdAt: Date.now() });
    }
    return e;
  }

  function addResults(store, rows, actor) {
    const season = activeSeason(store);
    const created = [];
    const errors = [];
    for (const [idx, item] of rows.entries()) {
      const points = pointsToDecString(item.points);
      if (!points) { errors.push(`Row ${idx + 1}: invalid points`); continue; }
      const playerName = String(item.player || '').trim();
      if (!playerName) { errors.push(`Row ${idx + 1}: missing player`); continue; }
      const event = resolveEvent(store, item.eventId, item.eventName, actor);
      if (!event) { errors.push(`Row ${idx + 1}: event required`); continue; }
      const player = findOrCreatePlayer(store, playerName, item.source || 'results-entry');
      if (!player) { errors.push(`Row ${idx + 1}: invalid player`); continue; }

      const out = {
        id: crypto.randomUUID(),
        playerId: player.id,
        eventId: event.id,
        seasonId: item.seasonId || season?.id || null,
        date: Number(item.date || Date.now()),
        points,
        finish: Number.isFinite(Number(item.finish)) ? Number(item.finish) : null,
        finalTable: Boolean(item.finalTable),
        cashed: Boolean(item.cashed),
        notes: String(item.notes || ''),
        screenshotRef: String(item.screenshotRef || ''),
        createdBy: String(actor || 'admin'),
        createdAt: Date.now(),
        official: true
      };
      store.pokerV2.results.push(out);
      created.push(out);
    }
    return { created, errors };
  }

  function leaderboardRows(store, period = 'all', seasonId = null) {
    const now = Date.now();
    const start = period === 'weekly' ? now - 7 * 86400000
      : period === 'monthly' ? now - 30 * 86400000
      : 0;
    const rows = (store.pokerV2.results || []).filter((r) => Number(r.date || 0) >= start && (!seasonId || r.seasonId === seasonId));
    const players = playerLookup(store).byId;
    const map = new Map();
    for (const r of rows) {
      const player = players.get(r.playerId);
      if (!player) continue;
      const p = map.get(player.id) || { playerId: player.id, player: player.displayName, pointsTenths: 0, finalTables: 0, cashes: 0, events: 0, biggestScore: 0 };
      const pts = Math.round(pointsDecToNumber(r.points) * 10);
      p.pointsTenths += pts;
      p.events += 1;
      if (r.finalTable) p.finalTables += 1;
      if (r.cashed) p.cashes += 1;
      if (pts > p.biggestScore) p.biggestScore = pts;
      map.set(player.id, p);
    }
    return [...map.values()]
      .sort((a, b) => b.pointsTenths - a.pointsTenths || b.finalTables - a.finalTables || b.cashes - a.cashes || a.player.localeCompare(b.player))
      .map((r, i) => ({
        rank: i + 1,
        ...r,
        points: Number((r.pointsTenths / 10).toFixed(1)),
        consistency: r.events ? Number(((r.cashes / r.events) * 100).toFixed(1)) : 0,
        biggestScore: Number((r.biggestScore / 10).toFixed(1))
      }));
  }

  function mergePlayers(store, primaryId, duplicateIds, actor) {
    const players = store.pokerV2.players || [];
    const primary = players.find((p) => p.id === primaryId && !p.deletedAt);
    if (!primary) throw new Error('Primary player not found');

    const dupes = duplicateIds
      .map((id) => players.find((p) => p.id === id && !p.deletedAt))
      .filter(Boolean);

    for (const d of dupes) {
      for (const r of store.pokerV2.results || []) {
        if (r.playerId === d.id) r.playerId = primary.id;
      }
      for (const a of store.pokerV2.playerAliases || []) {
        if (a.playerId === d.id) a.playerId = primary.id;
      }
      d.deletedAt = Date.now();
      d.updatedAt = Date.now();
      store.pokerV2.auditLogs.unshift({
        id: crypto.randomUUID(),
        action: 'player.merge',
        entityType: 'player',
        entityId: primary.id,
        beforeJSON: JSON.stringify({ duplicate: d }),
        afterJSON: JSON.stringify({ primary }),
        actor,
        createdAt: Date.now()
      });
    }

    // alias dedupe
    const seen = new Set();
    store.pokerV2.playerAliases = (store.pokerV2.playerAliases || []).filter((a) => {
      const k = `${a.playerId}::${canonicalizeName(a.alias)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return { merged: dupes.length };
  }

  function parseSmartPaste(raw, defaultEventName) {
    const out = [];
    const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      let m = line.match(/^(\d+)\s+(.+?)\s+(-?\d+(?:\.\d+)?)$/);
      if (m) {
        out.push({ finish: Number(m[1]), player: m[2], points: Number(m[3]), eventName: defaultEventName || '' });
        continue;
      }
      m = line.match(/^(.+?)\s*[-,]\s*(-?\d+(?:\.\d+)?)(?:\s*[-,]\s*(.+))?$/);
      if (m) {
        out.push({ player: m[1], points: Number(m[2]), eventName: m[3] || defaultEventName || '' });
        continue;
      }
      m = line.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)$/);
      if (m) {
        out.push({ player: m[1], points: Number(m[2]), eventName: defaultEventName || '' });
      }
    }
    return out;
  }

  return { getStore, save, activeSeason, playerLookup, findOrCreatePlayer, likelyDuplicates, addResults, leaderboardRows, mergePlayers, parseSmartPaste };
}

function registerPokerRoutes(app, opts) {
  const { readStore, writeStore, auth, adminOnly } = opts;
  const svc = createPokerService(readStore, writeStore);

  app.get('/api/poker/players', (req, res) => {
    const store = svc.getStore();
    const q = String(req.query.q || '').trim().toLowerCase();
    let rows = (store.pokerV2.players || []).filter((p) => !p.deletedAt);
    if (q) rows = rows.filter((p) => p.displayName.toLowerCase().includes(q) || p.canonicalName.includes(q));
    rows = rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return res.json({ players: rows });
  });

  app.get('/api/poker/players/:id', (req, res) => {
    const store = svc.getStore();
    const p = (store.pokerV2.players || []).find((x) => x.id === req.params.id && !x.deletedAt);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    const aliases = (store.pokerV2.playerAliases || []).filter((a) => a.playerId === p.id);
    const results = (store.pokerV2.results || []).filter((r) => r.playerId === p.id).sort((a, b) => b.date - a.date);
    const stats = {
      events: results.length,
      points: Number(results.reduce((n, r) => n + pointsDecToNumber(r.points), 0).toFixed(1)),
      finalTables: results.filter((r) => r.finalTable).length,
      cashes: results.filter((r) => r.cashed).length,
      biggestScore: Number(Math.max(0, ...results.map((r) => pointsDecToNumber(r.points))).toFixed(1))
    };
    return res.json({ player: p, aliases, stats, results });
  });

  app.post('/api/poker/players/merge', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    try {
      const primaryId = String(req.body?.primaryId || '');
      const duplicateIds = Array.isArray(req.body?.duplicateIds) ? req.body.duplicateIds.map(String) : [];
      const out = svc.mergePlayers(store, primaryId, duplicateIds, req.user.username);
      svc.save(store);
      return res.json({ ok: true, ...out });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Merge failed' });
    }
  });

  app.get('/api/poker/duplicates/likely', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const name = String(req.query.name || '');
    return res.json({ matches: svc.likelyDuplicates(store, name) });
  });

  app.get('/api/poker/events', (req, res) => {
    const store = svc.getStore();
    const q = String(req.query.q || '').trim().toLowerCase();
    const rows = (store.pokerV2.events || [])
      .filter((e) => !q || String(e.name || '').toLowerCase().includes(q))
      .sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0));
    return res.json({ events: rows });
  });

  app.get('/api/poker/events/:id', (req, res) => {
    const store = svc.getStore();
    const event = (store.pokerV2.events || []).find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const rows = (store.pokerV2.results || []).filter((r) => r.eventId === event.id);
    const lb = new Map();
    const players = svc.playerLookup(store).byId;
    for (const r of rows) {
      const p = players.get(r.playerId);
      if (!p) continue;
      const x = lb.get(p.id) || { playerId: p.id, player: p.displayName, points: 0, finalTables: 0, cashes: 0 };
      x.points += pointsDecToNumber(r.points);
      if (r.finalTable) x.finalTables += 1;
      if (r.cashed) x.cashes += 1;
      lb.set(p.id, x);
    }
    const leaderboard = [...lb.values()].sort((a, b) => b.points - a.points).map((x, i) => ({ rank: i + 1, ...x, points: Number(x.points.toFixed(1)) }));
    return res.json({ event, leaderboard, recent: rows.sort((a, b) => b.date - a.date).slice(0, 25) });
  });

  app.get('/api/poker/seasons', (req, res) => {
    const store = svc.getStore();
    return res.json({ seasons: store.pokerV2.seasons || [], activeSeason: svc.activeSeason(store) });
  });

  app.post('/api/poker/seasons', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const body = req.body || {};
    const now = Date.now();
    const row = {
      id: crypto.randomUUID(),
      name: String(body.name || '').trim() || `Season ${store.pokerV2.seasons.length + 1}`,
      startAt: Number(body.startAt || now),
      endAt: body.endAt ? Number(body.endAt) : null,
      isActive: Boolean(body.isActive),
      createdAt: now,
      updatedAt: now
    };
    if (row.isActive) {
      for (const s of store.pokerV2.seasons) s.isActive = false;
    }
    store.pokerV2.seasons.push(row);
    svc.save(store);
    return res.status(201).json({ ok: true, season: row });
  });

  app.put('/api/poker/seasons/:id/activate', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const target = (store.pokerV2.seasons || []).find((s) => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Season not found' });
    for (const s of store.pokerV2.seasons) s.isActive = false;
    target.isActive = true;
    target.updatedAt = Date.now();
    svc.save(store);
    return res.json({ ok: true, activeSeason: target });
  });

  app.post('/api/poker/results/preview', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const smartPaste = String(req.body?.smartPaste || '');
    const defaultEventName = String(req.body?.defaultEventName || '');
    const screenshotRef = String(req.body?.screenshotRef || '');
    const parsed = svc.parseSmartPaste(smartPaste, defaultEventName).map((r) => ({ ...r, screenshotRef }));
    const preview = parsed.map((r) => ({
      ...r,
      points: pointsToDecString(r.points),
      duplicateWarning: svc.likelyDuplicates(store, r.player)
    }));
    return res.json({ rows: preview });
  });

  app.post('/api/poker/results', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const submitToken = String(req.body?.submitToken || '');
    if (!submitToken) return res.status(400).json({ error: 'submitToken required' });
    store.pokerV2.submitCache = store.pokerV2.submitCache || {};
    if (store.pokerV2.submitCache[submitToken]) return res.status(409).json({ error: 'Duplicate submit blocked' });

    const rows = Array.isArray(req.body?.results) ? req.body.results : [req.body];
    const normalized = rows.map((r) => ({
      player: r.player,
      points: r.points,
      eventId: r.eventId,
      eventName: r.eventName,
      seasonId: r.seasonId,
      date: r.date,
      finish: r.finish,
      finalTable: r.finalTable,
      cashed: r.cashed,
      notes: r.notes,
      screenshotRef: r.screenshotRef
    }));

    const { created, errors } = svc.addResults(store, normalized, req.user.username);
    store.pokerV2.submitCache[submitToken] = Date.now();
    store.pokerV2.auditLogs.unshift({ id: crypto.randomUUID(), action: 'result.bulkCreate', entityType: 'result', entityId: created[0]?.id || 'none', beforeJSON: null, afterJSON: JSON.stringify({ count: created.length }), actor: req.user.username, createdAt: Date.now() });
    svc.save(store);
    return res.status(201).json({ ok: true, added: created.length, errors });
  });

  app.get('/api/poker/results', (req, res) => {
    const store = svc.getStore();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize || 25)));
    const q = String(req.query.q || '').trim().toLowerCase();
    const players = svc.playerLookup(store).byId;
    const events = new Map((store.pokerV2.events || []).map((e) => [e.id, e]));
    let rows = (store.pokerV2.results || []).map((r) => ({
      ...r,
      playerName: players.get(r.playerId)?.displayName || 'Unknown',
      eventName: events.get(r.eventId)?.name || 'Custom'
    }));
    if (q) rows = rows.filter((r) => r.playerName.toLowerCase().includes(q) || r.eventName.toLowerCase().includes(q));
    rows = rows.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
    const total = rows.length;
    const paged = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({ ...r, points: Number(pointsDecToNumber(r.points).toFixed(1)) }));
    return res.json({ results: paged, page, pageSize, total });
  });

  app.get('/api/poker/leaderboards', (req, res) => {
    const store = svc.getStore();
    const tab = String(req.query.tab || 'all-time').toLowerCase();
    const season = String(req.query.seasonId || '');
    const period = tab === 'weekly' ? 'weekly' : tab === 'monthly' ? 'monthly' : 'all';
    const seasonId = tab === 'season' ? (season || svc.activeSeason(store)?.id || null) : null;
    const rows = svc.leaderboardRows(store, period, seasonId);
    return res.json({ tab, seasonId, leaderboard: rows });
  });

  app.get('/api/poker/dashboard', (req, res) => {
    const store = svc.getStore();
    const lb = svc.leaderboardRows(store, 'all', null);
    const top10 = lb.slice(0, 10);
    const results = store.pokerV2.results || [];
    const kpis = {
      players: lb.length,
      events: results.length,
      avgPoints: lb.length ? Number((lb.reduce((n, r) => n + r.points, 0) / lb.length).toFixed(1)) : 0,
      activeSeason: svc.activeSeason(store)?.name || '—'
    };
    const streak = top10[0] || null;
    const hype = {
      hotStreak: streak ? `${streak.player} +${streak.points.toFixed(1)} pts` : 'No streak yet',
      finalTableMachine: top10.sort((a, b) => b.finalTables - a.finalTables)[0] || null,
      cashKing: top10.sort((a, b) => b.cashes - a.cashes)[0] || null,
      biggestScore: top10.sort((a, b) => b.biggestScore - a.biggestScore)[0] || null,
      mostConsistent: top10.sort((a, b) => b.consistency - a.consistency)[0] || null
    };

    const trend = results
      .slice()
      .sort((a, b) => a.date - b.date)
      .slice(-60)
      .map((r) => ({ date: r.date, points: pointsDecToNumber(r.points) }));

    return res.json({ kpis, top10, hype, trend });
  });

  app.get('/api/poker/admin/audit', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize || 25)));
    const rows = (store.pokerV2.auditLogs || []).slice((page - 1) * pageSize, page * pageSize);
    return res.json({ rows, page, pageSize, total: (store.pokerV2.auditLogs || []).length });
  });

  app.get('/api/poker/admin/insights', auth, adminOnly, (req, res) => {
    const store = svc.getStore();
    const seasonId = String(req.query.seasonId || svc.activeSeason(store)?.id || '');
    const rows = svc.leaderboardRows(store, 'all', seasonId);
    const top = rows[0];
    const narrative = top
      ? `🔥 ${top.player} leads the selected season with ${top.points.toFixed(1)} points. FT rate: ${top.finalTables}/${top.events}.`
      : 'No data yet in selected season. Add results to generate insights.';
    return res.json({
      provider: process.env.LLM_API_KEY ? 'llm' : 'mock',
      seasonId,
      recap: narrative,
      bullets: [
        `Top 3 average points: ${rows.slice(0, 3).reduce((n, r) => n + r.points, 0).toFixed(1)}`,
        `Most consistent so far: ${(rows.sort((a, b) => b.consistency - a.consistency)[0] || {}).player || '—'}`,
        `Biggest score this period: ${(rows.sort((a, b) => b.biggestScore - a.biggestScore)[0] || {}).biggestScore || 0}`
      ]
    });
  });

  app.get(['/poker', '/poker/leaderboards', '/poker/events', '/poker/events/:id', '/poker/players', '/poker/players/:id'], (_req, res) => {
    return res.sendFile(path.join(__dirname, 'poker-app.html'));
  });

  app.get(['/admin/poker', '/admin/poker/results', '/admin/poker/events', '/admin/poker/players'], (_req, res) => {
    return res.sendFile(path.join(__dirname, 'admin-poker.html'));
  });
}

module.exports = { registerPokerRoutes, ensurePokerV2Store, canonicalizeName, normalizeAliasForMatch, levenshtein, pointsToDecString };
