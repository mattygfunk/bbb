(()=>{
  const app=document.getElementById('app');
  const route=location.pathname;

  const fmt=(n)=>Number(n||0).toFixed(1);
  const esc=(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  async function get(url){const r=await fetch(url);return r.json();}

  function setActiveNav(){
    document.querySelectorAll('.pv2-nav a').forEach((a)=>{
      const href=a.getAttribute('href')||'';
      const active = href===route || (href!=='/' && route.startsWith(href));
      a.classList.toggle('active', active);
    });
  }

  function shellIntro(title){
    return `<nav class='pv2-crumbs'><a href='/'>Home</a><span>›</span><a href='/poker'>Poker</a><span>›</span><span>${esc(title)}</span></nav>`;
  }

  function chartLine(points){
    if(!points.length)return '<div class="muted">No trend data yet</div>';
    const w=800,h=180,pad=20;
    const vals=points.map(p=>Number(p.points||0));
    const min=Math.min(...vals),max=Math.max(...vals);
    const sx=(i)=>pad+(i*(w-pad*2)/Math.max(1,points.length-1));
    const sy=(v)=>h-pad-((v-min)/(Math.max(1,max-min)))*(h-pad*2);
    const d=points.map((p,i)=>`${i?'L':'M'}${sx(i)} ${sy(Number(p.points||0))}`).join(' ');
    return `<svg viewBox='0 0 ${w} ${h}' class='pv2-chart'><path d='${d}' fill='none' stroke='#d4af37' stroke-width='3'/></svg>`;
  }

  async function renderHub(){
    const d=await get('/api/poker/dashboard');
    const top=(d.top10||[]).slice(0,10).map(r=>`<tr><td>${r.rank}</td><td><a href='/poker/players/${r.playerId}'>${esc(r.player)}</a></td><td>${fmt(r.points)}</td><td><span class='pill'>FT ${r.finalTables}</span></td><td><span class='pill'>Cash ${r.cashes}</span></td></tr>`).join('');
    app.innerHTML=`${shellIntro('Hub')}
      <section class='pv2-grid'>
        <article class='pv2-card'><h3>Active Players (Season)</h3><p>${d.kpis.activePlayersSeason ?? d.kpis.players ?? 0}</p></article>
        <article class='pv2-card'><h3>Total Results Logged</h3><p>${d.kpis.totalResultsLogged ?? d.kpis.events ?? 0}</p></article>
        <article class='pv2-card'><h3>Avg Points / Result</h3><p>${fmt(d.kpis.avgPointsPerResult ?? d.kpis.avgPoints ?? 0)}</p></article>
        <article class='pv2-card'><h3>Events Tracked</h3><p>${d.kpis.eventsTracked ?? 0}</p><p class='muted'>${esc(d.kpis.activeSeason)}</p></article>
      </section>
      <section class='pv2-card'><h2>Performance Trend</h2>${chartLine(d.trend||[])}</section>
      <section class='pv2-card'><h2>Event Participation</h2><div class='table-wrap'><table><thead><tr><th>Event</th><th>Entries</th></tr></thead><tbody>${(d.eventParticipation||[]).map(e=>`<tr><td>${esc(e.eventName)}</td><td>${e.entries}</td></tr>`).join('')||'<tr><td colspan=2 class=muted>No data</td></tr>'}</tbody></table></div></section>
      <section class='pv2-grid hype'>
        <article class='pv2-card'><h4>Hot Streak</h4><p>${esc(d.hype.hotStreak||'—')}</p></article>
        <article class='pv2-card'><h4>Final Table Machine</h4><p>${esc(d.hype.finalTableMachine?.player||'—')}</p></article>
        <article class='pv2-card'><h4>Cash King</h4><p>${esc(d.hype.cashKing?.player||'—')}</p></article>
        <article class='pv2-card'><h4>Biggest Score</h4><p>${esc(d.hype.biggestScore?.player||'—')}</p></article>
        <article class='pv2-card'><h4>Most Consistent</h4><p>${esc(d.hype.mostConsistent?.player||'—')}</p></article>
      </section>
      <section class='pv2-card'><h2>Top 10</h2><div class='table-wrap'><table><thead><tr><th>#</th><th>Player</th><th>Points</th><th>FT</th><th>Cash</th></tr></thead><tbody>${top||'<tr><td colspan=5 class=muted>No data</td></tr>'}</tbody></table></div></section>
    `;
  }

  async function renderLeaderboards(){
    const seasons=await get('/api/poker/seasons');
    const active=seasons.activeSeason?.id||'';
    app.innerHTML=`${shellIntro('Leaderboards')}<section class='pv2-card'><h2>Leaderboards</h2>
    <div class='row-actions'>
    <button class='btn tab' data-tab='season'>Season</button>
    <button class='btn tab' data-tab='monthly'>Monthly</button>
    <button class='btn tab' data-tab='weekly'>Weekly</button>
    <button class='btn tab active' data-tab='all-time'>All-time</button>
    </div>
    <div class='row-actions' style='margin-top:8px;gap:8px;flex-wrap:wrap'>
      <input id='q' placeholder='Search player' style='max-width:180px' />
      <select id='eventType'><option value=''>All event types</option><option value='nightly'>Nightly</option><option value='special'>Special</option><option value='satellite'>Satellite</option></select>
      <input id='minEvents' type='number' min='0' step='1' value='0' placeholder='Min events' style='max-width:120px' />
      <label><input id='ftOnly' type='checkbox' /> FT only</label>
      <label><input id='cashOnly' type='checkbox' /> Cashed only</label>
      <label><input id='showAllRows' type='checkbox' /> Show all</label>
      <button class='btn' id='applyFilters'>Apply</button>
    </div>
    <div id='lb-wrap'></div></section>`;
    let currentTab='all-time';
    async function load(tab){
      currentTab=tab;
      const q=encodeURIComponent(document.getElementById('q')?.value||'');
      const eventType=encodeURIComponent(document.getElementById('eventType')?.value||'');
      const minEvents=encodeURIComponent(document.getElementById('minEvents')?.value||'0');
      const finalTableOnly=document.getElementById('ftOnly')?.checked?'true':'false';
      const cashedOnly=document.getElementById('cashOnly')?.checked?'true':'false';
      const d=await get(`/api/poker/leaderboards?tab=${encodeURIComponent(tab)}&seasonId=${encodeURIComponent(active)}&q=${q}&eventType=${eventType}&minEvents=${minEvents}&finalTableOnly=${finalTableOnly}&cashedOnly=${cashedOnly}`);
      const showAll=document.getElementById('showAllRows')?.checked;
      const sourceRows=(d.leaderboard||[]);
      const shownRows = showAll ? sourceRows : sourceRows.slice(0,10);
      const rows=shownRows.map(r=>`<tr><td>${r.rank}</td><td><a href='/poker/players/${r.playerId}'>${esc(r.player)}</a></td><td>${fmt(r.points)}</td><td>${r.events}</td><td>${fmt(r.avgPoints)}</td><td>${r.finalTables}</td><td>${r.cashes}</td><td>${fmt(r.ftPct)}%</td><td>${fmt(r.cashPct)}%</td><td>${r.lastPlayed?new Date(r.lastPlayed).toLocaleDateString('en-AU'):'—'}</td></tr>`).join('');
      const helper = showAll ? `Showing all ${sourceRows.length} players` : `Showing top ${Math.min(10, sourceRows.length)} players`;
      document.getElementById('lb-wrap').innerHTML=`<p class='muted'>${helper}</p><div class='table-wrap'><table><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Events</th><th>Avg</th><th>FT</th><th>Cash</th><th>FT%</th><th>Cash%</th><th>Last Played</th></tr></thead><tbody>${rows||'<tr><td colspan=10>No data</td></tr>'}</tbody></table></div>`;
    }
    document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');load(b.dataset.tab);});
    document.getElementById('applyFilters').onclick=()=>load(currentTab);
    load('all-time');
  }

  async function renderPlayers(){
    const q=new URLSearchParams(location.search).get('q')||'';
    const d=await get(`/api/poker/players?q=${encodeURIComponent(q)}`);
    const cards=(d.players||[]).map(p=>`<a class='pv2-card' href='/poker/players/${p.id}'><h3>${esc(p.displayName)}</h3><p class='muted'>${esc(p.canonicalName)}</p></a>`).join('');
    app.innerHTML=`${shellIntro('Players')}<section><h2>Players</h2><form><input name='q' value='${esc(q)}' placeholder='Search players' /><button class='btn'>Search</button></form></section><section class='pv2-grid'>${cards||'<p>No players</p>'}</section>`;
  }

  async function renderPlayer(){
    const id=route.split('/').pop();
    const d=await get(`/api/poker/players/${id}`);
    const badges=[];
    if(d.stats.finalTables>=5)badges.push('FT Merchant');
    if(d.stats.biggestScore>=300)badges.push('Sun Run Specialist');
    if(d.stats.events>=15)badges.push('Loose Unit');
    const rows=(d.results||[]).slice(0,40).map(r=>`<tr><td>${new Date(r.date).toLocaleDateString('en-AU')}</td><td>${fmt(r.points)}</td><td><span class='pill'>${r.finalTable?'FT':'—'}</span></td><td><span class='pill'>${r.cashed?'Cash':'—'}</span></td></tr>`).join('');
    app.innerHTML=`${shellIntro('Player Profile')}<section class='pv2-card'><h2>${esc(d.player.displayName)}</h2><p>${badges.map(b=>`<span class='pill'>${b}</span>`).join(' ')||'—'}</p><p class='muted'>Aliases: ${(d.aliases||[]).map(a=>esc(a.alias)).join(', ')}</p></section>
    <section class='pv2-grid'><article class='pv2-card'><h4>Points</h4><p>${fmt(d.stats.points)}</p></article><article class='pv2-card'><h4>Events</h4><p>${d.stats.events}</p></article><article class='pv2-card'><h4>FT</h4><p>${d.stats.finalTables}</p></article><article class='pv2-card'><h4>Cashes</h4><p>${d.stats.cashes}</p></article></section>
    <section class='pv2-card'><h3>Recent Results</h3><div class='table-wrap'><table><thead><tr><th>Date</th><th>Points</th><th>FT</th><th>Cash</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async function renderEvents(){
    const d=await get('/api/poker/events');
    const list=(d.events||[]).map(e=>`<a class='pv2-card' href='/poker/events/${e.id}'><h3>${esc(e.name)}</h3><p class='muted'>${esc(e.type)} • ${new Date(e.startAt).toLocaleString('en-AU')}</p></a>`).join('');
    app.innerHTML=`${shellIntro('Events')}<section><h2>Events</h2></section><section class='pv2-grid'>${list||'<p>No events</p>'}</section>`;
  }

  async function renderEvent(){
    const id=route.split('/').pop();
    const d=await get(`/api/poker/events/${id}`);
    const lb=(d.leaderboard||[]).map(r=>`<tr><td>${r.rank}</td><td>${esc(r.player)}</td><td>${fmt(r.points)}</td><td><span class='pill'>FT ${r.finalTables}</span> <span class='pill'>Cash ${r.cashes}</span></td></tr>`).join('');
    app.innerHTML=`${shellIntro('Event Detail')}<section class='pv2-card'><h2>${esc(d.event.name)}</h2><p class='muted'>${esc(d.event.type)}</p></section><section class='pv2-card'><h3>Event Leaderboard</h3><div class='table-wrap'><table><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Tags</th></tr></thead><tbody>${lb||'<tr><td colspan=4>No data</td></tr>'}</tbody></table></div></section>`;
  }

  setActiveNav();
  if(route==='/poker')renderHub();
  else if(route==='/poker/leaderboards')renderLeaderboards();
  else if(route==='/poker/players')renderPlayers();
  else if(route.startsWith('/poker/players/'))renderPlayer();
  else if(route==='/poker/events')renderEvents();
  else if(route.startsWith('/poker/events/'))renderEvent();
})();
