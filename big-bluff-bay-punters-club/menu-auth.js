const MENU_API_ROOTS = ['/api', '/punters/api'];
const MENU_TOKEN_KEY = 'bbb-token-v3';

async function menuReq(path, opt = {}) {
  const token = localStorage.getItem(MENU_TOKEN_KEY);
  let lastErr = null;

  for (const root of MENU_API_ROOTS) {
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

(async function showAdminNavIfAdmin(){
  const adminLinks = document.querySelectorAll('#admin-nav-link');
  if (!adminLinks.length) return;
  if (!localStorage.getItem(MENU_TOKEN_KEY)) return;

  try {
    const me = await menuReq('/me');
    if (me?.user?.role === 'admin') {
      adminLinks.forEach((el) => { el.style.display = 'inline-block'; });
    }
  } catch {
    // ignore
  }
})();
