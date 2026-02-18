const API_ROOTS=['/api'];
const API={fixtures:'/fixtures',tips:'/tips',ladder:'/ladder',ladderMember:(member)=>`/ladder/${encodeURIComponent(member)}`,bossesBet:'/bosses-bet',milestones:'/milestones',register:'/register',login:'/login',logout:'/logout',me:'/me',profile:'/profile'};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null,existingByRace:new Map(),raceCount:12,lastTipInteractionAt:0,selectedBreakdownMember:''};
const $=id=>document.getElementById(id);

async function req(path,opt={}){
  const h={'Content-Type':'application/json',...(opt.headers||{})};
  if(state.token)h.Authorization=`Bearer ${state.token}`;
  let lastErr='';
  for(const root of API_ROOTS){
    for(let attempt=0;attempt<2;attempt+=1){
      try{
        const r=await fetch(`${root}${path}`,{...opt,headers:h,credentials:'same-origin'});
        const d=await r.json().catch(()=>({}));
        if(r.ok)return d;
        lastErr=d.error||`Request failed (${r.status})`;
        if(r.status>=500 && attempt===0){
          await new Promise((resolve)=>setTimeout(resolve,200));
          continue;
        }
      }catch{
        lastErr='Network error. Please retry.';
      }
    }
  }
  throw new Error(lastErr||'Request failed');
}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function getProfile(){
  return state.user?.profile || { bio:'', profilePic:'', settings:{ emailNotifications:false, publicProfile:false, theme:'system' } };
}

function renderProfileCard(){
  const form = $('profile-form');
  if(!form) return;
  const profile = getProfile();
  const picInput = $('profile-pic-input');
  const bioInput = $('profile-bio-input');
  const publicInput = $('profile-public-input');
  const emailInput = $('profile-email-input');
  const themeInput = $('profile-theme-input');
  const preview = $('profile-pic-preview');
  const msg = $('profile-msg');

  const disabled = !state.user;
  form.querySelectorAll('input, textarea, select, button').forEach((el)=>{ el.disabled = disabled; });

  if(picInput) picInput.value = profile.profilePic || '';
  if(bioInput) bioInput.value = profile.bio || '';
  if(publicInput) publicInput.checked = Boolean(profile.settings?.publicProfile);
  if(emailInput) emailInput.checked = Boolean(profile.settings?.emailNotifications);
  if(themeInput) themeInput.value = profile.settings?.theme || 'system';
  if(preview) preview.src = profile.profilePic || '/assets/default-avatar.svg';
  if(msg && !state.user) msg.textContent = 'Log in to edit your profile.';
}

