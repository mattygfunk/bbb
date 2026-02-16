const API_ROOTS=['/api'];
const API={tips:'/tips',fixtures:'/fixtures',results:'/results',bossesBet:'/bosses-bet',bossesBetResults:'/bosses-bet/results',archiveRound:'/archive-round',unlockSatNoon:'/tips/unlock-saturday-noon',tipEditDeadline:'/tips/edit-deadline',jackpot:'/jackpot',pokerResults:'/poker-results',pokerLeaderboard:'/poker-leaderboard',pokerPlayers:'/poker-players',pokerPlayersImport:'/poker-players/import',login:'/login',logout:'/logout',me:'/me',updateFixture:id=>`/fixtures/${id}`,updateResult:race=>`/results/${race}`,clearResult:race=>`/results/${race}`,updateTip:(id)=>`/tips/${id}`};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null,raceCount:12,raceResults:{},bossesBet:{legs:['R9','R10','R11','R12'],selections:{}},tipsAll:[],popularByRace:{},rolloverAppliedFromQuery:false,summary:{tipUsers:0,paidUsers:0,pokerEvents:0}};
const $=id=>document.getElementById(id);
async function req(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;let lastErr='';for(const root of API_ROOTS){const r=await fetch(`${root}${path}`,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(r.ok)return d;if(r.status===403){lastErr=d.error||'Admin only. Log in with an admin account (farmilut).';continue;}if(r.status===401){lastErr=d.error||'Session expired. Please log in again.';continue;}lastErr=d.error||`Request failed (${r.status})`;}throw new Error(lastErr||'Request failed');}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function isAdmin(){return state.user?.role==='admin';}

function setPokerResultMsg(type, text){
  const el = $('poker-result-msg');
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.remove('msg-ok', 'msg-warn', 'msg-err');
  if (type === 'ok') el.classList.add('msg-ok');
  else if (type === 'warn') el.classList.add('msg-warn');
  else if (type === 'err') el.classList.add('msg-err');
}

function applyAdminViewFilter(){
  const params = new URLSearchParams(window.location.search || '');
  const view = String(params.get('view') || 'all').toLowerCase();
  const racing = $('admin-racing-sections');
  const poker = $('admin-poker-sections');
  const racingUsers = $('admin-racing-users');

  const showRacing = view === 'all' || view === 'racing';
  const showPoker = view === 'all' || view === 'poker';

  if (racing) racing.style.display = showRacing ? 'grid' : 'none';
  if (racingUsers) racingUsers.style.display = showRacing ? 'block' : 'none';
  if (poker) poker.style.display = showPoker ? 'grid' : 'none';

  document.querySelectorAll('.admin-mode-link').forEach((el) => {
    el.classList.toggle('active', String(el.dataset.adminView || 'all') === view);
  });

  const pill = $('admin-active-view-pill');
  if (pill) pill.textContent = `View: ${view}`;

  return view;
}

function renderAdminSummaryCounts(){
  const tipUsers = Number(state.summary?.tipUsers || 0);
  const paidUsers = Number(state.summary?.paidUsers || 0);
  const pokerEvents = Number(state.summary?.pokerEvents || 0);

  const all = tipUsers + pokerEvents;
  const racing = tipUsers;
  const poker = pokerEvents;

  const allEl = $('admin-count-all');
  const racingEl = $('admin-count-racing');
  const pokerEl = $('admin-count-poker');
  if (allEl) allEl.textContent = String(all);
  if (racingEl) racingEl.textContent = String(racing);
  if (pokerEl) pokerEl.textContent = String(poker);

  const tipUsersEl = $('admin-stat-tip-users');
  const paidUsersEl = $('admin-stat-paid-users');
  const pokerEventsEl = $('admin-stat-poker-events');
  if (tipUsersEl) tipUsersEl.textContent = String(tipUsers);
  if (paidUsersEl) paidUsersEl.textContent = String(paidUsers);
  if (pokerEventsEl) pokerEventsEl.textContent = String(pokerEvents);
}

async function applyRolloverFromQueryIfRequested(){
  if (state.rolloverAppliedFromQuery) return;
  const params = new URLSearchParams(window.location.search || '');
  const shouldApply = params.get('apply') === '1';
  const rolloverRaw = params.get('rollover');
  if (!shouldApply || rolloverRaw == null) return;
  if (!isAdmin()) return;

  const rollover = Number(rolloverRaw);
  if (!Number.isFinite(rollover) || rollover < 0) {
    $('archive-round-msg').textContent = 'Invalid rollover in URL. Use ?rollover=80&apply=1';
    state.rolloverAppliedFromQuery = true;
    return;
  }

  try {
    const r = await req(API.jackpot, { method: 'PUT', body: JSON.stringify({ rollover }) });
    const val = Number(r.jackpotCarry || 0);
    const input = $('jackpot-rollover-input');
    const current = $('jackpot-current');
    if (input) input.value = String(val);
    if (current) current.textContent = `Current rollover: $${val}`;
    $('archive-round-msg').textContent = `Applied jackpot rollover from URL: $${val}.`;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('rollover');
    clean.searchParams.delete('apply');
    history.replaceState({}, '', clean.toString());
  } catch (err) {
    $('archive-round-msg').textContent = `URL rollover apply failed: ${err.message}`;
  }

  state.rolloverAppliedFromQuery = true;
}

function fillResultsForm(race){
  const form = $('results-form');
  if(!form) return;
  const r = state.raceResults?.[race] || {};
  if (form.first) form.first.value = Array.isArray(r.first) ? r.first.join(',') : '';
  if (form.second) form.second.value = Array.isArray(r.second) ? r.second.join(',') : '';
  if (form.third) form.third.value = Array.isArray(r.third) ? r.third.join(',') : '';
  if (form.substitutions) {
    const subs = Array.isArray(r.substitutions) ? r.substitutions.map((s)=>`${s.scratched}>${s.substitute}`).join(', ') : '';
    form.substitutions.value = subs;
  }
}

function renderRaceOptions(){
  const select = $('results-race');
  if(!select) return;
  const prev = select.value;
  select.innerHTML = '';
  for(let i=1;i<=state.raceCount;i+=1){
    const opt = document.createElement('option');
    opt.value = `R${i}`;
    opt.textContent = `R${i}`;
    select.appendChild(opt);
  }
  select.value = prev || 'R1';
  fillResultsForm(select.value);
}

function renderBossesLegInputs(){
  const wrap = $('bosses-legs');
  if(!wrap) return;
  wrap.innerHTML = '';
  const selectedLegs = new Set((state.bossesBet?.legs || []).map(String));
  const selections = state.bossesBet?.selections || {};

  for(let i=1;i<=state.raceCount;i+=1){
    const race = `R${i}`;
    const row = document.createElement('div');
    row.className = 'row';
    const checked = selectedLegs.size ? selectedLegs.has(race) : true;
    row.innerHTML = `<label style="display:flex;align-items:center;gap:.45rem"><input type='checkbox' name='leg-${race}' ${checked ? 'checked' : ''}/> ${race}</label><input name='sel-${race}' type='text' placeholder='selection' value='${esc(selections[race] || '')}' style='max-width:140px' />`;
    wrap.appendChild(row);
  }
}

function computePopularByRace(tips){
  const byRace = new Map();
  (tips || []).filter(t=>t.status!=='removed').forEach((t)=>{
    const race = String(t.race || '').toUpperCase();
    const sel = String(t.selection || t.horse || '').trim();
    if(!race || !sel) return;
    if(!byRace.has(race)) byRace.set(race, new Map());
    const m = byRace.get(race);
    m.set(sel, (m.get(sel) || 0) + 1);
  });

  const out = {};
  for(const [race,m] of byRace.entries()){
    const sorted = [...m.entries()].sort((a,b)=>b[1]-a[1] || Number(a[0])-Number(b[0]) || String(a[0]).localeCompare(String(b[0])));
    if(sorted[0]) out[race] = { selection: sorted[0][0], votes: sorted[0][1] };
  }
  return out;
}

function renderBossesSuggested(popular){
  const box = $('bosses-suggested');
  if(!box) return;
  const races = Array.from({length:state.raceCount},(_,i)=>`R${i+1}`);
  const lines = races.filter(r=>popular[r]).map((r)=>`${r}: ${popular[r].selection} (${popular[r].votes} votes)`);
  box.textContent = lines.length ? `Most popular picks → ${lines.join(' • ')}` : 'No tip data yet to auto-calculate Bosses Bet.';
}

async function bootstrap(){if(!state.token)return;try{state.user=(await req(API.me)).user;}catch{state.token=null;state.user=null;localStorage.removeItem(tokenKey);}}

async function refresh(){
  $('auth-controls').innerHTML=state.user?`<span class='profile-chip'><a class='pill' href='/profile' style='text-decoration:none'>${esc(state.user.username)} (${esc(state.user.role)})</a><a class='menu-link' href='/profile#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<span class='pill'>Logged out</span>`;
  const b=$('logout-btn'); if(b)b.onclick=logout;
  const adminOnly=$('admin-only');
  const loginCard=$('admin-login-card');
  if(adminOnly) adminOnly.style.display=isAdmin()?'grid':'none';
  if(loginCard) loginCard.style.display=isAdmin()?'none':'block';
  $('admin-list').innerHTML='';
  renderAdminSummaryCounts();
  if(!isAdmin()){ return; }
  applyAdminViewFilter();

  try {
    const fx = await req(API.fixtures);
    const meet = (fx.fixtures || [])[0] || {};
    state.raceCount = Number(meet.raceCount || 12);
    const form = $('fixture-form');
    if (form) {
      if (form.date && !form.date.value) form.date.value = meet.date || '';
      if (form.event && !form.event.value) form.event.value = meet.event || '';
      if (form.track && !form.track.value) form.track.value = meet.track || '';
      if (form.raceCount) form.raceCount.value = String(meet.raceCount || 12);
    }
  } catch {}

  try {
    const rr = await req(API.results);
    state.raceResults = rr.raceResults || {};
    renderRaceOptions();
  } catch {}

  try {
    const bb = await req(API.bossesBet);
    state.bossesBet = bb.bossesBet || { legs:[], selections:{} };
  } catch {
    state.bossesBet = { legs:[], selections:{} };
  }
  renderBossesLegInputs();

  try {
    const dl = await req(API.tipEditDeadline);
    const node = $('tip-unlock-status');
    if (node) {
      const when = dl?.effectiveDeadlineMs ? new Date(Number(dl.effectiveDeadlineMs)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' }) : 'Unknown';
      node.textContent = `Tip edits are currently ${dl?.editableNow ? 'OPEN' : 'LOCKED'} until ${when}.`;
    }
  } catch {}

  try {
    const j = await req(API.jackpot);
    const rollover = Number(j?.rollover || 0);
    const input = $('jackpot-rollover-input');
    const current = $('jackpot-current');
    if (input) input.value = String(rollover);
    if (current) current.textContent = `Current rollover: $${rollover}`;
  } catch {}

  await applyRolloverFromQueryIfRequested();

  const p=await req(`${API.tips}?status=all`);
  state.tipsAll = p.tips || [];
  state.popularByRace = computePopularByRace(state.tipsAll);
  renderBossesSuggested(state.popularByRace);

  const activeTips = (p.tips || []).filter((t) => t.status !== 'removed');
  state.summary.tipUsers = new Set(activeTips.map((t) => String(t.member || '').trim()).filter(Boolean)).size;
  state.summary.paidUsers = new Set(activeTips.filter((t) => t.paid).map((t) => String(t.member || '').trim()).filter(Boolean)).size;

  try {
    const pokerAll = await req(`${API.pokerLeaderboard}?range=all`);
    state.summary.pokerEvents = Number(pokerAll?.stats?.events || 0);
  } catch {
    state.summary.pokerEvents = state.summary.pokerEvents || 0;
  }

  renderAdminSummaryCounts();
  refreshPokerPlayerOptions().catch(()=>{});

  if(!p.tips?.length){$('admin-list').innerHTML='<p class="muted">No tips submitted yet.</p>';return;}

  const byUser = new Map();
  (p.tips || []).filter(t=>t.status!=='removed').forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byUser.has(member)) byUser.set(member, []);
    byUser.get(member).push(t);
  });

  Array.from(byUser.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([member, tips]) => {
      const allPaid = tips.length > 0 && tips.every(t => t.paid);
      const lines = tips
        .sort((a,b)=>Number(String(a.race||'R0').slice(1))-Number(String(b.race||'R0').slice(1)))
        .map((t) => `<span>${esc(t.race)}: ${esc(t.selection || t.horse || '')}</span>`)
        .join(' • ');
      const row = document.createElement('div');
      row.className = 'row';
      row.style.alignItems = 'flex-start';
      row.innerHTML = `<div><strong>${esc(member)}</strong><div class='muted'>${tips.length} race${tips.length===1?'':'s'} tipped • ${allPaid ? 'Paid' : 'Unpaid'}</div><div class='muted'>${lines}</div></div><div class='row-actions'><button class='btn btn-ghost' data-action='toggle-paid' data-member='${encodeURIComponent(member)}' data-paid='${allPaid ? 'false' : 'true'}'>Mark ${allPaid ? 'Unpaid' : 'Paid'}</button><button class='btn btn-ghost' data-action='edit-tips' data-member='${encodeURIComponent(member)}'>Edit Tips</button></div>`;
      $('admin-list').appendChild(row);
    });

  $('admin-list').querySelectorAll("button[data-action='toggle-paid']").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const member = decodeURIComponent(btn.dataset.member || '');
        const nextPaid = btn.dataset.paid === 'true';
        const tipsForMember = (p.tips || []).filter(t => String(t.member||'') === member && t.status !== 'removed');
        for (const tip of tipsForMember) {
          await req(API.updateTip(tip.id), { method: 'PATCH', body: JSON.stringify({ paid: nextPaid }) });
        }
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    };
  });

  $('admin-list').querySelectorAll("button[data-action='edit-tips']").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const member = decodeURIComponent(btn.dataset.member || '');
        const tipsForMember = (p.tips || [])
          .filter(t => String(t.member||'') === member && t.status !== 'removed')
          .sort((a,b)=>Number(String(a.race||'R0').slice(1))-Number(String(b.race||'R0').slice(1)));

        const current = tipsForMember.map((t)=>`${t.race}=${t.selection || ''}`).join(', ');
        const raw = prompt(`Edit tips for ${member}.\nFormat: R1=4, R2=9\n(Only existing tipped races can be edited)`, current);
        if (raw == null) return;

        const updates = raw.split(',').map((x)=>x.trim()).filter(Boolean).map((entry)=>{
          const [raceRaw, selRaw] = entry.split('=').map((v)=>String(v||'').trim());
          return { race: raceRaw.toUpperCase(), selection: selRaw };
        }).filter((x)=>/^R\d+$/i.test(x.race) && x.selection);

        if(!updates.length){ alert('No valid edits found. Use format like R1=4, R2=9'); return; }

        const tipByRace = new Map(tipsForMember.map((t)=>[String(t.race||'').toUpperCase(), t]));
        const missing = [];
        for (const u of updates) {
          const tip = tipByRace.get(u.race);
          if (!tip) { missing.push(u.race); continue; }
          await req(API.updateTip(tip.id), { method:'PATCH', body: JSON.stringify({ selection: u.selection }) });
        }

        if (missing.length) {
          alert(`Updated existing races. Could not edit ${missing.join(', ')} because no tip exists yet for those races.`);
        }
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    };
  });
}

