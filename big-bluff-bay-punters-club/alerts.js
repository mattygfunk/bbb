const tokenKey = 'bbb-token-v3';
const API = { me:'/api/me', profile:'/api/profile', sendEmailVerify:'/api/alerts/email/verify/send', confirmEmailVerify:'/api/alerts/email/verify/confirm' };

const DEFAULTS = {
  alerts: { scheduleDrop:true, startingSoon:true, lateReg:true, overlayWatch:false, winnerPosts:true, breakingNews:true },
  methods: { email:{enabled:true, verified:false, mode:'Digest'}, sms:{enabled:false}, telegram:{enabled:false, linked:false} },
  rules: { timezone:'Australia/Melbourne', quietStart:'23:00', quietEnd:'08:00', allowHighQuiet:true, maxDay:4, tone:'Balanced' },
  advanced: { weeklyCap: 16, raceTypes: { thoroughbreds:true, greyhounds:true, harness:false }, segments: { jackpots:true, promos:true, coaching:false } },
  contact: { email:'', phone:'', telegramUser:'' },
  consent:false
};

const state = { token: localStorage.getItem(tokenKey)||'', user:null, prefs: structuredClone(DEFAULTS), busy:false, emailVerifyStatus:'idle', emailVerifyMsg:'' };
const app = document.getElementById('alerts-app');
const preview = document.getElementById('preview-panel');

function esc(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
async function req(url, opt={}){ const h={'Content-Type':'application/json',...(opt.headers||{})}; if(state.token) h.Authorization=`Bearer ${state.token}`; const r=await fetch(url,{...opt,headers:h}); const d=await r.json().catch(()=>({})); if(!r.ok){ const parts=[d.error||`HTTP ${r.status}`]; if(d.detail) parts.push(d.detail); if(d.responseCode) parts.push(`SMTP ${d.responseCode}`); if(d.code) parts.push(d.code); throw new Error(parts.join(' • ')); } return d; }
function mergeDefaults(x){ return { ...structuredClone(DEFAULTS), ...(x||{}), alerts:{...DEFAULTS.alerts,...(x?.alerts||{})}, methods:{ email:{...DEFAULTS.methods.email,...(x?.methods?.email||{})}, sms:{...DEFAULTS.methods.sms,...(x?.methods?.sms||{})}, telegram:{...DEFAULTS.methods.telegram,...(x?.methods?.telegram||{}) } }, rules:{...DEFAULTS.rules,...(x?.rules||{})}, advanced:{...DEFAULTS.advanced,...(x?.advanced||{}), raceTypes:{...DEFAULTS.advanced.raceTypes,...(x?.advanced?.raceTypes||{})}, segments:{...DEFAULTS.advanced.segments,...(x?.advanced?.segments||{})}}, contact:{...DEFAULTS.contact,...(x?.contact||{})} }; }

function set(path, v){ const p=path.split('.'); let o=state.prefs; for(let i=0;i<p.length-1;i++) o=o[p[i]]; o[p.at(-1)] = v; render(); }
function normalizeEmail(v=''){ return String(v||'').trim().toLowerCase(); }
function validEmail(v=''){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v)); }

function applyPreset(name){
  const p = structuredClone(state.prefs);
  if(name==='minimal') p.alerts = { scheduleDrop:true, startingSoon:false, lateReg:false, overlayWatch:false, winnerPosts:false, breakingNews:false };
  if(name==='balanced') p.alerts = { scheduleDrop:true, startingSoon:true, lateReg:true, overlayWatch:false, winnerPosts:true, breakingNews:true };
  if(name==='grinder') p.alerts = { scheduleDrop:true, startingSoon:true, lateReg:true, overlayWatch:true, winnerPosts:true, breakingNews:true };
  state.prefs = p;
  render();
}

function toggle(label,key){ return `<label style='display:flex;justify-content:space-between;align-items:center;border:1px solid #2b3d4e;border-radius:10px;padding:.6rem;background:#0f1620'><span>${label}</span><input type='checkbox' data-b='alerts.${key}' ${state.prefs.alerts[key]?'checked':''}></label>`; }

