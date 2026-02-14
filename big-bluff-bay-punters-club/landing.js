const LOCK_AT_ISO = '2026-02-14T15:00:00+11:00';
const ENTRY_FEE = 10;

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

function fmtCountdown(ms) {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
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
    tr.innerHTML = `<td>${r.rank}</td><td>${esc(r.member)}</td><td>${r.points}</td><td>+${r.correct || 0}</td>`;
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

async function hydrateLanding() {
  renderWinners(MOCK.winners);
  const ticker = document.getElementById('payout-ticker');
  if (ticker) ticker.textContent = MOCK.payoutsTicker;

  try {
    const [fx, tips, ladder] = await Promise.all([
      fetch('/api/fixtures').then((r) => r.json()).catch(() => ({})),
      fetch('/api/tips?status=all').then((r) => r.json()).catch(() => ({})),
      fetch('/api/ladder').then((r) => r.json()).catch(() => ({}))
    ]);

    const meet = fx?.fixtures?.[0]?.track || 'Meet loading';
    const tipRows = (tips?.tips || []).filter((t) => t.status !== 'removed');
    const entries = new Set(tipRows.map((t) => t.member)).size;

    const paidMembers = new Set(tipRows.filter((t) => t.paid).map((t) => String(t.member || ''))).size;
    const potValue = paidMembers * ENTRY_FEE;
    const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
    const potText = money.format(potValue);

    const leaders = ladder?.ladder || [];
    const lastWinner = leaders[0]?.member ? `@${leaders[0].member}` : 'No winner yet';

    document.getElementById('status-meet').textContent = meet;
    document.getElementById('status-entries').textContent = entries ? String(entries) : 'Building';
    document.getElementById('status-jackpot').textContent = potText;
    document.getElementById('status-jackpot-label').textContent = potValue > 0 ? 'Jackpot live' : 'Jackpot building';

    document.getElementById('jackpot-value').textContent = potText;
    document.getElementById('jackpot-growth').textContent = `+${potText}`;
    document.getElementById('jackpot-last-winner').textContent = lastWinner;

    document.getElementById('stat-weeks').textContent = String(fx?.fixtures?.length || '—');
    document.getElementById('stat-entries').textContent = entries ? String(entries) : '—';
    document.getElementById('stat-paid').textContent = potText;

    renderTipsByPlayer(tipRows);
    renderLadder(leaders);
  } catch {
    // graceful fallback to mock/empty states
  }
}

(function initLanding() {
  if (window.location.hash === '#enter-table') {
    window.location.replace('/punters.html#tip-form');
    return;
  }

  const lockNode = document.getElementById('status-lock');
  if (lockNode) {
    const end = new Date(LOCK_AT_ISO).getTime();
    const tick = () => { lockNode.textContent = fmtCountdown(end - Date.now()); };
    tick();
    setInterval(tick, 1000);
  }

  wirePickToggles();
  hydrateLanding();
})();
