const API_ROOTS=['/api'];
const API={fixtures:'/fixtures',tips:'/tips',tipEditDeadline:'/tips/edit-deadline',ladder:'/ladder',ladderMember:(member)=>`/ladder/${encodeURIComponent(member)}`,bossesBet:'/bosses-bet',milestones:'/milestones',jackpot:'/jackpot',puntersOverview:(tier='free')=>`/punters/overview?tier=${encodeURIComponent(tier)}`,puntersClaim:'/punters/claims',puntersBanter:'/punters/banter',register:'/register',login:'/login',logout:'/logout',me:'/me',profile:'/profile',passwordReset:'/password-recovery/reset',passwordResetRequest:'/password-reset/request',passwordResetConfirm:'/password-reset/confirm'};
const tokenKey='bbb-token-v3';
const trackKey='bbb-punters-track-v1';
const qs = new URLSearchParams(location.search);
const explicitTrackFromUrl = qs.get('trackId') || qs.get('track') || '';
const storedTrack = localStorage.getItem(trackKey) || '';
const trackFromUrl = explicitTrackFromUrl || storedTrack || 'thoroughbreds';
const PREFILL = (typeof window !== 'undefined' && window.__PUNTERS_PREFILL__) ? window.__PUNTERS_PREFILL__ : null;
const state={token:localStorage.getItem(tokenKey)||null,user:null,existingByRace:new Map(),raceCount:12,raceRunners:{},nextTipRace:'R1',lastTipInteractionAt:0,selectedBreakdownMember:'',tipStateResolved:false,tierView:'free',lastOverview:null,isJackpotEligible:false,roundStatus:'OPEN',roundPhase:'OPEN_FOR_TIPS',tipsEditableNow:true,trackId:String(trackFromUrl),refreshInFlight:false,trackResolved:Boolean(explicitTrackFromUrl)};
const $=id=>document.getElementById(id);
const PUNTERS_API_CACHE_KEY='bbb-punters-api-cache-v1';

function readPuntersApiCache(){ return {}; }
function writePuntersApiCache(_path, _data){ /* disabled to prevent tab freeze risk */ }
function getPuntersApiCache(_path, _maxAgeMs=5*60*1000){ return null; }

(function prunePuntersApiCache(){
  try { localStorage.removeItem(PUNTERS_API_CACHE_KEY); } catch {}
})();

function getRunnerNameByRaceSelection(race='R1', selection='') {
  const raceId = String(race || '').toUpperCase();
  const sel = String(selection || '').trim();
  if (!raceId || !sel) return '';
  const rows = state.raceRunners?.[raceId]?.runners || [];
  const hit = rows.find((r) => String(r?.runnerNumber || '') === sel || String(r?.rawBlock || '').startsWith(`${sel} `));
  return String(hit?.horseName || '').trim();
}

function formatSelectionText(race='R1', selection='—', runnerName='') {
  const sel = String(selection || '—');
  const name = String(runnerName || getRunnerNameByRaceSelection(race, sel) || '').trim();
  return name ? `#${sel} • ${name}` : `#${sel}`;
}