$('login-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.target);const username=String(f.get('member')||'').trim();const password=String(f.get('pin')||'').trim();try{const r=await req(API.login,{method:'POST',body:JSON.stringify({username,password})});state.token=r.token;state.user=r.user;localStorage.setItem(tokenKey,state.token);$('login-msg').textContent='Logged in.';await refresh();}catch(err){$('login-msg').textContent=err.message;}});

$('fixture-form').addEventListener('submit',async(e)=>{e.preventDefault();if(!isAdmin()){ $('fixture-msg').textContent='Admin login required.'; return; }const f=new FormData(e.target);try{await req(API.updateFixture('f1'),{method:'PUT',body:JSON.stringify({date:String(f.get('date')||'').trim(),event:String(f.get('event')||'').trim(),track:String(f.get('track')||'').trim(),raceCount:Number(f.get('raceCount')||12)})});$('fixture-msg').textContent='Fixture updated.';await refresh();}catch(err){$('fixture-msg').textContent=err.message;}});

$('archive-round-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  if(!confirm('Archive current meet tips/results and reset active round?')) return;
  try {
    const r = await req(API.archiveRound, { method: 'POST' });
    const outcome = r.outrightWinner
      ? `Outright winner: ${r.outrightWinner}. Jackpot resets.`
      : `No outright winner. Jackpot rolls to next week: $${Number(r.rolloverToNextWeek || 0)}.`;
    $('archive-round-msg').textContent = `Archived ${r.tipsArchived || 0} tips${r.fixture ? ` from ${r.fixture}` : ''}. ${outcome}`;
    await refresh();
  } catch (err) {
    $('archive-round-msg').textContent = err.message;
  }
});

