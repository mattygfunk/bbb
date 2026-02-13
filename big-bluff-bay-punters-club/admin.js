const API={tips:'/api/tips',login:'/api/login',logout:'/api/logout',me:'/api/me',updateFixture:id=>`/api/fixtures/${id}`};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null};
const $=id=>document.getElementById(id);
async function req(url,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;const r=await fetch(url,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function isAdmin(){return state.user?.role==='admin';}

async function bootstrap(){if(!state.token)return;try{state.user=(await req(API.me)).user;}catch{state.token=null;state.user=null;localStorage.removeItem(tokenKey);}}

async function refresh(){
  $('auth-controls').innerHTML=state.user?`<span class='pill'>${esc(state.user.username)} (${esc(state.user.role)})</span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<span class='pill'>Logged out</span>`;
  const b=$('logout-btn'); if(b)b.onclick=logout;
  const adminOnly=$('admin-only');
  const loginCard=$('admin-login-card');
  if(adminOnly) adminOnly.style.display=isAdmin()?'grid':'none';
  if(loginCard) loginCard.style.display=isAdmin()?'none':'block';
  $('admin-list').innerHTML='';
  if(!isAdmin()){ return; }
  const p=await req('/api/tips?status=approved');
  if(!p.tips?.length){$('admin-list').innerHTML='<p class="muted">No tips submitted yet.</p>';return;}
  p.tips.forEach(t=>{const row=document.createElement('div');row.className='row';row.innerHTML=`<div><strong>${esc(t.race)} — ${esc(t.selection||t.horse||'')}</strong><div class='muted'>by ${esc(t.member)}</div></div>`;$('admin-list').appendChild(row);});
}

$('login-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.target);const username=String(f.get('member')||'').trim();const password=String(f.get('pin')||'').trim();try{const r=await req(API.login,{method:'POST',body:JSON.stringify({username,password})});state.token=r.token;state.user=r.user;localStorage.setItem(tokenKey,state.token);$('login-msg').textContent='Logged in.';await refresh();}catch(err){$('login-msg').textContent=err.message;}});

$('fixture-form').addEventListener('submit',async(e)=>{e.preventDefault();if(!isAdmin()){ $('fixture-msg').textContent='Admin login required.'; return; }const f=new FormData(e.target);try{await req(API.updateFixture('f1'),{method:'PUT',body:JSON.stringify({date:String(f.get('date')||'').trim(),event:String(f.get('event')||'').trim(),track:String(f.get('track')||'').trim()})});$('fixture-msg').textContent='Fixture updated.';}catch(err){$('fixture-msg').textContent=err.message;}});

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}

(async()=>{await bootstrap();await refresh();})();
