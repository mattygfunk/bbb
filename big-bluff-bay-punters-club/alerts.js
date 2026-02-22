const tokenKey = 'bbb_token';
const API = { me:'/api/me', profile:'/api/profile', sendEmailVerify:'/api/alerts/email/verify/send', confirmEmailVerify:'/api/alerts/email/verify/confirm' };
const DEFAULTS = {
  alerts:{ scheduleDrop:true, startingSoon:true, lateReg:true, overlayWatch:false, seatFill:false, satellites:true, goldenTicket:true, winnerPosts:true, finalTable:false, jackpotWinners:true, depositOffers:false, finalChance:false, breakingNews:true },
  methods:{ email:{enabled:true, verified:false, format:'HTML', mode:'Digest'}, sms:{enabled:false, verified:false, highOnlyQuiet:true}, telegram:{enabled:false, linked:false, mode:'channel', emojis:true} },
  rules:{ timezone:'Australia/Melbourne', quietStart:'23:00', quietEnd:'08:00', weekendMode:true, allowHighQuiet:true, maxDay:4, maxHour:1, cooldown:30, tone:'Balanced', emoji:'Light', length:'Standard', links:'schedule', bankroll:true, minGtd:500, maxBuyin:100, from:'10:00', to:'23:00' },
  segments:['Tournaments','Sunday Major'],
  contact:{ email:'', phone:'', telegramUser:'' },
  consent:false
};
const ALERT_GROUPS = {
  tournaments:[['Tonight’s Schedule Drop','scheduleDrop'],['Starting Soon','startingSoon'],['Late Reg Closing','lateReg'],['Overlay Watch','overlayWatch'],['Seat Fill / Tables Running','seatFill'],['Satellites','satellites'],['Special Events / Golden Ticket','goldenTicket']],
  results:[['Winner Posts','winnerPosts'],['Big Final Table Alert','finalTable'],['Jackpot / Promo Winners','jackpotWinners']],
  admin:[['Deposit Bonus / Reload Offers','depositOffers'],['Limited Seats / Final Chance','finalChance'],['Breaking News','breakingNews']]
};
const state = { token: localStorage.getItem(tokenKey)||'', user:null, prefs: structuredClone(DEFAULTS), busy:false };
const app = document.getElementById('alerts-app');
const preview = document.getElementById('preview-panel');