$('unlock-sat-noon-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  if(!confirm('Unlock tip edits until next Saturday 12:00 PM (Melbourne time)?')) return;
  try {
    const r = await req(API.unlockSatNoon, { method: 'POST' });
    const local = new Date(Number(r.deadlineMs || 0)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' });
    $('archive-round-msg').textContent = `Tips unlocked until ${local}.`;
  } catch (err) {
    $('archive-round-msg').textContent = err.message;
  }
});

$('jackpot-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  const rollover = Number(f.get('rollover'));
  if(!Number.isFinite(rollover) || rollover < 0){ $('archive-round-msg').textContent='Enter a valid jackpot amount.'; return; }
  try {
    const r = await req(API.jackpot, { method: 'PUT', body: JSON.stringify({ rollover }) });
    $('archive-round-msg').textContent = `Jackpot rollover set to $${Number(r.jackpotCarry || 0)}.`;
    const current = $('jackpot-current');
    if (current) current.textContent = `Current rollover: $${Number(r.jackpotCarry || 0)}`;
  } catch (err) {
    $('archive-round-msg').textContent = err.message;
  }
});

const resultsRace = $('results-race');
if (resultsRace) resultsRace.addEventListener('change', (e) => fillResultsForm(String(e.target.value || 'R1')));

$('results-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('results-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  const race = String(f.get('race') || '').toUpperCase();
  try {
    await req(API.updateResult(race), {
      method: 'PUT',
      body: JSON.stringify({
        first: String(f.get('first') || ''),
        second: String(f.get('second') || ''),
        third: String(f.get('third') || ''),
        substitutions: String(f.get('substitutions') || '')
      })
    });
    $('results-msg').textContent = 'Results saved.';
    await refresh();
    fillResultsForm(race);
  } catch (err) {
    $('results-msg').textContent = err.message;
  }
});

