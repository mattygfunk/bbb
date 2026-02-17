(function(){
  const body = document.getElementById('poker-leaderboard-body');
  const status = document.getElementById('poker-leaderboard-status');
  const eventsEl = document.getElementById('poker-leaderboard-events');
  const playersEl = document.getElementById('poker-leaderboard-players');
  const filters = Array.from(document.querySelectorAll('.leaderboard-filter'));
  if(!body || !status || !filters.length) return;

  const storageKey = 'bbb-poker-leaderboard-tab-v2';
  let currentTab = localStorage.getItem(storageKey) || 'weekly';

  const rangeToTab = { week:'weekly', month:'monthly', all:'all-time', weekly:'weekly', monthly:'monthly', 'all-time':'all-time' };

  function labelFor(tab){
    if (tab === 'all-time') return 'all-time';
    if (tab === 'monthly') return 'monthly';
    if (tab === 'season') return 'season';
    return 'weekly';
  }

  function setActive(tab){
    filters.forEach((b)=>{
      const btnTab = rangeToTab[b.dataset.range] || b.dataset.range;
      b.classList.toggle('active', btnTab === tab);
    });
  }

  function render(rows){
    body.innerHTML = '';
    if (!rows.length){
      body.innerHTML = "<tr><td colspan='5' class='muted'>No results yet for this range.</td></tr>";
      return;
    }
    rows.forEach((r)=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${r.rank}</td><td>${r.player}</td><td>${Number(r.points||0).toFixed(1)}</td><td>${r.finalTables||0}</td><td>${r.cashes||0}</td>`;
      body.appendChild(tr);
    });
  }

  async function load(tab, silent = false){
    currentTab = tab;
    localStorage.setItem(storageKey, tab);
    setActive(tab);
    status.textContent = `Range: ${labelFor(tab)}`;
    if (!silent) body.innerHTML = "<tr><td colspan='5' class='muted'>Loading leaderboard…</td></tr>";

    try {
      const res = await fetch(`/api/poker/leaderboards?tab=${encodeURIComponent(tab)}`);
      const data = await res.json();
      const rows = data.leaderboard || [];
      render(rows);
      if (eventsEl) {
        const events = rows.reduce((n, r) => n + Number(r.events || 0), 0);
        eventsEl.textContent = String(events);
      }
      if (playersEl) playersEl.textContent = String(rows.length);
      const t = new Date().toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' });
      status.textContent = `Range: ${labelFor(tab)} • Updated ${t}`;
    } catch {
      if (!silent) body.innerHTML = "<tr><td colspan='5' class='muted'>Could not load leaderboard.</td></tr>";
    }
  }

  filters.forEach((btn)=>btn.addEventListener('click',()=>{
    const tab = rangeToTab[btn.dataset.range] || 'weekly';
    load(tab);
  }));

  if (!['weekly','monthly','all-time','season'].includes(currentTab)) currentTab = 'weekly';
  load(currentTab);
  setInterval(()=>load(currentTab, true), 30000);
})();