async function req(path,opt={}){
  const h={'Content-Type':'application/json',...(opt.headers||{})};
  if(state.token)h.Authorization=`Bearer ${state.token}`;
  const method = String(opt.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  let lastErr='';
  for(const root of API_ROOTS){
    for(let attempt=0;attempt<2;attempt+=1){
      try{
        const r=await fetch(`${root}${path}`,{...opt,headers:h,credentials:'same-origin'});
        const d=await r.json().catch(()=>({}));
        if(r.ok){
          if (isGet) writePuntersApiCache(path, d);
          return d;
        }
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
  if (isGet) {
    const cached = getPuntersApiCache(path);
    if (cached) return cached;
  }
  throw new Error(lastErr||'Request failed');
}

async function resolveTrackContext(){
  if (state.trackResolved || explicitTrackFromUrl) return;
  const tracks = ['greyhounds', 'thoroughbreds'];
  try {
    const results = await Promise.all(tracks.map((trackId)=>
      req(`${API.puntersOverview('free')}&trackId=${encodeURIComponent(trackId)}`)
        .then((d)=>({ trackId, roundStatus: String(d?.round?.status || 'CLOSED').toUpperCase(), roundPhase: String(d?.round?.phase || 'BETWEEN_ROUNDS').toUpperCase() }))
        .catch(()=>({ trackId, roundStatus: 'CLOSED', roundPhase: 'BETWEEN_ROUNDS' }))
    ));
    const open = results.find((r)=>r.roundStatus === 'OPEN' && r.roundPhase !== 'BETWEEN_ROUNDS');
    const candidate = open || results.find((r)=>r.roundStatus === 'OPEN') || results.find((r)=>r.roundPhase !== 'BETWEEN_ROUNDS');
    if (candidate?.trackId) state.trackId = candidate.trackId;
  } finally {
    state.trackResolved = true;
    try { localStorage.setItem(trackKey, String(state.trackId || 'thoroughbreds')); } catch {}
  }
}

function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function applyTableCards(){document.querySelectorAll('.table-wrap').forEach((wrap)=>{const table=wrap.querySelector('table');if(!table)return;const heads=[...table.querySelectorAll('thead th')].map((th)=>th.textContent.trim());if(!heads.length)return;const rowCount=table.querySelectorAll('tbody tr').length;const sig=`${heads.join('|')}::${rowCount}`;if(wrap.dataset.cardSig===sig)return;wrap.dataset.cardSig=sig;wrap.classList.add('table-cards');table.querySelectorAll('tbody tr').forEach((tr)=>{[...tr.children].forEach((td,i)=>{if(!td.getAttribute('data-label'))td.setAttribute('data-label',heads[i]||'Value');});});});}

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

function renderLeaderboardSkeleton(){
  const body = $('leaderboard-body');
  if (!body) return;
  body.innerHTML = `<tr><td colspan='4' class='muted'>Fetching leaderboard…</td></tr>`;
}

function renderLeaderboard(rows){
  const body = $('leaderboard-body');
  if(!body) return;
  body.innerHTML='';
  (rows||[]).forEach((r)=>{
    const tr=document.createElement('tr');
    const tierBadge = String(r.tier || '').toUpperCase() === 'JACKPOT'
      ? " <span class='pill'>💰 Jackpot Eligible</span>"
      : '';
    tr.innerHTML=`<td>${r.rank}</td><td><button class='btn btn-ghost' type='button' data-member='${encodeURIComponent(String(r.member || ''))}'>${esc(r.member)}</button>${tierBadge}</td><td>${r.points == null ? '—' : r.points}</td><td>${(r.winners ?? r.correct) == null ? '—' : (r.winners ?? r.correct)}</td>`;
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

  const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const historyRows = (data?.winnerHistory || []).slice(0, 12);

  const formatRoundLabel = (row) => {
    const raceDateRaw = String(row?.raceDate || '').trim();
    if (raceDateRaw) {
      const parsed = new Date(raceDateRaw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
      }
      return raceDateRaw;
    }
    const ts = Number(row?.archivedAt || 0);
    if (Number.isFinite(ts) && ts > 0) {
      return new Date(ts).toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(row?.weekLabel || 'Round —');
  };

  const snapshotHref = (row) => {
    const id = String(row?.roundId || row?.id || '').trim();
    return id ? `/punters-club/results/${encodeURIComponent(id)}` : '/punters.html#round-recap';
  };

  const featured = data?.featuredWinner || historyRows[0] || null;
  const recentRollover = historyRows.find((r) => Boolean(r?.rolledOver)) || null;

  if(!featured){
    winnerCard.innerHTML = "<p class='muted'>No weekly winner recorded yet.</p>";
  } else {
    const label = formatRoundLabel(featured);
    const isRollover = Boolean(featured.rolledOver);
    const winnerName = isRollover ? 'No outright winner' : String(featured.member || '—');
    const points = Number(featured.points || 0);
    const winners = Number(featured.winners || 0);
    const prize = Number(featured.prize ?? featured.points ?? 0);
    winnerCard.innerHTML = `
      <article class='card winners-feature-card ${isRollover ? 'is-rollover' : 'is-paid'}'>
        <p class='next-tip-kicker'>Latest Result</p>
        <h3 class='winners-feature-name'>${esc(winnerName)}</h3>
        <p class='muted'>${esc(label)}</p>
        <p class='winners-feature-prize'>${money.format(prize)}</p>
        <div class='row-actions'>
          <span class='pill'>${points} pts</span>
          <span class='pill'>${winners} winners</span>
          <span class='pill ${isRollover ? 'chip-red' : ''}'>${isRollover ? 'Rollover' : 'Paid ✅'}</span>
        </div>
        <div class='row-actions'>
          <a class='btn chip-btn' href='${snapshotHref(featured)}'>View Round Snapshot</a>
          <a class='btn btn-ghost' href='/punters-club/results'>View Full Archive</a>
        </div>
      </article>
      ${recentRollover ? `
      <article class='card winners-rollover-card'>
        <p class='next-tip-kicker'>Rollover Round ⚠️</p>
        <h4>${esc(formatRoundLabel(recentRollover))}</h4>
        <p class='muted'>No outright winner — jackpot rolls over</p>
        <p class='winners-feature-prize'>${money.format(Number(recentRollover.prize ?? 0))}</p>
        <div class='row-actions'>
          <span class='pill chip-red'>Rollover</span>
        </div>
        <p class='muted'>Rollover keeps the pot honest. Next round gets bigger.</p>
        <div class='row-actions'>
          <a class='btn btn-ghost' href='${snapshotHref(recentRollover)}'>View Round Snapshot</a>
        </div>
      </article>` : ''}
    `;
  }

  const statRounds = $('proof-stat-rounds');
  const statPaid = $('proof-stat-paid');
  const statRoll = $('proof-stat-rollovers');
  const paidTotal = historyRows.filter((r) => !r?.rolledOver).reduce((sum, r) => sum + Number(r?.prize ?? 0), 0);
  const rolloverCount = historyRows.filter((r) => Boolean(r?.rolledOver)).length;
  if (statRounds) statRounds.textContent = `${historyRows.length}`;
  if (statPaid) statPaid.textContent = money.format(paidTotal);
  if (statRoll) statRoll.textContent = `${rolloverCount}`;

  const promoRounds = $('promo-stat-rounds');
  const promoPaid = $('promo-stat-paid');
  const promoStreak = $('promo-top-streak');
  const promoBiggest = $('promo-biggest-payout');
  const promoRolloverRate = $('promo-rollover-rate');
  const promoUniqueWinners = $('promo-unique-winners');
  const promoLatestWinner = $('promo-latest-winner');
  const topStreak = (data?.streakLeaderboard || [])[0];
  const paidRows = historyRows.filter((r) => !Boolean(r?.rolledOver));
  const biggestPayout = paidRows.reduce((max, r) => Math.max(max, Number(r?.prize ?? 0)), 0);
  const uniqueWinners = new Set(paidRows.map((r) => String(r?.member || '').trim().toLowerCase()).filter(Boolean));
  const rolloverRate = historyRows.length ? Math.round((rolloverCount / historyRows.length) * 100) : 0;
  const latestWinnerRow = paidRows[0] || historyRows[0] || null;

  if (promoRounds) promoRounds.textContent = `${historyRows.length}`;
  if (promoPaid) promoPaid.textContent = money.format(paidTotal);
  if (promoStreak) promoStreak.textContent = topStreak ? `${topStreak.member} (${Number(topStreak.currentStreak || 0)} week streak)` : 'No streak data yet';
  if (promoBiggest) promoBiggest.textContent = money.format(biggestPayout);
  if (promoRolloverRate) promoRolloverRate.textContent = `${rolloverRate}%`;
  if (promoUniqueWinners) promoUniqueWinners.textContent = `${uniqueWinners.size}`;
  if (promoLatestWinner) {
    const latestName = String(latestWinnerRow?.member || '').trim() || '—';
    const latestPrize = Number(latestWinnerRow?.prize ?? 0);
    promoLatestWinner.textContent = latestName === '—' ? '—' : `${latestName} (${money.format(latestPrize)})`;
  }

  winnerHistory.innerHTML='';
  historyRows.slice(0,8).forEach((row)=>{
    const tr=document.createElement('tr');
    const isRollover = Boolean(row.rolledOver);
    const winnerCell = isRollover ? `${esc(row.member || '-')} ⚠️` : esc(row.member || '-');
    tr.innerHTML=`<td><a class='menu-link' href='${snapshotHref(row)}'>${esc(formatRoundLabel(row))}</a></td><td>${winnerCell}</td><td><span class='pill ${isRollover ? 'chip-red' : ''}'>${isRollover ? 'Rollover' : 'Paid'}</span></td><td>${money.format(Number((row.prize ?? row.points ?? 0)))}</td><td><a class='btn btn-ghost tiny-btn' href='${snapshotHref(row)}'>📸 Snapshot</a></td>`;
    winnerHistory.appendChild(tr);
  });
  if(!historyRows.length){
    const tr=document.createElement('tr');
    tr.innerHTML="<td colspan='5' class='muted'>No winners archived yet.</td>";
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
  const summary = $('bosses-summary');
  const descVal = $('bosses-freeroll-value');
  const promoVal = $('promo-freeroll-value');
  const rulesVal = $('rules-bosses-freeroll');
  const eligibility = $('bosses-eligibility-note');
  if(!wrap || !overall) return;

  const data = bb || {};
  const status = String(data.status || data.overall || 'live').toUpperCase();
  overall.textContent = status;
  overall.classList.remove('chip-red','bosses-status-live','bosses-status-won','bosses-status-lost','bosses-status-void');
  if (status === 'LOST') overall.classList.add('chip-red','bosses-status-lost');
  else if (status === 'WON') overall.classList.add('bosses-status-won');
  else if (status === 'VOID') overall.classList.add('bosses-status-void');
  else overall.classList.add('bosses-status-live');

  const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const freerollPrize = Number(data.freerollPrize || 0);
  const freerollText = freerollPrize > 0 ? money.format(freerollPrize) : 'TBA';
  if (descVal) descVal.textContent = freerollText;
  if (promoVal) promoVal.textContent = freerollText;
  if (rulesVal) rulesVal.textContent = freerollText;
  if (eligibility) eligibility.textContent = String(data.eligibilityNote || 'Eligible = all players who entered tips this week before lock.');

  const updatedAt = Number(data.updatedAt || 0);
  const lockTime = Number(data.lockTime || 0);
  if (summary) {
    summary.innerHTML = `
      <article class='card'><h3>${esc(String(data.weekKey || 'Current round'))}</h3><p class='muted'>${esc(String(data.title || 'Bosses Multi'))}</p></article>
      <article class='card'><h3>${esc(String(data.meet || 'Track TBA'))}</h3><p class='muted'>Current tipping track</p></article>
      <article class='card'><h3>PLACE</h3><p class='muted'>Bet type (all legs)</p></article>
      <article class='card'><h3>${esc(String(data.stake || '—'))}</h3><p class='muted'>Stake</p></article>
      <article class='card'><h3>${esc(String(data.potentialReturn || '—'))}</h3><p class='muted'>Potential return</p></article>
      <article class='card'><h3>${esc(freerollText)}</h3><p class='muted'>Freeroll Prize</p></article>
      <article class='card'><h3>${lockTime>0?esc(new Date(lockTime).toLocaleString('en-AU',{timeZone:'Australia/Melbourne', dateStyle:'medium', timeStyle:'short'})):'—'}</h3><p class='muted'>Lock (Melbourne)</p></article>
      <article class='card'><h3>${updatedAt>0?esc(new Date(updatedAt).toLocaleTimeString('en-AU',{timeZone:'Australia/Melbourne',hour:'2-digit',minute:'2-digit'})):'—'}</h3><p class='muted'>Last updated (Melbourne)</p></article>
    `;
  }

  const legItems = Array.isArray(data.legItems) ? data.legItems : [];
  const fallbackFromProgress = (data.progress || []).filter((l)=>l?.inMulti).map((l, idx)=>(
    { legNumber: idx+1, race: l.race, selection: l.selection || '', betType: 'W/P', odds: '', result: String(l.status || 'PENDING').toUpperCase() }
  ));
  const rows = legItems.length ? legItems : fallbackFromProgress;

  wrap.innerHTML = '';
  if (!rows.length) {
    wrap.innerHTML = "<tr><td colspan='4' class='muted'>No Bosses Multi legs configured yet.</td></tr>";
    return;
  }

  rows.forEach((leg, idx)=>{
    const resultRaw = String(leg.result || 'PENDING').toUpperCase();
    const result = resultRaw === 'PLACED' ? 'WON' : (resultRaw === 'MISSED' ? 'LOST' : resultRaw);
    const tr = document.createElement('tr');
    const raceKey = String(leg.race || '').toUpperCase();
    const selRaw = String(leg.selection || '').trim();
    const selNo = selRaw.match(/(\d{1,2})/)?.[1] || '';
    const raceRows = state.raceRunners?.[raceKey]?.runners || [];
    const hit = raceRows.find((r)=> String(r?.runnerNumber || '') === String(selNo));
    const runnerName = String(hit?.horseName || '').trim();
    const selectionText = runnerName ? `${selRaw || `#${selNo}`} • ${runnerName}` : (selRaw || '—');
    const oddsText = String(leg.odds || '').trim() || (hit?.prices?.place != null ? String(hit.prices.place) : (hit?.prices?.win != null ? String(hit.prices.win) : '—'));
    const legRace = `Leg ${Number(leg.legNumber || idx + 1)} · ${esc(leg.race || 'Race —')}`;
    tr.innerHTML = `<td>${legRace}</td><td>${esc(selectionText)}</td><td>${esc(oddsText)}</td><td><span class='pill ${result==='LOST'?'chip-red':''}'>${esc(result)}</span></td>`;
    wrap.appendChild(tr);
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

    const imported = state.raceRunners?.[race]?.runners || [];
    const opts=['<option value="">—</option>'];
    if (imported.length) {
      imported.forEach((r) => {
        const num = String(r?.runnerNumber || '').trim();
        const horse = String(r?.horseName || '').trim();
        const barrier = r?.barrier == null ? '' : ` (B${r.barrier})`;
        const win = r?.prices?.win == null ? '' : ` • Win ${r.prices.win}`;
        const place = r?.prices?.place == null ? '' : ` • Plc ${r.prices.place}`;
        const labelCore = `${num || '?'} ${horse}`.trim();
        const label = `${labelCore}${barrier}${win}${place}`.trim();
        const value = num || String(labelCore.match(/#?(\d{1,2})/)?.[1] || '');
        const disabled = r?.isScratched ? 'disabled' : '';
        const scr = r?.isScratched ? ' [SCR]' : '';
        if (value) opts.push(`<option value="${esc(value)}" ${disabled}>${esc(label + scr)}</option>`);
      });
    }
    if (opts.length === 1) {
      for(let n=1;n<=24;n+=1) opts.push(`<option>${n}</option>`);
    }

    row.innerHTML=`<label for='${selectId}'><strong>${race}</strong><span class='muted' style='position:absolute;left:-9999px'> selection</span></label><select id='${selectId}' name='${race}' aria-label='${race} selection'>${opts.join('')}</select>`;
    const selEl = row.querySelector('select');
    selEl?.addEventListener('change', () => { state.nextTipRace = race; renderRaceMarket(race); });
    wrap.appendChild(row);
  }
}

function getRaceFavoriteText(race='R1') {
  const rows = state.raceRunners?.[String(race).toUpperCase()]?.runners || [];
  const fav = rows.filter((r)=>!r?.isScratched && Number.isFinite(Number(r?.prices?.win))).sort((a,b)=>Number(a.prices.win)-Number(b.prices.win))[0];
  return fav ? `Fav: ${fav.horseName} (${fav.prices.win})` : '';
}

function renderRaceMarket(race = state.nextTipRace || 'R1') {
  const raceId = String(race || 'R1').toUpperCase();
  const raceTag = $('race-market-race');
  const top = $('race-market-top');
  const body = $('race-market-body');
  const sort = $('race-market-sort')?.value || 'order';
  if (!raceTag || !top || !body) return;

  raceTag.textContent = raceId;
  const imported = state.raceRunners?.[raceId]?.runners || [];
  if (!imported.length) {
    top.textContent = 'Top of market: —';
    body.innerHTML = "<tr><td colspan='5' class='muted'>No imported runners for this race yet.</td></tr>";
    return;
  }

  const rows = [...imported];
  if (sort === 'odds') rows.sort((a,b)=>((a?.isScratched?9999:Number(a?.prices?.win||9999)) - (b?.isScratched?9999:Number(b?.prices?.win||9999))));
  else if (sort === 'barrier') rows.sort((a,b)=>(Number(a?.barrier||999)-Number(b?.barrier||999)));
  else if (sort === 'name') rows.sort((a,b)=>String(a?.horseName||'').localeCompare(String(b?.horseName||'')));

  const favs = imported
    .filter((r)=>!r?.isScratched && Number.isFinite(Number(r?.prices?.win)))
    .sort((a,b)=>Number(a.prices.win)-Number(b.prices.win))
    .slice(0,3);
  top.textContent = favs.length
    ? `Top of market: ${favs.map((r,i)=>`${i+1}) ${r.horseName} (${r.prices.win})`).join(' • ')}`
    : 'Top of market: no active odds available';

  body.innerHTML = '';
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    const scr = Boolean(r?.isScratched);
    const isFav = favs.some((f)=>f.horseName===r.horseName);
    tr.className = `${scr?'scr-row':''} ${isFav?'fav-row':''}`.trim();
    tr.innerHTML = `<td>${esc(`${r?.runnerNumber || idx+1}. ${r?.horseName || '—'}`)}</td><td>${r?.barrier ?? '—'}</td><td>${r?.prices?.win ?? '—'}</td><td>${r?.prices?.place ?? '—'}</td><td><span class='pill ${scr?'chip-red':''}'>${scr?'SCR':'Active'}</span></td>`;
    body.appendChild(tr);
  });
}

function markTipInteraction(){ state.lastTipInteractionAt = Date.now(); }
function tipInteractionActive(){ return (Date.now() - Number(state.lastTipInteractionAt || 0)) < 20000; }

function setVisible(el, show) {
  if (!el) return;
  el.hidden = !show;
  el.style.display = show ? '' : 'none';
}

function fmtHHMMSS(ms) {
  if (!Number.isFinite(ms)) return '--:--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderNextTipInlineStatus(overviewData, tipDeadlineRes, fixtures) {
  const stateEl = $('next-tip-inline-state');
  const jackpotEl = $('next-tip-inline-jackpot');
  const meetEl = $('next-tip-inline-meet');
  const lockEl = $('next-tip-inline-lock');
  if (!stateEl || !jackpotEl || !meetEl || !lockEl) return;

  const status = String(overviewData?.round?.status || 'OPEN').toUpperCase();
  const phase = String(overviewData?.round?.phase || '').toUpperCase();
  const betweenRounds = phase === 'BETWEEN_ROUNDS' || (status !== 'OPEN' && !overviewData?.round?.id);

  stateEl.textContent = status === 'OPEN' ? '🟢 Open now' : '🔴 Closed';
  jackpotEl.textContent = betweenRounds
    ? '💰 Jackpot: Pending next round'
    : `💰 Jackpot live: $${Number(overviewData?.jackpot?.totalPot || 0).toFixed(0)}`;
  const meet = betweenRounds ? '—' : String((fixtures?.[0]?.track || fixtures?.[0]?.event || '').trim() || '—');
  meetEl.textContent = `🏁 Meet: ${meet}`;

  const lockAt = Number(tipDeadlineRes?.effectiveDeadlineMs || tipDeadlineRes?.lockAtMs || 0);
  lockEl.textContent = betweenRounds
    ? '🔒 Lock: Pending'
    : `🔒 Lock: ${lockAt > 0 ? fmtHHMMSS(lockAt - Date.now()) : '--:--:--'}`;
}


function wireTierTabs(){
  document.querySelectorAll('.tier-tab').forEach((btn)=>{
    btn.classList.toggle('active', String(btn.dataset.tierView||'free')===state.tierView);
    btn.onclick = async () => {
      state.tierView = String(btn.dataset.tierView || 'free');
      wireTierTabs();
      await refresh();
    };
  });
}

function renderTierStrip(overview){
  if(!overview) return;
  const tierPill = $('tier-pill');
  const paidPill = $('paid-count-pill');
  const potPill = $('pot-pill');
  if(tierPill) tierPill.textContent = `View: ${state.tierView === 'paid' ? 'JACKPOT ELIGIBLE' : 'FREE'}`;
  if(paidPill) paidPill.textContent = `Jackpot Eligible: ${Number(overview?.tiers?.jackpotEligible || 0)}`;
  if(potPill) potPill.textContent = `Pot: $${Number(overview?.jackpot?.totalPot || 0).toFixed(0)}`;
}

function renderUpgradeButtonState(){
  const btn = $('upgrade-tier-btn');
  if(!btn) return;
  if(state.roundStatus !== 'OPEN'){
    btn.textContent = 'Round finished ✅';
    btn.disabled = true;
    btn.classList.add('btn-ghost');
    return;
  }
  if(state.isJackpotEligible){
    btn.textContent = 'You’re in ✅';
    btn.disabled = true;
    btn.classList.add('btn-ghost');
    return;
  }
  btn.textContent = 'Upgrade to Jackpot Eligible';
  btn.disabled = false;
  btn.classList.remove('btn-ghost');
}

function renderRoundMeta(overview){
  const betweenRounds = state.roundPhase === 'BETWEEN_ROUNDS';
  const lockWholeEntry = state.roundStatus !== 'OPEN' || !state.tipsEditableNow || betweenRounds;
  const quickTipsCard = $('quick-tips-entry-card');
  const raceMarket = $('race-market-card');
  const bossesCard = $('bosses-bet-card');
  if (quickTipsCard) quickTipsCard.style.display = lockWholeEntry ? 'none' : '';
  if (raceMarket) {
    raceMarket.style.display = betweenRounds ? 'none' : '';
    raceMarket.hidden = betweenRounds;
  }
  // Keep Bosses Multi tracker visible at all times (pre-lock + post-lock).
  if (bossesCard) bossesCard.style.display = '';

  const finalLabel = $('final-results-label');
  if(finalLabel){
    finalLabel.hidden = !overview?.frozen;
  }

  const winnerBanner = $('winner-banner');
  if (winnerBanner) winnerBanner.hidden = !overview?.winnerBanner;
  if (overview?.winnerBanner){
    $('winner-banner-name').textContent = overview.winnerBanner.member || 'tofu';
    $('winner-banner-range').textContent = overview.winnerBanner.dateRange || '';
    $('winner-banner-pot').textContent = `Pot: $${Number(overview.winnerBanner.pot || 0).toFixed(2)}`;
    $('winner-banner-line').textContent = overview.winnerBanner.oneLiner || '';
  }

  const recap = $('round-recap');
  if (recap) recap.hidden = !overview?.recap;
  const top3Body = $('round-recap-top3');
  if (overview?.recap && top3Body){
    top3Body.innerHTML = '';
    (overview.recap.top3 || []).forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${idx+1}</td><td>${esc(row.member || '-')}</td><td>${Number(row.points || 0)}</td>`;
      top3Body.appendChild(tr);
    });
    $('round-recap-summary').textContent = `${overview.recap.winner} won • ${overview.recap.totalEntries} entries • ${overview.recap.paidEntries} paid • Pot $${Number(overview.recap.finalPot||0).toFixed(2)} • ${overview.recap.statusText || ''}`;
  }

  const teaser = $('next-round-teaser');
  if (teaser) teaser.hidden = !overview?.nextRoundTeaser;
  if (overview?.nextRoundTeaser){
    $('next-round-teaser-text').textContent = overview.nextRoundTeaser.title || 'Next Punters Club opens Friday afternoon';
    $('next-round-teaser-venue').textContent = overview.nextRoundTeaser.venue || 'Venue TBA';
  }

  const past = $('past-rounds-list');
  if (past){
    const rounds = overview?.pastRounds || [];
    if (!rounds.length){
      past.innerHTML = ``;
    } else {
      past.innerHTML = rounds.map((r)=>`<a class='menu-link' href='/punters-club/results/${encodeURIComponent(r.id)}'>${esc(r.label || r.id)} — Winner: ${esc(r.winner || '—')}</a>`).join('');
    }
  }
}

function getCurrentRoundPoolText() {
  const pot = Number(state?.lastOverview?.jackpot?.totalPot || 0);
  if (!Number.isFinite(pot) || pot <= 0) return 'Current round prize pool: TBA';
  return `Current round prize pool (incl. jackpot): $${Math.round(pot)}`;
}

function generateWinningScenarios({ userRank, userPoints, leaderPoints, gapToFirst, remainingRaces, nextUserPick, ladderRows }) {
  const lines = [];
  const safeGap = Number.isFinite(gapToFirst) ? gapToFirst : null;
  const safeRemaining = Number.isFinite(remainingRaces) ? remainingRaces : null;
  const clustered = Array.isArray(ladderRows) && Number.isFinite(userPoints)
    ? ladderRows.filter((r) => Math.abs(Number(r?.points || 0) - userPoints) <= 2).length >= 4
    : false;

  if (safeGap != null && safeGap <= 0) {
    lines.push('You’re leading. A clean finish keeps pressure on the chasers.');
  } else if (safeGap != null && safeGap <= 1) {
    lines.push('You’re within striking distance of 1st — one result could swing the lead.');
  } else if (safeGap != null && safeGap <= 3) {
    lines.push(`You’re ${safeGap} pts off top. One strong race likely pulls you right back in.`);
  } else if (safeGap != null) {
    lines.push(`You’re ${safeGap} pts behind 1st. You’ll need a sharp final run to challenge.`);
  }

  if (safeRemaining != null && safeRemaining <= 2) {
    lines.push('Final stretch: with 2 or fewer races left, every place result is critical.');
  }

  if (clustered) {
    lines.push('Tight ladder: multiple punters are clustered within 1–2 points.');
  }

  if (nextUserPick) {
    lines.push(`Your next pick (${nextUserPick}) is a key swing spot for your ladder position.`);
  }

  if (!lines.length) lines.push('You’re still live. Watch the next race and ladder movement for opportunities.');
  return lines.slice(0, 4);
}

function renderMemberCockpit(data = {}) {
  const wrap = $('member-cockpit');
  const scen = $('member-scenarios');
  if (!wrap || !scen) return;

  const betweenRounds = state.roundPhase === 'BETWEEN_ROUNDS';
  const roundClosed = state.roundStatus !== 'OPEN';

  if (!state.user || betweenRounds || roundClosed) {
    wrap.hidden = true;
    scen.hidden = true;
    return;
  }

  wrap.hidden = false;
  scen.hidden = false;

  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const rank = Number(data.userRank || 0);
  const points = Number(data.userPoints || 0);
  const gap = Number(data.gapToFirst);

  setText('mc-rank', rank > 0 ? `#${rank}` : '—');
  setText('mc-points', Number.isFinite(points) ? `${points} pts` : '—');
  setText('mc-gap', !Number.isFinite(gap) ? '—' : gap <= 0 ? (rank === 1 ? 'Leading' : 'Tied for 1st') : `-${gap} pts`);
  setText('mc-remaining', Number.isFinite(data.remainingRaces) ? `${Math.max(0, data.remainingRaces)} left` : '—');

  const jackpotChip = $('mc-jackpot-chip');
  if (jackpotChip) {
    const jackpotText = data.isJackpotEligible ? 'Jackpot Eligible ✅' : 'FREE / Upgrade Available';
    jackpotChip.textContent = jackpotText;
    jackpotChip.classList.toggle('chip-red', !data.isJackpotEligible);
  }

  const bossesChip = $('mc-bosses-chip');
  if (bossesChip) {
    bossesChip.textContent = data.bossesStatus || '—';
    bossesChip.classList.toggle('chip-red', String(data.bossesStatus || '').toLowerCase().includes('not'));
  }

  const meta = $('member-round-meta');
  if (meta) {
    const bits = [];
    if (data.submittedAtText) bits.push(`Submitted: ${data.submittedAtText}`);
    if (data.roundLabel) bits.push(`Round: ${data.roundLabel}`);
    meta.textContent = bits.length ? bits.join(' • ') : 'Your live position this round.';
  }

  const list = $('member-scenarios-list');
  if (list) {
    const scenarios = generateWinningScenarios(data);
    list.innerHTML = '';
    scenarios.forEach((line) => {
      const li = document.createElement('li');
      li.className = 'member-cockpit__scenario';
      li.textContent = line;
      list.appendChild(li);
    });
  }
}

function applyPuntersStateVisibility(mode = 'logged-out') {
  const split = $('next-tip-entry-split');
  const leaderboard = $('leaderboard');
  const liveSnap = $('punters-live-snapshot');
  const howItWorks = $('punters-how-it-works');
  const loginGate = $('punters-login-gate');

  const set = (el, on) => { if (el) el.hidden = !on; };

  if (mode === 'logged-out') {
    set(loginGate, true);
    set(split, false);
    set(leaderboard, true);
    set(liveSnap, false);
    set(howItWorks, true);
    return;
  }

  if (mode === 'round-closed') {
    set(loginGate, false);
    set(split, false);
    set(leaderboard, true);
    set(liveSnap, true);
    set(howItWorks, true);
    return;
  }

  if (mode === 'no-entry') {
    set(loginGate, false);
    set(split, true);
    set(leaderboard, true);
    set(liveSnap, true);
    set(howItWorks, false);
    return;
  }

  // live-entered
  set(loginGate, false);
  set(split, true);
  set(leaderboard, true);
  set(liveSnap, true);
  set(howItWorks, false);
}

function renderPuntersViewState() {
  const title = $('punters-state-title');
  const copy = $('punters-state-copy');
  const cta = $('punters-state-cta');
  if (!title || !copy || !cta) return;

  if (!state.user) {
    title.textContent = 'Join this week’s round';
    copy.textContent = 'Register or log in once, then submit tips and track your leaderboard position.';
    cta.textContent = 'Register / Log In';
    cta.href = '/punters.html#punters-login-gate';
    applyPuntersStateVisibility('logged-out');
    return;
  }

  if (state.roundStatus !== 'OPEN' || state.roundPhase === 'BETWEEN_ROUNDS') {
    title.textContent = 'Round closed';
    copy.textContent = 'This round is complete. Check winners and recap while we prep the next round.';
    cta.textContent = 'View Winners & Recap';
    cta.href = '/winners.html';
    applyPuntersStateVisibility('round-closed');
    return;
  }

  if (state.existingByRace.size === 0) {
    title.textContent = 'You’re in — now enter your tips';
    copy.textContent = 'Round is live and you have no saved tips yet. Enter now before lock.';
    cta.textContent = 'Enter Tips';
    cta.href = '/punters.html#tip-form';
    applyPuntersStateVisibility('no-entry');
    return;
  }

  title.textContent = 'Round live — tips submitted';
  copy.textContent = `You’ve entered ${state.existingByRace.size} race${state.existingByRace.size===1?'':'s'}. Track ladder and lock timer below.`;
  cta.textContent = 'View Live Leaderboard';
  cta.href = '/punters.html#leaderboard';
  applyPuntersStateVisibility('live-entered');
}

function renderTipEntryState() {
  const entryCard = $('quick-tips-entry-card');
  const form = $('tip-form');
  const summaryCard = $('tips-locked-summary');
  const summaryText = $('tips-locked-summary-text');
  const editBtn = $('tips-edit-btn');
  if (!form || !summaryCard || !summaryText) return;

  if (!state.user) {
    setVisible(entryCard, false);
    renderPuntersViewState();
    return;
  }
  setVisible(entryCard, true);

  if (!state.tipStateResolved) {
    setVisible(summaryCard, true);
    summaryText.textContent = 'Checking your saved tips…';
    setVisible(form, false);
    if (editBtn) editBtn.hidden = true;
    renderPuntersViewState();
    return;
  }

  if (state.roundPhase === 'BETWEEN_ROUNDS') {
    setVisible(entryCard, false);
    renderPuntersViewState();
    return;
  }

  if (state.roundStatus !== 'OPEN') {
    setVisible(summaryCard, true);
    summaryText.textContent = 'Round finished ✅';
    setVisible(form, false);
    if (editBtn) editBtn.hidden = true;
    renderPuntersViewState();
    return;
  }

  if (!state.tipsEditableNow) {
    const picks = Array.from(state.existingByRace.entries())
      .sort((a,b)=>Number(String(a[0]).replace('R',''))-Number(String(b[0]).replace('R','')))
      .map(([race,sel])=>({ race, text: formatSelectionText(race, sel) }));
    const picksHtml = picks.length
      ? `<span class='tips-summary-grid'>${picks.map((p)=>`<span class='tips-summary-pill'><strong>${esc(p.race)}</strong><span>${esc(p.text)}</span></span>`).join('')}</span>`
      : '<span class="muted">No saved tips found.</span>';

    setVisible(summaryCard, true);
    summaryText.innerHTML = `Tips are locked for this round 🔒 • ${esc(getCurrentRoundPoolText())}<div style='margin-top:.4rem'>${picksHtml}</div>`;
    setVisible(form, false);
    if (editBtn) editBtn.hidden = true;
    renderPuntersViewState();
    return;
  }

  // logged-out state handled at top (entry card hidden)

  const count = state.existingByRace.size;
  const fullByFixture = state.raceCount > 0 && count >= state.raceCount;

  const enteredRaceNums = Array.from(state.existingByRace.keys())
    .map((r) => Number(String(r || '').replace('R', '')))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const maxEnteredRace = enteredRaceNums.length ? enteredRaceNums[enteredRaceNums.length - 1] : 0;
  const contiguousFromStart = enteredRaceNums.every((n, i) => n === i + 1);
  // Fallback: if fixture raceCount is stale but user has a full contiguous set (e.g. R1..R10),
  // treat as complete and collapse form.
  const fullByContiguousSet = contiguousFromStart && count >= 10 && count === maxEnteredRace;

  const full = fullByFixture || fullByContiguousSet;
  if (!full) {
    setVisible(summaryCard, false);
    setVisible(form, true);
    if (editBtn) editBtn.hidden = true;
    renderPuntersViewState();
    return;
  }

  const picks = Array.from(state.existingByRace.entries())
    .sort((a,b)=>Number(String(a[0]).replace('R',''))-Number(String(b[0]).replace('R','')))
    .map(([race,sel])=>({ race, text: formatSelectionText(race, sel) }));

  summaryText.innerHTML = picks.length
    ? `<span class='tips-summary-grid'>${picks.map((p)=>`<span class='tips-summary-pill'><strong>${esc(p.race)}</strong><span>${esc(p.text)}</span></span>`).join('')}</span>`
    : 'All races entered.';
  setVisible(summaryCard, true);
  setVisible(form, false);
  if (editBtn) editBtn.hidden = false;
  renderPuntersViewState();
}

async function hydrateNextTipCard(trackId){
  const card = $('next-tip-punters-card');
  const primary = $('next-tip-punters-primary');
  const secondary = $('next-tip-punters-secondary') || { hidden: true, textContent: '', href: '' };
  const badge = $('next-tip-punters-badge');
  const countdown = $('next-tip-punters-countdown');
  const race = $('next-tip-punters-race');
  const context = $('next-tip-punters-context');
  const lockline = $('next-tip-punters-lockline');
  const pick = $('next-tip-punters-pick');
  const social = $('next-tip-punters-social');
  if(!card || !primary || !badge || !countdown || !race || !context || !pick || !social) return;
  const setSocial = (text='', opts={}) => {
    const suppressFav = Boolean(opts?.suppressFav);
    const fav = suppressFav ? '' : getRaceFavoriteText(state.nextTipRace || 'R1');
    social.textContent = fav ? `${text} • ${fav}` : text;
  };
  const setLockline = (text = '') => {
    if (!lockline) return;
    lockline.textContent = text;
    lockline.style.display = text ? '' : 'none';
  };

  if(!state.user){
    card.hidden = true;
    return;
  }

  card.hidden = false;
  card.className = 'card next-tip-card next-tip-card--tease';
  card.classList.remove('countdown-pulse');
  badge.textContent = 'MEMBER PREVIEW';
  race.textContent = 'Loading your next race tip…';
  context.textContent = 'Punters Club • Member card';
  pick.textContent = '#—';
  setLockline('');
  setSocial('Syncing your member card…');
  countdown.style.display = 'none';
  countdown.textContent = '';
  primary.textContent = 'Open Tip Form';
  primary.href = '/punters.html#tip-form';
  secondary.hidden = true;

  // Signed-in users should never see a login CTA.
  setSocial('Syncing your member card…');
  primary.textContent = 'Open Tip Form';
  primary.href = '/punters.html#tip-form';

  try{
    let d = await req(`/punters/next-tip-summary?trackId=${encodeURIComponent(trackId || 'thoroughbreds')}`);
    if (String(d?.state || '') === 'ERROR' || (!d?.raceNumber && String(d?.roundStatus || '').toUpperCase() !== 'CLOSED')) {
      const lg = await req(`/punters/next-tip?trackId=${encodeURIComponent(trackId || 'thoroughbreds')}`);
      d = {
        roundStatus: lg?.roundStatus,
        trackName: lg?.trackName,
        venue: lg?.venue || lg?.fixture?.track || lg?.fixture?.event || '',
        raceNumber: lg?.nextRace,
        startTime: lg?.startAtMs || null,
        lockTime: lg?.lockAtMs || null,
        userHasTip: Boolean(lg?.hasTip),
        userPick: lg?.tip || null,
        canEdit: Boolean(lg?.editable),
        othersCount: 0,
        ladderRank: null,
        ladderRankAvailable: false,
        state: lg?.allComplete || String(lg?.roundStatus || '').toUpperCase() === 'CLOSED'
          ? 'ROUND_COMPLETE'
          : (lg?.hasTip ? (lg?.editable ? 'EDITABLE' : 'LOCKED') : 'MISSING_TIP')
      };

      if (String(d?.roundStatus || '').toUpperCase() === 'CLOSED') {
        d.state = 'ROUND_COMPLETE';
        d.userHasTip = false;
      }

      // Last-resort salvage: if APIs are degraded but user has tips, do NOT show false "No tip entered".
      if (String(d?.roundStatus || '').toUpperCase() !== 'CLOSED' && (String(d?.state || '') === 'ERROR' || (!d?.userHasTip && !d?.raceNumber))) {
        const tipsAll = await req(`/tips?status=all&trackId=${encodeURIComponent(trackId || 'thoroughbreds')}`);
        const mine = (tipsAll?.tips || [])
          .filter((t) => String(t.status || '') !== 'removed')
          .filter((t) => String(t.member || '').trim().toLowerCase() === String(state.user?.username || '').trim().toLowerCase())
          .sort((a,b)=>Number(String(a.race||'R999').replace('R',''))-Number(String(b.race||'R999').replace('R','')));
        if (mine.length) {
          const settled = new Set(Object.keys(state?.lastOverview?.raceResults || {}).map((r)=>String(r||'').toUpperCase()));
          let nextRace = null;
          for (let i = 1; i <= state.raceCount; i += 1) {
            const race = `R${i}`;
            if (!settled.has(race)) { nextRace = race; break; }
          }
          const chosenRace = nextRace || String(mine[0].race || 'R1').toUpperCase();
          const chosenTip = mine.find((t) => String(t.race || '').toUpperCase() === chosenRace) || mine[0];
          d.userHasTip = Boolean(chosenTip);
          d.userPick = chosenTip;
          d.raceNumber = chosenRace;
          d.state = state.tipsEditableNow ? 'EDITABLE' : 'LOCKED';
          d.canEdit = Boolean(state.tipsEditableNow);
          d.trackName = d.trackName || 'Track';
          d.venue = d.venue || 'Venue TBA';
        }
      }
    }
    const now = Date.now();
    const toLock = Number(d?.lockTime || 0) - now;
    const toStart = Number(d?.startTime || 0) - now;
    const activeCountdown = [toLock, toStart].filter((n) => Number.isFinite(n) && n > 0).sort((a,b)=>a-b)[0] || 0;
    const mm = String(Math.max(0, Math.floor(activeCountdown/60000))).padStart(2,'0');
    const ss = String(Math.max(0, Math.floor((activeCountdown%60000)/1000))).padStart(2,'0');
    const imminent = activeCountdown > 0 && activeCountdown < 60000;
    const isBetweenRounds = String(d?.roundPhase || state.roundPhase || '').toUpperCase() === 'BETWEEN_ROUNDS';
    countdown.style.display = (!isBetweenRounds && activeCountdown > 0) ? '' : 'none';
    countdown.textContent = (!isBetweenRounds && activeCountdown > 0) ? `${mm}:${ss}` : '';
    const raceNum = Number(String(d?.raceNumber || '').replace('R',''));
    const raceLabel = Number.isFinite(raceNum) && raceNum > 0 ? `Race ${raceNum}` : (isBetweenRounds ? 'Next round pending' : 'Race');
    state.nextTipRace = Number.isFinite(raceNum) && raceNum > 0 ? `R${raceNum}` : state.nextTipRace;
    renderRaceMarket(state.nextTipRace);
    const apiVenue = String(d?.venue || '').trim();
    const fallbackVenue = String(state?.lastOverview?.fixtures?.[0]?.track || state?.fixture?.track || '').trim();
    const venue = (!isBetweenRounds && apiVenue && !/^venue\s*tba$/i.test(apiVenue)) ? apiVenue : (isBetweenRounds ? 'Track' : (fallbackVenue || 'Track'));
    race.textContent = venue && venue !== 'Track' ? `${raceLabel} — ${venue}` : raceLabel;
    const baseTrackType = String(d?.trackName || '').toLowerCase().includes('grey') ? 'Greyhounds' : 'Thoroughbreds';
    const trackType = isBetweenRounds ? String(d?.nextMeet?.trackName || baseTrackType || 'Next track') : baseTrackType;
    context.textContent = venue && venue !== 'Track' ? `${trackType} • ${venue} meeting` : `${trackType} meeting`;
    const lockRef = Number(d?.lockTime || 0);
    const hardLocked = lockRef > 0 && now >= lockRef;
    const canEditEffective = Boolean(d?.canEdit) && !hardLocked;
    if (isBetweenRounds) {
      context.textContent = `${trackType} • Between rounds`;
      setLockline('');
    } else if (lockRef > 0 && !hardLocked) {
      context.textContent = `${trackType} • Locks in ${mm}:${ss} (Melbourne)`;
      setLockline('');
    } else if (lockRef > 0 && hardLocked) {
      context.textContent = `${trackType} • Locked ${new Date(lockRef).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
      setLockline('');
    } else {
      context.textContent = `${trackType} • ${venue} meeting`;
      setLockline('');
    }

    if (isBetweenRounds) {
      const raceMarket = $('race-market-card');
      if (raceMarket) raceMarket.style.display = 'none';
    }

    if(String(d?.state||'')==='ROUND_COMPLETE'){
      card.className = 'card next-tip-card next-tip-card--closed';
      if (isBetweenRounds) {
        badge.textContent = 'BETWEEN ROUNDS';
        race.textContent = `${trackType} • Next meet pending`;
        pick.textContent = '✅ Last round settled • Waiting for admin to publish next meet';
        const nextLabel = String(d?.nextMeet?.dateLabel || d?.fixture?.date || '').trim();
        setSocial(`Next scheduled round: ${String(d?.nextMeet?.trackName || trackType)}${nextLabel ? ` • ${nextLabel}` : ''}. Review final leaderboard, archive snapshots, and confirm your $20 eligibility.`, { suppressFav: true });
        primary.textContent = 'View Last Results';
        primary.href = '/punters.html#leaderboard';
        secondary.hidden = false;
        secondary.textContent = 'Browse Archive';
        secondary.href = '/punters.html#proof-archive';
      } else {
        badge.textContent = 'ROUND COMPLETE';
        pick.textContent = '#—';
        setSocial('Next round opens soon.');
        primary.textContent = 'View Results';
        primary.href = '/punters.html#leaderboard';
        secondary.hidden = true;
      }
      return;
    }

    if(!d?.userHasTip){
      card.className = `card next-tip-card ${imminent ? 'next-tip-card--imminent' : 'next-tip-card--missing'}`;
      if (imminent) card.classList.add('countdown-pulse');
      badge.textContent = imminent ? 'LOCK IMMINENT' : (canEditEffective ? 'NO TIP ENTERED' : 'LOCKED');
      pick.textContent = '#—';
      const others = Number(d?.othersCount || 0);
      const positionText = d?.ladderRankAvailable && d?.ladderRank && d?.ladderSize
        ? `You’re in position ${d.ladderRank} of ${d.ladderSize} on the leaderboard`
        : '';
      setSocial(positionText || (others <= 0 ? `No tips locked yet` : `${others} punter${others===1?'':'s'} locked`));
      primary.textContent = canEditEffective ? 'Add Tip Now' : 'Full Card';
      primary.href = canEditEffective ? '/punters.html#tip-form' : '/punters.html#leaderboard';
      return;
    }

    pick.textContent = `Your Selection: ${formatSelectionText(state.nextTipRace || 'R1', String(d?.userPick?.selection || '—'), String(d?.userPick?.runnerName || d?.userPick?.horse || ''))}`;
    const others = Number(d?.othersCount || 0);
    const positionText = d?.ladderRankAvailable && d?.ladderRank && d?.ladderSize
      ? `You’re in position ${d.ladderRank} of ${d.ladderSize} on the leaderboard`
      : '';
    social.textContent = positionText || (others <= 0 ? `You’re first on the card` : `You + ${others} others locked`);

    if(imminent && canEditEffective){
      card.className = 'card next-tip-card next-tip-card--imminent';
      card.classList.add('countdown-pulse');
      badge.textContent = 'LOCK IMMINENT';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = true;
            return;
    }

    if(canEditEffective){
      card.className = 'card next-tip-card next-tip-card--warn';
      badge.textContent = 'EDITABLE';
      primary.textContent = 'Edit';
      primary.href = '/punters.html#tip-form';
      secondary.hidden = true;
            return;
    }

    card.className = 'card next-tip-card next-tip-card--highlight';
    badge.textContent = 'LOCKED IN';
    primary.textContent = 'Full Card';
    primary.href = '/punters.html#leaderboard';
    secondary.hidden = true;
  }catch{
    try {
      const lg = await req(`/punters/next-tip?trackId=${encodeURIComponent(trackId || 'thoroughbreds')}`);
      const isBetweenRounds = String(lg?.roundPhase || '').toUpperCase() === 'BETWEEN_ROUNDS';
      const raceNum = Number(String(lg?.nextRace || '').replace('R',''));
      const raceLabel = Number.isFinite(raceNum) && raceNum > 0 ? `Race ${raceNum}` : (isBetweenRounds ? 'Next meet pending' : 'Race');
      const trackType = String(lg?.trackName || '').toLowerCase().includes('grey') ? 'Greyhounds' : 'Thoroughbreds';
      const apiVenue = String(lg?.venue || lg?.fixture?.track || lg?.fixture?.event || '').trim();
      const fallbackVenue = String(state?.lastOverview?.fixtures?.[0]?.track || state?.fixture?.track || '').trim();
      const venue = (!isBetweenRounds && apiVenue && !/^venue\s*tba$/i.test(apiVenue)) ? apiVenue : (isBetweenRounds ? '' : (fallbackVenue || ''));
      race.textContent = venue ? `${raceLabel} — ${venue}` : raceLabel;
      context.textContent = isBetweenRounds ? `${trackType} • Between rounds` : (venue ? `${trackType} • ${venue} meeting` : `${trackType} meeting`);
      const ms = Math.max(0, Number(lg?.countdownToMs || 0) - Date.now());
      const mm = String(Math.floor(ms/60000)).padStart(2,'0');
      const ss = String(Math.floor((ms%60000)/1000)).padStart(2,'0');
      countdown.style.display = '';
      countdown.textContent = `${mm}:${ss}`;
      setLockline(ms > 0 ? `Locks in ${mm}:${ss} (Melbourne time)` : '');
      if (isBetweenRounds) {
        card.className = 'card next-tip-card next-tip-card--closed';
        badge.textContent = 'BETWEEN ROUNDS';
        pick.textContent = '✅ Last round settled • Waiting for admin to publish next meet';
        social.textContent = 'Check leaderboard + archive while next meeting is being set.';
        primary.textContent = 'View Last Results';
        primary.href = '/punters.html#leaderboard';
        secondary.hidden = false;
        secondary.textContent = 'Browse Archive';
        secondary.href = '/punters.html#proof-archive';
      } else if (lg?.hasTip) {
        card.className = `card next-tip-card ${lg?.editable ? 'next-tip-card--warn' : 'next-tip-card--highlight'}`;
        badge.textContent = lg?.editable ? 'EDITABLE' : 'LOCKED IN';
        pick.textContent = `Your Selection: ${formatSelectionText(state.nextTipRace || 'R1', String(lg?.tip?.selection || '—'), String(lg?.tip?.runnerName || lg?.tip?.horse || ''))}`;
        const others = Number(lg?.othersCount || 0);
        social.textContent = others <= 0 ? 'You’re first on the card' : `You + ${others} others locked`;
        primary.textContent = lg?.editable ? 'Edit' : 'Full Card';
        primary.href = lg?.editable ? '/punters.html#tip-form' : '/punters.html#leaderboard';
      }
    } catch {}
  }
}

function renderBanterWall(items=[]){
  const list = $('banter-list');
  const status = $('banter-wall-status');
  const submitBtn = $('banter-submit-btn');
  if (!list) return;
  const locked = !state.tipsEditableNow || state.roundStatus === 'CLOSED';
  if (status) {
    status.textContent = locked
      ? 'Lock is in — drop your recap + brag rights below.'
      : 'Wall opens after lock. Get your tip in first.';
  }
  if (submitBtn) submitBtn.disabled = !locked || !state.user;

  const rows = Array.isArray(items) ? items.slice(0, 12) : [];
  if (!rows.length) {
    list.innerHTML = `<p class='muted'>${locked ? 'No banter posted yet. Be first.' : 'No banter yet. Wall opens after lock.'}</p>`;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const who = esc(row?.member || 'Punter');
    const tip = esc(row?.tip || '');
    const brag = esc(row?.brag || '');
    const when = Number(row?.createdAt || 0);
    const ts = Number.isFinite(when) && when > 0
      ? new Date(when).toLocaleString('en-AU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
      : '';
    return `<article class='banter-item'><p><strong>${who}</strong> <span class='muted'>${esc(ts)}</span></p>${tip ? `<p class='meta'>Tip: ${tip}</p>` : ''}${brag ? `<p>${brag}</p>` : ''}</article>`;
  }).join('');
}

async function refresh(){
  if (state.refreshInFlight) return;
  await resolveTrackContext();
  try { localStorage.setItem(trackKey, String(state.trackId || 'thoroughbreds')); } catch {}
  state.refreshInFlight = true;
  state.tipStateResolved = false;
  renderTipEntryState();
  renderLeaderboardSkeleton();
  const compactFallback = $('leaderboard-fallback-card');
  if (compactFallback) compactFallback.hidden = true;
  try {
  const isEditingTips = tipInteractionActive() || !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
  let fx,tp,allTipsRes,bossesRes,milestonesRes,tipDeadlineRes;
  const overview = await req(`${API.puntersOverview(state.tierView)}&trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`).catch(() => (PREFILL?.overview || null));
  const paidOverview = state.user
    ? await req(`${API.puntersOverview('paid')}&trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`).catch(() => null)
    : null;
  state.lastOverview = overview || state.lastOverview;
  state.raceRunners = (overview || state.lastOverview)?.raceRunners || state.raceRunners || {};
  state.roundStatus = String((overview || state.lastOverview)?.round?.status || 'OPEN').toUpperCase();
  const roundIdNow = String((overview || state.lastOverview)?.round?.id || '').trim();
  const apiPhase = String((overview || state.lastOverview)?.round?.phase || '').trim();
  state.roundPhase = String(apiPhase || (!roundIdNow || state.roundStatus !== 'OPEN' ? 'BETWEEN_ROUNDS' : 'OPEN_FOR_TIPS')).toUpperCase();
  const rulesJackpot = $('rules-jackpot-value');
  if (rulesJackpot && (overview || state.lastOverview)) rulesJackpot.textContent = `$${Number((overview||state.lastOverview)?.jackpot?.totalPot || 0).toFixed(0)}`;
  renderTierStrip(overview || state.lastOverview);
  renderRoundMeta(overview || state.lastOverview);
  wireTierTabs();

  try {
    [fx,tp,allTipsRes,bossesRes,milestonesRes,tipDeadlineRes]=await Promise.all([
      req(`${API.fixtures}?trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`),
      req(`${API.tips}?status=all&trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`),
      req(`${API.tips}?status=all&trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`),
      req(`${API.bossesBet}?trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`),
      req(`${API.milestones}?trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`),
      req(`${API.tipEditDeadline}?trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`)
    ]);
  } catch (err) {
    if (PREFILL) {
      fx = PREFILL.fixtures || { fixtures: overview?.fixtures || [] };
      tp = PREFILL.tips || { tips: overview?.tipsFeed || [] };
      allTipsRes = PREFILL.tips || tp;
      bossesRes = PREFILL.bossesBet || { bossesBet: {} };
      milestonesRes = PREFILL.milestones || {};
      tipDeadlineRes = PREFILL.tipEditDeadline || { editableNow: true };
      const tipMsg = $('tip-msg');
      if (tipMsg) tipMsg.textContent = 'Using preloaded data (live sync unavailable on this device).';
    } else {
      const status = $('leaderboard-status');
      if (status) status.textContent = 'Syncing';
      const msg = String(err?.message || 'Request failed');
      const tipMsg = $('tip-msg');
      if (tipMsg) tipMsg.textContent = msg.includes('(404)')
        ? 'Live round sync in progress — refresh in a moment.'
        : 'Live data unavailable right now — refresh in a moment.';
      const ladderFallback = $('ladder-fallback');
      if (ladderFallback) {
        ladderFallback.hidden = false;
        ladderFallback.textContent = msg.includes('(404)')
          ? 'Round data is syncing. Please refresh shortly.'
          : 'Leaderboard data unavailable right now. Please refresh in a moment.';
      }
      const compactFallback = $('leaderboard-fallback-card');
      const compactFallbackCopy = $('leaderboard-fallback-copy');
      if (compactFallback) {
        compactFallback.hidden = false;
        if (compactFallbackCopy) compactFallbackCopy.textContent = 'Showing last known values where available.';
      }
      state.tipStateResolved = true;
      renderTipEntryState();
      return;
    }
  }
  state.tipsEditableNow = Boolean(tipDeadlineRes?.editableNow ?? true);
  const overviewData = overview || state.lastOverview || {};
  renderRoundMeta(overviewData);
  const effectiveFixtures = (overviewData.frozen && Array.isArray(overviewData.fixtures) && overviewData.fixtures.length)
    ? overviewData.fixtures
    : (fx.fixtures || []);
  const fixturesList = $('fixtures-list');
  if (fixturesList) fixturesList.innerHTML='';
  (effectiveFixtures||[]).forEach(f=>{const e=document.createElement('article');e.className='fixture';e.innerHTML=`<strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p>`; if (fixturesList) fixturesList.appendChild(e);});
  const quickFixtureLine = $('quick-fixture-line');
  const nextMeet = (effectiveFixtures || [])[0];
  if (quickFixtureLine) {
    quickFixtureLine.textContent = nextMeet
      ? `Next meet: ${nextMeet.date} • ${nextMeet.track} (${nextMeet.event})`
      : 'Next meet details coming soon.';
  }
  renderNextTipInlineStatus(overviewData, tipDeadlineRes, effectiveFixtures);
  const newRaceCount = Number((fx.fixtures||[])[0]?.raceCount || 12);
  const raceCountChanged = newRaceCount !== state.raceCount;
  state.raceCount = newRaceCount;
  if (raceCountChanged || !document.querySelector('#quick-race-list select')) renderRaceInputs(state.raceCount);
  else renderRaceInputs(state.raceCount);

  const settledRacesForMarket = new Set(Object.keys(overviewData?.raceResults || {}).map((r)=>String(r||'').toUpperCase()));
  let marketRace = null;
  for (let i = 1; i <= state.raceCount; i += 1) {
    const race = `R${i}`;
    if (!settledRacesForMarket.has(race)) { marketRace = race; break; }
  }
  state.nextTipRace = marketRace || `R${Math.max(1, state.raceCount)}`;
  renderRaceMarket(state.nextTipRace || 'R1');
  const ladderFallback = $('ladder-fallback');
  const compactFallback = $('leaderboard-fallback-card');
  const ladderRows = (overview || state.lastOverview)?.ladder || [];
  renderLeaderboard(ladderRows);
  if (compactFallback) compactFallback.hidden = true;
  if (ladderFallback) {
    if (ladderRows.length > 0) {
      ladderFallback.hidden = true;
    } else {
      ladderFallback.hidden = false;
      ladderFallback.textContent = state.roundStatus === 'CLOSED'
        ? 'Round complete — results below. Next venue announced Friday arvo.'
        : 'Leaderboard is warming up — results will appear after races are scored.';
    }
  }
  const status = $('leaderboard-status');
  if (status) {
    if (state.roundStatus === 'CLOSED') {
      status.textContent = 'Round finished ✅';
    } else {
      const settled = new Set(Object.keys(overviewData?.raceResults || {}).map((r)=>String(r||'').toUpperCase()));
      let nextRaceNo = null;
      for (let i = 1; i <= state.raceCount; i += 1) {
        if (!settled.has(`R${i}`)) { nextRaceNo = i; break; }
      }
      status.textContent = nextRaceNo ? `Race ${nextRaceNo}` : ((overview || state.lastOverview)?.round?.label || 'Live');
    }
  }
  renderBossesBet((bossesRes && bossesRes.bossesBet) || overview?.bossesBet || {});
  renderMilestones(milestonesRes || {});
  renderBanterWall(overviewData.banterWall || []);
  if (state.selectedBreakdownMember) {
    loadMemberBreakdown(state.selectedBreakdownMember, false).catch(()=>{});
  }
  const tipsListEl = $('tips-list');
  const tipsCountEl = $('tips-count');
  if (tipsListEl) tipsListEl.innerHTML='';
  const byPunter = new Map();
  const visibleTips = Array.isArray(overviewData.tipsFeed) && overviewData.frozen ? overviewData.tipsFeed : (tp.tips||[]);
  (visibleTips||[]).filter(t=>t.status!=='removed').forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byPunter.has(member)) byPunter.set(member, { picks: new Map(), unpaid: false });
    const row = byPunter.get(member);
    row.picks.set(String(t.race || ''), { selection: String(t.selection || ''), horse: String(t.horse || t.runnerName || '') });
    if (!t.paid) row.unpaid = true;
  });
  const raceOrder = Array.from({length:state.raceCount}, (_,i)=>`R${i+1}`);
  const currentUserLower = String(state.user?.username || '').toLowerCase();
  if (tipsListEl) {
    Array.from(byPunter.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([member, data]) => {
      const picks = data.picks;
      const lines = raceOrder
        .filter((r) => picks.get(r))
        .map((r) => {
          const p = picks.get(r);
          const sel = typeof p === 'string' ? p : p.selection;
          const horse = typeof p === 'string' ? '' : p.horse;
          return `<span>${esc(r)}: <strong>${esc(formatSelectionText(r, sel, horse))}</strong></span>`;
        })
        .join(' • ');
      const e=document.createElement('article');
      const mine = currentUserLower && String(member).toLowerCase() === currentUserLower;
      e.className=`tip${mine ? ' tip-own' : ''}`;
      const reminder = data.unpaid
        ? `<p class='meta unpaid-reminder'>⚠️ Not jackpot-eligible yet. Upgrade path: click <strong>Upgrade to Jackpot Eligible</strong>, pay <strong>$20 via PayID 0421 325 503</strong>, then submit confirmation for admin verification.</p>`
        : "";
      e.innerHTML=`<strong>${esc(member)}</strong>${mine ? " <span class='pill'>You</span>" : ""} <span class='pill'>Locked</span>${data.unpaid ? " <span class='pill unpaid-pill'>UNPAID</span>" : ""}<p class='meta'>${lines || 'No tips yet'}</p>${reminder}`;
      tipsListEl.appendChild(e);
    });
  }
  if (tipsCountEl) tipsCountEl.textContent=`${byPunter.size} punter${byPunter.size===1?'':'s'}`;
  const pcWeeks = $('pc-stat-weeks');
  const pcEntries = $('pc-stat-entries');
  const pcPaid = $('pc-stat-paid');
  const payoutHistory = Array.isArray(milestonesRes?.winnerHistory) ? milestonesRes.winnerHistory : [];
  const recentPayoutTotal = payoutHistory
    .filter((r) => !r?.rolledOver)
    .slice(0, 8)
    .reduce((sum, r) => sum + Number(r?.prize ?? 0), 0);
  const archivedRounds = Array.isArray(overviewData?.pastRounds) && overviewData.pastRounds.length
    ? overviewData.pastRounds.length
    : payoutHistory.length;
  if (pcWeeks) pcWeeks.textContent = String(archivedRounds || '—');
  if (pcEntries) pcEntries.textContent = String(byPunter.size || '—');
  if (pcPaid) pcPaid.textContent = `$${recentPayoutTotal.toFixed(2)}`;
  const communityTipsCard = $('community-tips-card');
  if (communityTipsCard) {
    communityTipsCard.style.display = byPunter.size === 0 ? 'none' : '';
  }

  // Prefill current user's existing tips into quick-entry dropdowns
  // Don't overwrite while someone is actively choosing on mobile.
  if (!isEditingTips) {
    for(let i=1;i<=state.raceCount;i+=1){
      const el=document.querySelector(`#quick-race-list select[name='R${i}']`);
      if(el) el.value='';
    }
  }
  state.existingByRace = new Map();
  state.isJackpotEligible = false;
  let myTipCount = 0;
  let myTips = [];
  if(state.user){
    const currentUser = String(state.user.username || '').toLowerCase();
    const mine=(allTipsRes.tips||[]).filter(t=>String(t.member||'').toLowerCase()===currentUser && t.status!=='removed');
    myTips = mine;
    state.isJackpotEligible = mine.some((t)=>Boolean(t.paid));
    const latestByRace=new Map();
    for(const t of mine){
      if(!latestByRace.has(t.race)) latestByRace.set(t.race,t);
    }
    myTipCount = latestByRace.size;
    latestByRace.forEach((t,race)=>{
      state.existingByRace.set(race, String(t.selection||''));
      if (!isEditingTips) {
        const el=document.querySelector(`#quick-race-list select[name='${race}']`);
        if(el) el.value=String(t.selection||'');
      }
    });
  }

  const pokerLiveNudge = $('poker-live-nudge');
  if (pokerLiveNudge) {
    pokerLiveNudge.textContent = myTipCount > 0
      ? 'You tipped this week — tonight’s poker seat is live.'
      : 'Lock your tips first, then jump into tonight’s poker seat when you’re ready.';
  }

  const userKey = String(state.user?.username || '').toLowerCase();
  const personalLadderRows = Array.isArray(paidOverview?.ladder) ? paidOverview.ladder : (ladderRows || []);
  const userRow = (personalLadderRows || []).find((r) => String(r?.member || '').toLowerCase() === userKey) || null;
  const leaderPoints = Number((personalLadderRows || [])[0]?.points || (ladderRows || [])[0]?.points || 0);
  const userPoints = Number(userRow?.points || 0);
  const userRank = Number(userRow?.rank || 0);
  const gapToFirst = Number.isFinite(leaderPoints) && Number.isFinite(userPoints) ? (leaderPoints - userPoints) : NaN;
  const settledCount = Object.keys(overviewData?.raceResults || {}).length;
  const remainingRacesRaw = Number(overviewData?.round?.remainingRaces);
  const remainingRaces = Number.isFinite(remainingRacesRaw)
    ? remainingRacesRaw
    : (Number.isFinite(state.raceCount) ? Math.max(0, state.raceCount - settledCount) : NaN);
  const latestTipTs = myTips.reduce((mx, t) => Math.max(mx, Number(t?.updatedAt || t?.createdAt || t?.submittedAt || 0)), 0);
  const submittedAtText = latestTipTs > 0
    ? new Date(latestTipTs).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit' })
    : '';
  const settledRaces = new Set(Object.keys(overviewData?.raceResults || {}).map((r)=>String(r||'').toUpperCase()));
  let focusRace = null;
  for (let i = 1; i <= state.raceCount; i += 1) {
    const race = `R${i}`;
    if (!settledRaces.has(race)) { focusRace = race; break; }
  }
  const nextUserPick = focusRace ? (state.existingByRace.get(focusRace) || '') : '';
  const bossesStatus = myTipCount > 0 ? 'Eligible ✅' : (state.tipsEditableNow ? 'Not entered' : 'Not eligible');
  renderMemberCockpit({
    userRank,
    userPoints,
    leaderPoints,
    gapToFirst,
    remainingRaces,
    isJackpotEligible: state.isJackpotEligible,
    bossesStatus,
    nextUserPick: nextUserPick ? `${focusRace || 'Next'} #${nextUserPick}` : '',
    ladderRows: personalLadderRows,
    submittedAtText,
    roundLabel: String(nextMeet?.track || overviewData?.round?.label || '')
  });

  renderUpgradeButtonState();
  await hydrateNextTipCard(String(overviewData?.track?.id || 'thoroughbreds'));

  state.tipStateResolved = true;
  renderTipEntryState();
  applyTableCards();

  $('auth-controls').innerHTML=state.user?`<span class='profile-chip'><img src='${esc(getProfile().profilePic || '/assets/default-avatar.svg')}' alt='' class='profile-chip-avatar'/> <a class='pill' href='/profile' style='text-decoration:none'>${esc(state.user.username)}</a><a class='menu-link' href='/profile#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<a class='menu-link' href='/punters.html#punters-login-gate'>Log in</a>`;
  const loginGate = $('punters-login-gate');
  if (loginGate) loginGate.hidden = Boolean(state.user);
  const loginCtaWrap = $('punters-login-cta-wrap');
  if (loginCtaWrap) loginCtaWrap.hidden = Boolean(state.user);
  const adminNav = $('admin-nav-link');
  if (adminNav) adminNav.style.display = state.user?.role === 'admin' ? 'inline-block' : 'none';
  const b=$('logout-btn'); if(b)b.onclick=logout;
  renderProfileCard();
  } finally {
    state.refreshInFlight = false;
  }
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

const forgotForm = $('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim();
    const msg = $('forgot-msg');
    try {
      await req(API.passwordResetRequest, { method: 'POST', body: JSON.stringify({ email }) });
      if (msg) msg.textContent = 'If your email exists, a reset link has been sent.';
      forgotForm.reset();
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Could not send reset link.';
    }
  });
}

const resetToken = new URLSearchParams(window.location.search).get('resetToken') || '';
const resetLinkForm = $('reset-link-form');
if (resetLinkForm && resetToken) {
  resetLinkForm.hidden = false;
  resetLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const newPassword = String(f.get('newPassword') || '').trim();
    const msg = $('reset-link-msg');
    try {
      await req(API.passwordResetConfirm, { method: 'POST', body: JSON.stringify({ token: resetToken, newPassword }) });
      if (msg) msg.textContent = 'Password reset successful. You can log in now.';
      const url = new URL(window.location.href);
      url.searchParams.delete('resetToken');
      window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
      setTimeout(() => { resetLinkForm.hidden = true; }, 1000);
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Could not reset password.';
    }
  });
}

// Buy-in vote submission removed: fixed $20 entry is live now.

$('banter-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('banter-form-msg');
  if(!state.user){ if(msg) msg.textContent = 'Log in first.'; return; }
  if(state.tipsEditableNow && state.roundStatus !== 'CLOSED'){ if(msg) msg.textContent = 'Banter opens after lock.'; return; }
  const f = new FormData(e.target);
  const tip = String(f.get('tip') || '').trim();
  const brag = String(f.get('brag') || '').trim();
  if(!tip && !brag){ if(msg) msg.textContent = 'Add a tip or brag line.'; return; }
  try {
    await req(`${API.puntersBanter}?trackId=${encodeURIComponent(state.trackId || 'thoroughbreds')}`, { method:'POST', body: JSON.stringify({ tip, brag, trackId: state.trackId }) });
    e.target.reset();
    if (msg) msg.textContent = 'Posted to Banter Wall ✅';
    await refresh();
  } catch (err) {
    if (msg) msg.textContent = err.message || 'Could not post banter.';
  }
});

$('tip-form').addEventListener('submit',async(e)=>{e.preventDefault();markTipInteraction();if(state.roundStatus!=='OPEN'){$('tip-msg').textContent='Round finished ✅. Tips reopen next round.';return;}if(!state.tipsEditableNow){$('tip-msg').textContent=`Tips are locked for this round 🔒 • ${getCurrentRoundPoolText()}`;return;}if(!state.user){$('tip-msg').textContent='Log in first.';return;}const f=new FormData(e.target);const picks=[];for(let i=1;i<=state.raceCount;i+=1){const race=`R${i}`;const selection=String(f.get(race)||'').trim();if(!selection) continue;const existing=state.existingByRace.get(race)||'';if(selection!==existing) picks.push({race,selection});}if(!picks.length){$('tip-msg').textContent='No changes to save.';return;}try{let updated=0;for(const pick of picks){const r=await req(API.tips,{method:'POST',body:JSON.stringify({...pick, trackId: state.trackId})});if(r.updated) updated+=1;}$('tip-msg').textContent=`Saved ${picks.length} change${picks.length===1?'':'s'}${updated?` (${updated} updated)`:''}.`;await refresh();}catch(err){$('tip-msg').textContent=err.message;}});
$('race-market-sort')?.addEventListener('change', ()=>renderRaceMarket(state.nextTipRace || 'R1'));

const tipForm = $('tip-form');
if (tipForm) {
  ['focusin','pointerdown','touchstart','change','input'].forEach((evt)=>{
    tipForm.addEventListener(evt, markTipInteraction, { passive: true });
  });
}

const tipsEditBtn = $('tips-edit-btn');
if (tipsEditBtn) {
  tipsEditBtn.addEventListener('click', () => {
    const form = $('tip-form');
    const summary = $('tips-locked-summary');
    setVisible(form, true);
    setVisible(summary, false);
    markTipInteraction();
    document.querySelector('#quick-race-list select')?.focus();
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



const claimModal = $('claim-modal');
$('close-claim-modal-btn')?.addEventListener('click', ()=> claimModal?.close());
$('upgrade-tier-btn')?.addEventListener('click', ()=>{
  const msg = $('tip-msg');
  if(state.roundStatus !== 'OPEN'){
    if(msg) msg.textContent = 'Round finished ✅. Upgrades reopen with the next round.';
    return;
  }
  if(!state.user){
    if(msg) msg.textContent = 'Log in first to upgrade.';
    return;
  }
  if(state.isJackpotEligible){
    if(msg) msg.textContent = 'You are already jackpot eligible for this round ✅';
    return;
  }
  const amountInput = document.querySelector('#claim-form input[name="amount"]');
  const noteInput = document.querySelector('#claim-form textarea[name="note"]');
  const ref = `BBB-${String(state.user.username || '').trim().toLowerCase()}`;
  if(amountInput) amountInput.value = '20';
  if(noteInput && !noteInput.value) noteInput.value = ref;
  const refEl = $('claim-ref-format');
  if (refEl) refEl.textContent = ref;
  claimModal?.showModal();
});
$('claim-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = $('claim-msg');
  const submitBtn = $('claim-submit-btn');
  if(!state.user){ if(msg) msg.textContent='Log in first.'; return; }
  const f = new FormData(e.target);
  const note = String(f.get('note')||'').trim();
  if (!note) { if (msg) msg.textContent = 'Add transfer reference (e.g. BBB-username).'; return; }
  try {
    if (submitBtn) submitBtn.disabled = true;
    if (msg) msg.textContent = 'Submitting claim…';
    await req(API.puntersClaim,{method:'POST',body:JSON.stringify({amount:Number(f.get('amount')||0), note})});
    if(msg) msg.textContent = 'Claim submitted for admin review.';
    setTimeout(()=>claimModal?.close(),800);
  } catch (err) {
    if(msg) msg.textContent = err.message || 'Could not submit claim.';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('copy-payid-btn')?.addEventListener('click', async ()=>{
  const val = String($('payid-number')?.textContent || '').trim();
  const out = $('copy-payid-msg');
  if (!val) { if (out) out.textContent = 'PayID unavailable.'; return; }
  try {
    await navigator.clipboard.writeText(val);
    if (out) out.textContent = 'Copied ✅';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = val;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    if (out) out.textContent = 'Copied ✅';
  }
});

$('punters-state-cta')?.addEventListener('click', ()=>{
  if (state.user) return;
  setTimeout(()=>{ document.querySelector('#login-form input[name="member"]')?.focus(); }, 50);
});

(async()=>{
  wirePuntersLeaderboardShare();
  await bootstrap();
  await refresh().catch(()=>{});
  setInterval(()=>{
    if (document.hidden) return;
    if (tipInteractionActive()) return;
    const interacting = !!document.querySelector('#quick-race-list select:focus, #tip-form button:focus');
    if (interacting) return;
    refresh().catch(()=>{});
  },30000);
})();