$('bosses-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('bosses-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  const legs = [];
  const selections = {};
  for(let i=1;i<=state.raceCount;i+=1){
    const race = `R${i}`;
    const enabled = f.get(`leg-${race}`) !== null;
    const sel = String(f.get(`sel-${race}`) || '').trim();
    if(enabled) legs.push(race);
    selections[race] = sel;
  }

  try {
    await req(API.bossesBet, {
      method: 'PUT',
      body: JSON.stringify({ legs, selections })
    });
    $('bosses-msg').textContent = 'Bosses bet saved.';
    await refresh();
  } catch (err) {
    $('bosses-msg').textContent = err.message;
  }
});

$('clear-results-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('results-msg').textContent='Admin login required.'; return; }
  const race = String($('results-race')?.value || 'R1').toUpperCase();
  if(!confirm(`Clear saved result for ${race}?`)) return;
  try {
    await req(API.clearResult(race), { method: 'DELETE' });
    $('results-msg').textContent = `${race} result cleared.`;
    await refresh();
    fillResultsForm(race);
  } catch (err) {
    $('results-msg').textContent = err.message;
  }
});

$('autofill-bosses-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('bosses-msg').textContent='Admin login required.'; return; }

  try {
    // Always fetch latest tips before auto-fill so it works even if prior refresh failed.
    const p = await req(`${API.tips}?status=all`);
    state.tipsAll = p.tips || [];
    state.popularByRace = computePopularByRace(state.tipsAll);
    renderBossesSuggested(state.popularByRace);
  } catch (err) {
    $('bosses-msg').textContent = `Could not load latest tips: ${err.message}`;
    return;
  }

  const popular = state.popularByRace || {};
  let filled = 0;
  for(let i=1;i<=state.raceCount;i+=1){
    const race = `R${i}`;
    const box = document.querySelector(`#bosses-legs input[name='leg-${race}']`);
    const sel = document.querySelector(`#bosses-legs input[name='sel-${race}']`);
    if(!sel || !box) continue;
    if(popular[race]?.selection){
      box.checked = true;
      sel.value = popular[race].selection;
      filled += 1;
    }
  }

  $('bosses-msg').textContent = filled
    ? `Auto-filled ${filled} race${filled===1?'':'s'} from most popular tips. Click Save Bosses Bet to apply.`
    : 'No popular tips found to auto-fill yet.';
});

