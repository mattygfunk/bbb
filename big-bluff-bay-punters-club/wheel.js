(() => {
  const canvas = document.getElementById('wheel-canvas');
  const spinBtn = document.getElementById('wheel-spin-btn');
  const statusEl = document.getElementById('wheel-status');
  const prizeEl = document.getElementById('wheel-prize');
  const winnerEl = document.getElementById('wheel-winner');
  const winnerPrizeEl = document.getElementById('wheel-result-prize');
  const resultCard = document.getElementById('wheel-result-card');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#0891b2','#4f46e5','#be123c'];

  const token = localStorage.getItem('bbb-token-v3') || '';
  const state = { session: null, spin: null, prize: null, rotation: 0, spinning: false };

  function drawWheel() {
    const entrants = state.session?.entrantsSnapshot || [];
    const n = Math.max(entrants.length, 1);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 8;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    const seg = (Math.PI * 2) / n;

    for (let i = 0; i < n; i++) {
      const a0 = i * seg;
      const a1 = a0 + seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Inter, Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const name = String(entrants[i] || '').slice(0, 20);
      ctx.fillText(name, r - 16, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1220';
    ctx.fill();
    ctx.restore();
  }

  async function loadCurrent() {
    const r = await fetch('/api/wheel/current', { cache: 'no-store' });
    const d = await r.json();
    state.session = d.session;
    state.spin = d.spin;
    state.prize = d.prize;

    if (!state.session) {
      statusEl.textContent = 'No wheel session is active yet.';
      spinBtn.disabled = true;
      drawWheel();
      return;
    }
    if (!token) {
      spinBtn.disabled = true;
      statusEl.textContent = 'Admin login required to spin.';
    }

    prizeEl.textContent = `Prize: ${state.prize?.title || '—'}`;
    if (state.spin) {
      state.rotation = Number(state.spin.finalRotationDeg || 0) % 360;
      statusEl.textContent = `Already spun: ${state.spin.winnerUsername}`;
      spinBtn.disabled = true;
      resultCard.hidden = false;
      winnerEl.textContent = state.spin.winnerUsername;
      winnerPrizeEl.textContent = state.prize?.title || '';
    }
    drawWheel();
  }

  function animateTo(finalDeg, durationMs) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      state.rotation = finalDeg;
      drawWheel();
      return Promise.resolve();
    }
    const start = performance.now();
    const from = state.rotation;
    const delta = finalDeg - from;
    return new Promise((resolve) => {
      const tick = (t) => {
        const p = Math.min(1, (t - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 4);
        state.rotation = from + delta * eased;
        drawWheel();
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  spinBtn?.addEventListener('click', async () => {
    if (state.spinning || !state.session) return;
    state.spinning = true;
    spinBtn.disabled = true;
    statusEl.textContent = 'Requesting server-authoritative spin…';
    try {
      const nonce = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const r = await fetch(`/api/admin/wheel/sessions/${encodeURIComponent(state.session.id)}/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ clientNonce: nonce })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Spin failed');
      statusEl.textContent = 'Spinning…';
      await animateTo(Number(d.finalRotationDeg || 0), Number(d.durationMs || 7200));
      statusEl.textContent = `Winner: ${d.winnerUsername}`;
      resultCard.hidden = false;
      winnerEl.textContent = d.winnerUsername;
      winnerPrizeEl.textContent = state.prize?.title || '';
    } catch (err) {
      statusEl.textContent = err.message || 'Spin failed';
      spinBtn.disabled = false;
    } finally {
      state.spinning = false;
    }
  });

  loadCurrent().catch((e) => { statusEl.textContent = e.message || 'Could not load wheel'; });
})();