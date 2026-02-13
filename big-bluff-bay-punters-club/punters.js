const API_ROOTS=['/api'];
const API={fixtures:'/fixtures',tips:'/tips',ladder:'/ladder',bossesBet:'/bosses-bet',register:'/register',login:'/login',logout:'/logout',me:'/me'};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null,existingByRace:new Map(),raceCount:12,lastTipInteractionAt:0};
const $=id=>document.getElementById(id);

async function req(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;let lastErr='';for(const root of API_ROOTS){const r=await fetch(`${root}${path}`,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(r.ok)return d;lastErr=d.error||`Request failed (${r.status})`;}throw new Error(lastErr||'Request failed');}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function renderLeaderboard(rows){
  const body = $('leaderboard-body');
  if(!body) return;
  body.innerHTML='';
  (rows||[]).forEach((r)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.rank}</td><td>${esc(r.member)}</td><td>${r.points}</td><td>${r.correct}</td>`;
    body.appendChild(tr);
  });
  if(!(rows||[]).length){
    const tr=document.createElement('tr');
    tr.innerHTML="<td colspan='4' class='muted'>No scored results yet.</td>";
    body.appendChild(tr);
  }
}

function renderBossesBet(bb){
  const wrap = $('bosses-progress');
  const overall = $('bosses-overall');
  if(!wrap || !overall) return;
  const data = bb || { progress:[], overall:'live' };
  overall.textContent = String(data.overall || 'live').toUpperCase();
  wrap.innerHTML = '';
  (data.progress || []).forEach((leg)=>{
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<strong>${esc(leg.race)}</strong><span class='muted'>${esc(leg.selection || '—')}</span><span class='pill'>${esc(leg.status || 'pending')}</span>`;
    wrap.appendChild(row);
  });
}

function renderRaceInputs(count){

  const wrap = $('quick-race-list');
  if(!wrap) return;
  wrap.innerHTML='';
  for(let i=1;i<=count;i+=1){
    const race=`R${i}`;
    const row=document.createElement('div');
    row.className='row';
    const opts=['<option value="">—</option>'];
    for(let n=1;n<=24;n+=1) opts.push(`<option>${n}</option>`);
    row.innerHTML=`<strong>${race}</strong><select name='${race}'>${opts.join('')}</select>`;
    wrap.appendChild(row);
  }
}

function markTipInteraction(){ state.lastTipInteractionAt = Date.now(); }
function tipInteractionActive(){ return (Date.now() - Number(state.lastTipInteractionAt || 0)) < 20000; }