$('reset-bosses-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('bosses-msg').textContent='Admin login required.'; return; }
  if(!confirm('Reset Bosses Bet for all races?')) return;
  try {
    await req(API.bossesBet, { method: 'DELETE' });
    $('bosses-msg').textContent = 'Bosses bet reset.';
    await refresh();
  } catch (err) {
    $('bosses-msg').textContent = err.message;
  }
});

$('reset-bosses-results-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('bosses-msg').textContent='Admin login required.'; return; }
  if(!confirm('Reset ALL Bosses Multi results and clear selections for this meet?')) return;
  try {
    // Primary reset endpoint
    await req(API.bossesBetResults, { method: 'DELETE' });
    // Defensive follow-up to avoid stale selections from older deployments/caches
    await req(API.bossesBet, { method: 'DELETE' });
    $('bosses-msg').textContent = 'Bosses multi results and selections reset.';
    await refresh();
  } catch (err) {
    $('bosses-msg').textContent = err.message;
  }
});

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}

(async()=>{await bootstrap();await refresh();refreshPokerPlayerOptions().catch(()=>{});})();

setInterval(() => {
  if (document.hidden) return;
  if (!isAdmin()) return;
  refresh().catch(() => {});
}, 30000);


const pokerEventPreset = $('poker-event-preset');
const pokerEventCustomWrap = $('poker-event-custom-wrap');
const pokerEventCustom = $('poker-event-custom');

