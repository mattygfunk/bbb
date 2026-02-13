const API={fixtures:'/api/fixtures',tips:'/api/tips',register:'/api/register',login:'/api/login',logout:'/api/logout',me:'/api/me'};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null,existingByRace:new Map()};
const $=id=>document.getElementById(id);

async function req(url,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;const r=await fetch(url,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

async function refresh(){
  const [fx,tp,allTipsRes]=await Promise.all([req(API.fixtures),req('/api/tips?status=approved'),req('/api/tips?status=all')]);
  $('fixtures-list').innerHTML='';
  (fx.fixtures||[]).forEach(f=>{const e=document.createElement('article');e.className='fixture';e.innerHTML=`<strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p>`;$('fixtures-list').appendChild(e);});
  $('tips-list').innerHTML='';
  const byPunter = new Map();
  (tp.tips||[]).forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byPunter.has(member)) byPunter.set(member, new Map());
    byPunter.get(member).set(String(t.race || ''), String(t.selection || t.horse || ''));
  });
  const raceOrder = Array.from({length:12}, (_,i)=>`R${i+1}`);
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
  for(let i=1;i<=12;i+=1){
    const el=document.querySelector(`#quick-race-list select[name='R${i}']`);
    if(el) el.value='';
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
      const el=document.querySelector(`#quick-race-list select[name='${race}']`);
      if(el) el.value=String(t.selection||'');
    });
  }

  $('auth-controls').innerHTML=state.user?`<span class='pill'>${esc(state.user.username)}</span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<a class='menu-link' href='/'>Log in</a>`;
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

$('tip-form').addEventListener('submit',async(e)=>{e.preventDefault();if(!state.user){$('tip-msg').textContent='Log in first.';return;}const f=new FormData(e.target);const picks=[];for(let i=1;i<=12;i+=1){const race=`R${i}`;const selection=String(f.get(race)||'').trim();if(!selection) continue;const existing=state.existingByRace.get(race)||'';if(selection!==existing) picks.push({race,selection});}if(!picks.length){$('tip-msg').textContent='No changes to save.';return;}try{let updated=0;for(const pick of picks){const r=await req(API.tips,{method:'POST',body:JSON.stringify(pick)});if(r.updated) updated+=1;}$('tip-msg').textContent=`Saved ${picks.length} change${picks.length===1?'':'s'}${updated?` (${updated} updated)`:''}.`;await refresh();}catch(err){$('tip-msg').textContent=err.message;}});

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}

(async()=>{await bootstrap();await refresh();})();
