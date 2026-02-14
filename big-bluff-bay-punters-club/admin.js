const API_ROOTS=['/api','/punters/api'];
const API={tips:'/tips',fixtures:'/fixtures',results:'/results',bossesBet:'/bosses-bet',bossesBetResults:'/bosses-bet/results',archiveRound:'/archive-round',unlockSatNoon:'/tips/unlock-saturday-noon',tipEditDeadline:'/tips/edit-deadline',login:'/login',logout:'/logout',me:'/me',updateFixture:id=>`/fixtures/${id}`,updateResult:race=>`/results/${race}`,clearResult:race=>`/results/${race}`,updateTip:(id)=>`/tips/${id}`};
const tokenKey='bbb-token-v3';
const state={token:localStorage.getItem(tokenKey)||null,user:null,raceCount:12,raceResults:{},bossesBet:{legs:['R9','R10','R11','R12'],selections:{}},tipsAll:[],popularByRace:{}};
const $=id=>document.getElementById(id);
async function req(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;let lastErr='';for(const root of API_ROOTS){const r=await fetch(`${root}${path}`,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(r.ok)return d;lastErr=d.error||`Request failed (${r.status})`;}throw new Error(lastErr||'Request failed');}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function isAdmin(){return state.user?.role==='admin';}

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
  $('auth-controls').innerHTML=state.user?`<span class='pill'>${esc(state.user.username)} (${esc(state.user.role)})</span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<span class='pill'>Logged out</span>`;
  const b=$('logout-btn'); if(b)b.onclick=logout;
  const adminOnly=$('admin-only');
  const loginCard=$('admin-login-card');
  if(adminOnly) adminOnly.style.display=isAdmin()?'grid':'none';
  if(loginCard) loginCard.style.display=isAdmin()?'none':'block';
  $('admin-list').innerHTML='';
  if(!isAdmin()){ return; }

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

  const p=await req(`${API.tips}?status=all`);
  state.tipsAll = p.tips || [];
  state.popularByRace = computePopularByRace(state.tipsAll);
  renderBossesSuggested(state.popularByRace);
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

(async()=>{await bootstrap();await refresh();})();