function syncPokerEventMode(){
  const isCustom = pokerEventPreset?.value === 'custom';
  if (pokerEventCustomWrap) pokerEventCustomWrap.hidden = !isCustom;
  if (pokerEventCustom) {
    pokerEventCustom.required = Boolean(isCustom);
    if (isCustom) setTimeout(() => pokerEventCustom.focus(), 0);
    if (!isCustom) pokerEventCustom.value = '';
  }
}


function syncPokerPlayerMode() {
  const select = $('poker-player-select');
  const wrap = $('poker-player-custom-wrap');
  const input = $('poker-player-custom');
  const isCustom = String(select?.value || '') === '__custom__';
  if (wrap) wrap.hidden = !isCustom;
  if (input) {
    input.required = isCustom;
    if (!isCustom) input.value = '';
  }
}

function selectedPokerPlayer(formData) {
  const selected = String(formData.get('playerSelect') || '').trim();
  const custom = String(formData.get('playerCustom') || '').trim();
  if (selected === '__custom__') return custom;
  return selected;
}

function renderPokerPlayerOptions(players = []) {
  const select = $('poker-player-select');
  if (!select) return;
  const current = String(select.value || '');
  const options = ['<option value="">Select player…</option>'];
  (players || []).forEach((name) => {
    const safe = String(name || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    options.push(`<option value="${safe}">${safe}</option>`);
  });
  options.push('<option value="__custom__">Other (type manually)…</option>');
  select.innerHTML = options.join('');

  if (current && Array.from(select.options).some((o) => o.value === current)) {
    select.value = current;
  } else {
    select.value = '';
  }
  syncPokerPlayerMode();
}

async function refreshPokerPlayerOptions() {
  try {
    const out = await req(API.pokerPlayers);
    renderPokerPlayerOptions(out.players || []);
  } catch {
    renderPokerPlayerOptions([]);
  }
}

function parseCsvUsernames(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const parseCells = (line) => line.split(',').map((c) => String(c || '').trim().replace(/^"|"$/g, ''));

  // Accept one-line comma-separated username lists:
  // user1,user2,user3,...
  if (lines.length === 1) {
    const single = parseCells(lines[0]).filter(Boolean);
    const looksLikeHeaderOnly = single.length <= 3 && single.every((v) => ['username', 'player', 'name'].includes(v.toLowerCase()));
    if (single.length > 1 && !looksLikeHeaderOnly) {
      const seen = new Set();
      return single.filter((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  const header = parseCells(lines[0]).map((h) => h.toLowerCase());
  const preferred = ['username', 'player', 'name'];
  let idx = header.findIndex((h) => preferred.includes(h));

  const out = [];
  const start = idx >= 0 ? 1 : 0;
  if (idx < 0) idx = 0;

  for (let i = start; i < lines.length; i += 1) {
    const cells = parseCells(lines[i]);
    const name = String(cells[idx] || '').trim();
    if (!name) continue;
    out.push(name);
  }

  const seen = new Set();
  return out.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyPokerBulkFromQuery(){
  const box = $('poker-bulk-lines');
  if (!box) return;
  const params = new URLSearchParams(window.location.search || '');
  const bulkLines = params.get('bulkLines');
  if (!bulkLines) return;

  box.value = bulkLines;

  const eventName = String(params.get('eventName') || '').trim();
  if (eventName) {
    const preset = $('poker-event-preset');
    const custom = $('poker-event-custom');
    const known = ['Nightly 500gtd', 'Nightly 700gtd', 'Sunday 1300gtd'];
    if (preset) {
      if (known.includes(eventName)) {
        preset.value = eventName;
      } else {
        preset.value = 'custom';
        if (custom) custom.value = eventName;
      }
      syncPokerEventMode();
    }
  }

  setPokerResultMsg('warn', 'Bulk lines prefilled from URL. Review and click Import Bulk Results.');
}

pokerEventPreset?.addEventListener('change', syncPokerEventMode);
$('poker-player-select')?.addEventListener('change', syncPokerPlayerMode);
syncPokerEventMode();
syncPokerPlayerMode();
applyPokerBulkFromQuery();

function selectedPokerEventName(formData){
  const eventPreset = String(formData.get('eventPreset') || 'Nightly 500gtd').trim();
  const eventNameCustom = String(formData.get('eventNameCustom') || '').trim();
  const eventName = eventPreset === 'custom' ? eventNameCustom : eventPreset;
  return { eventPreset, eventNameCustom, eventName };
}

$('poker-result-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }
  const f = new FormData(e.target);
  const player = String(selectedPokerPlayer(f) || '').trim();
  const points = Number(f.get('points'));
  const { eventPreset, eventNameCustom, eventName } = selectedPokerEventName(f);
  const finalTable = f.get('finalTable') !== null;
  const cashed = f.get('cashed') !== null;

  if (!player) { setPokerResultMsg('err','Player is required.'); return; }
  if (!Number.isFinite(points) || points < 0) { setPokerResultMsg('err','Enter a valid points value.'); return; }
  if (eventPreset === 'custom' && !eventNameCustom) { setPokerResultMsg('err','Enter a custom event name.'); return; }

  try {
    await req(API.pokerResults, {
      method: 'POST',
      body: JSON.stringify({ player, points, finalTable, cashed, eventName, createdAt: Date.now() })
    });

    let top='';
    let tail='';
    try {
      const lbWeek = await req(`${API.pokerLeaderboard}?range=week`);
      const first = (lbWeek.leaderboard || [])[0];
      if (first) top = ` Top this week: ${first.player} (${Number(first.points||0).toFixed(2).replace(/\.00$/,'')}).`;
    } catch {}
    try {
      const lbAll = await req(`${API.pokerLeaderboard}?range=all`);
      tail = ` All-time events now: ${Number(lbAll?.stats?.events || 0)}.`;
    } catch {}

    setPokerResultMsg('ok', `Single import successful: added 1 result for ${player} (${eventName || 'event not set'}).${tail}${top}`);
    e.target.reset();
    syncPokerEventMode();
    syncPokerPlayerMode();
    refreshPokerPlayerOptions().catch(()=>{});
  } catch (err) {
    setPokerResultMsg('err', `Single import failed: ${err.message || 'Request failed.'}`);
  }
});

function parsePokerBulkRows(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  // Primary mode: one row per line (or semicolon-separated)
  let rows = text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((x) => x.trim());
      return { player: String(parts[0] || ''), points: Number(parts[1]), rank: Number(parts[2]), raw: line };
    })
    .filter((r) => r.player || Number.isFinite(r.points));

  // Fallback mode: single-line triples separated by spaces, e.g.
  // "MILLLZZ,814.05,1 OneLook,488.43,2 AllinSam,325.62,3"
  if (rows.length <= 1) {
    const matches = [...text.matchAll(/([^,\n;]+?),\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+))?/g)];
    if (matches.length >= 2) {
      rows = matches.map((m) => ({
        player: String(m[1] || '').trim(),
        points: Number(m[2]),
        rank: Number(m[3]),
        raw: m[0]
      }));
    }
  }

  return rows;
}

$('poker-bulk-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }

  const formData = new FormData(e.target);
  const raw = String(formData.get('bulkLines') || '');
  const rows = parsePokerBulkRows(raw);
  const parentFormData = new FormData($('poker-result-form'));
  const { eventPreset, eventNameCustom, eventName } = selectedPokerEventName(parentFormData);
  const finalTableDefault = parentFormData.get('finalTable') !== null;
  const cashedDefault = parentFormData.get('cashed') !== null;

  if (!rows.length) { setPokerResultMsg('err', 'Paste at least one valid row.'); return; }
  if (eventPreset === 'custom' && !eventNameCustom) { setPokerResultMsg('err','Enter a custom event name first.'); return; }

  const results = [];
  const errors = [];
  rows.forEach((row, idx) => {
    const player = String(row.player || '').trim();
    const points = Number(row.points);
    const rank = Number(row.rank);
    if (!player || !Number.isFinite(points) || points < 0) {
      errors.push(`Line ${idx + 1} invalid: ${row.raw}`);
      return;
    }
    results.push({
      player,
      points,
      finalTable: finalTableDefault,
      cashed: cashedDefault,
      eventName,
      createdAt: Date.now(),
      ...(Number.isFinite(rank) && rank > 0 ? { eventRank: rank } : {})
    });
  });

  if (!results.length) { setPokerResultMsg('err', errors[0] || 'No valid rows to import.'); return; }

  try {
    const out = await req(API.pokerResults, { method: 'POST', body: JSON.stringify({ results }) });
    let tail = '';
    try {
      const lb = await req(`${API.pokerLeaderboard}?range=all`);
      tail = ` All-time events now: ${Number(lb?.stats?.events || 0)}.`;
    } catch {}
    const successCount = Number(out?.added || results.length);
    const failCount = errors.length;
    const failedPreview = failCount ? ` Failed lines: ${errors.slice(0, 3).join(' | ')}${failCount > 3 ? ' ...' : ''}` : '';
    const summary = `Bulk import successful: ${successCount} added.${failCount ? ` Failed/skipped: ${failCount}.` : ' Failed/skipped: 0.'}${tail}${failedPreview}`;
    setPokerResultMsg(failCount ? 'warn' : 'ok', summary);
    refreshPokerPlayerOptions().catch(()=>{});
  } catch (err) {
    setPokerResultMsg('err', err.message || 'Request failed.');
  }
});

