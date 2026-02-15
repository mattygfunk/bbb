(function(){
  const body = document.getElementById('poker-leaderboard-body');
  const status = document.getElementById('poker-leaderboard-status');
  const eventsEl = document.getElementById('poker-leaderboard-events');
  const playersEl = document.getElementById('poker-leaderboard-players');
  const filters = Array.from(document.querySelectorAll('.leaderboard-filter'));
  if(!body || !status || !filters.length) return;

  const storageKey = 'bbb-poker-leaderboard-range';
  let currentRange = localStorage.getItem(storageKey) || 'week';

  function labelFor(range){
    if (range === 'all') return 'all-time';
    if (range === 'month') return 'this month';
    return 'this week';
  }

  function setActive(range){
    filters.forEach((b)=>{
      b.classList.toggle('active', b.dataset.range === range);
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
      tr.innerHTML = `<td>${r.rank}</td><td>${r.player}</td><td>${Number(r.points||0).toFixed(2).replace(/\.00$/,'')}</td><td>${r.finalTables||0}</td><td>${r.cashes||0}</td>`;
      body.appendChild(tr);
    });
  }

  async function load(range, silent = false){
    currentRange = range;
    localStorage.setItem(storageKey, range);
    setActive(range);
    status.textContent = `Range: ${labelFor(range)}`;
    if (!silent) body.innerHTML = "<tr><td colspan='5' class='muted'>Loading leaderboard…</td></tr>";

    try {
      const res = await fetch(`/api/poker-leaderboard?range=${encodeURIComponent(range)}`);
      const data = await res.json();
      render(data.leaderboard || []);
      if (eventsEl) eventsEl.textContent = String(data?.stats?.events ?? 0);
      if (playersEl) playersEl.textContent = String(data?.stats?.players ?? 0);
      const t = new Date(Number(data?.updatedAt || Date.now())).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' });
      status.textContent = `Range: ${labelFor(range)} • Updated ${t}`;
    } catch {
      if (!silent) body.innerHTML = "<tr><td colspan='5' class='muted'>Could not load leaderboard.</td></tr>";
    }
  }

  filters.forEach((btn)=>btn.addEventListener('click',()=>load(btn.dataset.range || 'week')));
  load(currentRange);
  setInterval(()=>load(currentRange, true), 30000);
})();
