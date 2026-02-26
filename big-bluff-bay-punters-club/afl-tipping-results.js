(function () {
  'use strict';

  const TOKEN_KEY = 'bbb-token-v3';
  const API = '/api/afl-tipping';

  let currentUser = null;
  let userTipsMap = {}; // { gameId: pick }

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

  function fmtMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-AU');
  }

  function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
  function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function renderJackpotBanner(round) {
    const banner = document.getElementById('jackpot-banner');
    if (!banner || !round) return;
    const jk = round.weeklyJackpot;
    if (!jk || (!jk.winnerId && !jk.rolledOver)) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    if (jk.rolledOver) {
      banner.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:2em;">🎰</div>
          <h3 style="color:#f59e0b;margin:.25rem 0;">Jackpot Rolled Over!</h3>
          <p style="color:var(--muted);">No outright winner this week. The ${fmtMoney(jk.totalPot)} pot rolls into next round.</p>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:2em;">🏆</div>
          <h3 style="color:var(--brand);margin:.25rem 0;">${escHtml(jk.winnerMember)} won ${fmtMoney(jk.winnerPayout)}!</h3>
          <p style="color:var(--muted);">Weekly jackpot winner for ${escHtml(round.label)}.</p>
        </div>
      `;
    }
  }

  function renderGamesTable(round) {
    const gamesLoadingEl = document.getElementById('games-loading');
    const gamesWrapEl = document.getElementById('games-results-wrap');
    const tbody = document.getElementById('games-tbody');
    if (!tbody) return;

    if (gamesLoadingEl) gamesLoadingEl.style.display = 'none';

    const games = round.games || [];
    if (!games.length) {
      if (gamesWrapEl) gamesWrapEl.style.display = 'none';
      return;
    }

    if (gamesWrapEl) gamesWrapEl.style.display = '';

    tbody.innerHTML = games.map((g) => {
      const result = g.result;
      const hasResult = result && result.winner;
      const userPick = userTipsMap[g.id];
      let tipCell = '<td style="padding:.5rem .75rem;text-align:center;color:var(--muted);">—</td>';

      if (userPick && hasResult) {
        const correct = userPick === result.winner;
        tipCell = `<td style="padding:.5rem .75rem;text-align:center;">
          <span style="font-weight:600;color:${correct ? 'var(--brand)' : '#ef4444'};">
            ${correct ? '✅' : '❌'} ${escHtml(userPick)}
          </span>
        </td>`;
      } else if (userPick) {
        tipCell = `<td style="padding:.5rem .75rem;text-align:center;color:var(--muted);">${escHtml(userPick)}</td>`;
      }

      return `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:.5rem .75rem;font-weight:600;">${escHtml(g.homeTeam)}</td>
          <td style="padding:.5rem .75rem;text-align:center;color:var(--muted);font-size:.9em;">
            ${hasResult && result.homeScore != null ? `${result.homeScore} – ${result.awayScore}` : '—'}
          </td>
          <td style="padding:.5rem .75rem;font-weight:600;text-align:right;">${escHtml(g.awayTeam)}</td>
          <td style="padding:.5rem .75rem;text-align:center;">
            ${hasResult ? `<span style="font-weight:700;color:var(--brand);">${escHtml(result.winner)}</span>` : '<span style="color:var(--muted);">TBD</span>'}
          </td>
          ${tipCell}
        </tr>
      `;
    }).join('');
  }

  function renderScoresTable(userScores) {
    const scoresLoadingEl = document.getElementById('scores-loading');
    const scoresWrapEl = document.getElementById('scores-wrap');
    const scoresEmptyEl = document.getElementById('scores-empty');
    const tbody = document.getElementById('scores-tbody');
    if (!tbody) return;

    if (scoresLoadingEl) scoresLoadingEl.style.display = 'none';

    if (!userScores || !userScores.length) {
      if (scoresWrapEl) scoresWrapEl.style.display = 'none';
      if (scoresEmptyEl) scoresEmptyEl.style.display = '';
      return;
    }

    if (scoresWrapEl) scoresWrapEl.style.display = '';
    if (scoresEmptyEl) scoresEmptyEl.style.display = 'none';

    const topScore = userScores[0] ? userScores[0].correct : 0;

    tbody.innerHTML = userScores.map((s, i) => `
      <tr style="border-bottom:1px solid var(--line);">
        <td style="padding:.5rem .75rem;font-weight:700;color:var(--afl-light);">${i + 1}</td>
        <td style="padding:.5rem .75rem;font-weight:600;">${escHtml(s.member || s.userId)}</td>
        <td style="padding:.5rem .75rem;text-align:center;font-weight:700;color:${s.correct === topScore ? 'var(--brand)' : 'var(--text)'};">${s.correct}</td>
        <td style="padding:.5rem .75rem;text-align:center;color:var(--muted);">${s.total}</td>
        <td style="padding:.5rem .75rem;text-align:center;">${s.perfect ? '🌟' : '—'}</td>
      </tr>
    `).join('');
  }

  async function loadRound(roundId) {
    hide('jackpot-banner');

    const gamesLoading = document.getElementById('games-loading');
    const scoresLoading = document.getElementById('scores-loading');
    if (gamesLoading) { gamesLoading.style.display = ''; }
    if (scoresLoading) { scoresLoading.style.display = ''; }

    try {
      const data = await req(`${API}/results/${roundId}`);
      const round = data.round;

      // Update subtitle
      const subtitle = document.getElementById('results-subtitle');
      if (subtitle) subtitle.textContent = round.label;

      // Fetch user's tips for this round
      userTipsMap = {};
      if (currentUser) {
        try {
          const tipsData = await req(`${API}/my-tips/${roundId}`);
          for (const t of (tipsData.tips || [])) {
            userTipsMap[t.gameId] = t.pick;
          }
        } catch { /* not logged in or no tips */ }
      }

      renderJackpotBanner(round);
      renderGamesTable(round);
      renderScoresTable(data.userScores);

      // Next round callout
      const roundsData = await req(`${API}/rounds`);
      const allRounds = roundsData.rounds || [];
      const currentIdx = allRounds.findIndex((r) => r.id === roundId);
      const nextRound = allRounds[currentIdx + 1];
      const callout = document.getElementById('next-round-callout');
      const nextLabel = document.getElementById('next-round-label');
      if (nextRound && callout && nextLabel) {
        callout.style.display = '';
        nextLabel.textContent = `${nextRound.label} — ${nextRound.status === 'open' ? 'Open for tips now!' : 'Coming soon'}`;
      } else if (callout) {
        callout.style.display = 'none';
      }

    } catch (err) {
      if (gamesLoading) gamesLoading.innerHTML = `<span style="color:#ef4444;">Error: ${escHtml(err.message)}</span>`;
    }
  }

  async function init() {
    // Check auth (optional — used to show personal tips)
    if (token()) {
      try {
        const me = await req('/api/me');
        currentUser = me.user || null;
      } catch {
        currentUser = null;
      }
    }

    // Check for roundId in URL path
    const pathParts = window.location.pathname.split('/');
    const urlRoundId = pathParts[pathParts.length - 1] && pathParts[pathParts.length - 1] !== 'results'
      ? pathParts[pathParts.length - 1]
      : null;

    try {
      const data = await req(urlRoundId ? `${API}/results/${urlRoundId}` : `${API}/results`);

      hide('results-loading');

      if (!data.round) {
        show('no-results-msg');
        return;
      }

      show('results-content');

      // Populate round selector
      const selector = document.getElementById('round-selector');
      if (selector && data.rounds && data.rounds.length) {
        selector.innerHTML = data.rounds.map((r) =>
          `<option value="${escHtml(r.id)}">${escHtml(r.label)}</option>`
        ).join('');

        // Set current round
        const activeRoundId = urlRoundId || data.round.id;
        selector.value = activeRoundId;

        selector.addEventListener('change', () => {
          loadRound(selector.value);
        });
      }

      // Update subtitle
      const subtitle = document.getElementById('results-subtitle');
      if (subtitle) subtitle.textContent = data.round.label;

      // Load initial round
      const initialRoundId = urlRoundId || data.round.id;
      await loadRound(initialRoundId);

    } catch (err) {
      hide('results-loading');
      show('no-results-msg');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