async function refresh(){
  const isEditingTips = tipInteractionActive() || !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
  const [fx,tp,allTipsRes,ladderRes,bossesRes]=await Promise.all([req(API.fixtures),req(`${API.tips}?status=all`),req(`${API.tips}?status=all`),req(API.ladder),req(API.bossesBet)]);
  $('fixtures-list').innerHTML='';
  (fx.fixtures||[]).forEach(f=>{const e=document.createElement('article');e.className='fixture';e.innerHTML=`<strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p>`;$('fixtures-list').appendChild(e);});
  const newRaceCount = Number((fx.fixtures||[])[0]?.raceCount || 12);
  const raceCountChanged = newRaceCount !== state.raceCount;
  state.raceCount = newRaceCount;
  if (raceCountChanged || !document.querySelector('#quick-race-list select')) renderRaceInputs(state.raceCount);
  renderLeaderboard(ladderRes.ladder || []);
  renderBossesBet(bossesRes.bossesBet || {});
  $('tips-list').innerHTML='';
  const byPunter = new Map();
  (tp.tips||[]).filter(t=>t.status!=='removed').forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byPunter.has(member)) byPunter.set(member, new Map());
    byPunter.get(member).set(String(t.race || ''), String(t.selection || t.horse || ''));
  });
  const raceOrder = Array.from({length:state.raceCount}, (_,i)=>`R${i+1}`);
  Array.from(byPunter.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([member, picks]) => {
    const lines = raceOrder
      .filter((r) => picks.get(r))
      .map((r) => `<span>${esc(r)}: <strong>${esc(picks.get(r))}</strong></span>`)
      .join(' • ');
    const e=document.createElement('article');
    e.className='tip';
    e.innerHTML=`<strong>${esc(member)}</strong><p class='meta'>${lines || 'No tips yet'}</p>`;
    $('tips-list').appendChild(e);
  });
  $('tips-count').textContent=`${byPunter.size} punter${byPunter.size===1?'':'s'}`;

  // Prefill current user's existing tips into quick-entry dropdowns
  // Don't overwrite while someone is actively choosing on mobile.
  if (!isEditingTips) {
    for(let i=1;i<=state.raceCount;i+=1){
      const el=document.querySelector(`#quick-race-list select[name='R${i}']`);
      if(el) el.value='';
    }
  }
  state.existingByRace = new Map();
  if(state.user){
    const currentUser = String(state.user.username || '').toLowerCase();
    const mine=(allTipsRes.tips||[]).filter(t=>String(t.member||'').toLowerCase()===currentUser && t.status!=='removed');
    const latestByRace=new Map();
    for(const t of mine){
      if(!latestByRace.has(t.race)) latestByRace.set(t.race,t);
    }
    latestByRace.forEach((t,race)=>{
      state.existingByRace.set(race, String(t.selection||''));
      if (!isEditingTips) {
        const el=document.querySelector(`#quick-race-list select[name='${race}']`);
        if(el) el.value=String(t.selection||'');
      }
    });
  }

  $('auth-controls').innerHTML=state.user?`<span class='pill'>${esc(state.user.username)}</span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<a class='menu-link' href='/'>Log in</a>`;
  const adminNav = $('admin-nav-link');
  if (adminNav) adminNav.style.display = state.user?.role === 'admin' ? 'inline-block' : 'none';
  const b=$('logout-btn'); if(b)b.onclick=logout;
}

async function bootstrap(){if(!state.token)return;try{const me=await req(API.me);state.user=me.user;}catch{state.token=null;state.user=null;localStorage.removeItem(tokenKey);} }

const loginForm = $('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const username = String(f.get('member') || '').trim();
    const password = String(f.get('pin') || '').trim();
    const mode = e.submitter?.dataset.mode || 'login';
    try {
      if (mode === 'register') await req(API.register, { method: 'POST', body: JSON.stringify({ username, password }) });
      const r = await req(API.login, { method: 'POST', body: JSON.stringify({ username, password }) });
      state.token = r.token;
      state.user = r.user;
      localStorage.setItem(tokenKey, state.token);
      const loginMsg = $('login-msg');
      if (loginMsg) loginMsg.textContent = 'Logged in.';
      await refresh();
    } catch (err) {
      const loginMsg = $('login-msg');
      if (loginMsg) loginMsg.textContent = err.message;
    }
  });
}

$('tip-form').addEventListener('submit',async(e)=>{e.preventDefault();markTipInteraction();if(!state.user){$('tip-msg').textContent='Log in first.';return;}const f=new FormData(e.target);const picks=[];for(let i=1;i<=state.raceCount;i+=1){const race=`R${i}`;const selection=String(f.get(race)||'').trim();if(!selection) continue;const existing=state.existingByRace.get(race)||'';if(selection!==existing) picks.push({race,selection});}if(!picks.length){$('tip-msg').textContent='No changes to save.';return;}try{let updated=0;for(const pick of picks){const r=await req(API.tips,{method:'POST',body:JSON.stringify(pick)});if(r.updated) updated+=1;}$('tip-msg').textContent=`Saved ${picks.length} change${picks.length===1?'':'s'}${updated?` (${updated} updated)`:''}.`;await refresh();}catch(err){$('tip-msg').textContent=err.message;}});

const tipForm = $('tip-form');
if (tipForm) {
  ['focusin','pointerdown','touchstart','change','input'].forEach((evt)=>{
    tipForm.addEventListener(evt, markTipInteraction, { passive: true });
  });
}

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}

(async()=>{
  await bootstrap();
  await refresh();
  setInterval(()=>{
    if (tipInteractionActive()) return;
    const interacting = !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
    if (interacting) return;
    refresh().catch(()=>{});
  },30000);
})();
