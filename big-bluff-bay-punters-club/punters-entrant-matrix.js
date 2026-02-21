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

async function load() {
  const head = $('matrix-head');
  const body = $('matrix-body');
  const meta = $('matrix-meta');
  const trackId = new URLSearchParams(location.search).get('trackId') || 'thoroughbreds';

  try {
    const res = await fetch(`/api/punters/entrant-matrix?trackId=${encodeURIComponent(trackId)}`, { credentials:'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load entrant matrix');

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

    const ts = Number(data.generatedAt || 0);
    meta.textContent = `Track: ${trackId} • Entrants: ${rows.length}${ts ? ` • Updated: ${new Date(ts).toLocaleTimeString('en-AU')}` : ''}`;
  } catch (err) {
    body.innerHTML = `<tr><td class='muted'>${esc(err.message || 'Request failed')}</td></tr>`;
    if (meta) meta.textContent = 'Could not load entrant matrix.';
  }
}

load();
