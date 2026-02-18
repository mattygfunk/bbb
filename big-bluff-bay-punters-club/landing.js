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
  payoutsTicker: 'Payout board refreshes after weekly settlement.'
};

function esc(s) {
  return String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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

function renderFixtures(fixtures) {
  const list = document.getElementById('home-fixtures-list');
  if (!list) return;
  list.innerHTML = '';

  const rows = (fixtures || []).slice(0, 3);
  if (!rows.length) {
    list.innerHTML = '<article class="fixture"><strong>Next meet loading</strong><p class="muted">Fixture details will appear here shortly.</p></article>';
    return;
  }

  rows.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'fixture';
    card.innerHTML = `<strong>${esc(f.event || 'Upcoming Meet')}</strong><p>${esc(f.date || 'TBA')} • ${esc(f.track || 'TBA')}</p><p class='muted'>Races: ${Number(f.raceCount || 12)}</p>`;
    list.appendChild(card);
  });
}

function renderTipsByPlayer(tips) {
  const list = document.getElementById('tips-preview-list');
  if (!list) return;
  list.innerHTML = '';
  if (!tips.length) {
    list.innerHTML = '<article class="tip"><p class="muted">No tips posted yet. Be first in.</p></article>';
    return;
  }

  const byMember = new Map();
  tips.forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byMember.has(member)) byMember.set(member, []);
    byMember.get(member).push({ race: String(t.race || ''), selection: String(t.selection || '') });
  });

  const raceNum = (r) => Number(String(r || '').replace('R', '')) || 999;
  Array.from(byMember.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6)
    .forEach(([member, picks]) => {
      const ordered = picks.sort((a, b) => raceNum(a.race) - raceNum(b.race));
      const lines = ordered.map((p) => `${esc(p.race)}: ${esc(p.selection)}`).join(' • ');
      const card = document.createElement('article');
      card.className = 'tip';
      card.innerHTML = `<h3>${esc(member)}</h3><p class="meta">${lines || 'No tips yet'}</p>`;
      list.appendChild(card);
    });
}

function renderLadder(rows) {
  const body = document.getElementById('ladder-preview');
  if (!body) return;
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">Leaderboard updates when results are posted.</td></tr>';
    return;
  }
  rows.slice(0, 10).forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.rank}</td><td>${esc(r.member)}</td><td>${r.points}</td><td>${r.winners ?? r.correct ?? 0}</td>`;
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

async function hydrateLandingCritical() {
  renderWinners(MOCK.winners);
  const ticker = document.getElementById('payout-ticker');
  if (ticker) ticker.textContent = MOCK.payoutsTicker;

  try {
    const [jackpot, fx, ladder, milestones, pokerResults] = await Promise.all([
      fetchApi('/jackpot'),
      fetchApi('/fixtures'),
      fetchApi('/ladder'),
      fetchApi('/milestones'),
      fetchApi('/poker/results?page=1&pageSize=100')
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

    const meet = fx?.fixtures?.[0]?.track || 'Meet loading';
    renderFixtures(fx?.fixtures || []);

    const leaders = ladder?.ladder || [];
    renderLadder(leaders);

    const winnerHistory = milestones?.winnerHistory || [];
    const puntersRecent = winnerHistory.slice(0, 6).map((w) => ({
      type: 'punters',
      ts: Number(w.archivedAt || 0),
      label: w.weekLabel || 'Week —',
      winner: w.rolledOver ? 'Rollover' : String(w.member || '—'),
      prize: Number(w.prize ?? w.points ?? 0),
      rolledOver: Boolean(w.rolledOver)
    }));
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
    renderWinners(
      combined.slice(0, 6).map((w) => ({
        handle: w.type === 'poker'
          ? `♠ ${w.winner}`
          : (w.rolledOver ? '🏇 Rollover' : `🏇 @${String(w.winner || '').replace(/^@/, '')}`),
        week: w.label || '—',
        prize: money.format(Number(w.prize || 0))
      }))
    );

    document.getElementById('status-meet').textContent = meet;
    document.getElementById('status-entries').textContent = 'Live';
    document.getElementById('stat-weeks').textContent = String(fx?.fixtures?.length || '—');
    document.getElementById('stat-paid').textContent = potText;

    const cutoff = document.getElementById('ladder-after-race');
    if (cutoff) cutoff.textContent = ladder?.afterRace ? `After ${ladder.afterRace}` : 'Live';

    scheduleIdle(() => hydrateLandingDeferred(potText), 3000);
  } catch {
  }
}

async function hydrateLandingDeferred(potText) {
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
      if (potText) document.getElementById('stat-paid').textContent = potText;
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
})();
