(async function(){
  const esc=(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const roundId = decodeURIComponent((location.pathname.split('/').pop() || '').trim());
  if(!roundId) return;
  const out = await fetch(`/api/punters/results/${encodeURIComponent(roundId)}`).then(r=>r.json());
  if(out.error){ document.getElementById('results-round-label').textContent = out.error; return; }
  const round = out.round || {};
  const snap = out.snapshot || {};
  document.getElementById('results-round-label').textContent = `${round.label || round.id} • Final results (Round closed)`;

  const ladderBody = document.getElementById('results-ladder');
  ladderBody.innerHTML = '';
  (snap.finalLeaderboard || []).forEach((row)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${Number(row.rank || 0)}</td><td>${esc(row.member)}</td><td>${Number(row.points || 0)}</td>`;
    ladderBody.appendChild(tr);
  });
  if(!(snap.finalLeaderboard||[]).length){ ladderBody.innerHTML = "<tr><td colspan='3' class='muted'>No results snapshot.</td></tr>"; }

  const fixtures = document.getElementById('results-fixtures');
  fixtures.innerHTML = (snap.finalFixtures || []).map((f)=>`<article class='fixture'><strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p></article>`).join('');
  if(!(snap.finalFixtures||[]).length) fixtures.innerHTML = "<p class='muted'>No fixture snapshot.</p>";

  const tips = document.getElementById('results-tips');
  tips.innerHTML = (snap.finalTipsFeed || []).slice(0,120).map((t)=>`<article class='tip'><strong>${esc(t.member)}</strong><p class='meta'>${esc(t.race)}: ${esc(t.selection || t.horse || '')}</p></article>`).join('');
  if(!(snap.finalTipsFeed||[]).length) tips.innerHTML = "<p class='muted'>No tips snapshot.</p>";
})();
