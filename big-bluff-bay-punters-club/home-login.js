const API_ROOTS = ['/api'];
const API = { register: '/register', login: '/login', me: '/me' };
const tokenKey = 'bbb-token-v3';

const form = document.getElementById('home-login-form');
const msg = document.getElementById('home-login-msg');
const loginCard = form?.closest('.card');
const passwordInput = document.getElementById('home-password');
const togglePasswordBtn = document.getElementById('toggle-password');

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
  // Avoid unnecessary /api/me request (and console noise) for anonymous visitors.
  if (!localStorage.getItem(tokenKey)) return;

  try {
    const me = await req(API.me);
    if (!me?.user) return;

    if (loginCard) {
      loginCard.style.display = 'none';
    }
  } catch {
    // token missing/expired or offline; keep login card visible
  }
}

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePasswordBtn.textContent = isHidden ? 'Hide' : 'Show';
    togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const username = String(data.get('member') || '').trim();
  const password = String(data.get('pin') || '').trim();
  const mode = e.submitter?.dataset.mode || 'login';

  if (username.length < 3) {
    msg.textContent = 'Username must be at least 3 characters.';
    return;
  }
  if (password.length < 6) {
    msg.textContent = 'Password must be at least 6 characters.';
    return;
  }

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
