(function () {
  'use strict';

  const TOKEN_KEY = 'bbb-token-v3';
  const API = '/api/afl-tipping';

  let allLadder = [];
  let currentFilter = 'all';

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

  function fmtMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-AU');
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.setFilter = function setFilter(f) {
    currentFilter = f;
    const allBtn = document.getElementById('filter-all');
    const paidBtn = document.getElementById('filter-paid');
    if (allBtn) allBtn.className = f === 'all' ? 'btn chip-btn' : 'btn btn-ghost';
    if (paidBtn) paidBtn.className = f === 'paid' ? 'btn chip-btn' : 'btn btn-ghost';
    renderLadder();
  };

  function renderLadder() {
    const body = document.getElementById('ladder-body');
    const empty = document.getElementById('ladder-empty');
    const wrap = document.getElementById('ladder-wrap');
    if (!body) return;

    const filtered = currentFilter === 'paid'
      ? allLadder.filter((e) => e.paid)
      : allLadder;

    if (!filtered.length) {
      wrap.style.display = 'none';
      empty.style.display = '';
      return;
    }

    wrap.style.display = '';
    empty.style.display = 'none';

    body.innerHTML = filtered.map((entry, i) => {
      const rank = i + 1;
      const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
      const medalStr = medals[rank] ? `${medals[rank]} ` : '';
      const statusBadge = entry.paid
        ? '<span style="background:#052e16;color:#4ade80;border-radius:99px;padding:.15rem .5rem;font-size:.75em;border:1px solid #22c55e;">Paid</span>'
        : '<span style="background:#1a1000;color:#fbbf24;border-radius:99px;padding:.15rem .5rem;font-size:.75em;border:1px solid #f59e0b;">Pending</span>';
      return `
        <tr class="${rank === 1 ? 'afl-rank-1' : ''}" style="border-bottom:1px solid var(--line);">
          <td style="padding:.6rem .75rem;font-weight:700;color:var(--afl-light);">${medalStr}${rank}</td>
          <td style="padding:.6rem .75rem;font-weight:600;">${escHtml(entry.member)}</td>
          <td style="padding:.6rem .75rem;text-align:center;font-weight:700;color:var(--afl-light);">${entry.totalPoints || entry.totalCorrect}</td>
          <td style="padding:.6rem .75rem;text-align:center;color:var(--muted);">${entry.roundsPlayed}</td>
          <td style="padding:.6rem .75rem;text-align:center;color:${entry.thisWeek > 0 ? 'var(--brand)' : 'var(--muted)'};">${entry.thisWeek > 0 ? '+' + entry.thisWeek : '—'}</td>
          <td style="padding:.6rem .75rem;text-align:center;">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  function renderWeeklyBreakdown(data) {
    const sectionEl = document.getElementById('weekly-section');
    const loadingEl = document.getElementById('weekly-loading');
    const wrapEl = document.getElementById('weekly-wrap');
    const emptyEl = document.getElementById('weekly-empty');
    const labelEl = document.getElementById('weekly-round-label');
    const body = document.getElementById('weekly-body');

    if (loadingEl) loadingEl.style.display = 'none';
    if (sectionEl) sectionEl.style.display = '';

    if (data.latestRound && labelEl) {
      labelEl.textContent = data.latestRound.label;
    }

    const breakdown = data.weeklyBreakdown || [];
    if (!breakdown.length) {
      if (wrapEl) wrapEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (wrapEl) wrapEl.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    const topScore = breakdown[0] ? breakdown[0].correct : 0;
    body.innerHTML = breakdown.map((s, i) => `
      <tr style="border-bottom:1px solid var(--line);">
        <td style="padding:.5rem .75rem;font-weight:700;color:var(--afl-light);">${i + 1}</td>
        <td style="padding:.5rem .75rem;font-weight:600;">${escHtml(s.member || s.userId)}</td>
        <td style="padding:.5rem .75rem;text-align:center;font-weight:700;color:${s.correct === topScore ? 'var(--brand)' : 'var(--text)'};">${s.correct}</td>
        <td style="padding:.5rem .75rem;text-align:center;color:var(--muted);">${s.total}</td>
        <td style="padding:.5rem .75rem;text-align:center;">${s.perfect ? '🌟' : '—'}</td>
      </tr>
    `).join('');
  }

  async function load() {
    const loadingEl = document.getElementById('ladder-loading');
    try {
      const data = await req(`${API}/leaderboard`);

      allLadder = data.ladder || [];

      if (loadingEl) loadingEl.style.display = 'none';
      document.getElementById('weekly-loading') && (document.getElementById('weekly-loading').style.display = 'none');

      // Stat cards
      const prizes = data.prizes || {};
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setText('stat-entrants', prizes.confirmedCount || 0);
      setText('stat-season-pot', fmtMoney(prizes.gross || 0));
      setText('stat-weekly-pot', fmtMoney(data.weeklyPot || 0));
      setText('stat-rollover', fmtMoney(data.rollover || 0));
      setText('prize-1st', fmtMoney(prizes.first || 0));
      setText('prize-2nd', fmtMoney(prizes.second || 0));
      setText('prize-3rd', fmtMoney(prizes.third || 0));

      renderLadder();
      renderWeeklyBreakdown(data);

    } catch (err) {
      if (loadingEl) loadingEl.innerHTML = `<span style="color:#ef4444;">Error: ${escHtml(err.message)}</span>`;
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