function render(){
  const auth = document.getElementById('alerts-auth');
  auth.innerHTML = state.user ? `<span class='chip'>${esc(state.user.username)}</span><button class='btn ghost' id='logout-btn'>Log out</button>` : `<a class='btn ghost' href='/punters.html#punters-login-gate'>Log in</a>`;

  const enabledAlertCount = Object.values(state.prefs.alerts).filter(Boolean).length;
  const enabledMethodCount = [state.prefs.contact.email, state.prefs.contact.phone, state.prefs.contact.telegramUser].filter((v)=>String(v||'').trim()).length;
  const completion = [enabledAlertCount > 0, enabledMethodCount > 0, Boolean(state.prefs.consent)].filter(Boolean).length;

  app.innerHTML = `
  <section class='card'>
    <div class='step'><span class='n'>A</span><h2>Choose Alerts</h2></div>
    <p class='muted'>${state.user ? `Nice one, ${esc(state.user.username)}.` : 'Pick your setup first, then log in to save.'} ${enabledAlertCount} alert type${enabledAlertCount===1?'':'s'} enabled.</p>
    <p class='muted'>Keep it simple: pick a preset, then tweak if you want.</p>
    <div class='row two'>
      <button class='btn ghost' data-preset='minimal'>Minimal</button>
      <button class='btn ghost' data-preset='balanced'>Balanced</button>
      <button class='btn ghost' data-preset='grinder'>Grinder</button>
    </div>
    <div class='grid two' style='margin-top:.6rem'>
      ${toggle('Tonight schedule drop','scheduleDrop')}
      ${toggle('Starting soon alerts','startingSoon')}
      ${toggle('Late reg closing','lateReg')}
      ${toggle('Overlay watch','overlayWatch')}
      ${toggle('Winner posts (next morning)','winnerPosts')}
      ${toggle('Breaking news (rare)','breakingNews')}
    </div>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>B</span><h2>Contact Methods</h2></div>
    <div class='grid two'>
      <article class='method'>
        <h3>Email (recommended)</h3>
        <label>Email address<input data-b='contact.email' value='${esc(state.prefs.contact.email)}' placeholder='you@domain.com'></label>
        <div class='row two'>
          <button class='btn ghost' data-action='verify-email' ${!state.user || !String(state.prefs.contact.email||'').trim() || state.emailVerifyStatus==='sending' ? 'disabled' : ''}>${state.emailVerifyStatus==='sending' ? 'Sending…' : 'Verify email'}</button>
          <button class='btn ghost' data-action='verify-email-self' ${!state.user || state.emailVerifyStatus==='sending' ? 'disabled' : ''}>${state.emailVerifyStatus==='sending' ? 'Please wait…' : 'Send test to account email'}</button>
        </div>
        <span class='muted'>${state.prefs.methods.email.verified?'Verified ✅':(state.prefs.contact.email?'Pending verification':'Add email')}</span>
        <p class='footer-note ${state.emailVerifyStatus==='success' ? 'good' : (state.emailVerifyStatus==='error' ? 'bad' : '')}' id='email-verify-msg'>${esc(state.emailVerifyMsg || '')}</p>
      </article>
      <article class='method'>
        <h3>SMS</h3>
        <label>Mobile<input data-b='contact.phone' value='${esc(state.prefs.contact.phone)}' placeholder='04xx xxx xxx'></label>
        <p class='footer-note'>Premium channel. We keep messages short.</p>
      </article>
      <article class='method'>
        <h3>Telegram</h3>
        <label>Username<input data-b='contact.telegramUser' value='${esc(state.prefs.contact.telegramUser)}' placeholder='@yourhandle'></label>
      </article>
      <article class='method coming'><h3>WhatsApp <span class='badge'>Coming soon</span></h3></article>
    </div>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>C</span><h2>Rules & Timing</h2></div>
    <div class='grid three'>
      <label>Timezone<input disabled value='Melbourne (AEDT/AEST)'></label>
      <label>Quiet start<input type='time' data-b='rules.quietStart' value='${state.prefs.rules.quietStart}'></label>
      <label>Quiet end<input type='time' data-b='rules.quietEnd' value='${state.prefs.rules.quietEnd}'></label>
      <label>Max alerts per day<input type='number' min='0' max='10' data-b='rules.maxDay' value='${state.prefs.rules.maxDay}'></label>
      <label>Tone<select data-b='rules.tone'><option ${state.prefs.rules.tone==='Larrikin'?'selected':''}>Larrikin</option><option ${state.prefs.rules.tone==='Balanced'?'selected':''}>Balanced</option><option ${state.prefs.rules.tone==='Professional'?'selected':''}>Professional</option></select></label>
      <label><input type='checkbox' data-b='rules.allowHighQuiet' ${state.prefs.rules.allowHighQuiet?'checked':''}> Allow High priority during quiet hours</label>
    </div>
    <details style='margin-top:.6rem'>
      <summary>Advanced options (optional)</summary>
      <div class='grid two' style='margin-top:.6rem'>
        <label>Weekly alert cap<input type='number' min='1' max='60' data-b='advanced.weeklyCap' value='${Number(state.prefs.advanced?.weeklyCap || 16)}'></label>
        <label>Email mode<select data-b='methods.email.mode'><option ${state.prefs.methods.email.mode==='Digest'?'selected':''}>Digest</option><option ${state.prefs.methods.email.mode==='Instant'?'selected':''}>Instant</option><option ${state.prefs.methods.email.mode==='Priority only'?'selected':''}>Priority only</option></select></label>
      </div>
      <div class='grid two' style='margin-top:.6rem'>
        <label><input type='checkbox' data-b='advanced.raceTypes.thoroughbreds' ${state.prefs.advanced?.raceTypes?.thoroughbreds?'checked':''}> Thoroughbreds alerts</label>
        <label><input type='checkbox' data-b='advanced.raceTypes.greyhounds' ${state.prefs.advanced?.raceTypes?.greyhounds?'checked':''}> Greyhounds alerts</label>
        <label><input type='checkbox' data-b='advanced.raceTypes.harness' ${state.prefs.advanced?.raceTypes?.harness?'checked':''}> Harness alerts</label>
      </div>
      <div class='grid two' style='margin-top:.4rem'>
        <label><input type='checkbox' data-b='advanced.segments.jackpots' ${state.prefs.advanced?.segments?.jackpots?'checked':''}> Jackpot updates</label>
        <label><input type='checkbox' data-b='advanced.segments.promos' ${state.prefs.advanced?.segments?.promos?'checked':''}> Promo drops</label>
        <label><input type='checkbox' data-b='advanced.segments.coaching' ${state.prefs.advanced?.segments?.coaching?'checked':''}> Tips/coaching content</label>
      </div>
    </details>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>D</span><h2>Save</h2></div>
    <label><input type='checkbox' data-b='consent' ${state.prefs.consent?'checked':''}> I agree to receive messages from Big Bluff Bay.</label>
    <p class='footer-note'>You’re in control — mute us anytime. Setup progress: ${completion}/3</p>
    <button class='btn' id='save-btn' ${!state.user || state.busy ? 'disabled' : ''}>${state.busy?'Saving…':(state.user?'Save Preferences':'Log in to Save')}</button>
  </section>`;

  const active = Object.values(state.prefs.alerts).filter(Boolean).length;
  preview.innerHTML = `<h2>Live Preview</h2>
  <p class='muted'>No spam. Just the good stuff.</p>
  <div class='preview-msg'><strong>Schedule</strong><p>Tonight’s drop is ready. Melbourne time, always.</p></div>
  <div class='preview-msg'><strong>Starting soon</strong><p>Your selected events start in 15 mins.</p></div>
  <div class='preview-msg'><strong>Status</strong><p>${active} alert types enabled • ${enabledMethodCount} contact method${enabledMethodCount===1?'':'s'} set • tone: ${state.prefs.rules.tone}</p></div>`;

  bind();
}

