(function(){
  const body = document.getElementById('poker-leaderboard-body');
  const status = document.getElementById('poker-leaderboard-status');
  const filters = Array.from(document.querySelectorAll('.leaderboard-filter'));
  if(!body || !status || !filters.length) return;

  let currentRange = 'week';

  function setActive(range){
    filters.forEach((b)=>{
      if (b.dataset.range === range) {
        b.style.borderColor = '#86efac';
        b.style.color = '#dcfce7';
      } else {
        b.style.borderColor = '#334155';
        b.style.color = '';
      }
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

  async function load(range){
    currentRange = range;
    setActive(range);
    status.textContent = `Range: ${range === 'all' ? 'all-time' : range}`;
    body.innerHTML = "<tr><td colspan='5' class='muted'>Loading leaderboard…</td></tr>";
    try {
      const res = await fetch(`/api/poker-leaderboard?range=${encodeURIComponent(range)}`);
      const data = await res.json();
      render(data.leaderboard || []);
    } catch {
      body.innerHTML = "<tr><td colspan='5' class='muted'>Could not load leaderboard.</td></tr>";
    }
  }

  filters.forEach((btn)=>btn.addEventListener('click',()=>load(btn.dataset.range || 'week')));
  load(currentRange);
})();
