const API_ROOTS = ['/api'];
const API = { register: '/register', login: '/login', me: '/me' };
const tokenKey = 'bbb-token-v3';

const form = document.getElementById('home-login-form');
const msg = document.getElementById('home-login-msg');
const loginCard = form?.closest('.card');
const passwordInput = document.getElementById('home-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const modeInput = document.getElementById('home-auth-mode');
const modeLoginBtn = document.getElementById('home-mode-login');
const modeRegisterBtn = document.getElementById('home-mode-register');
const submitBtn = document.getElementById('home-auth-submit');
const emailWrap = document.getElementById('home-email-wrap');
const emailInput = document.getElementById('home-email');
let sessionActive = false;

async function req(path, opt = {}) {
  const token = localStorage.getItem(tokenKey);
  let lastErr = null;

  for (const root of API_ROOTS) {
    const res = await fetch(`${root}${path}`, {
      ...opt,
      credentials: 'same-origin',
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

    sessionActive = true;
    // Keep the hero card visible so the "Your Next Race Tip" module (nested in it)
    // stays above-the-fold after login.
    if (msg) msg.textContent = `Signed in as ${me.user.username}. Continue to Punters Area.`;
    if (submitBtn) submitBtn.textContent = 'Open Punters Area';
  } catch {
    // token missing/expired or offline; keep login card visible
  }
}

function setAuthMode(mode) {
  const next = mode === 'register' ? 'register' : 'login';
  if (modeInput) modeInput.value = next;
  if (modeLoginBtn) {
    modeLoginBtn.classList.toggle('chip-btn', next === 'login');
    modeLoginBtn.classList.toggle('btn-ghost', next !== 'login');
    modeLoginBtn.setAttribute('aria-pressed', String(next === 'login'));
  }
  if (modeRegisterBtn) {
    modeRegisterBtn.classList.toggle('chip-btn', next === 'register');
    modeRegisterBtn.classList.toggle('btn-ghost', next !== 'register');
    modeRegisterBtn.setAttribute('aria-pressed', String(next === 'register'));
  }
  if (submitBtn) submitBtn.textContent = next === 'register' ? 'Create Account & Continue' : 'Log In & Continue';
  if (emailWrap) emailWrap.hidden = next !== 'register';
  if (emailInput) {
    emailInput.required = next === 'register';
    if (next !== 'register') emailInput.value = '';
  }
  if (msg) msg.textContent = next === 'register' ? 'Create your account once, then you can log in with the same details.' : '';
}

modeLoginBtn?.addEventListener('click', () => setAuthMode('login'));
modeRegisterBtn?.addEventListener('click', () => setAuthMode('register'));
setAuthMode(modeInput?.value || 'login');

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePasswordBtn.textContent = isHidden ? 'Hide' : 'Show';
    togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
  });
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sessionActive) {
      window.location.href = '/punters.html';
      return;
    }
    const data = new FormData(form);
    const username = String(data.get('member') || '').trim();
    const password = String(data.get('pin') || '').trim();
    const email = String(data.get('email') || '').trim();
    const mode = String(modeInput?.value || 'login');

    if (username.length < 3) {
      if (msg) msg.textContent = 'Username must be at least 3 characters.';
      return;
    }
    if (!password) {
      if (msg) msg.textContent = 'Enter your password.';
      return;
    }
    if (mode === 'register' && password.length < 6) {
      if (msg) msg.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (mode === 'register' && !email) {
      if (msg) msg.textContent = 'Email is required for new accounts.';
      return;
    }

    try {
      if (mode === 'register') {
        await req(API.register, {
          method: 'POST',
          body: JSON.stringify({ username, password, email })
        });
      }

      const login = await req(API.login, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      localStorage.setItem(tokenKey, login.token);
      if (msg) msg.textContent = 'Logged in. Redirecting to Punters Area...';
      window.location.href = '/punters.html';
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Login failed. Please try again.';
    }
  });
}

applyLoggedInState();