function bind(){
  document.getElementById('logout-btn')?.addEventListener('click',()=>{ localStorage.removeItem(tokenKey); location.reload(); });
  app.querySelectorAll('[data-b]').forEach(el=>{ const p=el.dataset.b; const cb=()=>set(p, el.type==='checkbox'?el.checked:(el.type==='number'?Number(el.value):el.value)); el.addEventListener('change',cb); if(el.tagName==='INPUT'&&el.type!=='checkbox') el.addEventListener('input',cb); });
  app.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
  app.querySelector('[data-action="verify-email"]')?.addEventListener('click', async ()=>{
    if(!state.user){ alert('Log in first.'); return; }
    const email = normalizeEmail(state.prefs.contact.email);
    if (!validEmail(email)) {
      state.emailVerifyStatus = 'error';
      state.emailVerifyMsg = 'Enter a valid email before sending verification.';
      render();
      return;
    }
    state.prefs.contact.email = email;
    state.emailVerifyStatus = 'sending';
    state.emailVerifyMsg = `Sending verification to ${email}…`;
    render();
    try{
      const out = await req(API.sendEmailVerify,{ method:'POST', body: JSON.stringify({ email }) });
      state.emailVerifyStatus = 'success';
      state.emailVerifyMsg = `Verification email sent to ${out.sentTo}. Check your inbox and click the green confirm button.`;
    } catch(e){
      const detail = String(e.message || 'Verification failed');
      state.emailVerifyStatus = 'error';
      state.emailVerifyMsg = `Email verify failed: ${detail}`;
    }
    render();
  });
  app.querySelector('[data-action="verify-email-self"]')?.addEventListener('click', async ()=>{
    if(!state.user){ alert('Log in first.'); return; }
    state.emailVerifyStatus = 'sending';
    state.emailVerifyMsg = 'Checking account email…';
    render();
    try {
      const prof = await req(API.profile);
      const accountEmail = normalizeEmail(prof?.profile?.email || '');
      if (!validEmail(accountEmail)) {
        state.emailVerifyStatus = 'error';
        state.emailVerifyMsg = 'Your account profile email is missing/invalid. Set it in Profile first.';
        render();
        return;
      }
      state.prefs.contact.email = accountEmail;
      state.emailVerifyMsg = `Sending verification to ${accountEmail}…`;
      render();
      const out = await req(API.sendEmailVerify,{ method:'POST', body: JSON.stringify({ email: accountEmail }) });
      state.emailVerifyStatus = 'success';
      state.emailVerifyMsg = `Test verification sent to account email: ${out.sentTo}`;
    } catch(e) {
      state.emailVerifyStatus = 'error';
      state.emailVerifyMsg = `Send test failed: ${String(e.message||'Unknown error')}`;
    }
    render();
  });

  document.getElementById('save-btn')?.addEventListener('click', save);
}

