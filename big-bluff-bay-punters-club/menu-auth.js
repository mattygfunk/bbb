const MENU_API_ROOTS = ['/api'];
const MENU_TOKEN_KEY = 'bbb-token-v3';

async function menuReq(path, opt = {}) {
  const token = localStorage.getItem(MENU_TOKEN_KEY);
  let lastErr = null;

  for (const root of MENU_API_ROOTS) {
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

function ensureAuthControlsContainer() {
  const existing = document.getElementById('auth-controls');
  if (existing) return existing;

  const nav = document.querySelector('.nav.wrap, nav.nav');
  if (!nav) return null;

  const controls = document.createElement('div');
  controls.id = 'auth-controls';

  const rightStack = nav.querySelector('.nav-right-stack');
  if (rightStack) {
    rightStack.appendChild(controls);
  } else {
    nav.appendChild(controls);
  }
  return controls;
}

function renderAuthControls(user) {
  const controls = ensureAuthControlsContainer();
  if (!controls) return;

  if (!user) {
    controls.innerHTML = `<a class='menu-link' href='/'>Log in</a>`;
    return;
  }

  const avatar = String(user?.profile?.profilePic || '/assets/default-avatar.svg');
  const username = String(user.username || 'Member');
  controls.innerHTML = `<span class='profile-chip'><img src='${avatar.replaceAll("'", '&#39;')}' alt='' class='profile-chip-avatar'/> <a class='pill' href='/profile.html?u=${encodeURIComponent(username)}' style='text-decoration:none'>${username.replaceAll('<','&lt;').replaceAll('>','&gt;')}</a><a class='menu-link' href='/punters.html#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='menu-logout-btn'>Log Out</button>`;

  const logoutBtn = document.getElementById('menu-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await menuReq('/logout', { method: 'POST' }); } catch {}
      localStorage.removeItem(MENU_TOKEN_KEY);
      window.location.reload();
    });
  }
}

(async function initMenuAuth(){
  const adminLinks = document.querySelectorAll('#admin-nav-link');
  const token = localStorage.getItem(MENU_TOKEN_KEY);

  if (!token) {
    renderAuthControls(null);
    return;
  }

  try {
    const me = await menuReq('/me');
    const user = me?.user || null;
    renderAuthControls(user);
    if (user?.role === 'admin') {
      adminLinks.forEach((el) => { el.style.display = 'inline-block'; });
    }
  } catch {
    localStorage.removeItem(MENU_TOKEN_KEY);
    renderAuthControls(null);
  }
})();
