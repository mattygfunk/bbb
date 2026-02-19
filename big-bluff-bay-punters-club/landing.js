const LOCK_AT_ISO = '2026-02-14T15:00:00+11:00';
const LANDING_API_ROOTS = ['/api'];

window.addEventListener('error', (e) => {
});

// Mock preview data for UI polish while live feeds are sparse.
// TODO: replace/augment with real backend endpoints when available.
const MOCK = {
  runners: [
    { name: 'Storm Ledger', barrier: 4, jockey: 'Macca', odds: '4.60', confidence: 68, risk: '♣' },
    { name: 'Bayline Belle', barrier: 8, jockey: 'Jess', odds: '6.20', confidence: 55, risk: '♠' },
    { name: 'Cash Cascade', barrier: 2, jockey: 'Rico', odds: '3.90', confidence: 74, risk: '♣' },
    { name: 'Pinjarra Prince', barrier: 6, jockey: 'A. Kerr', odds: '8.10', confidence: 46, risk: '♠' }
  ],
  winners: [
    { handle: '@___', week: 'Wk --', prize: 'Prize pending' },
    { handle: '@___', week: 'Wk --', prize: 'Payout board loading' }
  ],
  payoutsTicker: 'Next venue announced Friday arvo.'
};

function esc(s) {
  return String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function stampUpdated() {
  const n = document.getElementById('status-last-updated');
  if (!n) return;
  n.textContent = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function setStatusState(stateText, tone = 'open') {
  const node = document.getElementById('status-state-pill');
  if (!node) return;
  node.textContent = stateText;
  node.classList.remove('chip-red');
  if (tone !== 'open') node.classList.add('chip-red');
}

function applyTableCards() {
  document.querySelectorAll('.table-wrap').forEach((wrap) => {
    const table = wrap.querySelector('table');
    const headers = [...(table?.querySelectorAll('thead th') || [])].map((th) => th.textContent.trim());
    if (!table || !headers.length) return;
    wrap.classList.add('table-cards');
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (!td.getAttribute('data-label')) td.setAttribute('data-label', headers[i] || 'Value');
      });
    });
  });
}