async function save(){
  if(!state.user) return alert('Log in first.');
  if(!state.prefs.consent) return alert('Tick consent first.');
  try{
    state.busy=true; render();
    const existing = (await req(API.profile)).profile || {};
    const settings = { ...(existing.settings||{}), alertsPreferences: state.prefs };
    await req(API.profile,{ method:'PUT', body: JSON.stringify({ settings }) });
    alert('Saved. Clean and simple.');
  }catch(e){ alert(e.message); }
  finally{ state.busy=false; render(); }
}

(async function init(){
  render();
  try{
    const verifyToken = new URLSearchParams(window.location.search).get('verify');
    if (verifyToken) {
      const out = await req(API.confirmEmailVerify, { method:'POST', body: JSON.stringify({ token: verifyToken }) });
      if (out?.token) {
        state.token = out.token;
        localStorage.setItem(tokenKey, out.token);
      }
      if (out?.user) state.user = out.user;
      state.prefs.contact.email = out.email;
      state.prefs.methods.email.verified = true;
      state.emailVerifyStatus = 'success';
      state.emailVerifyMsg = `Nice. ${out.email} is now verified and you’re now signed in.`;
      const u = new URL(window.location.href); u.searchParams.delete('verify'); window.history.replaceState({}, '', u.toString());
      render();
    }

    if(state.token){
      try {
        if (!state.user) state.user = (await req(API.me)).user;
      } catch {}
      try {
        const profile = await req(API.profile);
        state.prefs = mergeDefaults(profile?.profile?.settings?.alertsPreferences || DEFAULTS);
        if (state.emailVerifyStatus === 'success') {
          state.prefs.methods.email.verified = true;
        }
      } catch {}
    }
  } catch {}
  finally { render(); }
})();