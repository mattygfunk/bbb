const LOCK_AT_ISO = '2026-02-14T15:00:00+11:00';
const LANDING_API_ROOTS = ['/api'];
const LANDING_API_CACHE = new Map();
const LANDING_CACHE_KEY='bbb-landing-api-cache-v1';
function readLandingCache(){ try { return JSON.parse(localStorage.getItem(LANDING_CACHE_KEY)||'{}'); } catch { return {}; } }
function writeLandingCache(path, data){ try { const c=readLandingCache(); c[path]={ts:Date.now(), data}; localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify(c)); } catch {} }
function getLandingCache(path, maxAgeMs=5*60*1000){ try { const e=readLandingCache()[path]; if(!e) return null; if((Date.now()-Number(e.ts||0))>maxAgeMs) return null; return e.data||null; } catch { return null; } }

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
  n.textContent = `${new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} (Melbourne)`;
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
    if (!table) return;
    const headers = [...(table.querySelectorAll('thead th') || [])].map((th) => th.textContent.trim());
    if (!headers.length) return;
    const rowCount = table.querySelectorAll('tbody tr').length;
    const sig = `${headers.join('|')}::${rowCount}`;
    if (wrap.dataset.cardSig === sig) return;
    wrap.dataset.cardSig = sig;
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
        const r = await fetch(url, { credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          LANDING_API_CACHE.set(path, d);
          writeLandingCache(path, d);
          return d;
        }
      } catch {}
      // brief retry for transient timeouts/network hiccups
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return LANDING_API_CACHE.get(path) || getLandingCache(path) || {};
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function fmtHHMMSS(ms) {
  if (!Number.isFinite(ms)) return '--:--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
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

let homeRaceRunners = {};

function lookupRunnerName(race = '', selection = '') {
  const rows = homeRaceRunners?.[String(race || '').toUpperCase()]?.runners || [];
  const sel = String(selection || '').trim();
  const hit = rows.find((r) => String(r?.runnerNumber || '') === sel);
  return String(hit?.horseName || '').trim();
}

function renderTipsByPlayer(tips, currentUser = '') {
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
    byMember.get(member).push({ race: String(t.race || ''), selection: String(t.selection || ''), horse: String(t.runnerName || t.horse || '') });
  });

  const raceNum = (r) => Number(String(r || '').replace('R', '')) || 999;
  const entries = Array.from(byMember.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  entries.slice(0, 4).forEach(([member, picks]) => {
    const ordered = picks.sort((a, b) => raceNum(a.race) - raceNum(b.race));
    const lines = ordered.slice(0, 4).map((p) => {
      const horse = String(p.horse || lookupRunnerName(p.race, p.selection) || '');
      return `${esc(p.race)}: #${esc(p.selection)}${horse ? ` • ${esc(horse)}` : ''}`;
    }).join(' • ');
    const card = document.createElement('article');
    const mine = currentUser && String(member).toLowerCase() === String(currentUser).toLowerCase();
    card.className = `tip${mine ? ' tip-own' : ''}`;
    card.innerHTML = `<h3>${esc(member)} ${mine ? "<span class='pill'>You</span>" : ''} <span class='pill'>Locked</span></h3><p class="meta">${lines || 'No tips yet'}</p>`;
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
  (items || []).forEach((w, idx) => {
    const card = document.createElement('article');
    card.className = `card winner-item winner-item-premium ${idx === 0 ? 'winner-item-featured' : ''}`;
    const handleRaw = String(w.handle || '').trim();
    const icon = handleRaw.startsWith('♠') ? '♠' : '🏇';
    const cleanName = handleRaw
      .replace(/^([♠🏇])\s*/, '')
      .replace(/[\uFFFD]/g, '')
      .replace(/^@+/, '')
      .trim() || '—';
    const typeLabel = icon === '♠' ? 'Poker Result' : 'Racing Result';
    card.innerHTML = `
      <div class='winner-item-head'>
        <span class='pill'>${esc(typeLabel)}</span>
        <span class='pill'>${esc(w.week || '—')}</span>
      </div>
      <h3 class='winner-name'>${esc(`${icon} @${cleanName}`)}</h3>
      <p class='winner-prize'>${esc(w.prize || '$0.00')}</p>
    `;
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
      node.textContent = `♠ ${row.winner || '—'} — ${money.format(Number(row.prize || 0))}`;
    } else {
      const winner = row.rolledOver ? 'Rollover' : String(row.winner || '—');
      node.textContent = `🏇 ${winner} — ${money.format(Number(row.prize || 0))}`;
    }
  }
}

function renderRecentResultsTable(items) {
  const body = document.getElementById('recent-results-body');
  if (!body) return;
  const rows = (items || []).slice(0, 6);
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = "<tr><td colspan='4' class='muted'>No recent verified results yet.</td></tr>";
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const track = row.type === 'poker' ? '♠ Poker' : '🏇 Punters Club';
    const winner = row.rolledOver ? 'Rollover' : String(row.winner || '—');
    tr.innerHTML = `<td class='recent-result-track'>${esc(track)}</td><td class='recent-result-winner'>${esc(winner)}</td><td>${esc(row.label || '—')}</td><td>${esc(new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(Number(row.prize || 0)))}</td>`;
    body.appendChild(tr);
  });
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

async function hydrateNextTipHomeFallback(trackId, token, section, card, body, raceEl, pickEl, primary, secondary) {
  try {
    const [meRes, tipsRes, ladderRes] = await Promise.all([
      fetch('/api/me', { credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/tips?status=all&trackId=${encodeURIComponent(trackId)}`, { credentials: 'same-origin' }),
      fetch(`/api/ladder?trackId=${encodeURIComponent(trackId)}`, { credentials: 'same-origin' })
    ]);
    if (!meRes.ok || !tipsRes.ok) return;
    const me = await meRes.json();
    const tipsData = await tipsRes.json();
    const ladder = ladderRes.ok ? await ladderRes.json() : {};
    const userKey = String(me?.user?.username || '').trim().toLowerCase();
    if (!userKey) return;

    const afterRaceNum = Number(String(ladder?.afterRace || '').replace('R', ''));
    const nextRace = Number.isFinite(afterRaceNum) && afterRaceNum > 0 ? `R${afterRaceNum + 1}` : 'R1';
    const userTip = (tipsData?.tips || [])
      .filter((t) => String(t.member || '').trim().toLowerCase() === userKey)
      .find((t) => String(t.race || '').toUpperCase() === nextRace);

    if (!userTip) return;

    section.hidden = false;
    card.className = 'card next-tip-card next-tip-card--highlight';
    raceEl.textContent = nextRace;
    const heroHorse = String(userTip.runnerName || lookupRunnerName(nextRace, userTip.selection) || '');
    pickEl.textContent = heroHorse
      ? `YOUR SELECTION • #${userTip.selection || '—'} • ${heroHorse}`
      : `YOUR SELECTION • #${String(userTip.selection || '—')}`;
    body.textContent = 'Live sync mode • Your next-race tip is locked and ready.';
    primary.textContent = 'Edit This Tip';
    primary.href = '/punters.html#tip-form';
    secondary.textContent = 'Log In First';
    secondary.href = '/punters.html';
  } catch {}
}

async function hydrateNextTipHome(trackId = 'thoroughbreds') {
  const section = document.getElementById('next-tip-home');
  const card = document.getElementById('next-tip-home-card');
  const raceEl = document.getElementById('next-tip-home-race');
  const pickEl = document.getElementById('next-tip-home-pick');
  const badgeEl = document.getElementById('next-tip-home-badge');
  const countdownEl = document.getElementById('next-tip-home-countdown');
  const contextEl = document.getElementById('next-tip-home-context');
  const locklineEl = document.getElementById('next-tip-home-lockline');
  const socialEl = document.getElementById('next-tip-home-social');
  const primary = document.getElementById('next-tip-home-primary');
  const secondary = document.getElementById('next-tip-home-secondary');
  const inlineState = document.getElementById('next-tip-home-inline-state');
  const inlineJackpot = document.getElementById('next-tip-home-inline-jackpot');
  const inlineMeet = document.getElementById('next-tip-home-inline-meet');
  const inlineLock = document.getElementById('next-tip-home-inline-lock');
  if (!section || !card || !raceEl || !pickEl || !badgeEl || !countdownEl || !contextEl || !socialEl || !primary || !secondary) return;
  const setLockline = (text = '') => {
    if (!locklineEl) return;
    locklineEl.textContent = text;
    locklineEl.style.display = text ? '' : 'none';
  };

  const token = localStorage.getItem('bbb-token-v3');
  if (!token) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  // Keep last good card visible while refreshing to prevent flicker on transient API failures.
  if (!card.dataset.state) {
    card.className = 'card next-tip-card next-tip-card--tease';
    card.classList.remove('countdown-pulse');
    card.dataset.state = 'tease';
    badgeEl.textContent = 'MEMBER PREVIEW';
    raceEl.textContent = 'Loading your next race tip…';
    contextEl.textContent = 'Punters Club • Member card';
    pickEl.textContent = '#—';
    setLockline('');
    socialEl.textContent = 'Syncing your member card…';
    countdownEl.style.display = 'none';
    countdownEl.textContent = '';
    primary.textContent = 'Open Tip Form';
    primary.href = '/punters.html#tip-form';
    secondary.hidden = false;
    secondary.textContent = 'Log In First';
    secondary.href = '/punters.html';
  }

  try {
    const res = await fetch(`/api/punters/next-tip-summary?trackId=${encodeURIComponent(trackId)}`, {
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) return;
    let d = null;
    if (res.ok) {
      d = await res.json();
    }

    const overviewRes = await fetch(`/api/punters/overview?tier=free&trackId=${encodeURIComponent(trackId)}`, { credentials: 'same-origin' });
    const overview = overviewRes.ok ? await overviewRes.json() : null;
    const settled = new Set(Object.keys(overview?.raceResults || {}).map((r) => String(r || '').toUpperCase()));
    const raceCount = Number((overview?.fixtures || [])[0]?.raceCount || 12);
    let firstUnsettled = null;
    for (let i = 1; i <= raceCount; i += 1) {
      const race = `R${i}`;
      if (!settled.has(race)) { firstUnsettled = race; break; }
    }
    if (String(d?.state || '') === 'ERROR' || (!d?.raceNumber && String(d?.roundStatus || '').toUpperCase() !== 'CLOSED')) {
      const legacyRes = await fetch(`/api/punters/next-tip?trackId=${encodeURIComponent(trackId)}`, {
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (legacyRes.ok) {
        const lg = await legacyRes.json();
        d = {
          roundStatus: lg?.roundStatus,
          trackName: lg?.trackName,
          venue: lg?.venue || lg?.fixture?.track || lg?.fixture?.event || '',
          raceNumber: lg?.nextRace,
          startTime: lg?.startAtMs || null,
          lockTime: lg?.lockAtMs || null,
          userHasTip: Boolean(lg?.hasTip),
          userPick: lg?.tip || null,
          canEdit: Boolean(lg?.editable),
          othersCount: Number(lg?.othersCount || 0),
          ladderRank: null,
          ladderRankAvailable: false,
          state: lg?.allComplete || String(lg?.roundStatus || '').toUpperCase() === 'CLOSED'
            ? 'ROUND_COMPLETE'
            : (lg?.hasTip ? (lg?.editable ? 'EDITABLE' : 'LOCKED') : 'MISSING_TIP')
        };
      }

      if (String(d?.roundStatus || '').toUpperCase() === 'CLOSED') {
        d.state = 'ROUND_COMPLETE';
        d.userHasTip = false;
      }

      // Last-resort salvage from tips endpoint to avoid false "No tip entered".
      if (String(d?.roundStatus || '').toUpperCase() !== 'CLOSED' && (String(d?.state || '') === 'ERROR' || (!d?.userHasTip && !d?.raceNumber))) {
        const tipsRes = await fetch(`/api/tips?status=all&trackId=${encodeURIComponent(trackId)}`, { credentials: 'same-origin' });
        const meRes = await fetch('/api/me', { credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } });
        if (tipsRes.ok && meRes.ok) {
          const tipsData = await tipsRes.json();
          const me = await meRes.json();
          const userKey = String(me?.user?.username || '').trim().toLowerCase();
          const mine = (tipsData?.tips || [])
            .filter((t) => String(t.status || '') !== 'removed')
            .filter((t) => String(t.member || '').trim().toLowerCase() === userKey)
            .sort((a,b)=>Number(String(a.race||'R999').replace('R',''))-Number(String(b.race||'R999').replace('R','')));
          if (mine.length) {
            const targetRace = firstUnsettled || String(mine[0].race || 'R1').toUpperCase();
            const targetPick = mine.find((t) => String(t.race || '').toUpperCase() === targetRace) || mine[0];
            d.userHasTip = Boolean(targetPick);
            d.userPick = targetPick;
            d.raceNumber = targetRace;
            d.state = d.canEdit ? 'EDITABLE' : 'LOCKED';
            d.trackName = d.trackName || 'Track';
            d.venue = d.venue || 'Venue TBA';
          }
        }
      }
    }

    if (d && firstUnsettled && String(d?.state || '').toUpperCase() !== 'ROUND_COMPLETE') {
      const currentRace = String(d.raceNumber || '').toUpperCase();
      if (!currentRace || settled.has(currentRace)) d.raceNumber = firstUnsettled;
    }

    const now = Date.now();
    const toLock = Number(d?.lockTime || 0) - now;
    const toStart = Number(d?.startTime || 0) - now;
    const activeCountdown = [toLock, toStart].filter((n) => Number.isFinite(n) && n > 0).sort((a,b)=>a-b)[0] || 0;
    const mm = String(Math.max(0, Math.floor(activeCountdown / 60000))).padStart(2, '0');
    const ss = String(Math.max(0, Math.floor((activeCountdown % 60000) / 1000))).padStart(2, '0');
    const imminent = activeCountdown > 0 && activeCountdown < 60000;
    countdownEl.style.display = activeCountdown > 0 ? '' : 'none';
    countdownEl.textContent = activeCountdown > 0 ? `${mm}:${ss}` : '';

    const isBetweenRounds = String(d?.roundPhase || '').toUpperCase() === 'BETWEEN_ROUNDS'
      || (String(d?.roundStatus || '').toUpperCase() === 'CLOSED' && !String(d?.raceNumber || '').trim());
    const rawVenue = String(d?.venue || '').trim();
    const venue = (!isBetweenRounds && rawVenue && !/^venue\s*tba$/i.test(rawVenue)) ? rawVenue : '';
    const raceNum = Number(String(d?.raceNumber || '').replace('R',''));
    const raceLabel = Number.isFinite(raceNum) && raceNum > 0 ? `Race ${raceNum}` : (isBetweenRounds ? 'Next round pending' : 'Race');
    raceEl.textContent = venue ? `${raceLabel} — ${venue}` : raceLabel;
    contextEl.textContent = isBetweenRounds ? 'No meet published yet' : (venue ? `${venue} meeting` : `Round open`);
    const lockRef = Number(d?.lockTime || 0);
    const hardLocked = lockRef > 0 && now >= lockRef;
    const canEditEffective = Boolean(d?.canEdit) && !hardLocked;

    if (inlineState) {
      const roundComplete = String(d?.state || '').toUpperCase() === 'ROUND_COMPLETE';
      inlineState.textContent = (!hardLocked && !roundComplete && !isBetweenRounds) ? '🟢 Open now' : '🔴 Closed';
    }
    if (inlineJackpot) inlineJackpot.textContent = `💰 Jackpot live: ${document.getElementById('status-jackpot')?.textContent || '$0'}`;
    if (inlineMeet) inlineMeet.textContent = `🏁 Meet: ${isBetweenRounds ? '—' : (venue || '—')}`;
    const statusLockText = String(document.getElementById('status-lock')?.textContent || '').trim();
    if (inlineLock) inlineLock.textContent = isBetweenRounds
      ? '🔒 Lock: Pending'
      : `🔒 Lock: ${lockRef > 0 ? fmtHHMMSS(lockRef - now) : (statusLockText || '--:--:--')}`;
    if (isBetweenRounds) {
      contextEl.textContent = 'No meet published yet';
      setLockline('');
    } else if (lockRef > 0 && !hardLocked) {
      contextEl.textContent = `Locks in ${mm}:${ss} (Melbourne)`;
      setLockline('');
    } else if (lockRef > 0 && hardLocked) {
      contextEl.textContent = `Locked ${new Date(lockRef).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} (Melbourne)`;
      setLockline('');
    } else {
      contextEl.textContent = venue ? `${venue} meeting` : `Waiting for next meet`;
      setLockline('');
    }

    if (String(d?.state || '') === 'ROUND_COMPLETE') {
      card.className = 'card next-tip-card next-tip-card--closed';
      badgeEl.textContent = isBetweenRounds ? 'BETWEEN ROUNDS' : 'ROUND COMPLETE';
      pickEl.textContent = '#—';
      socialEl.textContent = isBetweenRounds ? 'No meet announced yet. Waiting for next round setup.' : 'Next round opens soon.';
      primary.textContent = isBetweenRounds ? 'View Archive' : 'View Results';
      primary.href = isBetweenRounds ? '/winners.html' : '/punters.html#leaderboard';
      secondary.textContent = 'Log In First';
      secondary.href = '/punters.html';
      return;
    }

    if (!d?.userHasTip) {
      card.className = `card next-tip-card ${imminent ? 'next-tip-card--imminent' : 'next-tip-card--missing'}`;
      if (imminent) card.classList.add('countdown-pulse');
      badgeEl.textContent = imminent ? 'LOCK IMMINENT' : (canEditEffective ? 'NO TIP ENTERED' : 'LOCKED');
      pickEl.textContent = '#—';
      const others = Number(d?.othersCount || 0);
      const positionText = d?.ladderRankAvailable && d?.ladderRank && d?.ladderSize
        ? `You’re in position ${d.ladderRank} of ${d.ladderSize} on the leaderboard`
        : '';
      socialEl.textContent = positionText || (others <= 0 ? `No tips locked yet` : `${others} punter${others===1?'':'s'} locked`);
      primary.textContent = canEditEffective ? 'Add Tip Now' : 'Full Card';
      primary.href = canEditEffective ? '/punters.html#tip-form' : '/punters.html';
      secondary.textContent = 'Log In First';
      secondary.href = '/punters.html';
      return;
    }

    const pickNo = String(d?.userPick?.selection || '—');
    const raceKey = Number.isFinite(raceNum) && raceNum > 0 ? `R${raceNum}` : '';
    const pickHorse = String(d?.userPick?.runnerName || d?.userPick?.horse || lookupRunnerName(raceKey, pickNo) || '').trim();
    pickEl.textContent = pickHorse ? `YOUR SELECTION • #${pickNo} • ${pickHorse}` : `YOUR SELECTION • #${pickNo}`;
    const others = Number(d?.othersCount || 0);
    const positionText = d?.ladderRankAvailable && d?.ladderRank && d?.ladderSize
      ? `You’re in position ${d.ladderRank} of ${d.ladderSize} on the leaderboard`
      : '';
    socialEl.textContent = positionText || (others <= 0 ? `You’re first on the card` : `You + ${others} others locked`);

    if (imminent && canEditEffective) {
      card.className = 'card next-tip-card next-tip-card--imminent';
      card.classList.add('countdown-pulse');
      badgeEl.textContent = 'LOCK IMMINENT';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = false;
      secondary.textContent = 'Log In First';
      secondary.href = '/punters.html';
      return;
    }

    if (canEditEffective) {
      card.className = 'card next-tip-card next-tip-card--warn';
      badgeEl.textContent = 'EDITABLE';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = false;
      secondary.textContent = 'Log In First';
      secondary.href = '/punters.html';
      return;
    }

    card.className = 'card next-tip-card next-tip-card--highlight';
    badgeEl.textContent = 'LOCKED IN';
    primary.textContent = 'Full Card';
    primary.href = '/punters.html';
    secondary.hidden = true;
  } catch {}
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
    const effectiveJackpot = overview?.jackpot || jackpot || {};
    const potValue = Number(effectiveJackpot?.totalPot || 0);
    const roundValue = Number(effectiveJackpot?.currentRoundPot || 0);
    const rolloverValue = Number(effectiveJackpot?.rollover || 0);
    const potText = money.format(potValue);
    const lastWinnerRaw = String(overview?.winnerBanner?.member || jackpot?.lastWinner || '').trim();
    const lastWinner = lastWinnerRaw ? `@${lastWinnerRaw.replace(/^@/, '')}` : 'No winner yet';

    document.getElementById('status-jackpot').textContent = potText;
    document.getElementById('status-jackpot-label').textContent = potValue > 0 ? 'Jackpot live' : 'Jackpot building';
    document.getElementById('jackpot-value').textContent = potText;
    document.getElementById('jackpot-growth').textContent = `+${money.format(roundValue)}${rolloverValue ? ` (incl. rollover ${money.format(rolloverValue)})` : ''}`;
    document.getElementById('jackpot-last-winner').textContent = lastWinner;
    const livePot = document.getElementById('live-week-pot');
    if (livePot) livePot.textContent = potText;

    homeRaceRunners = overview?.raceRunners || {};

    const effectiveFixtures = (Array.isArray(overview?.fixtures) && overview.fixtures.length)
      ? overview.fixtures
      : (fx?.fixtures || []);
    const meet = effectiveFixtures?.[0]?.track || 'Round complete — results below';
    const lockText = document.getElementById('status-lock')?.textContent || 'Updating…';
    renderFixtures(effectiveFixtures, overview, jackpot, lockText);

    const roundStatus = String(overview?.round?.status || '').toUpperCase();
    const roundPhase = String(overview?.round?.phase || '').toUpperCase();
    const closedRound = roundStatus === 'CLOSED';
    const betweenRounds = roundPhase === 'BETWEEN_ROUNDS' || (closedRound && !overview?.round?.id);
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
    renderRecentResultsTable(combined);
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

    const heroKicker = document.getElementById('hero-kicker-text');
    const heroSubline = document.getElementById('hero-subline-text');
    const heroProof1 = document.getElementById('hero-proof-1');
    const heroProof2 = document.getElementById('hero-proof-2');
    const heroProof3 = document.getElementById('hero-proof-3');
    const heroNewHere = document.getElementById('hero-new-here-copy');
    const heroCta = document.getElementById('hero-primary-cta');

    if (betweenRounds) {
      if (heroKicker) heroKicker.textContent = 'Between rounds • archive + prep mode';
      if (heroSubline) heroSubline.textContent = 'Last round is settled. Next meet details will appear here once published.';
      if (heroProof1) heroProof1.innerHTML = '<strong>Review outcomes:</strong> verify final ladder, winner, and payout snapshot.';
      if (heroProof2) heroProof2.innerHTML = '<strong>Prep for next open:</strong> keep your account ready and watch for the meet announcement.';
      if (heroProof3) heroProof3.innerHTML = '<strong>Stay sharp:</strong> track recent form and return for lock-in once round opens.';
      if (heroNewHere) heroNewHere.innerHTML = 'New here? <a href="/winners.html">Explore winners, streaks, and payout history</a> while the next meet is being set.';
      if (heroCta) {
        heroCta.textContent = 'View Winners & Archive';
        heroCta.href = '/winners.html';
      }
      document.getElementById('status-jackpot-label').textContent = 'Carryover ready';
      document.getElementById('status-meet').textContent = 'Awaiting next meet announcement';
      const lockNode = document.getElementById('status-lock');
      if (lockNode) lockNode.textContent = 'Pending';
    } else {
      if (heroKicker) heroKicker.textContent = 'Premium punters-to-poker ladder';
      if (heroSubline) heroSubline.textContent = 'Tip fast. Lock in. Win real. Verified results. Transparent payouts.';
      if (heroProof1) heroProof1.innerHTML = '<strong>Lock tips fast:</strong> one clean entry flow before cutoff.';
      if (heroProof2) heroProof2.innerHTML = '<strong>Track results live:</strong> points, winners, and jackpots update transparently.';
      if (heroProof3) heroProof3.innerHTML = '<strong>Level up to poker:</strong> convert discipline into nightly and Sunday events.';
      if (heroNewHere) heroNewHere.innerHTML = 'New here? <a href="/winners.html">See recent winners, streaks, and payout history</a>.';
      if (heroCta) {
        heroCta.textContent = 'Log In to Continue';
        heroCta.href = '/punters.html#punters-login-gate';
      }
      document.getElementById('status-jackpot-label').textContent = potValue > 0 ? 'Jackpot live' : 'Jackpot building';
      document.getElementById('status-meet').textContent = meet;
    }

    document.getElementById('status-entries').textContent = betweenRounds ? 'Between rounds' : 'Live';
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

    const nextRaceCallout = document.getElementById('home-next-race-callout');
    if (nextRaceCallout) {
      const afterRace = Number(String(ladder?.afterRace || '').replace('R', ''));
      const nextRaceNum = Number.isFinite(afterRace) && afterRace > 0 ? afterRace + 1 : 1;
      if (closedRound) {
        nextRaceCallout.textContent = 'ROUND COMPLETE — RESULTS BELOW';
      } else {
        nextRaceCallout.textContent = `NEXT RACE: R${nextRaceNum}`;
      }
    }

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
    const nextRaceCallout = document.getElementById('home-next-race-callout');
    if (nextRaceCallout && !String(nextRaceCallout.textContent || '').trim()) {
      nextRaceCallout.textContent = 'NEXT RACE: R1';
    }
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
    let currentUser = '';
    const token = localStorage.getItem('bbb-token-v3');
    if (token) {
      try {
        const meRes = await fetch('/api/me', { credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } });
        if (meRes.ok) {
          const me = await meRes.json();
          currentUser = String(me?.user?.username || '');
        }
      } catch {}
    }

    requestAnimationFrame(() => {
      renderTipsByPlayer(tipRows, currentUser);
      renderSocialFeed(social?.items || []);
      document.getElementById('status-entries').textContent = entries ? String(entries) : 'Building';
      document.getElementById('stat-entries').textContent = entries ? String(entries) : '—';
      const liveEntries = document.getElementById('live-week-entries');
      if (liveEntries) liveEntries.textContent = String(entries || 0);
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

  const tick = () => {
    const text = fmtCountdown(end - Date.now());
    lockNode.textContent = text;
    const inlineLock = document.getElementById('next-tip-home-inline-lock');
    if (inlineLock) inlineLock.textContent = `🔒 Lock: ${text}`;
  };
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
    if (document.hidden) return;
    hydrateLandingCritical();
  }, 60000);

  // Keep next-tip card in sync with auth changes that happen after initial render.
  setInterval(() => {
    if (document.hidden) return;
    hydrateNextTipHome();
  }, 15000);
  window.addEventListener('focus', () => hydrateNextTipHome());
  window.addEventListener('storage', (e) => {
    if (e.key === 'bbb-token-v3') hydrateNextTipHome();
  });
})();
