const assert = require('assert');
const { canonicalizeName, normalizeAliasForMatch, levenshtein, ensurePokerV2Store } = require('./poker-system');

(function run(){
  const store = { pokerPlayers: ['  MatT  Simon  ', 'MATT-simon'], pokerResults: [{ id:'x1', player:'Matt   Simon', points: 120.37, eventName:'Nightly 500gtd', createdAt:Date.now() }] };
  const changed = ensurePokerV2Store(store);
  assert.equal(changed, true);
  assert.ok(store.pokerV2);
  assert.ok((store.pokerV2.players || []).length >= 1);
  assert.equal(canonicalizeName('  BIG   BLUFF  '), 'big bluff');
  assert.equal(normalizeAliasForMatch('Big-Bluff!!  Bay'), 'bigbluff bay');
  assert.ok(levenshtein('matt', 'mat') <= 1);

  const player = store.pokerV2.players.find((p) => p.canonicalName === 'matt simon');
  assert.ok(player, 'canonical player should exist');
  const results = (store.pokerV2.results || []).filter((r) => r.playerId === player.id);
  assert.ok(results.length >= 1, 'migrated result should map to canonical player');
  assert.equal(results[0].points.includes('.'), true);

  console.log('Poker V2 unit tests passed ✅');
})();
