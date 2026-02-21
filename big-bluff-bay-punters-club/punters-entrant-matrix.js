const $ = (id) => document.getElementById(id);

function esc(s){return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function raceCellHtml(cell = {}) {
  const sel = String(cell.selection || '').trim();
  if (!sel) return `<span class='muted'>—</span>`;
  const pts = Number(cell.points || 0);
  const outcome = String(cell.outcome || 'pending');
  const cls = outcome === 'winner' ? '' : outcome === 'missed' ? 'chip-red' : '';
  return `#${esc(sel)} <span class='pill ${cls}'>${pts}pt</span>`;
}

async function renderMatrix(data, trackId) {
  const head = $('matrix-head');
  const body = $('matrix-body');
  const meta = $('matrix-meta');
  const races = Array.isArray(data.races) ? data.races : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  head.innerHTML = `<tr>
    <th>Entrant</th>
    <th>Jackpot</th>
    <th>Rank</th>
    <th>Total</th>
    ${races.map((r)=>`<th>${esc(r)}</th>`).join('')}
  </tr>`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan='${4 + races.length}' class='muted'>No entrant data yet.</td></tr>`;
  } else {
    body.innerHTML = rows.map((row) => `
      <tr>
        <td><strong>${esc(row.member)}</strong></td>
        <td>${row.jackpotEligible ? "<span class='pill'>✅ Eligible</span>" : "<span class='pill chip-red'>FREE</span>"}</td>
        <td>${row.rank ? `#${row.rank}` : '—'}</td>
        <td>${Number(row.totalPoints || 0)}</td>
        ${races.map((race) => `<td>${raceCellHtml(row.races?.[race])}</td>`).join('')}
      </tr>
    `).join('');
  }

  const ts = Number(data.generatedAt || Date.now());
  meta.textContent = `Track: ${trackId} • Entrants: ${rows.length}${ts ? ` • Updated: ${new Date(ts).toLocaleTimeString('en-AU')}` : ''}`;
}

async function loadFallback(trackId) {
  const [overviewRes, tipsRes] = await Promise.all([
    fetch(`/api/punters/overview?tier=paid&trackId=${encodeURIComponent(trackId)}`, { credentials:'same-origin' }),
    fetch(`/api/tips?status=all&trackId=${encodeURIComponent(trackId)}`, { credentials:'same-origin' })
  ]);
  const overview = await overviewRes.json();
  const tipsData = await tipsRes.json();
  const raceCount = Number((overview?.fixtures || [])[0]?.raceCount || 12);
  const races = Array.from({ length: Math.max(1, raceCount) }, (_, i) => `R${i + 1}`);
  const ladder = Array.isArray(overview?.ladder) ? overview.ladder : [];
  const rankBy = new Map(ladder.map((r)=>[String(r.member||'').toLowerCase(), Number(r.rank||0)]));
  const jackpotBy = new Map(ladder.map((r)=>[String(r.member||'').toLowerCase(), String(r.tier||'').toUpperCase()==='JACKPOT']));

  const tips = Array.isArray(tipsData?.tips) ? tipsData.tips : [];
  const byMember = new Map();
  tips.filter((t)=>String(t.status||'')!=='removed').forEach((t)=>{
    const member = String(t.member || '').trim();
    if (!member) return;
    const key = member.toLowerCase();
    if (!byMember.has(key)) byMember.set(key, { member, races: {} });
    const race = String(t.race || '').toUpperCase();
    byMember.get(key).races[race] = { selection: String(t.selection || '') };
  });

  const rows = Array.from(byMember.values()).map((row)=>{
    let total = 0;
    races.forEach((race)=>{
      const sel = String(row.races?.[race]?.selection || '');
      const rr = overview?.raceResults?.[race];
      if (!sel) { row.races[race] = { selection:'', points:0, outcome:'none' }; return; }
      if (!rr) { row.races[race] = { selection:sel, points:0, outcome:'pending' }; return; }
      const first = (rr.first||[]).map(String), second=(rr.second||[]).map(String), third=(rr.third||[]).map(String);
      let points=0,outcome='missed';
      if (first.includes(sel)) { points=3; outcome='winner'; }
      else if (second.includes(sel)) { points=2; outcome='second'; }
      else if (third.includes(sel)) { points=1; outcome='third'; }
      total += points;
      row.races[race] = { selection: sel, points, outcome };
    });
    const k = row.member.toLowerCase();
    return { member: row.member, jackpotEligible: Boolean(jackpotBy.get(k)), rank: rankBy.get(k) || null, totalPoints: total, races: row.races };
  }).sort((a,b)=>(Number(a.rank||9999)-Number(b.rank||9999))||String(a.member).localeCompare(String(b.member)));

  return { races, rows, generatedAt: Date.now() };
}

async function load() {
  const trackId = new URLSearchParams(location.search).get('trackId') || 'thoroughbreds';
  try {
    const res = await fetch(`/api/punters/entrant-matrix?trackId=${encodeURIComponent(trackId)}`, { credentials:'same-origin' });
    const contentType = String(res.headers.get('content-type') || '');
    if (!res.ok || !contentType.includes('application/json')) throw new Error('API unavailable');
    const data = await res.json();
    await renderMatrix(data, trackId);
  } catch {
    try {
      const fallback = await loadFallback(trackId);
      await renderMatrix(fallback, trackId);
    } catch (err) {
      $('matrix-body').innerHTML = `<tr><td class='muted'>${esc(err.message || 'Request failed')}</td></tr>`;
      $('matrix-meta').textContent = 'Could not load entrant matrix.';
    }
  }
}

load();
