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
    byMember.get(member).push({ race: String(t.race || ''), selection: String(t.selection || '') });
  });

  const raceNum = (r) => Number(String(r || '').replace('R', '')) || 999;
  const entries = Array.from(byMember.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  entries.slice(0, 4).forEach(([member, picks]) => {
    const ordered = picks.sort((a, b) => raceNum(a.race) - raceNum(b.race));
    const lines = ordered.slice(0, 4).map((p) => `${esc(p.race)}: ${esc(p.selection)}`).join(' • ');
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
  (items || []).forEach((w) => {
    const card = document.createElement('article');
    card.className = 'card winner-item';
    card.innerHTML = `<strong>${esc(w.handle)}</strong><p class='muted'>${esc(w.week)}</p><p class='muted'>${esc(w.prize)}</p>`;
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
    pickEl.textContent = userTip.runnerName
      ? `${userTip.selection || '—'} • ${userTip.runnerName}`
      : String(userTip.selection || '—');
    body.textContent = 'Live sync mode • Your next-race tip is locked and ready.';
    primary.textContent = 'Edit This Tip';
    primary.href = '/punters.html#tip-form';
    secondary.textContent = 'View Full Card';
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
  if (!section || !card || !raceEl || !pickEl || !badgeEl || !countdownEl || !contextEl || !socialEl || !primary || !secondary) return;
  const setLockline = (text = '') => {
    if (!locklineEl) return;
    locklineEl.textContent = text;
    locklineEl.style.display = text ? '' : 'none';
  };

  const token = localStorage.getItem('bbb-token-v3');
  section.hidden = false;
  card.className = 'card next-tip-card next-tip-card--tease';
  card.classList.remove('countdown-pulse');
  card.dataset.state = 'tease';
  badgeEl.textContent = 'MEMBER PREVIEW';
  raceEl.textContent = 'Log in to unlock your next race tip';
  contextEl.textContent = 'Punters Club • Private member card';
  pickEl.textContent = '#—';
  setLockline('');
  socialEl.textContent = 'Track + lock details appear after login';
  countdownEl.style.display = 'none';
  countdownEl.textContent = '';
  primary.textContent = 'Log In';
  primary.href = '/';
  secondary.hidden = false;
  secondary.textContent = 'View Full Card';
  secondary.href = '/punters.html';
  if (!token) return;

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
          venue: lg?.fixture?.track,
          raceNumber: lg?.nextRace,
          startTime: lg?.startAtMs || null,
          lockTime: lg?.lockAtMs || null,
          userHasTip: Boolean(lg?.hasTip),
          userPick: lg?.tip || null,
          canEdit: Boolean(lg?.editable),
          othersCount: 0,
          ladderRank: null,
          ladderRankAvailable: false,
          state: lg?.allComplete || String(lg?.roundStatus || '').toUpperCase() === 'CLOSED'
            ? 'ROUND_COMPLETE'
            : (lg?.hasTip ? (lg?.editable ? 'EDITABLE' : 'LOCKED') : 'MISSING_TIP')
        };
      }

      // Last-resort salvage from tips endpoint to avoid false "No tip entered".
      if (String(d?.state || '') === 'ERROR' || (!d?.userHasTip && !d?.raceNumber)) {
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
            d.userHasTip = true;
            d.userPick = mine[0];
            d.raceNumber = mine[0].race || 'R1';
            d.state = d.canEdit ? 'EDITABLE' : 'LOCKED';
            d.trackName = d.trackName || 'Track';
            d.venue = d.venue || 'Venue TBA';
          }
        }
      }
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

    const venue = d?.venue || 'Track';
    const raceNum = Number(String(d?.raceNumber || '').replace('R',''));
    const raceLabel = Number.isFinite(raceNum) && raceNum > 0 ? `Race ${raceNum}` : 'Race';
    const trackType = String(d?.trackName || '').toLowerCase().includes('grey') ? 'Greyhounds' : 'Thoroughbreds';
    raceEl.textContent = `${raceLabel} — ${venue}`;
    contextEl.textContent = `${trackType} • ${venue} meeting`;
    const lockRef = Number(d?.lockTime || 0);
    const hardLocked = lockRef > 0 && now >= lockRef;
    const canEditEffective = Boolean(d?.canEdit) && !hardLocked;
    if (lockRef > 0 && !hardLocked) {
      contextEl.textContent = `${trackType} • Locks in ${mm}:${ss} (Melbourne)`;
      setLockline('');
    } else if (lockRef > 0 && hardLocked) {
      contextEl.textContent = `${trackType} • Locked ${new Date(lockRef).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
      setLockline('');
    } else {
      contextEl.textContent = `${trackType} • ${venue} meeting`;
      setLockline('');
    }

    if (String(d?.state || '') === 'ROUND_COMPLETE') {
      card.className = 'card next-tip-card next-tip-card--closed';
      badgeEl.textContent = 'ROUND COMPLETE';
      pickEl.textContent = '#—';
      socialEl.textContent = 'Next round opens soon.';
      primary.textContent = 'View Results';
      primary.href = '/punters.html#leaderboard';
      secondary.textContent = 'View Full Card';
      secondary.href = '/punters.html';
      return;
    }

    if (!d?.userHasTip) {
      card.className = `card next-tip-card ${imminent ? 'next-tip-card--imminent' : 'next-tip-card--missing'}`;
      if (imminent) card.classList.add('countdown-pulse');
      badgeEl.textContent = imminent ? 'LOCK IMMINENT' : (canEditEffective ? 'NO TIP ENTERED' : 'LOCKED');
      pickEl.textContent = '#—';
      const others = Number(d?.othersCount || 0);
      const ladderSuffix = d?.ladderRankAvailable && d?.ladderRank ? ` • Position: #${d.ladderRank}` : '';
      socialEl.textContent = others <= 0 ? `You’re first on the card${ladderSuffix}` : `You + ${others} others locked${ladderSuffix}`;
      primary.textContent = canEditEffective ? 'Add Tip Now' : 'Full Card';
      primary.href = canEditEffective ? '/punters.html#tip-form' : '/punters.html';
      secondary.textContent = 'View Full Card';
      secondary.href = '/punters.html';
      return;
    }

    const pickNo = String(d?.userPick?.selection || '—');
    pickEl.textContent = `#${pickNo}`;
    const others = Number(d?.othersCount || 0);
    const ladderSuffix = d?.ladderRankAvailable ? ` • Position: #${d?.ladderRank || '—'}` : '';
    socialEl.textContent = others <= 0 ? `You’re first on the card${ladderSuffix}` : `You + ${others} others locked${ladderSuffix}`;

    if (imminent && canEditEffective) {
      card.className = 'card next-tip-card next-tip-card--imminent';
      card.classList.add('countdown-pulse');
      badgeEl.textContent = 'LOCK IMMINENT';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = false;
      secondary.textContent = 'View Full Card';
      secondary.href = '/punters.html';
      return;
    }

    if (canEditEffective) {
      card.className = 'card next-tip-card next-tip-card--warn';
      badgeEl.textContent = 'EDITABLE';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = false;
      secondary.textContent = 'View Full Card';
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
    const livePot = document.getElementById('live-week-pot');
    if (livePot) livePot.textContent = potText;

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
