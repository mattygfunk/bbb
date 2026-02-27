(() => {
  const canvas = document.getElementById('wheel-canvas');
  const spinBtn = document.getElementById('wheel-spin-btn');
  const statusEl = document.getElementById('wheel-status');
  const prizeEl = document.getElementById('wheel-prize');
  const winnerEl = document.getElementById('wheel-winner');
  const winnerPrizeEl = document.getElementById('wheel-result-prize');
  const resultCard = document.getElementById('wheel-result-card');
  const fairnessEl = document.getElementById('wheel-fairness');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#0891b2','#4f46e5','#be123c'];

  const token = localStorage.getItem('bbb-token-v3') || '';

  // ── Presence ───────────────────────────────────────────────────────────────
  const _presenceId = (() => {
    let id = sessionStorage.getItem('bbb-presence-id');
    if (!id) { id = (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random())); sessionStorage.setItem('bbb-presence-id', id); }
    return id;
  })();

  async function pingPresence() {
    try {
      await fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ clientId: _presenceId, page: 'wheel' })
      });
    } catch { /* silent */ }
  }

  async function loadPresence() {
    try {
      const r = await fetch('/api/presence?page=wheel');
      const d = await r.json();
      if (!d.ok) return;
      const totalEl = document.getElementById('presence-total');
      const liEl = document.getElementById('presence-logged-in');
      const anonEl = document.getElementById('presence-anon');
      if (totalEl) totalEl.textContent = `${d.total} viewer${d.total !== 1 ? 's' : ''}`;
      if (liEl) {
        if (d.loggedIn.length > 0) {
          const MAX = 6;
          const shown = d.loggedIn.slice(0, MAX);
          const overflow = d.loggedIn.length - MAX;
          const names = shown.map((u) => `<span style="display:inline-block;padding:.15rem .5rem;background:#0f2a50;border:1px solid #1e40af;border-radius:99px;color:#93c5fd;font-weight:600;">${u.replace(/[<>&"]/g,(c)=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</span>`).join(' ');
          liEl.innerHTML = `${names}${overflow > 0 ? ` <span style="color:var(--muted);">+${overflow} more</span>` : ''}`;
        } else { liEl.innerHTML = ''; }
      }
      if (anonEl) anonEl.textContent = d.anonymous > 0 ? `· ${d.anonymous} anonymous` : '';
    } catch { /* silent */ }
  }

  pingPresence();
  loadPresence();
  setInterval(pingPresence, 30000);
  setInterval(loadPresence, 15000);

  // ── State ──────────────────────────────────────────────────────────────────
  const state = { session: null, spin: null, prize: null, rotation: 0, spinning: false };
  let _lastSpinDeg = null;
  let _lastDurationMs = 7200;
  let _countdownTimer = null;

  // ── Countdown ──────────────────────────────────────────────────────────────
  // Counts 3-2-1-GO before the spin, resolves when done
  function startCountdown() {
    stopCountdown();
    const cdEl = document.getElementById('wheel-countdown');
    if (!cdEl) return Promise.resolve();
    return new Promise((resolve) => {
      const steps = ['3', '2', '1', '🚀 GO!'];
      let i = 0;
      cdEl.style.display = '';
      function next() {
        if (i >= steps.length) {
          cdEl.style.display = 'none';
          return resolve();
        }
        cdEl.textContent = steps[i++];
        _countdownTimer = setTimeout(next, i === steps.length ? 400 : 800);
      }
      next();
    });
  }

  function stopCountdown() {
    if (_countdownTimer) { clearTimeout(_countdownTimer); _countdownTimer = null; }
    const cdEl = document.getElementById('wheel-countdown');
    if (cdEl) cdEl.style.display = 'none';
  }

  // ── Replay ─────────────────────────────────────────────────────────────────
  function showReplayBtn() {
    let btn = document.getElementById('wheel-replay-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'wheel-replay-btn';
      btn.className = 'btn';
      btn.style.cssText = 'margin-top:.5rem;';
      btn.textContent = '🔁 Replay Spin';
      spinBtn.parentNode.insertBefore(btn, spinBtn.nextSibling);
      btn.addEventListener('click', async () => {
        if (state.spinning || _lastSpinDeg === null) return;
        state.spinning = true;
        btn.disabled = true;
        const fromDeg = state.rotation - (_lastSpinDeg - state.rotation) % 360;
        // rewind one full rotation back so replay has travel distance
        const replayFrom = _lastSpinDeg - 1440;
        state.rotation = replayFrom;
        statusEl.textContent = 'Get ready…';
        await startCountdown();
        statusEl.textContent = 'Replaying…';
        await animateTo(_lastSpinDeg, _lastDurationMs);
        statusEl.textContent = `Winner: ${state.spin?.winnerUsername || ''}`;
        state.spinning = false;
        btn.disabled = false;
      });
    }
    btn.style.display = '';
  }

  function hideReplayBtn() {
    const btn = document.getElementById('wheel-replay-btn');
    if (btn) btn.style.display = 'none';
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
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
      const a0 = i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a1); ctx.closePath();
      ctx.fillStyle = colors[i % colors.length]; ctx.fill();
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Inter, Arial';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(entrants[i] || '').slice(0, 20), r - 16, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1220'; ctx.fill();
    ctx.restore();
  }

  // ── Load current ───────────────────────────────────────────────────────────
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
      _lastSpinDeg = Number(state.spin.finalRotationDeg || 0);
      _lastDurationMs = 7200;
      state.rotation = _lastSpinDeg % 360;
      statusEl.textContent = `Already spun: ${state.spin.winnerUsername}`;
      spinBtn.disabled = true;
      resultCard.hidden = false;
      winnerEl.textContent = state.spin.winnerUsername;
      winnerPrizeEl.textContent = state.prize?.title || '';
      if (fairnessEl) fairnessEl.textContent = `Seed hash: ${String(state.spin.serverSeedHash || '').slice(0, 16)}… • Entrants hash: ${String(state.spin.entrantsHash || '').slice(0, 16)}…`;
      showReplayBtn();
    }
    drawWheel();
  }

  // ── Animate ────────────────────────────────────────────────────────────────
  function animateTo(finalDeg, durationMs) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { state.rotation = finalDeg; drawWheel(); return Promise.resolve(); }
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

  // ── Spin ───────────────────────────────────────────────────────────────────
  spinBtn?.addEventListener('click', async () => {
    if (state.spinning || !state.session) return;
    state.spinning = true;
    spinBtn.disabled = true;
    hideReplayBtn();
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

      state.spin = d.spin || {
        winnerUsername: d.winnerUsername,
        winnerIndex: d.winnerIndex,
        finalRotationDeg: d.finalRotationDeg,
        serverSeedHash: d.serverSeedHash || '',
        entrantsHash: d.entrantsHash || ''
      };

      _lastSpinDeg = Number(d.finalRotationDeg || 0);
      _lastDurationMs = Number(d.durationMs || 7200);

      statusEl.textContent = 'Get ready…';
      await startCountdown();
      statusEl.textContent = 'Spinning…';
      await animateTo(_lastSpinDeg, _lastDurationMs);

      statusEl.textContent = `🏆 Winner: ${d.winnerUsername}`;
      resultCard.hidden = false;
      winnerEl.textContent = d.winnerUsername;
      winnerPrizeEl.textContent = state.prize?.title || '';
      if (fairnessEl) fairnessEl.textContent = `Seed hash: ${String(state.spin.serverSeedHash || '').slice(0, 16)}… • Entrants hash: ${String(state.spin.entrantsHash || '').slice(0, 16)}…`;
      showReplayBtn();
    } catch (err) {
      statusEl.textContent = err.message || 'Spin failed';
      spinBtn.disabled = false;
      stopCountdown();
    } finally {
      state.spinning = false;
    }
  });

  loadCurrent().catch((e) => { statusEl.textContent = e.message || 'Could not load wheel'; });
})();