function renderLeaderboard(rows){
  const body = $('leaderboard-body');
  if(!body) return;
  body.innerHTML='';
  (rows||[]).forEach((r)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.rank}</td><td><button class='btn btn-ghost' type='button' data-member='${encodeURIComponent(String(r.member || ''))}'>${esc(r.member)}</button></td><td>${r.points}</td><td>${r.winners ?? r.correct ?? 0}</td>`;
    body.appendChild(tr);
  });
  if(!(rows||[]).length){
    const tr=document.createElement('tr');
    tr.innerHTML="<td colspan='4' class='muted'>No scored results yet.</td>";
    body.appendChild(tr);
  }

  body.querySelectorAll('button[data-member]').forEach((btn)=>{
    btn.addEventListener('click', ()=> loadMemberBreakdown(decodeURIComponent(btn.dataset.member || '')));
  });
}


function renderMilestones(data){
  const winnerCard = $('weekly-winner-card');
  const winnerHistory = $('winner-history-body');
  const streakBody = $('streak-body');
  if(!winnerCard || !winnerHistory || !streakBody) return;

  const featured = data?.featuredWinner || null;
  if(!featured){
    winnerCard.innerHTML = "<p class='muted'>No weekly winner recorded yet.</p>";
  } else {
    const date = featured.archivedAt ? new Date(featured.archivedAt).toLocaleDateString('en-AU',{ day:'2-digit', month:'short', year:'numeric' }) : '';
    winnerCard.innerHTML = `<div class='stack'><strong>${esc(featured.member)}</strong><p class='muted'>${esc(featured.weekLabel)}${date ? ` • ${date}` : ''}</p><p class='muted'>${featured.points} pts • ${featured.winners} winners</p></div>`;
  }

  winnerHistory.innerHTML='';
  (data?.winnerHistory || []).slice(0,8).forEach((row)=>{
    const tr=document.createElement('tr');
    const winnerCell = row.rolledOver ? `${esc(row.member || '-')} ⚠️` : esc(row.member || '-');
    tr.innerHTML=`<td>${esc(row.weekLabel || '-')}</td><td>${winnerCell}</td><td>$${Number(row.prize ?? row.points || 0).toFixed(2)}</td>`;
    winnerHistory.appendChild(tr);
  });
  if(!(data?.winnerHistory || []).length){
    const tr=document.createElement('tr');
    tr.innerHTML="<td colspan='3' class='muted'>No winners archived yet.</td>";
    winnerHistory.appendChild(tr);
  }

  streakBody.innerHTML='';
  (data?.streakLeaderboard || []).slice(0,10).forEach((row)=>{
    const badgeText = (row.badges || []).slice(0,2).join(' • ');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${row.rank}</td><td>${esc(row.member || '-')}</td><td>${Number(row.currentStreak || 0)}</td><td>${Number(row.bestStreak || 0)}</td><td>${Number(row.totalWins || 0)}</td><td class='muted'>${esc(badgeText || '—')}</td>`;
    streakBody.appendChild(tr);
  });
  if(!(data?.streakLeaderboard || []).length){
    const tr=document.createElement('tr');
    tr.innerHTML="<td colspan='6' class='muted'>No milestones yet.</td>";
    streakBody.appendChild(tr);
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

async function loadMemberBreakdown(member, scrollToSection = true){
  const body = $('breakdown-body');
  const title = $('breakdown-title');
  if(!body || !title || !member) return;

  title.textContent = `Loading breakdown for ${member}...`;
  body.innerHTML = `<tr><td colspan='4' class='muted'>Loading…</td></tr>`;
  try {
    const r = await req(API.ladderMember(member));
    const b = r.breakdown || { races: [], totalPoints: 0, winners: 0 };
    state.selectedBreakdownMember = member;
    title.textContent = `${member} — ${b.totalPoints} points • ${b.winners} winners`;
    body.innerHTML = '';
    if(!(b.races||[]).length){
      body.innerHTML = `<tr><td colspan='4' class='muted'>No scored races yet for ${esc(member)}.</td></tr>`;
      return;
    }
    (b.races || []).forEach((race)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(race.race || '-')}</td><td>${esc(race.effectiveSelection || race.selection || '-')}</td><td>${esc(race.outcome || '-')}</td><td>${Number(race.points || 0)}</td>`;
      body.appendChild(tr);
    });
    if (scrollToSection) {
      const section = $('points-breakdown');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    title.textContent = 'Could not load points breakdown.';
    body.innerHTML = `<tr><td colspan='4' class='muted'>${esc(err.message || 'Request failed')}</td></tr>`;
  }
}

// Buy-in vote removed: fixed $20 entry is live now.

function renderRaceInputs(count){

  const wrap = $('quick-race-list');
  if(!wrap) return;
  wrap.innerHTML='';
  for(let i=1;i<=count;i+=1){
    const race=`R${i}`;
    const selectId=`tip-${race.toLowerCase()}`;
    const row=document.createElement('div');
    row.className='row';
    const opts=['<option value="">—</option>'];
    for(let n=1;n<=24;n+=1) opts.push(`<option>${n}</option>`);
    row.innerHTML=`<label for='${selectId}'><strong>${race}</strong><span class='muted' style='position:absolute;left:-9999px'> selection</span></label><select id='${selectId}' name='${race}' aria-label='${race} selection'>${opts.join('')}</select>`;
    wrap.appendChild(row);
  }
}

function markTipInteraction(){ state.lastTipInteractionAt = Date.now(); }
function tipInteractionActive(){ return (Date.now() - Number(state.lastTipInteractionAt || 0)) < 20000; }

async function refresh(){
  const isEditingTips = tipInteractionActive() || !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
  let fx,tp,allTipsRes,ladderRes,bossesRes,milestonesRes;
  try {
    [fx,tp,allTipsRes,ladderRes,bossesRes,milestonesRes]=await Promise.all([
      req(API.fixtures),
      req(`${API.tips}?status=all`),
      req(`${API.tips}?status=all`),
      req(API.ladder),
      req(API.bossesBet),
      req(API.milestones)
    ]);
  } catch (err) {
    const status = $('leaderboard-status');
    if (status) status.textContent = 'Offline';
    const tipMsg = $('tip-msg');
    if (tipMsg) tipMsg.textContent = `Live data unavailable: ${err.message}`;
    return;
  }
  const fixturesList = $('fixtures-list');
  if (fixturesList) fixturesList.innerHTML='';
  (fx.fixtures||[]).forEach(f=>{const e=document.createElement('article');e.className='fixture';e.innerHTML=`<strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p>`; if (fixturesList) fixturesList.appendChild(e);});
  const quickFixtureLine = $('quick-fixture-line');
  const nextMeet = (fx.fixtures || [])[0];
  if (quickFixtureLine) {
    quickFixtureLine.textContent = nextMeet
      ? `Next meet: ${nextMeet.date} • ${nextMeet.track} (${nextMeet.event})`
      : 'Next meet details coming soon.';
  }
  const newRaceCount = Number((fx.fixtures||[])[0]?.raceCount || 12);
  const raceCountChanged = newRaceCount !== state.raceCount;
  state.raceCount = newRaceCount;
  if (raceCountChanged || !document.querySelector('#quick-race-list select')) renderRaceInputs(state.raceCount);
  renderLeaderboard(ladderRes.ladder || []);
  const status = $('leaderboard-status');
  if (status) status.textContent = ladderRes.afterRace ? `After ${ladderRes.afterRace}` : 'Live';
  renderBossesBet(bossesRes.bossesBet || {});
  renderMilestones(milestonesRes || {});
  if (state.selectedBreakdownMember) {
    loadMemberBreakdown(state.selectedBreakdownMember, false).catch(()=>{});
  }
  $('tips-list').innerHTML='';
  const byPunter = new Map();
  (tp.tips||[]).filter(t=>t.status!=='removed').forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byPunter.has(member)) byPunter.set(member, { picks: new Map(), unpaid: false });
    const row = byPunter.get(member);
    row.picks.set(String(t.race || ''), String(t.selection || t.horse || ''));
    if (!t.paid) row.unpaid = true;
  });
  const raceOrder = Array.from({length:state.raceCount}, (_,i)=>`R${i+1}`);
  Array.from(byPunter.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([member, data]) => {
    const picks = data.picks;
    const lines = raceOrder
      .filter((r) => picks.get(r))
      .map((r) => `<span>${esc(r)}: <strong>${esc(picks.get(r))}</strong></span>`)
      .join(' • ');
    const e=document.createElement('article');
    e.className='tip';
    const reminder = data.unpaid
      ? `<p class='meta unpaid-reminder'>⚠️ Payment reminder: not marked paid — PayID for today: <strong>0421 325 503</strong></p>`
      : "";
    e.innerHTML=`<strong>${esc(member)}</strong>${data.unpaid ? " <span class='pill unpaid-pill'>UNPAID</span>" : ""}<p class='meta'>${lines || 'No tips yet'}</p>${reminder}`;
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

  $('auth-controls').innerHTML=state.user?`<span class='profile-chip'><img src='${esc(getProfile().profilePic || '/assets/default-avatar.svg')}' alt='' class='profile-chip-avatar'/> <a class='pill' href='/profile' style='text-decoration:none'>${esc(state.user.username)}</a><a class='menu-link' href='/profile#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<a class='menu-link' href='/'>Log in</a>`;
  const adminNav = $('admin-nav-link');
  if (adminNav) adminNav.style.display = state.user?.role === 'admin' ? 'inline-block' : 'none';
  const b=$('logout-btn'); if(b)b.onclick=logout;
  renderProfileCard();
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

// Buy-in vote submission removed: fixed $20 entry is live now.

$('tip-form').addEventListener('submit',async(e)=>{e.preventDefault();markTipInteraction();if(!state.user){$('tip-msg').textContent='Log in first.';return;}const f=new FormData(e.target);const picks=[];for(let i=1;i<=state.raceCount;i+=1){const race=`R${i}`;const selection=String(f.get(race)||'').trim();if(!selection) continue;const existing=state.existingByRace.get(race)||'';if(selection!==existing) picks.push({race,selection});}if(!picks.length){$('tip-msg').textContent='No changes to save.';return;}try{let updated=0;for(const pick of picks){const r=await req(API.tips,{method:'POST',body:JSON.stringify(pick)});if(r.updated) updated+=1;}$('tip-msg').textContent=`Saved ${picks.length} change${picks.length===1?'':'s'}${updated?` (${updated} updated)`:''}.`;await refresh();}catch(err){$('tip-msg').textContent=err.message;}});

const tipForm = $('tip-form');
if (tipForm) {
  ['focusin','pointerdown','touchstart','change','input'].forEach((evt)=>{
    tipForm.addEventListener(evt, markTipInteraction, { passive: true });
  });
}

function wirePuntersLeaderboardShare(){
  const btn = $('share-punters-leaderboard-btn');
  const msg = $('share-punters-msg');
  if(!btn) return;
  btn.onclick = async () => {
    const text = 'Big Bluff Bay Punters Club leaderboard is live. Have a look:';
    const url = `${window.location.origin}/share/leaderboard`;
    const payload = `${text} ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BBB Leaderboard', text, url });
        if (msg) msg.textContent = 'Shared. Select your Messenger group to post it.';
      } else {
        const shareUrl = `https://www.facebook.com/dialog/share?app_id=966242223397117&display=popup&href=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`;
        const w = window.open(shareUrl, '_blank', 'noopener,noreferrer');
        try { await navigator.clipboard.writeText(payload); } catch {}
        if (msg) msg.textContent = w
          ? 'Facebook share dialog opened. Choose Messenger and your group.'
          : 'Popup was blocked. Please allow popups, then try again.';
      }
    } catch {
      if (msg) msg.textContent = 'Share cancelled.';
    }
  };
}

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}