function esc(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
async function req(url, opt={}){ const h={'Content-Type':'application/json',...(opt.headers||{})}; if(state.token) h.Authorization=`Bearer ${state.token}`; const r=await fetch(url,{...opt,headers:h}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; }
function mergeDefaults(incoming){ return { ...structuredClone(DEFAULTS), ...(incoming||{}), alerts:{...DEFAULTS.alerts,...(incoming?.alerts||{})}, methods:{ email:{...DEFAULTS.methods.email,...(incoming?.methods?.email||{})}, sms:{...DEFAULTS.methods.sms,...(incoming?.methods?.sms||{})}, telegram:{...DEFAULTS.methods.telegram,...(incoming?.methods?.telegram||{}) }, }, rules:{...DEFAULTS.rules,...(incoming?.rules||{})}, contact:{...DEFAULTS.contact,...(incoming?.contact||{})}, segments:Array.isArray(incoming?.segments)?incoming.segments:DEFAULTS.segments.slice()}; }
function setByPath(path, v){ const p=path.split('.'); let o=state.prefs; for(let i=0;i<p.length-1;i++) o=o[p[i]]; o[p[p.length-1]]=v; render(); }

function methodCardEmail(){const m=state.prefs.methods.email;return `<article class='method'><h3>Email</h3><label>Email<input data-b='contact.email' value='${esc(state.prefs.contact.email)}' placeholder='you@domain.com'></label><div class='row two'><button class='btn ghost' data-action='verify-email'>Send verification link</button><span class='muted'>${m.verified?'Verified ✅':'Not verified'}</span></div><div class='row two'><label>Format<select data-b='methods.email.format'><option ${m.format==='HTML'?'selected':''}>HTML</option><option ${m.format==='Plain'?'selected':''}>Plain</option></select></label><label>Mode<select data-b='methods.email.mode'><option ${m.mode==='Digest'?'selected':''}>Digest</option><option ${m.mode==='Instant'?'selected':''}>Instant</option></select></label></div></article>`;}
function methodCardSms(){const m=state.prefs.methods.sms;return `<article class='method'><h3>SMS</h3><label>Mobile (AU)<input data-b='contact.phone' value='${esc(state.prefs.contact.phone)}' placeholder='04xx xxx xxx'></label><div class='row two'><button class='btn ghost' data-action='send-sms-code'>Send code</button><input placeholder='Enter 6-digit code'></div><label><input type='checkbox' data-b='methods.sms.highOnlyQuiet' ${m.highOnlyQuiet?'checked':''}> Quiet hours override for High only</label><p class='footer-note'>SMS is premium — we keep it tight.</p></article>`;}
function methodCardTelegram(){const m=state.prefs.methods.telegram;return `<article class='method'><h3>Telegram</h3><label>Username<input data-b='contact.telegramUser' value='${esc(state.prefs.contact.telegramUser)}' placeholder='@yourhandle'></label><div class='row two'><button class='btn ghost' data-action='tg-channel'>Join Channel</button><button class='btn ghost' data-action='tg-bot'>Link Bot</button></div><span class='muted'>${m.linked?'Linked ✅':'Not linked'}</span></article>`;}
function alertRows(list){return list.map(([label,key])=>`<div class='toggle'><span>${label}</span><input type='checkbox' data-b='alerts.${key}' ${state.prefs.alerts[key]?'checked':''}></div>`).join('');}

function render(){
  document.getElementById('alerts-auth').innerHTML = state.user ? `<span class='chip'>${esc(state.user.username)}</span><button class='btn ghost' id='logout-btn'>Log out</button>` : `<a class='btn ghost' href='/punters.html#punters-login-gate'>Log in</a>`;
  app.innerHTML = `<section class='card'><div class='step'><span class='n'>A</span><h2>Choose Alerts</h2></div><div class='grid two'><details open><summary>Tournaments</summary>${alertRows(ALERT_GROUPS.tournaments)}</details><details><summary>Results / Social</summary>${alertRows(ALERT_GROUPS.results)}</details></div><details><summary>Bankroll / Admin Signals</summary>${alertRows(ALERT_GROUPS.admin)}</details></section>
  <section class='card methods'><div class='step'><span class='n'>B</span><h2>Choose Contact Methods</h2></div><div class='grid two'>${methodCardEmail()}${methodCardSms()}${methodCardTelegram()}<article class='method coming'><h3>WhatsApp <span class='badge'>Coming soon</span></h3></article><article class='method coming'><h3>Messenger DM <span class='badge'>Coming soon</span></h3></article></div></section>
  <section class='card'><div class='step'><span class='n'>C</span><h2>Rules & Timing</h2></div><div class='grid three'>
  <label>Timezone<input disabled value='Melbourne (AEDT/AEST)'></label><label>Quiet start<input type='time' data-b='rules.quietStart' value='${state.prefs.rules.quietStart}'></label><label>Quiet end<input type='time' data-b='rules.quietEnd' value='${state.prefs.rules.quietEnd}'></label>
  <label>Max/day<input type='number' min='0' max='10' data-b='rules.maxDay' value='${state.prefs.rules.maxDay}'></label><label>Max/hour<input type='number' min='0' max='3' data-b='rules.maxHour' value='${state.prefs.rules.maxHour}'></label><label>Cooldown<select data-b='rules.cooldown'><option ${state.prefs.rules.cooldown==15?'selected':''}>15</option><option ${state.prefs.rules.cooldown==30?'selected':''}>30</option><option ${state.prefs.rules.cooldown==60?'selected':''}>60</option><option ${state.prefs.rules.cooldown==90?'selected':''}>90</option></select></label>
  <label>Tone<select data-b='rules.tone'><option ${state.prefs.rules.tone==='Larrikin'?'selected':''}>Larrikin</option><option ${state.prefs.rules.tone==='Balanced'?'selected':''}>Balanced</option><option ${state.prefs.rules.tone==='Professional'?'selected':''}>Professional</option></select></label><label>Emoji<select data-b='rules.emoji'><option ${state.prefs.rules.emoji==='None'?'selected':''}>None</option><option ${state.prefs.rules.emoji==='Light'?'selected':''}>Light</option><option ${state.prefs.rules.emoji==='Full'?'selected':''}>Full</option></select></label><label>Length<select data-b='rules.length'><option ${state.prefs.rules.length==='Short'?'selected':''}>Short</option><option ${state.prefs.rules.length==='Standard'?'selected':''}>Standard</option><option ${state.prefs.rules.length==='Detailed'?'selected':''}>Detailed</option></select></label>
  </div><div class='row two'><label>Only GTD >=<input type='number' data-b='rules.minGtd' value='${state.prefs.rules.minGtd}'></label><label>Only buy-in <=<input type='number' data-b='rules.maxBuyin' value='${state.prefs.rules.maxBuyin}'></label></div>
  <p class='muted'>So we don’t spam you with stuff you don’t play: ${['Tournaments','Cash','Freerolls','Sunday Major','Golden Ticket events'].map(s=>`<label><input data-seg='${s}' type='checkbox' ${state.prefs.segments.includes(s)?'checked':''}> ${s}</label>`).join(' • ')}</p></section>
  <section class='card'><div class='step'><span class='n'>D</span><h2>Preview & Save</h2></div><label><input type='checkbox' data-b='consent' ${state.prefs.consent?'checked':''}> I agree to receive messages from Big Bluff Bay.</label><p class='footer-note'>Reply STOP for SMS. Unsubscribe link for email. Leave Telegram anytime.</p><button class='btn' id='save-btn'>${state.busy?'Saving…':'Save Preferences'}</button></section>`;

  const smsLen = state.prefs.rules.length==='Detailed'?148:state.prefs.rules.length==='Standard'?110:72;
  preview.innerHTML = `<h2>Live Preview</h2><p class='muted'>You’re in control — mute us anytime.</p>
  <div class='preview-msg'><strong>Schedule digest</strong><p>Tonight’s drop: 8PM $500 GTD + 10PM $700 GTD. Melbourne time, always.</p></div>
  <div class='preview-msg'><strong>Overlay watch</strong><p>Overlay brewing 👀  T-20 checkpoint triggered for GTD ${state.prefs.rules.minGtd}+.</p></div>
  <div class='preview-msg'><strong>Late reg closing</strong><p>Late reg closes in 10 minutes. Final chance to jump in.</p></div>
  <p class='footer-note'>SMS est: ${smsLen}/160 chars</p>`;

  bindEvents();
}

function bindEvents(){
  document.getElementById('logout-btn')?.addEventListener('click',()=>{ localStorage.removeItem(tokenKey); location.reload(); });
  app.querySelectorAll('[data-b]').forEach(el=>{ const p=el.dataset.b; const cb=()=>setByPath(p, el.type==='checkbox'?el.checked:(el.type==='number'?Number(el.value):el.value)); el.addEventListener('change',cb); if(el.tagName==='INPUT'&&el.type!=='checkbox') el.addEventListener('input',cb); });
  app.querySelectorAll('[data-seg]').forEach(el=>el.addEventListener('change',()=>{ const s=el.dataset.seg; state.prefs.segments = el.checked ? [...new Set([...state.prefs.segments,s])] : state.prefs.segments.filter(x=>x!==s); render(); }));
  app.querySelector('[data-action="verify-email"]')?.addEventListener('click', async ()=>{
    if(!state.user){ alert('Log in first.'); return; }
    try{
      const email = String(state.prefs.contact.email || '').trim();
      const out = await req(API.sendEmailVerify,{ method:'POST', body: JSON.stringify({ email }) });
      alert(`Verification email sent to ${out.sentTo}`);
    }catch(e){ alert(e.message); }
  });
  app.querySelector('[data-action="send-sms-code"]')?.addEventListener('click',()=>alert('SMS code sent (stub)'));
  app.querySelector('[data-action="tg-channel"]')?.addEventListener('click',()=>alert('Channel link placeholder'));
  app.querySelector('[data-action="tg-bot"]')?.addEventListener('click',()=>{ state.prefs.methods.telegram.linked=true; alert('Telegram bot linked (stub)'); render(); });
  document.getElementById('save-btn')?.addEventListener('click', savePrefs);
}

async function savePrefs(){
  if(!state.user){ alert('Log in first.'); return; }
  if(!state.prefs.consent){ alert('Tick consent first.'); return; }
  try{
    state.busy=true; render();
    const existing = (await req(API.profile)).profile || {};
    const settings = { ...(existing.settings||{}), alertsPreferences: state.prefs };
    await req(API.profile,{ method:'PUT', body: JSON.stringify({ settings }) });
    alert('Saved. Alerts preferences are now wired to your profile settings.');
  }catch(e){ alert(e.message); }
  finally{ state.busy=false; render(); }
}

(async function init(){
  render();
  if(!state.token) return;
  try{
    const me = await req(API.me); state.user = me.user;
    const profile = await req(API.profile);
    state.prefs = mergeDefaults(profile?.profile?.settings?.alertsPreferences || DEFAULTS);

    const token = new URLSearchParams(window.location.search).get('verify');
    if (token) {
      try {
        const out = await req(API.confirmEmailVerify, { method:'POST', body: JSON.stringify({ token }) });
        state.prefs.contact.email = String(out.email || state.prefs.contact.email || '');
        state.prefs.methods.email.verified = true;
        alert(`Email verified: ${out.email}`);
        const u = new URL(window.location.href); u.searchParams.delete('verify'); window.history.replaceState({}, '', u.toString());
      } catch (err) {
        alert(err.message || 'Email verification failed');
      }
    }

    render();
  }catch{}
})();