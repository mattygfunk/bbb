const $ = (id) => document.getElementById(id);
const matrixState = { races: [], rows: [], sortKey: 'rank', dir: 'asc' };

function esc(s){return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function raceCellHtml(cell = {}) {
  const sel = String(cell.selection || '').trim();
  if (!sel) return `<span class='muted'>—</span>`;
  const pts = Number(cell.points || 0);
  const outcome = String(cell.outcome || 'pending');
  const cls = outcome === 'winner' ? '' : outcome === 'missed' ? 'chip-red' : '';
  return `#${esc(sel)} <span class='pill ${cls}'>${pts}pt</span>`;
}

function sortRows(rows, races, sortKey, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let av; let bv;
    if (sortKey === 'member') { av = String(a.member || '').toLowerCase(); bv = String(b.member || '').toLowerCase(); }
    else if (sortKey === 'jackpotEligible') { av = a.jackpotEligible ? 1 : 0; bv = b.jackpotEligible ? 1 : 0; }
    else if (sortKey === 'rank') { av = Number(a.rank || 99999); bv = Number(b.rank || 99999); }
    else if (sortKey === 'totalPoints') { av = Number(a.totalPoints || 0); bv = Number(b.totalPoints || 0); }
    else if (String(sortKey).startsWith('race:')) {
      const race = String(sortKey).slice(5);
      av = Number(a.races?.[race]?.points || 0);
      bv = Number(b.races?.[race]?.points || 0);
    } else { av = 0; bv = 0; }

    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return String(a.member || '').localeCompare(String(b.member || ''));
  });
}

function renderTable(trackId) {
  const head = $('matrix-head');
  const body = $('matrix-body');
  const sortMeta = $('matrix-sort-meta');
  const races = matrixState.races;
  const rows = sortRows(matrixState.rows, races, matrixState.sortKey, matrixState.dir);

  const arrow = (k) => matrixState.sortKey === k ? (matrixState.dir === 'asc' ? ' ↑' : ' ↓') : '';
  head.innerHTML = `<tr>
    <th><button class='btn btn-ghost tiny-btn' data-sort='member'>Entrant${arrow('member')}</button></th>
    <th><button class='btn btn-ghost tiny-btn' data-sort='jackpotEligible'>Jackpot${arrow('jackpotEligible')}</button></th>
    <th><button class='btn btn-ghost tiny-btn' data-sort='rank'>Rank${arrow('rank')}</button></th>
    <th><button class='btn btn-ghost tiny-btn' data-sort='totalPoints'>Total${arrow('totalPoints')}</button></th>
    ${races.map((r)=>`<th><button class='btn btn-ghost tiny-btn' data-sort='race:${esc(r)}'>${esc(r)}${arrow(`race:${r}`)}</button></th>`).join('')}
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

  head.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-sort') || 'rank');
      if (matrixState.sortKey === key) matrixState.dir = matrixState.dir === 'asc' ? 'desc' : 'asc';
      else { matrixState.sortKey = key; matrixState.dir = (key === 'member') ? 'asc' : 'desc'; }
      renderTable(trackId);
    });
  });

  if (sortMeta) sortMeta.textContent = `Sorted by ${matrixState.sortKey} (${matrixState.dir})`;
}

async function renderMatrix(data, trackId) {
  const meta = $('matrix-meta');
  matrixState.races = Array.isArray(data.races) ? data.races : [];
  matrixState.rows = Array.isArray(data.rows) ? data.rows : [];
  renderTable(trackId);
  const ts = Number(data.generatedAt || Date.now());
  meta.textContent = `Track: ${trackId} • Entrants: ${matrixState.rows.length}${ts ? ` • Updated: ${new Date(ts).toLocaleTimeString('en-AU')}` : ''}`;
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
