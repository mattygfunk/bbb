/* BBB Alerts Preferences (Preview only)
 * TODO(back-end): wire save payload to user profile API
 * TODO(back-end): method verification flows
 * TODO(back-end): real sending + cooldown engines
 */
const STORAGE_KEY = 'bbb_alerts_preview_v1';

const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
const defaults = {
  alerts: {
    scheduleDrop: true, startingSoon: true, lateReg: true, overlayWatch: false,
    seatFill: false, satellites: true, goldenTicket: true,
    winnerPosts: true, finalTable: false, jackpotWinners: true,
    depositOffers: false, finalChance: false, breakingNews: true
  },
  methods: { email:true, sms:false, telegram:false },
  timezone: 'Australia/Melbourne', quietStart:'23:00', quietEnd:'08:00', weekendMode:true,
  allowHighQuiet:true, maxDay:4, maxHour:1, cooldown:'30', tone:'Balanced', emoji:'Light', length:'Standard',
  links:'Only schedule', bankroll:true, minGtd:500, maxBuyin:100, from:'10:00', to:'23:00',
  segments:['Tournaments','Sunday Major'], consent:false,
  contact:{ email:'', phone:'', telegramUser:'' }
};
Object.assign(state, structuredClone(defaults), state);

const app = document.getElementById('alerts-app');
const preview = document.getElementById('preview-panel');

function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function onChange(path, value){
  const parts = path.split('.'); let o = state;
  for (let i=0;i<parts.length-1;i++) o = o[parts[i]];
  o[parts.at(-1)] = value; saveLocal(); render();
}

function toggleRow(label, key){
  return `<div class='toggle'><span>${label}</span><input aria-label='${label}' type='checkbox' ${state.alerts[key]?'checked':''} data-bind='alerts.${key}' /></div>`;
}

