const seedData = {
  fixtures: [
    { date: 'Sat 15 Feb', event: 'Big Bluff Sprint', track: 'Bay Park' },
    { date: 'Wed 19 Feb', event: 'Midweek Mile', track: 'Harbour Downs' },
    { date: 'Sat 22 Feb', event: 'The Bluff Cup', track: 'Big Bluff Bay' }
  ],
  ladder: [
    { rank: 1, member: 'Macca', wins: 14, roi: '+18%' },
    { rank: 2, member: 'Jess', wins: 12, roi: '+11%' },
    { rank: 3, member: 'Rico', wins: 11, roi: '+7%' },
    { rank: 4, member: 'Tahlia', wins: 9, roi: '+2%' }
  ],
  tips: [
    { id: crypto.randomUUID(), member: 'Macca', race: 'R3', horse: 'Storm Ledger', odds: '$4.20', reason: 'Strong late speed.', status: 'approved', createdAt: Date.now() - 8600000 },
    { id: crypto.randomUUID(), member: 'Jess', race: 'R5', horse: 'Bayline Belle', odds: '$6.00', reason: 'Great barrier draw.', status: 'approved', createdAt: Date.now() - 4800000 },
    { id: crypto.randomUUID(), member: 'Rico', race: 'R7', horse: 'Cash Cascade', odds: '$5.50', reason: 'Handles soft track.', status: 'approved', createdAt: Date.now() - 1500000 }
  ]
};

const storeKeys = {
  currentUser: 'bbb-current-user-v2',
  tips: 'bbb-tips-v2'
};

const $ = (id) => document.getElementById(id);

const state = {
  currentUser: loadJson(storeKeys.currentUser, null),
  tips: loadJson(storeKeys.tips, seedData.tips)
};

const fixturesList = $('fixtures-list');
const tipsList = $('tips-list');
const ladderBody = $('ladder-body');
const tipsCount = $('tips-count');
const memberState = $('member-state');
const authControls = $('auth-controls');
const loginForm = $('login-form');
const tipForm = $('tip-form');
const loginMsg = $('login-msg');
const tipMsg = $('tip-msg');
const adminList = $('admin-list');

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isAdmin() {
  return (state.currentUser || '').toLowerCase() === 'admin';
}

function renderFixtures() {
  fixturesList.innerHTML = '';
  seedData.fixtures.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'fixture';
    card.innerHTML = `
      <strong>${escapeHtml(f.event)}</strong>
      <p>${escapeHtml(f.date)} • ${escapeHtml(f.track)}</p>
    `;
    fixturesList.appendChild(card);
  });
}

