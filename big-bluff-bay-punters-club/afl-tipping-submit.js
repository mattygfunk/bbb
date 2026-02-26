(function () {
  'use strict';

  const TOKEN_KEY = 'bbb-token-v3';
  const API = '/api/afl-tipping';

  let currentUser = null;
  let currentRound = null;
  let existingTips = {};  // { gameId: pick }
  let selections = {};    // { gameId: pick } — current session picks
  let countdownTimers = [];

  function token() { return localStorage.getItem(TOKEN_KEY); }

  async function req(path, opts = {}) {
    const t = token();
    const res = await fetch(path, {
      ...opts,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne'
    });
  }

  function formatCountdown(ms) {
    if (ms <= 0) return 'Locked';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
  function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function updateSubmitButton() {
    const btn = document.getElementById('submit-all-btn');
    const hint = document.getElementById('submit-hint');
    if (!btn || !currentRound) return;

    const now = Date.now();
    const unlockedGames = (currentRound.games || []).filter((g) => now < g.kickoff);
    const allPicked = unlockedGames.every((g) => selections[g.id]);

    if (unlockedGames.length === 0) {
      btn.disabled = true;
      if (hint) hint.textContent = 'All games are locked — no tips to submit.';
      return;
    }

    btn.disabled = !allPicked;
    if (!allPicked) {
      const unpicked = unlockedGames.filter((g) => !selections[g.id]).length;
      if (hint) hint.textContent = `Pick ${unpicked} more game${unpicked !== 1 ? 's' : ''} to enable submission.`;
    } else {
      if (hint) hint.textContent = `All ${unlockedGames.length} games picked. Ready to submit!`;
    }
  }

  function renderGames(games, existingTipsArr) {
    // Build existing tips map
    for (const t of (existingTipsArr || [])) {
      existingTips[t.gameId] = t.pick;
    }
    // Pre-populate selections from existing tips
    Object.assign(selections, existingTips);

    const container = document.getElementById('games-container');
    if (!container) return;

    // Clear old countdown timers
    for (const t of countdownTimers) clearInterval(t);
    countdownTimers = [];

    if (!games || !games.length) {
      container.innerHTML = '<p style="color:var(--muted);">No games scheduled for this round yet.</p>';
      return;
    }

    container.innerHTML = '';
    const now = Date.now();

    for (const game of games) {
      const locked = now >= game.kickoff;
      const tile = document.createElement('div');
      tile.className = 'game-tile' + (locked ? ' locked-tile' : '');
      tile.dataset.gameId = game.id;

      const result = game.result;

      tile.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem;">
          <div>
            <span style="font-size:.8em;color:var(--muted);">${escHtml(game.venue || '')}</span>
            <div style="margin-top:.25rem;">
              <span style="font-weight:600;">${escHtml(game.homeTeam)}</span>
              <span style="color:var(--muted);margin:0 .4rem;font-size:.9em;">vs</span>
              <span style="font-weight:600;">${escHtml(game.awayTeam)}</span>
            </div>
          </div>
          <div style="text-align:right;">
            ${locked
              ? `<span style="color:#ef4444;font-size:.9em;font-weight:600;">🔒 Locked</span>`
              : `<span style="font-size:.8em;color:var(--muted);">${fmtDate(game.kickoff)}</span>`
            }
            ${!locked ? `<div class="countdown-badge" id="cd-${game.id}"></div>` : ''}
          </div>
        </div>
        <div class="game-teams">
          <button
            class="game-pick-btn${locked ? ' locked' : ''}${!locked && selections[game.id] === game.homeTeam ? ' selected' : ''}${result && selections[game.id] === game.homeTeam ? (selections[game.id] === result.winner ? ' correct' : ' incorrect') : ''}"
            data-game="${game.id}"
            data-pick="${game.homeTeam}"
            ${locked ? 'disabled' : ''}
          >${escHtml(game.homeTeam)}</button>
          <button
            class="game-pick-btn${locked ? ' locked' : ''}${!locked && selections[game.id] === game.awayTeam ? ' selected' : ''}${result && selections[game.id] === game.awayTeam ? (selections[game.id] === result.winner ? ' correct' : ' incorrect') : ''}"
            data-game="${game.id}"
            data-pick="${game.awayTeam}"
            ${locked ? 'disabled' : ''}
          >${escHtml(game.awayTeam)}</button>
        </div>
        ${result ? `<div style="margin-top:.5rem;font-size:.85em;color:var(--muted);">Result: <strong style="color:var(--brand);">${escHtml(result.winner)}</strong>${result.homeScore != null ? ` (${result.homeScore} – ${result.awayScore})` : ''}</div>` : ''}
      `;

      container.appendChild(tile);

      // Countdown timer for unlocked games
      if (!locked) {
        const cdEl = document.getElementById(`cd-${game.id}`);
        if (cdEl) {
          const update = () => {
            const remaining = game.kickoff - Date.now();
            if (remaining <= 0) {
              cdEl.textContent = '🔒 Just locked!';
              // Disable pick buttons for this game
              tile.querySelectorAll('.game-pick-btn').forEach((b) => {
                b.disabled = true;
                b.classList.add('locked');
              });
              tile.classList.add('locked-tile');
              updateSubmitButton();
              return;
            }
            const text = formatCountdown(remaining);
            cdEl.textContent = `⏱ ${text} to lock`;
            cdEl.className = 'countdown-badge' + (remaining < 3600000 ? ' urgent' : '');
          };
          update();
          const timer = setInterval(update, 1000);
          countdownTimers.push(timer);
        }
      }
    }

    // Event delegation for pick buttons
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.game-pick-btn');
      if (!btn || btn.disabled || btn.classList.contains('locked')) return;

      const gameId = btn.dataset.game;
      const pick = btn.dataset.pick;

      // Deselect others in same game
      container.querySelectorAll(`.game-pick-btn[data-game="${gameId}"]`).forEach((b) => {
        b.classList.remove('selected');
      });

      // Select this one
      btn.classList.add('selected');
      selections[gameId] = pick;

      updateSubmitButton();
    });

    updateSubmitButton();
  }

  async function submitTips() {
    const btn = document.getElementById('submit-all-btn');
    if (!btn || !currentRound) return;

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const now = Date.now();
    const tips = Object.entries(selections)
      .map(([gameId, pick]) => ({ gameId, pick }))
      .filter(({ gameId }) => {
        const game = (currentRound.games || []).find((g) => g.id === gameId);
        return game && now < game.kickoff;
      });

    try {
      await req(`${API}/tips`, {
        method: 'POST',
        body: JSON.stringify({ roundId: currentRound.id, tips })
      });

      hide('tips-form-area');
      show('success-msg');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Submit All Tips';
      alert('Error submitting tips: ' + err.message);
    }
  }

  async function init() {
    hide('submit-loading');

    // Check auth
    if (!token()) {
      hide('submit-loading');
      show('auth-gate');
      return;
    }

    show('submit-loading');

    try {
      const me = await req('/api/me');
      currentUser = me.user || null;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      hide('submit-loading');
      show('auth-gate');
      return;
    }

    if (!currentUser) {
      hide('submit-loading');
      show('auth-gate');
      return;
    }

    // Check current round + user tips
    try {
      const tipsData = await req(`${API}/my-tips`);

      if (!tipsData.round) {
        hide('submit-loading');
        show('no-round-msg');
        return;
      }

      currentRound = tipsData.round;

      // Check entry status — try to enter (idempotent, returns existing entry)
      let entry = null;
      try {
        const enterRes = await req(`${API}/enter`, {
          method: 'POST',
          body: JSON.stringify({ email: currentUser.email || '' })
        });
        entry = enterRes.entry;
      } catch {
        entry = null;
      }

      if (!entry || entry.status !== 'confirmed') {
        hide('submit-loading');
        show('entry-gate');
        return;
      }

      // All good — show the form
      hide('submit-loading');

      const roundLabel = document.getElementById('form-round-label');
      const roundSubtitle = document.getElementById('round-subtitle');
      const roundStatusTag = document.getElementById('round-status-tag');
      if (roundLabel) roundLabel.textContent = currentRound.label;
      if (roundSubtitle) roundSubtitle.textContent = currentRound.label;
      if (roundStatusTag) {
        const statusMap = { pending: 'Upcoming', open: 'Open for Tips', locked: 'Locked', scoring: 'Scoring', scored: 'Scored' };
        const colorMap = { open: '#22c55e', locked: '#ef4444', scored: '#60a5fa', pending: '#6b7280' };
        roundStatusTag.textContent = statusMap[currentRound.status] || currentRound.status;
        roundStatusTag.style.color = colorMap[currentRound.status] || '#6b7280';
      }

      show('tips-form-area');
      renderGames(currentRound.games, tipsData.tips);

      // Submit button listener
      const submitBtn = document.getElementById('submit-all-btn');
      if (submitBtn) submitBtn.addEventListener('click', submitTips);

    } catch (err) {
      hide('submit-loading');
      if (err.message && err.message.toLowerCase().includes('confirm')) {
        show('entry-gate');
      } else if (err.message && err.message.toLowerCase().includes('entry')) {
        show('entry-gate');
      } else {
        show('no-round-msg');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