async function fetchApi(path) {
  for (const root of LANDING_API_ROOTS) {
    const url = `${root}${path}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (r.ok) return d;
      } catch {}
      // brief retry for transient timeouts/network hiccups
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return {};
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function renderFixtures(fixtures, overview, jackpot, lockText = 'Updating…') {
  const rows = (fixtures || []).slice(0, 1);
  const fallback = document.getElementById('next-event-fallback');
  const winner = document.getElementById('next-last-winner');
  const f = rows[0] || null;

  const title = document.getElementById('next-event-title');
  const venue = document.getElementById('next-venue');
  const date = document.getElementById('next-date');
  const firstRace = document.getElementById('next-first-race');
  const races = document.getElementById('next-races');
  const lock = document.getElementById('next-lock');
  const pot = document.getElementById('next-pot');
  const entries = document.getElementById('next-entries');
  const paid = document.getElementById('next-paid');
  const accent = document.getElementById('next-track-accent');
  if (!title || !venue || !date || !firstRace || !races || !lock || !pot || !entries || !paid || !accent) return;

  const trackId = String(overview?.track?.id || 'thoroughbreds');
  const isDogs = trackId === 'greyhounds';
  accent.textContent = isDogs ? '🐕 Greyhounds Track' : '🐎 Thoroughbreds Track';
  title.textContent = isDogs ? 'Next Up: Wednesday Greyhounds' : 'Next Up: Saturday Thoroughbreds';

  if (!f) {
    venue.textContent = 'TBA';
    date.textContent = 'TBA';
    firstRace.textContent = 'TBA';
    races.textContent = '--';
    lock.textContent = lockText;
    pot.textContent = `$${Number(jackpot?.totalPot || 0).toFixed(0)}`;
    entries.textContent = String(Number(overview?.tiers?.free || 0));
    paid.textContent = String(Number(overview?.tiers?.jackpotEligible || 0));
    if (fallback) fallback.hidden = false;
    if (winner) winner.textContent = String(overview?.winnerBanner?.member || overview?.pastRounds?.[0]?.winner || 'No winner yet');
    return;
  }

  venue.textContent = String(f.track || 'TBA');
  date.textContent = String(f.date || 'TBA');
  firstRace.textContent = String(f.firstRaceTime || 'As listed');
  races.textContent = String(Number(f.raceCount || 12));
  lock.textContent = lockText;
  pot.textContent = `$${Number(jackpot?.totalPot || 0).toFixed(0)}`;
  entries.textContent = String(Number(overview?.tiers?.free || 0));
  paid.textContent = String(Number(overview?.tiers?.jackpotEligible || 0));
  if (fallback) fallback.hidden = true;
}

function renderTipsByPlayer(tips) {
  const list = document.getElementById('tips-preview-list');
  const more = document.getElementById('tips-more-count');
  if (!list) return;
  list.innerHTML = '';
  if (!tips.length) {
    list.innerHTML = '<article class="tip"><p class="muted">No tips posted yet. Be first in.</p></article>';
    if (more) more.textContent = '';
    return;
  }

  const byMember = new Map();
  tips.forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byMember.has(member)) byMember.set(member, []);
    byMember.get(member).push({ race: String(t.race || ''), selection: String(t.selection || '') });
  });

  const raceNum = (r) => Number(String(r || '').replace('R', '')) || 999;
  const entries = Array.from(byMember.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  entries.slice(0, 3).forEach(([member, picks]) => {
    const ordered = picks.sort((a, b) => raceNum(a.race) - raceNum(b.race));
    const lines = ordered.slice(0, 4).map((p) => `${esc(p.race)} ${esc(p.selection)}`).join(' • ');
    const card = document.createElement('article');
    card.className = 'tip';
    card.innerHTML = `<h3>${esc(member)}</h3><p class="meta">${lines || 'No tips yet'}</p>`;
    list.appendChild(card);
  });
  const extra = Math.max(0, entries.length - 3);
  if (more) more.textContent = extra > 0 ? `+ ${extra} more punters locked in` : '';
}

function renderLadder(rows) {
  const body = document.getElementById('ladder-preview');
  if (!body) return;
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">Round complete — results below.</td></tr>';
    return;
  }
  rows.slice(0, 10).forEach((r) => {
    const tr = document.createElement('tr');
    const tierBadge = String(r.tier || '').toUpperCase() === 'JACKPOT' ? " <span class='pill'>💰</span>" : '';
    tr.innerHTML = `<td>${r.rank}</td><td>${esc(r.member)}${tierBadge}</td><td>${r.points}</td><td>${r.winners ?? r.correct ?? 0}</td>`;
    body.appendChild(tr);
  });
}

function renderWinners(items) {
  const wrap = document.getElementById('winners-strip');
  if (!wrap) return;
  wrap.innerHTML = '';
  (items || []).forEach((w) => {
    const card = document.createElement('article');
    card.className = 'pill winner-item';
    card.innerHTML = `${esc(w.handle)} • ${esc(w.week)} • ${esc(w.prize)}`;
    wrap.appendChild(card);
  });
  if (!items?.length) {
    const empty = document.createElement('span');
    empty.className = 'pill empty-state';
    empty.textContent = 'Winners wall updates after real payouts are recorded.';
    wrap.appendChild(empty);
  }
}

function renderTopWinners(items) {
  const n1 = document.getElementById('top-winner-1');
  const n2 = document.getElementById('top-winner-2');
  const n3 = document.getElementById('top-winner-3');
  const nodes = [n1, n2, n3].filter(Boolean);
  if (!nodes.length) return;

  const rows = (items || []).slice(0, 3);
  const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

  for (let i = 0; i < 3; i += 1) {
    const node = nodes[i];
    if (!node) continue;
    const row = rows[i];
    if (!row) {
      node.textContent = '—';
      continue;
    }
    if (row.type === 'poker') {
      node.textContent = `♠ Poker: ${row.winner || '—'} ${money.format(Number(row.prize || 0))}`;
    } else {
      const winner = row.rolledOver ? 'Rollover' : String(row.winner || '—');
      node.textContent = `🏇 Punters: ${winner} ${money.format(Number(row.prize || 0))}`;
    }
  }
}

function toMs(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 && n < 1e12 ? n * 1000 : n;
  const d = Date.parse(String(v));
  return Number.isFinite(d) ? d : 0;
}

function buildRecentPokerWinners(results) {
  const rows = Array.isArray(results?.results) ? results.results : [];
  const grouped = new Map();
  for (const r of rows) {
    const ts = toMs(r.date) || toMs(r.createdAt) || Date.now();
    const day = new Date(ts).toLocaleDateString('en-AU');
    const eventName = String(r.eventName || 'Poker Event').trim();
    const key = `${day}__${eventName}`;
    if (!grouped.has(key)) grouped.set(key, { ts, eventName, rows: [] });
    const g = grouped.get(key);
    if (ts > g.ts) g.ts = ts;
    g.rows.push(r);
  }

  return [...grouped.values()]
    .map((g) => {
      const winner = g.rows.reduce((best, r) => (Number(r.points || 0) > Number(best?.points || -Infinity) ? r : best), null);
      return {
        type: 'poker',
        ts: Number(g.ts || 0),
        label: g.eventName,
        winner: String(winner?.playerName || winner?.player || '—'),
        prize: Number(winner?.points || 0)
      };
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
}

function renderSocialFeed(items) {
  const wrap = document.getElementById('social-feed-list');
  if (!wrap) return;
  wrap.innerHTML = '';

  const rows = (items || []).slice(0, 6);
  if (!rows.length) {
    wrap.innerHTML = '<article class="tip"><strong>Feed is loading</strong><p class="meta">Connect Meta API credentials to sync live posts.</p></article>';
    return;
  }

  rows.forEach((p) => {
    const card = document.createElement('article');
    card.className = 'tip';
    const sourceEmoji = p.source === 'instagram' ? '📸' : '📘';
    const when = p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-AU') : '';
    const image = p.image ? `<img src="${esc(p.image)}" alt="${sourceEmoji} post" loading="lazy" decoding="async" style="width:100%;border-radius:.65rem;border:1px solid #2a3a50;margin:.45rem 0;max-height:220px;object-fit:cover" />` : '';
    card.innerHTML = `<strong>${sourceEmoji} ${esc((p.source || 'social').toUpperCase())}</strong><p class="meta">${esc(p.text || 'Latest club update.')}</p>${image}<p class="meta">${esc(when)}</p><a class="menu-link" href="${esc(p.permalink || '#')}" target="_blank" rel="noopener noreferrer">Open post</a>`;
    wrap.appendChild(card);
  });
}

function wirePickToggles() {
  document.querySelectorAll('.pick-toggle').forEach((wrap) => {
    wrap.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });
}

function wireLeaderboardShare() {
  const btn = document.getElementById('share-leaderboard-btn');
  const msg = document.getElementById('share-leaderboard-msg');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const text = 'Big Bluff Bay Punters Club leaderboard is live. Check current rankings:';
    const url = `${window.location.origin}/share/leaderboard`;
    const payload = `${text} ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BBB Leaderboard', text, url });
        if (msg) msg.textContent = 'Shared. Select your Messenger group to post it.';
      } else {
        const shareUrl = `https://www.facebook.com/dialog/share?app_id=966242223397117&display=popup&href=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`;
        const w = window.open(shareUrl, '_blank', 'noopener,noreferrer');
        try { await navigator.clipboard.writeText(payload); } catch {}
        if (msg) msg.textContent = w
          ? 'Facebook share dialog opened. Choose Messenger and your group.'
          : 'Popup was blocked. Please allow popups, then try again.';
      }
    } catch {
      if (msg) msg.textContent = 'Share cancelled.';
    }
  });
}

