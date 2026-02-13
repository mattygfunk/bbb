const API = { register: '/api/register', login: '/api/login' };
const tokenKey = 'bbb-token-v3';

const form = document.getElementById('home-login-form');
const msg = document.getElementById('home-login-msg');

async function req(url, opt = {}) {
  const res = await fetch(url, {
    ...opt,
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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
