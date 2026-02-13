const API = {
  fixtures: '/api/fixtures',
  tips: '/api/tips',
  ladder: '/api/ladder',
  register: '/api/register',
  login: '/api/login',
  logout: '/api/logout',
  me: '/api/me'
};

const storeKeys = { token: 'bbb-token-v3' };
const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem(storeKeys.token) || null,
  user: null,
  tips: [],
  pendingTips: [],
  fixtures: [],
  ladder: []
};

const ui = {
  fixturesList: $('fixtures-list'),
  tipsList: $('tips-list'),
  ladderBody: $('ladder-body'),
  tipsCount: $('tips-count'),
  memberState: $('member-state'),
  authControls: $('auth-controls'),
  loginForm: $('login-form'),
  tipForm: $('tip-form'),
  loginMsg: $('login-msg'),
  tipMsg: $('tip-msg'),
  adminList: $('admin-list')
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function isAdmin() {
  return state.user?.role === 'admin';
}

function renderFixtures() {
  ui.fixturesList.innerHTML = '';
  state.fixtures.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'fixture';
    card.innerHTML = `<strong>${escapeHtml(f.event)}</strong><p>${escapeHtml(f.date)} • ${escapeHtml(f.track)}</p>`;
    ui.fixturesList.appendChild(card);
  });
}

function renderTips() {
  ui.tipsList.innerHTML = '';
  state.tips.forEach((tip) => {
    const card = document.createElement('article');
    card.className = 'tip';
    card.innerHTML = `
      <strong>${escapeHtml(tip.horse)}</strong>
      <p class="meta">${escapeHtml(tip.race)} • ${escapeHtml(tip.odds)} • by ${escapeHtml(tip.member)}</p>
      <p>${escapeHtml(tip.reason)}</p>
    `;
    ui.tipsList.appendChild(card);
  });

  if (state.tips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No approved tips yet.';
    ui.tipsList.appendChild(empty);
  }

  ui.tipsCount.textContent = `${state.tips.length} tip${state.tips.length === 1 ? '' : 's'}`;
}

function renderLadder() {
  ui.ladderBody.innerHTML = '';
  state.ladder.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${escapeHtml(row.member)}</td>
      <td>${row.wins}</td>
      <td>${escapeHtml(row.roi)}</td>
    `;
    ui.ladderBody.appendChild(tr);
  });
}

function renderAuth() {
  ui.authControls.innerHTML = '';

  if (!state.user) {
    ui.memberState.textContent = 'Logged out';
    const hint = document.createElement('span');
    hint.className = 'pill';
    hint.textContent = 'Guest mode';
    ui.authControls.appendChild(hint);
    return;
  }

  ui.memberState.textContent = `Logged in: ${state.user.username}`;
  const userBadge = document.createElement('span');
  userBadge.className = 'pill';
  userBadge.textContent = `${state.user.username} (${state.user.role})`;

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-ghost';
  logoutBtn.textContent = 'Log Out';
  logoutBtn.addEventListener('click', logout);

  ui.authControls.append(userBadge, logoutBtn);
}

function renderAdmin() {
  ui.adminList.innerHTML = '';

  if (!isAdmin()) {
    const msg = document.createElement('p');
    msg.className = 'muted';
    msg.textContent = 'Admin tools are hidden. Log in as admin to moderate pending tips.';
    ui.adminList.appendChild(msg);
    return;
  }

  if (state.pendingTips.length === 0) {
    const none = document.createElement('p');
    none.className = 'muted';
    none.textContent = 'No pending tips to moderate.';
    ui.adminList.appendChild(none);
    return;
  }

  state.pendingTips.forEach((tip) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(tip.race)} — ${escapeHtml(tip.horse)} (${escapeHtml(tip.odds)})</strong>
        <div class="muted">by ${escapeHtml(tip.member)} • ${escapeHtml(tip.reason)}</div>
      </div>
      <div class="row-actions">
        <button class="btn" data-act="approved" data-id="${tip.id}">Approve</button>
        <button class="btn btn-danger" data-act="removed" data-id="${tip.id}">Remove</button>
      </div>
    `;
    ui.adminList.appendChild(row);
  });

  ui.adminList.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await request(`${API.tips}/${btn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.act })
        });
        await refreshData();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function refreshData() {
  const [fixturesRes, tipsRes, ladderRes] = await Promise.all([
    request(API.fixtures),
    request(`${API.tips}?status=approved`),
    request(API.ladder)
  ]);

  state.fixtures = fixturesRes.fixtures || [];
  state.tips = tipsRes.tips || [];
  state.ladder = ladderRes.ladder || [];

  if (isAdmin()) {
    const pendingRes = await request(`${API.tips}?status=pending`);
    state.pendingTips = pendingRes.tips || [];
  } else {
    state.pendingTips = [];
  }

  renderFixtures();
  renderTips();
  renderLadder();
  renderAuth();
  renderAdmin();
}

async function bootstrapAuth() {
  if (!state.token) return;
  try {
    const me = await request(API.me);
    state.user = me.user;
  } catch {
    state.token = null;
    state.user = null;
    localStorage.removeItem(storeKeys.token);
  }
}

async function loginOrRegister(mode, username, password) {
  if (!username || !password) throw new Error('Username and password are required.');

  if (mode === 'register') {
    await request(API.register, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  const loginRes = await request(API.login, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  state.token = loginRes.token;
  state.user = loginRes.user;
  localStorage.setItem(storeKeys.token, state.token);
}

async function logout() {
  try {
    await request(API.logout, { method: 'POST' });
  } catch {
    // ignore
  }
  state.token = null;
  state.user = null;
  localStorage.removeItem(storeKeys.token);
  ui.loginMsg.textContent = 'Logged out.';
  await refreshData();
}

ui.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(ui.loginForm);
  const username = String(form.get('member') || '').trim();
  const password = String(form.get('pin') || '').trim();

  const mode = event.submitter?.dataset.mode || 'login';
  try {
    await loginOrRegister(mode, username, password);
    ui.loginForm.reset();
    ui.loginMsg.textContent = mode === 'register'
      ? `Account created. Welcome, ${username}.`
      : `Welcome back, ${username}.`;
    await refreshData();
  } catch (err) {
    ui.loginMsg.textContent = err.message;
  }
});

ui.tipForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.user) {
    ui.tipMsg.textContent = 'Log in first to submit a tip.';
    return;
  }

  const form = new FormData(ui.tipForm);
  const payload = {
    race: String(form.get('race') || '').trim(),
    horse: String(form.get('horse') || '').trim(),
    odds: String(form.get('odds') || '').trim(),
    reason: String(form.get('reason') || '').trim()
  };

  try {
    const res = await request(API.tips, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    ui.tipForm.reset();
    ui.tipMsg.textContent = res.tip.status === 'approved'
      ? 'Tip approved and live.'
      : 'Tip submitted for admin approval.';
    await refreshData();
  } catch (err) {
    ui.tipMsg.textContent = err.message;
  }
});

(async function init() {
  await bootstrapAuth();
  await refreshData();
})();
