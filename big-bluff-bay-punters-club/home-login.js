const API_ROOTS = ['/api', '/punters/api'];
const API = { register: '/register', login: '/login', me: '/me' };
const tokenKey = 'bbb-token-v3';

const form = document.getElementById('home-login-form');
const msg = document.getElementById('home-login-msg');
const loginCard = form?.closest('.card');

async function req(path, opt = {}) {
  const token = localStorage.getItem(tokenKey);
  let lastErr = null;

  for (const root of API_ROOTS) {
    const res = await fetch(`${root}${path}`, {
      ...opt,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opt.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    lastErr = data?.error || `Request failed (${res.status})`;
  }

  throw new Error(lastErr || 'Request failed');
}

async function applyLoggedInState() {
  try {
    const me = await req(API.me);
    if (!me?.user) return;

    if (loginCard) {
      loginCard.innerHTML = `
        <h2>You're logged in</h2>
        <p class="muted">Signed in as <strong>${me.user.username}</strong>.</p>
        <div class="row-actions">
          <a class="btn" href="/punters.html">Go to Punters Area</a>
          <a class="btn btn-ghost" href="/admin.html">Admin Area</a>
        </div>
      `;
    }
  } catch {
    // not logged in
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const username = String(data.get('member') || '').trim();
  const password = String(data.get('pin') || '').trim();
  const mode = e.submitter?.dataset.mode || 'login';

  try {
    if (mode === 'register') {
      await req(API.register, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
    }

    const login = await req(API.login, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    localStorage.setItem(tokenKey, login.token);
    msg.textContent = 'Logged in. Redirecting to Punters Area...';
    window.location.href = '/punters.html';
  } catch (err) {
    msg.textContent = err.message;
  }
});

applyLoggedInState();