function render(){
  app.innerHTML = `
  <section class='card'>
    <div class='step'><span class='n'>A</span><h2>Choose Alerts</h2></div>
    <div class='grid two'>
      <details open><summary>Tournaments</summary>
        <div class='row'>
          ${toggleRow("Tonight’s Schedule Drop",'scheduleDrop')}
          ${toggleRow('Starting Soon','startingSoon')}
          ${toggleRow('Late Reg Closing','lateReg')}
          ${toggleRow('Overlay Watch','overlayWatch')}
          ${toggleRow('Seat Fill / Tables Running','seatFill')}
          ${toggleRow('Satellites','satellites')}
          ${toggleRow('Special Events / Golden Ticket','goldenTicket')}
        </div>
      </details>
      <details><summary>Results / Admin Signals</summary>
        <div class='row'>
          ${toggleRow('Winner Posts','winnerPosts')}
          ${toggleRow('Big Final Table Alert','finalTable')}
          ${toggleRow('Jackpot / Promo Winners','jackpotWinners')}
          ${toggleRow('Deposit Bonus / Reload Offers','depositOffers')}
          ${toggleRow('Limited Seats / Final Chance','finalChance')}
          ${toggleRow('Breaking News','breakingNews')}
        </div>
      </details>
    </div>
  </section>

  <section class='card methods'>
    <div class='step'><span class='n'>B</span><h2>Choose Contact Methods</h2></div>
    <div class='grid two'>
      <article class='method'>
        <h3>Email</h3><label>Email<input value='${state.contact.email}' data-bind='contact.email' placeholder='you@domain.com'></label>
        <div class='row two'><button class='btn ghost' data-toast='Verification link sent (stub).'>Send verification link</button><span class='muted'>Status: Not verified</span></div>
      </article>
      <article class='method'>
        <h3>SMS</h3><label>Mobile (AU)<input value='${state.contact.phone}' data-bind='contact.phone' placeholder='04xx xxx xxx'></label>
        <div class='row two'><button class='btn ghost' data-toast='Code sent (stub).'>Send code</button><input placeholder='Enter 6-digit code'></div>
        <p class='footer-note'>SMS is premium — we keep it tight.</p>
      </article>
      <article class='method'>
        <h3>Telegram</h3><label>Username (optional)<input value='${state.contact.telegramUser}' data-bind='contact.telegramUser' placeholder='@yourhandle'></label>
        <div class='row two'><button class='btn ghost' data-toast='Channel link opened (stub).'>Join Channel</button><button class='btn ghost' data-toast='Bot link flow (stub).'>Link Bot</button></div>
        <p class='footer-note'>Telegram is best for fast drops (coming soon).</p>
      </article>
      <article class='method coming'><h3>WhatsApp <span class='badge'>Coming soon</span></h3></article>
      <article class='method coming'><h3>Messenger DM <span class='badge'>Coming soon</span></h3></article>
    </div>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>C</span><h2>Set Rules & Timing</h2></div>
    <div class='grid three'>
      <label>Timezone<input value='${state.timezone}' disabled></label>
      <label>Quiet start<input type='time' value='${state.quietStart}' data-bind='quietStart'></label>
      <label>Quiet end<input type='time' value='${state.quietEnd}' data-bind='quietEnd'></label>
      <label>Max alerts/day<input type='number' min='0' max='10' value='${state.maxDay}' data-bind='maxDay'></label>
      <label>Max alerts/hour<input type='number' min='0' max='3' value='${state.maxHour}' data-bind='maxHour'></label>
      <label>Cooldown<select data-bind='cooldown'><option>15</option><option>30</option><option>60</option><option>90</option></select></label>
      <label>Tone<select data-bind='tone'><option>Larrikin</option><option>Balanced</option><option>Professional</option></select></label>
      <label>Emoji<select data-bind='emoji'><option>None</option><option>Light</option><option>Full</option></select></label>
      <label>Message length<select data-bind='length'><option>Short</option><option>Standard</option><option>Detailed</option></select></label>
    </div>
    <div class='row two' style='margin-top:.6rem'>
      <label>Only notify GTD >= <input type='number' value='${state.minGtd}' data-bind='minGtd'></label>
      <label>Only notify buy-in <= <input type='number' value='${state.maxBuyin}' data-bind='maxBuyin'></label>
    </div>
    <p class='muted'>Segments: ${['Tournaments','Cash','Freerolls','Sunday Major','Golden Ticket events'].map(s=>`<label><input type='checkbox' data-seg='${s}' ${state.segments.includes(s)?'checked':''}/> ${s}</label>`).join(' • ')}</p>
  </section>

  <section class='card'>
    <div class='step'><span class='n'>D</span><h2>Preview & Save</h2></div>
    <label><input type='checkbox' ${state.consent?'checked':''} data-bind='consent'> I agree to receive messages from Big Bluff Bay.</label>
    <p class='footer-note'>Reply STOP for SMS. Unsubscribe link for email. Leave Telegram anytime.</p>
    <button class='btn' id='save-btn'>Save Preferences (Preview Mode)</button>
  </section>`;

  preview.innerHTML = `<h2>Live Preview</h2>
    <p class='muted'>No spam. Just the good stuff.</p>
    <div class='preview-msg'><strong>Schedule digest</strong><p>Tonight: $500 GTD at 8:00 PM + $700 GTD at 10:00 PM. Overlay brewing 👀</p></div>
    <div class='preview-msg'><strong>Overlay watch</strong><p>$${state.minGtd}+ target flagged. Seats soft at T-20. Might be juicy.</p></div>
    <div class='preview-msg'><strong>Late reg closing</strong><p>Heads up — late reg shuts in 10 mins. If you're in, lock it now.</p></div>
    <p class='footer-note'>SMS est: ${Math.min(160, 60 + Number(state.length==='Detailed'?90:state.length==='Standard'?50:20))} chars</p>`;

  app.querySelectorAll('[data-bind]').forEach(el=>{
    const path=el.getAttribute('data-bind');
    if (el.tagName==='SELECT') el.value = state[path.split('.').at(-1)] || el.value;
    el.addEventListener('change',()=> onChange(path, el.type==='checkbox'?el.checked:el.value));
    el.addEventListener('input',()=> { if(el.type!=='checkbox') onChange(path, el.value); });
  });
  app.querySelectorAll('[data-seg]').forEach(el=>el.addEventListener('change',()=>{
    const s = el.getAttribute('data-seg');
    state.segments = el.checked ? [...new Set([...state.segments,s])] : state.segments.filter(x=>x!==s);
    saveLocal(); render();
  }));
  app.querySelectorAll('[data-toast]').forEach(b=>b.addEventListener('click',()=>alert(b.getAttribute('data-toast'))));
  document.getElementById('save-btn')?.addEventListener('click',()=>{
    if(!state.consent){ alert('Tick consent to continue (preview only).'); return; }
    saveLocal(); alert('Saved locally for preview only. Not wired to sending yet.');
  });
}

render();