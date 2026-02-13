const LOCK_AT_ISO = '2026-02-14T15:00:00+11:00';

function fmtCountdown(ms) {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function renderLadder(rows) {
  const body = document.getElementById('ladder-preview');
  if (!body) return;
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">No results yet.</td></tr>';
    return;
  }
  rows.slice(0, 10).forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.rank}</td><td>${r.member}</td><td>${r.points}</td><td>+${r.correct || 0}</td>`;
    body.appendChild(tr);
  });
}

async function hydrateLanding() {
  try {
    const [fx, tips, ladder] = await Promise.all([
      fetch('/api/fixtures').then((r) => r.json()).catch(() => ({})),
      fetch('/api/tips?status=approved').then((r) => r.json()).catch(() => ({})),
      fetch('/api/ladder').then((r) => r.json()).catch(() => ({}))
    ]);

    const meet = fx?.fixtures?.[0]?.track || 'Pinjarra';
    document.getElementById('status-meet').textContent = meet;

    const entries = new Set((tips?.tips || []).map((t) => t.member)).size;
    document.getElementById('status-entries').textContent = String(entries || 0);
    document.getElementById('stat-entries').textContent = String(entries || 0);

    renderLadder(ladder?.ladder || []);
    document.getElementById('stat-weeks').textContent = String(fx?.fixtures?.length || 1);
  } catch {
    // non-blocking
  }
}

function wirePickToggles() {
  document.querySelectorAll('.pick-toggle').forEach((wrap) => {
    wrap.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });
}

(function initLanding() {
  const lockNode = document.getElementById('status-lock');
  if (lockNode) {
    const end = new Date(LOCK_AT_ISO).getTime();
    const tick = () => { lockNode.textContent = fmtCountdown(end - Date.now()); };
    tick();
    setInterval(tick, 1000);
  }
  wirePickToggles();
  hydrateLanding();
})();