const profileForm = $('profile-form');
if (profileForm) {
  profileForm.addEventListener('input', (e)=>{
    if (e.target?.id === 'profile-pic-input') {
      const preview = $('profile-pic-preview');
      if (preview) preview.src = e.target.value.trim() || '/assets/default-avatar.svg';
    }
  });

  profileForm.addEventListener('change', (e)=>{
    if (e.target?.id !== 'profile-pic-file') return;
    const file = e.target.files?.[0];
    if (!file) return;
    const msg = $('profile-msg');
    if (!String(file.type || '').startsWith('image/')) {
      if (msg) msg.textContent = 'Please upload an image file.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const picInput = $('profile-pic-input');
        const preview = $('profile-pic-preview');
        if (picInput) picInput.value = dataUrl;
        if (preview) preview.src = dataUrl;
        if (msg) msg.textContent = 'Avatar ready. Click Save Profile.';
      };
      img.onerror = () => { if (msg) msg.textContent = 'Could not read that image.'; };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => { if (msg) msg.textContent = 'Could not load that image.'; };
    reader.readAsDataURL(file);
  });

  profileForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!state.user){ $('profile-msg').textContent = 'Log in first.'; return; }
    const f = new FormData(profileForm);
    const payload = {
      bio: String(f.get('bio') || '').trim(),
      profilePic: String(f.get('profilePic') || '').trim(),
      settings: {
        publicProfile: f.get('publicProfile') === 'on',
        emailNotifications: f.get('emailNotifications') === 'on',
        theme: String(f.get('theme') || 'system')
      }
    };
    try {
      const r = await req(API.profile, { method:'PUT', body: JSON.stringify(payload) });
      state.user.profile = r.profile;
      $('profile-msg').textContent = 'Profile saved.';
      renderProfileCard();
      const auth = $('auth-controls');
      if (auth) {
        $('auth-controls').innerHTML=`<span class='profile-chip'><img src='${esc(getProfile().profilePic || '/assets/default-avatar.svg')}' alt='' class='profile-chip-avatar'/> <a class='pill' href='/profile' style='text-decoration:none'>${esc(state.user.username)}</a><a class='menu-link' href='/profile#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`;
        const b=$('logout-btn'); if(b)b.onclick=logout;
      }
    } catch (err) {
      $('profile-msg').textContent = err.message || 'Could not save profile.';
    }
  });
}


(async()=>{
  wirePuntersLeaderboardShare();
  await bootstrap();
  await refresh().catch(()=>{});
  setInterval(()=>{
    if (tipInteractionActive()) return;
    const interacting = !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
    if (interacting) return;
    refresh().catch(()=>{});
  },30000);
})();
