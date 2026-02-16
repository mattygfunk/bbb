const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensurePokerV2Store } = require('./poker-system');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');
const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
ensurePokerV2Store(store);

const names = ['MILLLZZ', 'OneLook', 'AllinSam', 'FloppinQuads8888', 'Cptred', 'rumpig3'];
const events = store.pokerV2.events || [];
const defaultEvent = events[0];

for (const n of names) {
  const canonical = String(n).trim().toLowerCase();
  let p = (store.pokerV2.players || []).find((x) => x.canonicalName === canonical && !x.deletedAt);
  if (!p) {
    p = { id: crypto.randomUUID(), displayName: n, canonicalName: canonical, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now() };
    store.pokerV2.players.push(p);
    store.pokerV2.playerAliases.push({ id: crypto.randomUUID(), playerId: p.id, alias: n, source: 'seed', createdAt: Date.now() });
  }
  for (let i = 0; i < 5; i += 1) {
    store.pokerV2.results.push({
      id: crypto.randomUUID(),
      playerId: p.id,
      eventId: defaultEvent?.id || null,
      seasonId: (store.pokerV2.seasons.find((s) => s.isActive) || store.pokerV2.seasons[0]).id,
      date: Date.now() - (i * 86400000),
      points: (Math.round((80 + Math.random() * 300) * 10) / 10).toFixed(1),
      finish: i + 1,
      finalTable: i < 3,
      cashed: i < 4,
      notes: 'seeded',
      screenshotRef: '',
      createdBy: 'seed-script',
      createdAt: Date.now(),
      official: true
    });
  }
}

fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
console.log('Seeded poker demo data into', DATA_FILE);