$('poker-result-clear-btn')?.addEventListener('click', () => {
  const f = $('poker-result-form');
  if (f) f.reset();
  syncPokerEventMode();
  syncPokerPlayerMode();
  const msg = $('poker-result-msg');
  if (msg) { msg.textContent = ''; msg.classList.remove('msg-ok','msg-warn','msg-err'); }
});

$('poker-bulk-clear-btn')?.addEventListener('click', () => {
  const box = $('poker-bulk-lines');
  if (box) box.value = '';
  const msg = $('poker-result-msg');
  if (msg) { msg.textContent = ''; msg.classList.remove('msg-ok','msg-warn','msg-err'); }
});


$('poker-players-import-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }

  const textBox = $('poker-players-csv-text');
  const fileInput = $('poker-players-csv-file');
  let csvText = String(textBox?.value || '').trim();

  if (!csvText && fileInput?.files?.[0]) {
    try {
      csvText = await fileInput.files[0].text();
    } catch {
      setPokerResultMsg('err','Could not read CSV file.');
      return;
    }
  }

  const names = parseCsvUsernames(csvText);
  if (!names.length) {
    setPokerResultMsg('err','No usernames found in CSV. Include username/player/name column or first column of names.');
    return;
  }

  try {
    const out = await req(API.pokerPlayersImport, { method: 'POST', body: JSON.stringify({ names }) });
    await refreshPokerPlayerOptions();
    setPokerResultMsg('ok', `Imported ${Number(out?.added || 0)} usernames. Player autofill list now has ${Number(out?.total || 0)} names.`);
  } catch (err) {
    setPokerResultMsg('err', err.message || 'Username import failed.');
  }
});

$('poker-players-import-clear-btn')?.addEventListener('click', () => {
  const t = $('poker-players-csv-text');
  const f = $('poker-players-csv-file');
  if (t) t.value = '';
  if (f) f.value = '';
});
