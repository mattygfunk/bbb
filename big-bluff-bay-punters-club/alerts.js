const tokenKey = 'bbb-token-v3';
const API = { me:'/api/me', profile:'/api/profile', confirmEmailVerify:'/api/alerts/email/verify/confirm' };

const state = {
  token: localStorage.getItem(tokenKey) || '',
  user: null,
  status: ''
};

const form = document.getElementById('alerts-form');
const statusEl = document.getElementById('status');
const activateBtn = document.getElementById('activate');

function setStatus(msg){
  state.status = msg || '';
  if (statusEl) statusEl.textContent = state.status;
}

function normalizeEmail(v=''){ return String(v || '').trim().toLowerCase(); }

async function req(url, opt = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(url, { ...opt, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function readForm() {
  const email = normalizeEmail(document.getElementById('email')?.value || '');
  const quietStart = String(document.getElementById('quietStart')?.value || '23:00');
  const quietEnd = String(document.getElementById('quietEnd')?.value || '08:00');

  const checked = (name) => Boolean(form?.querySelector(`input[name="${name}"]`)?.checked);
  return {
    alerts: {
      overlayWatch: checked('overlayWatch'),
      startingSoon: checked('startingSoon'),
      lateReg: checked('lateReg'),
      freerolls: checked('freerolls'),
      cashActive: checked('cashActive')
    },
    methods: { email: { enabled: true, verified: false, mode: 'Digest' } },
    rules: { timezone:'Australia/Melbourne', quietStart, quietEnd, allowHighQuiet:true, maxDay:4, tone:'Balanced' },
    contact: { email, phone:'', telegramUser:'' },
    consent: true
  };
}

function fillFromPrefs(prefs = {}) {
  const email = normalizeEmail(prefs?.contact?.email || '');
  if (email) document.getElementById('email').value = email;

  const setCheck = (name, val) => {
    const el = form?.querySelector(`input[name="${name}"]`);
    if (el) el.checked = Boolean(val);
  };

  setCheck('overlayWatch', prefs?.alerts?.overlayWatch ?? false);
  setCheck('startingSoon', prefs?.alerts?.startingSoon ?? true);
  setCheck('lateReg', prefs?.alerts?.lateReg ?? true);
  setCheck('freerolls', prefs?.alerts?.freerolls ?? true);
  setCheck('cashActive', prefs?.alerts?.cashActive ?? false);

  document.getElementById('quietStart').value = String(prefs?.rules?.quietStart || '23:00');
  document.getElementById('quietEnd').value = String(prefs?.rules?.quietEnd || '08:00');
}

async function initVerifyFromLink(){
  const verifyToken = new URLSearchParams(window.location.search).get('verify');
  if (!verifyToken) return;
  const out = await req(API.confirmEmailVerify, { method:'POST', body: JSON.stringify({ token: verifyToken }) });
  if (out?.token) {
    state.token = out.token;
    localStorage.setItem(tokenKey, out.token);
  }
  const u = new URL(window.location.href);
  u.searchParams.delete('verify');
  window.history.replaceState({}, '', u.toString());
  setStatus(`Email verified: ${out.email}`);
}

async function init(){
  try {
    await initVerifyFromLink();

    if (!state.token) {
      setStatus('Log in to activate alerts.');
      return;
    }

    state.user = (await req(API.me)).user;
    const profile = await req(API.profile);
    fillFromPrefs(profile?.profile?.settings?.alertsPreferences || {});
    setStatus(`Signed in as ${state.user?.username || 'member'}.`);
  } catch (err) {
    setStatus(String(err.message || 'Could not load current alert settings.'));
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.token) {
    setStatus('Log in first, then activate alerts.');
    return;
  }

  const email = normalizeEmail(document.getElementById('email')?.value || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setStatus('Enter a valid email address.');
    return;
  }

  activateBtn.disabled = true;
  setStatus('Saving…');

  try {
    const prefs = readForm();
    const existing = (await req(API.profile)).profile || {};
    const settings = { ...(existing.settings || {}), alertsPreferences: prefs };
    await req(API.profile, { method:'PUT', body: JSON.stringify({ settings }) });
    setStatus('Alerts activated.');
  } catch (err) {
    setStatus(String(err.message || 'Could not save alerts settings.'));
  } finally {
    activateBtn.disabled = false;
  }
});

init();