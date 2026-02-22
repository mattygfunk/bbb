const tokenKey = 'bbb_token';
const API = { me:'/api/me', profile:'/api/profile', sendEmailVerify:'/api/alerts/email/verify/send', confirmEmailVerify:'/api/alerts/email/verify/confirm' };

const DEFAULTS = {
  alerts: { scheduleDrop:true, startingSoon:true, lateReg:true, overlayWatch:false, winnerPosts:true, breakingNews:true },
  methods: { email:{enabled:true, verified:false, mode:'Digest'}, sms:{enabled:false}, telegram:{enabled:false, linked:false} },
  rules: { timezone:'Australia/Melbourne', quietStart:'23:00', quietEnd:'08:00', allowHighQuiet:true, maxDay:4, tone:'Balanced' },
  contact: { email:'', phone:'', telegramUser:'' },
  consent:false
};

const state = { token: localStorage.getItem(tokenKey)||'', user:null, prefs: structuredClone(DEFAULTS), busy:false };
const app = document.getElementById('alerts-app');
const preview = document.getElementById('preview-panel');

function esc(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
async function req(url, opt={}){ const h={'Content-Type':'application/json',...(opt.headers||{})}; if(state.token) h.Authorization=`Bearer ${state.token}`; const r=await fetch(url,{...opt,headers:h}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; }
function mergeDefaults(x){ return { ...structuredClone(DEFAULTS), ...(x||{}), alerts:{...DEFAULTS.alerts,...(x?.alerts||{})}, methods:{ email:{...DEFAULTS.methods.email,...(x?.methods?.email||{})}, sms:{...DEFAULTS.methods.sms,...(x?.methods?.sms||{})}, telegram:{...DEFAULTS.methods.telegram,...(x?.methods?.telegram||{}) } }, rules:{...DEFAULTS.rules,...(x?.rules||{})}, contact:{...DEFAULTS.contact,...(x?.contact||{})} }; }

function set(path, v){ const p=path.split('.'); let o=state.prefs; for(let i=0;i<p.length-1;i++) o=o[p[i]]; o[p.at(-1)] = v; render(); }

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

  app.innerHTML = `
  <section class='card'>
    <div class='step'><span class='n'>A</span><h2>Choose Alerts</h2></div>
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
          <button class='btn ghost' data-action='verify-email'>Verify email</button>
          <span class='muted'>${state.prefs.methods.email.verified?'Verified ✅':'Not verified'}</span>
        </div>
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
    <details style='margin-top:.6rem'><summary>Advanced options (optional)</summary><p class='muted'>We’ll unlock deeper controls (caps, filters, segments) once alert engine is fully live.</p></details>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>D</span><h2>Save</h2></div>
    <label><input type='checkbox' data-b='consent' ${state.prefs.consent?'checked':''}> I agree to receive messages from Big Bluff Bay.</label>
    <p class='footer-note'>You’re in control — mute us anytime.</p>
    <button class='btn' id='save-btn'>${state.busy?'Saving…':'Save Preferences'}</button>
  </section>`;

  const active = Object.values(state.prefs.alerts).filter(Boolean).length;
  preview.innerHTML = `<h2>Live Preview</h2>
  <p class='muted'>No spam. Just the good stuff.</p>
  <div class='preview-msg'><strong>Schedule</strong><p>Tonight’s drop is ready. Melbourne time, always.</p></div>
  <div class='preview-msg'><strong>Starting soon</strong><p>Your selected events start in 15 mins.</p></div>
  <div class='preview-msg'><strong>Status</strong><p>${active} alert types enabled • tone: ${state.prefs.rules.tone}</p></div>`;

  bind();
}

function bind(){
  document.getElementById('logout-btn')?.addEventListener('click',()=>{ localStorage.removeItem(tokenKey); location.reload(); });
  app.querySelectorAll('[data-b]').forEach(el=>{ const p=el.dataset.b; const cb=()=>set(p, el.type==='checkbox'?el.checked:(el.type==='number'?Number(el.value):el.value)); el.addEventListener('change',cb); if(el.tagName==='INPUT'&&el.type!=='checkbox') el.addEventListener('input',cb); });
  app.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
  app.querySelector('[data-action="verify-email"]')?.addEventListener('click', async ()=>{
    if(!state.user){ alert('Log in first.'); return; }
    try{ const out = await req(API.sendEmailVerify,{ method:'POST', body: JSON.stringify({ email: state.prefs.contact.email }) }); alert(`Verification email sent to ${out.sentTo}`); } catch(e){ alert(e.message); }
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
  if(!state.token) return;
  try{
    state.user = (await req(API.me)).user;
    const profile = await req(API.profile);
    state.prefs = mergeDefaults(profile?.profile?.settings?.alertsPreferences || DEFAULTS);
    const verifyToken = new URLSearchParams(window.location.search).get('verify');
    if (verifyToken) {
      const out = await req(API.confirmEmailVerify, { method:'POST', body: JSON.stringify({ token: verifyToken }) });
      state.prefs.contact.email = out.email; state.prefs.methods.email.verified = true;
      const u = new URL(window.location.href); u.searchParams.delete('verify'); window.history.replaceState({}, '', u.toString());
      alert(`Email verified: ${out.email}`);
    }
    render();
  } catch {}
})();