function scheduleIdle(task, timeout = 2500) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => task(), { timeout });
  } else {
    setTimeout(task, 0);
  }
}

async function hydrateNextTipHome(trackId = 'thoroughbreds') {
  const card = document.getElementById('next-tip-home-card');
  const body = document.getElementById('next-tip-home-content');
  const primary = document.getElementById('next-tip-home-primary');
  const secondary = document.getElementById('next-tip-home-secondary');
  if (!card || !body || !primary || !secondary) return;

  card.className = 'card next-tip-card next-tip-card--tease';
  const token = localStorage.getItem('bbb-token-v3');
  if (!token) {
    body.textContent = 'Log in to see your next race tip.';
    primary.textContent = 'Enter Tips';
    primary.href = '/';
    secondary.textContent = 'View All My Tips';
    secondary.href = '/punters-club';
    return;
  }

  try {
    const res = await fetch(`/api/punters/next-tip?trackId=${encodeURIComponent(trackId)}`, {
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.roundStatus === 'CLOSED') {
      card.className = 'card next-tip-card next-tip-card--closed';
      body.textContent = 'Round finished — view results.';
      primary.textContent = 'View Results';
      primary.href = '/punters-club';
      secondary.textContent = 'View All My Tips';
      secondary.href = '/punters-club';
      return;
    }

    if (data.allComplete) {
      card.className = 'card next-tip-card next-tip-card--warn';
      body.textContent = 'All races complete — results coming. Check results shortly.';
      primary.textContent = 'View Results';
      primary.href = '/punters-club';
      secondary.textContent = 'View All My Tips';
      secondary.href = '/punters-club';
      return;
    }

    const countdown = Number(data.countdownToMs || 0) - Date.now();
    const h = String(Math.max(0, Math.floor(countdown / 3600000))).padStart(2, '0');
    const m = String(Math.max(0, Math.floor((countdown % 3600000) / 60000))).padStart(2, '0');

    if (!data.hasTip) {
      card.className = 'card next-tip-card next-tip-card--warn';
      body.textContent = `⚠️ No tip entered for ${data.nextRace || 'next race'} — locks in ${h}:${m}.`;
      primary.textContent = 'Add Tip';
      primary.href = '/punters-club';
      secondary.textContent = 'View All My Tips';
      secondary.href = '/punters-club';
      return;
    }

    card.className = 'card next-tip-card next-tip-card--highlight';
    const runner = data.tip?.runnerName ? `${data.tip.selection} (${data.tip.runnerName})` : `${data.tip?.selection || '—'}`;
    body.textContent = `${data.trackName || 'Track'} • ${data.fixture?.track || 'Venue TBA'} • ${data.nextRace} • Pick: ${runner} • ${data.statusBadge || 'Editable'} • ${h}:${m}`;
    primary.textContent = data.editable ? 'Edit Tips' : 'View Tips';
    primary.href = '/punters-club';
    secondary.textContent = 'View All My Tips';
    secondary.href = '/punters-club';
  } catch {
    body.textContent = 'Could not load your next tip right now.';
  }
}

async function hydrateLandingCritical() {
  renderWinners(MOCK.winners);
  const ticker = document.getElementById('payout-ticker');
  if (ticker) ticker.textContent = MOCK.payoutsTicker;

  try {
    const [jackpot, fx, ladder, milestones, pokerResults, overview, pokerDash] = await Promise.all([
      fetchApi('/jackpot'),
      fetchApi('/fixtures'),
      fetchApi('/ladder'),
      fetchApi('/milestones'),
      fetchApi('/poker/results?page=1&pageSize=100'),
      fetchApi('/punters/overview?tier=paid'),
      fetchApi('/poker/dashboard')
    ]);

    const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
    const potValue = Number(jackpot?.totalPot || 0);
    const roundValue = Number(jackpot?.currentRoundPot || 0);
    const rolloverValue = Number(jackpot?.rollover || 0);
    const potText = money.format(potValue);
    const lastWinner = jackpot?.lastWinner ? `@${jackpot.lastWinner}` : 'No winner yet';

    document.getElementById('status-jackpot').textContent = potText;
    document.getElementById('status-jackpot-label').textContent = potValue > 0 ? 'Jackpot live' : 'Jackpot building';
    document.getElementById('jackpot-value').textContent = potText;
    document.getElementById('jackpot-growth').textContent = `+${money.format(roundValue)}${rolloverValue ? ` (incl. rollover ${money.format(rolloverValue)})` : ''}`;
    document.getElementById('jackpot-last-winner').textContent = lastWinner;

    const effectiveFixtures = (Array.isArray(overview?.fixtures) && overview.fixtures.length)
      ? overview.fixtures
      : (fx?.fixtures || []);
    const meet = effectiveFixtures?.[0]?.track || 'Round complete — results below';
    const lockText = document.getElementById('status-lock')?.textContent || 'Updating…';
    renderFixtures(effectiveFixtures, overview, jackpot, lockText);

    const roundStatus = String(overview?.round?.status || '').toUpperCase();
    const closedRound = roundStatus === 'CLOSED';
    const opensAt = Number(overview?.nextRoundOpensAt || 0);
    if (closedRound) {
      const preOpenText = opensAt > Date.now()
        ? `🟠 Pre-open • opens ${new Date(opensAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}`
        : '🟠 Pre-open';
      setStatusState(preOpenText, 'closed');
    } else if (roundStatus === 'OPEN') {
      setStatusState('🟢 Open now', 'open');
    } else {
      setStatusState('🔴 Closed', 'closed');
    }
    let usedHistoryFallback = false;
    let leaders = closedRound
      ? (overview?.ladder || ladder?.ladder || [])
      : (ladder?.ladder || overview?.ladder || []);

    if (closedRound && (!leaders || !leaders.length)) {
      const recapTop = Array.isArray(overview?.recap?.top3) ? overview.recap.top3 : [];
      if (recapTop.length) {
        leaders = recapTop.map((r, idx) => ({
          rank: idx + 1,
          member: String(r.member || '—'),
          points: Number(r.points || 0),
          winners: Number(r.winners || 0)
        }));
      }
    }

    if ((!leaders || !leaders.length) && Array.isArray(milestones?.winnerHistory) && milestones.winnerHistory.length) {
      usedHistoryFallback = true;
      leaders = milestones.winnerHistory.slice(0, 10).map((w, idx) => ({
        rank: idx + 1,
        member: String(w.member || '—'),
        points: Number.isFinite(Number(w.points)) ? Number(w.points) : '—',
        winners: Number.isFinite(Number(w.winners)) ? Number(w.winners) : '—'
      }));
    }

    renderLadder(leaders);

    const winnerHistory = milestones?.winnerHistory || [];
    const puntersRecent = winnerHistory.slice(0, 6).map((w) => {
      let prize = Number(w.prize ?? w.points ?? 0);
      if (Boolean(w.rolledOver) && prize <= 0) {
        // Fallback for older archived rows that did not persist rollover amount.
        prize = Number(jackpot?.totalPot || jackpot?.rollover || 0);
      }
      return {
        type: 'punters',
        ts: Number(w.archivedAt || 0),
        label: w.weekLabel || 'Week —',
        winner: w.rolledOver ? 'Rollover' : String(w.member || '—'),
        prize,
        rolledOver: Boolean(w.rolledOver)
      };
    });
    const pokerRecent = buildRecentPokerWinners(pokerResults);

    let combined = [...puntersRecent, ...pokerRecent].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    // Ensure both categories appear when available.
    if (puntersRecent.length && pokerRecent.length) {
      const top = combined.slice(0, 3);
      const hasPunters = top.some((x) => x.type === 'punters');
      const hasPoker = top.some((x) => x.type === 'poker');
      if (!hasPunters) combined = [puntersRecent[0], ...combined.filter((x) => x.type !== 'punters')];
      if (!hasPoker) combined = [pokerRecent[0], ...combined.filter((x) => x.type !== 'poker')];
    }

    renderTopWinners(combined);
    const winnersWallRows = combined.slice(0, 8);
    renderWinners(
      winnersWallRows.map((w) => ({
        handle: w.type === 'poker'
          ? `♠ ${w.winner}`
          : (w.rolledOver ? '🏇 Rollover' : `🏇 @${String(w.winner || '').replace(/^@/, '')}`),
        week: w.label || '—',
        prize: money.format(Number(w.prize || 0))
      }))
    );

    const recentPayoutTotal = winnersWallRows.reduce((sum, r) => sum + Number(r.prize || 0), 0);

    document.getElementById('status-meet').textContent = meet;
    document.getElementById('status-entries').textContent = 'Live';
    document.getElementById('stat-weeks').textContent = String(puntersRecent.length || '—');
    document.getElementById('stat-paid').textContent = money.format(recentPayoutTotal);
    const heroEntries = document.getElementById('hero-social-entries');
    const heroPaid = document.getElementById('hero-social-paid');
    if (heroEntries) heroEntries.textContent = String(overview?.tiers?.free || 0);
    if (heroPaid) heroPaid.textContent = money.format(recentPayoutTotal);

    const hotPlayer = (pokerDash?.top10 || [])[0]?.player || 'No heater yet';
    const biggest = pokerDash?.hype?.biggestScore;
    const lifeLastWinner = document.getElementById('life-last-winner');
    const lifeHotPlayer = document.getElementById('life-hot-player');
    const lifeBiggestScore = document.getElementById('life-biggest-score');
    const lifeNextRound = document.getElementById('life-next-round');
    if (lifeLastWinner) lifeLastWinner.textContent = (puntersRecent[0]?.winner && puntersRecent[0].winner !== 'Rollover') ? puntersRecent[0].winner : 'No outright winner last round';
    if (lifeHotPlayer) lifeHotPlayer.textContent = hotPlayer;
    if (lifeBiggestScore) lifeBiggestScore.textContent = biggest?.player ? `${biggest.player} • ${money.format(Number(biggest.biggestScore || 0))}` : 'No posted score yet';
    if (lifeNextRound) lifeNextRound.textContent = roundStatus === 'OPEN'
      ? 'Round is open now'
      : (opensAt > Date.now()
        ? `Opens ${new Date(opensAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`
        : 'Next round timing update shortly');

    const cutoff = document.getElementById('ladder-after-race');
    if (cutoff) cutoff.textContent = (closedRound || usedHistoryFallback) ? 'Final' : (ladder?.afterRace ? `After ${ladder.afterRace}` : 'Live');

    const tickerNode = document.getElementById('payout-ticker');
    if (tickerNode && (closedRound || usedHistoryFallback)) {
      tickerNode.textContent = 'Showing last round results until tipping opens Friday arvo.';
    }

    const mobilePrimary = document.getElementById('mobile-primary-cta');
    if (mobilePrimary) mobilePrimary.textContent = closedRound ? 'View Results' : 'Enter Tips';

    stampUpdated();
    applyTableCards();
    hydrateNextTipHome(String(overview?.track?.id || 'thoroughbreds'));
    scheduleIdle(() => hydrateLandingDeferred(), 3000);
  } catch {
  }
}

async function hydrateLandingDeferred() {
  try {
    const [tips, social] = await Promise.all([
      fetchApi('/tips?status=all'),
      fetchApi('/social-feed')
    ]);

    const tipRows = (tips?.tips || []).filter((t) => t.status !== 'removed');
    const entries = new Set(tipRows.map((t) => t.member)).size;

    requestAnimationFrame(() => {
      renderTipsByPlayer(tipRows);
      renderSocialFeed(social?.items || []);
      document.getElementById('status-entries').textContent = entries ? String(entries) : 'Building';
      document.getElementById('stat-entries').textContent = entries ? String(entries) : '—';
      const heroEntries = document.getElementById('hero-social-entries');
      if (heroEntries && entries) heroEntries.textContent = String(entries);
      applyTableCards();
    });
  } catch {
    // deferred non-critical data failed; keep placeholders
  }
}

async function initLockCountdown() {
  const lockNode = document.getElementById('status-lock');
  if (!lockNode) return;

  let end = new Date(LOCK_AT_ISO).getTime();
  try {
    const dl = await fetchApi('/tips/edit-deadline');
    const apiEnd = Number(dl?.effectiveDeadlineMs || 0);
    if (apiEnd > 0) end = apiEnd;
  } catch {}

  const tick = () => { lockNode.textContent = fmtCountdown(end - Date.now()); };
  tick();
  setInterval(tick, 1000);
}

(function initLanding() {

  if (window.location.hash === '#enter-table') {
    window.location.replace('/punters.html#tip-form');
    return;
  }

  initLockCountdown();
  scheduleIdle(() => wirePickToggles(), 2000);
  wireLeaderboardShare();
  hydrateLandingCritical();

  // Keep homepage ladder status (e.g. After R1 -> After R2) fresh without reload.
  setInterval(() => {
    hydrateLandingCritical();
  }, 60000);

  // Keep next-tip card in sync with auth changes that happen after initial render.
  setInterval(() => {
    hydrateNextTipHome();
  }, 15000);
  window.addEventListener('focus', () => hydrateNextTipHome());
  window.addEventListener('storage', (e) => {
    if (e.key === 'bbb-token-v3') hydrateNextTipHome();
  });
})();