function renderLadder() {
  ladderBody.innerHTML = '';
  seedData.ladder.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.rank}</td>
      <td>${escapeHtml(r.member)}</td>
      <td>${r.wins}</td>
      <td>${escapeHtml(r.roi)}</td>
    `;
    ladderBody.appendChild(tr);
  });
}

function renderTips() {
  tipsList.innerHTML = '';
  const sorted = [...state.tips].sort((a, b) => b.createdAt - a.createdAt);
  const approved = sorted.filter((t) => t.status === 'approved');

  approved.forEach((tip) => {
    const card = document.createElement('article');
    card.className = 'tip';
    card.innerHTML = `
      <strong>${escapeHtml(tip.horse)}</strong>
      <p class="meta">${escapeHtml(tip.race)} • ${escapeHtml(tip.odds)} • by ${escapeHtml(tip.member)}</p>
      <p>${escapeHtml(tip.reason)}</p>
    `;
    tipsList.appendChild(card);
  });

  if (approved.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No approved tips yet.';
    tipsList.appendChild(empty);
  }

  tipsCount.textContent = `${approved.length} tip${approved.length === 1 ? '' : 's'}`;
}

function renderAuth() {
  const user = state.currentUser;
  memberState.textContent = user ? `Logged in: ${user}` : 'Logged out';
  authControls.innerHTML = '';

  if (!user) {
    const hint = document.createElement('span');
    hint.className = 'pill';
    hint.textContent = 'Guest mode';
    authControls.appendChild(hint);
    return;
  }

  const userBadge = document.createElement('span');
  userBadge.className = 'pill';
  userBadge.textContent = user;

  const logout = document.createElement('button');
  logout.className = 'btn btn-ghost';
  logout.textContent = 'Log Out';
  logout.addEventListener('click', () => {
    state.currentUser = null;
    saveJson(storeKeys.currentUser, null);
    loginMsg.textContent = 'Logged out.';
    tipMsg.textContent = '';
    renderAuth();
    renderAdmin();
  });

  authControls.append(userBadge, logout);
}

function renderAdmin() {
  adminList.innerHTML = '';

  if (!isAdmin()) {
    const msg = document.createElement('p');
    msg.className = 'muted';
    msg.textContent = 'Admin tools are hidden. Log in as “admin” to moderate pending tips.';
    adminList.appendChild(msg);
    return;
  }

  const pending = state.tips
    .filter((tip) => tip.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);

  if (pending.length === 0) {
    const done = document.createElement('p');
    done.className = 'muted';
    done.textContent = 'No pending tips to moderate.';
    adminList.appendChild(done);
    return;
  }

  pending.forEach((tip) => {
    const row = document.createElement('div');
    row.className = 'row';

    const summary = document.createElement('div');
    summary.innerHTML = `
      <strong>${escapeHtml(tip.race)} — ${escapeHtml(tip.horse)} (${escapeHtml(tip.odds)})</strong>
      <div class="muted">by ${escapeHtml(tip.member)} • ${escapeHtml(tip.reason)}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const approve = document.createElement('button');
    approve.className = 'btn';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => moderateTip(tip.id, 'approved'));

    const remove = document.createElement('button');
    remove.className = 'btn btn-danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => moderateTip(tip.id, 'removed'));

    actions.append(approve, remove);
    row.append(summary, actions);
    adminList.appendChild(row);
  });
}

function moderateTip(id, nextStatus) {
  state.tips = state.tips.map((tip) =>
    tip.id === id ? { ...tip, status: nextStatus } : tip
  );
  saveJson(storeKeys.tips, state.tips);
  renderTips();
  renderAdmin();
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  const member = String(data.get('member') || '').trim();
  const pin = String(data.get('pin') || '').trim();

  if (!member || pin.length < 4) {
    loginMsg.textContent = 'Use a member name and a 4+ digit PIN.';
    return;
  }

  state.currentUser = member;
  saveJson(storeKeys.currentUser, member);
  loginMsg.textContent = `Welcome in, ${member}.`;
  loginForm.reset();
  renderAuth();
  renderAdmin();
});

tipForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!state.currentUser) {
    tipMsg.textContent = 'Log in first to submit a tip.';
    return;
  }

  const data = new FormData(tipForm);
  const next = {
    id: crypto.randomUUID(),
    member: state.currentUser,
    race: String(data.get('race') || '').trim(),
    horse: String(data.get('horse') || '').trim(),
    odds: String(data.get('odds') || '').trim(),
    reason: String(data.get('reason') || '').trim(),
    createdAt: Date.now(),
    status: isAdmin() ? 'approved' : 'pending'
  };

  if (!next.race || !next.horse || !next.odds || !next.reason) {
    tipMsg.textContent = 'Please complete all fields.';
    return;
  }

  state.tips.push(next);
  saveJson(storeKeys.tips, state.tips);

  const statusText = next.status === 'approved' ? 'approved and live' : 'submitted for admin approval';
  tipMsg.textContent = `Tip ${statusText}.`;

  tipForm.reset();
  renderTips();
  renderAdmin();
});

renderFixtures();
renderLadder();
renderTips();
renderAuth();
renderAdmin();
