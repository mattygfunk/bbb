(function () {
  'use strict';

  const TOKEN_KEY = 'bbb-token-v3';
  const API = '/api/afl-tipping';

  let currentUser = null;
  let overviewData = null;
  let pollTimer = null;

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

  function fmtDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne'
    });
  }

  function statusLabel(status) {
    const map = { pending: 'Upcoming', open: 'Open for Tips', locked: 'Locked', scoring: 'Scoring', scored: 'Scored' };
    return map[status] || status;
  }

  function statusColor(status) {
    const map = { pending: '#6b7280', open: '#22c55e', locked: '#ef4444', scoring: '#f59e0b', scored: '#60a5fa' };
    return map[status] || '#6b7280';
  }

  function renderMiniLeaderboard(ladder) {
    const el = document.getElementById('mini-leaderboard');
    if (!el) return;
    if (!ladder || !ladder.length) {
      el.innerHTML = '<p style="color:var(--muted);">No scores yet.</p>';
      return;
    }
    const rows = ladder.slice(0, 5).map((entry, i) => `
      <tr class="${i === 0 ? 'afl-rank-1' : ''}">
        <td style="padding:.5rem .75rem;font-weight:700;color:var(--afl-light);width:2rem;">${i + 1}</td>
        <td style="padding:.5rem .75rem;">${escHtml(entry.member)}</td>
        <td style="padding:.5rem .75rem;text-align:right;">${entry.totalCorrect} pts</td>
        <td style="padding:.5rem .75rem;text-align:right;font-size:.8em;color:var(--muted);">${entry.thisWeek ? '+' + entry.thisWeek : ''}</td>
      </tr>
    `).join('');
    el.innerHTML = `<table class="afl-ladder" style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>`;
  }

  function renderCurrentRound(round) {
    const card = document.getElementById('current-round-card');
    if (!round || !card) return;
    card.style.display = '';

    document.getElementById('current-round-label').textContent = round.label || 'Current Round';

    const badge = document.getElementById('round-status-badge');
    badge.textContent = statusLabel(round.status);
    badge.style.color = statusColor(round.status);
    badge.style.borderColor = statusColor(round.status);

    const now = Date.now();
    const games = round.games || [];
    const list = document.getElementById('round-games-list');

    if (!games.length) {
      list.innerHTML = '<p style="color:var(--muted);">Games not yet scheduled.</p>';
      return;
    }

    list.innerHTML = games.map((g) => {
      const locked = now >= g.kickoff;
      const result = g.result;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .75rem;background:#0c1d3a;border-radius:var(--radius-md);margin-bottom:.5rem;opacity:${locked ? '.7' : '1'}">
          <div style="font-size:.9em;">
            <strong>${escHtml(g.homeTeam)}</strong>
            <span style="color:var(--muted);margin:0 .4rem;">vs</span>
            <strong>${escHtml(g.awayTeam)}</strong>
          </div>
          <div style="font-size:.8em;color:var(--muted);text-align:right;">
            ${result ? `<span style="color:var(--brand);">${escHtml(result.winner)}</span>` : ''}
            ${locked && !result ? '<span style="color:#ef4444;">🔒 Locked</span>' : ''}
            ${!locked ? `<span>${fmtDate(g.kickoff)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderJackpot(weeklyPot, rollover) {
    const amountEl = document.getElementById('jackpot-amount');
    const rolloverEl = document.getElementById('rollover-info');
    if (amountEl) amountEl.textContent = fmtMoney(weeklyPot);
    if (rolloverEl) {
      if (rollover > 0) {
        rolloverEl.innerHTML = `<span class="rollover-pill" style="display:inline-block;padding:.25rem .75rem;border-radius:99px;border:1px solid;font-size:.85em;">🔄 Rollover: ${fmtMoney(rollover)} carried over</span>`;
      } else {
        rolloverEl.innerHTML = `<span style="color:var(--muted);font-size:.9em;">Base pot: $30/week from house</span>`;
      }
    }
  }

  function renderPrizes(prizes) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmtMoney(val); };
    if (!prizes) return;
    set('prize-1st', prizes.first);
    set('prize-2nd', prizes.second);
    set('prize-3rd', prizes.third);
  }

  function renderStatusStrip(data) {
    const eEl = document.getElementById('stat-entrants');
    const wEl = document.getElementById('stat-weekly-pot');
    const rEl = document.getElementById('stat-rollover');
    const roundEl = document.getElementById('stat-round');

    if (eEl) eEl.textContent = `${data.confirmedCount || 0} entrant${data.confirmedCount === 1 ? '' : 's'}`;
    if (wEl) wEl.textContent = `Weekly pot: ${fmtMoney(data.weeklyPot)}`;
    if (rEl) {
      if (data.rollover > 0) {
        rEl.style.display = '';
        rEl.textContent = `🔄 Rollover: ${fmtMoney(data.rollover)}`;
      } else {
        rEl.style.display = 'none';
      }
    }
    if (roundEl && data.currentRound) {
      roundEl.textContent = `${data.currentRound.label} — ${statusLabel(data.currentRound.status)}`;
    } else if (roundEl) {
      roundEl.textContent = 'No active round';
    }
  }

  function renderBanter(banter, roundId) {
    const section = document.getElementById('banter-section');
    const list = document.getElementById('banter-list');
    if (!section || !list || !roundId) return;
    section.style.display = '';

    if (!banter || !banter.length) {
      list.innerHTML = '<p style="color:var(--muted);font-size:.9em;">No banter yet. Be first!</p>';
    } else {
      list.innerHTML = banter.map((b) => `
        <div style="padding:.5rem;border-bottom:1px solid var(--line);">
          <span style="font-weight:600;color:var(--afl-light);font-size:.9em;">${escHtml(b.member)}</span>
          <span style="color:var(--muted);font-size:.8em;margin-left:.5rem;">${fmtDate(b.createdAt)}</span>
          <div style="color:var(--text);margin-top:.2rem;font-size:.9em;">${escHtml(b.message)}</div>
        </div>
      `).join('');
      list.scrollTop = list.scrollHeight;
    }

    // Show appropriate form or login prompt
    const formArea = document.getElementById('banter-form-area');
    const loginPrompt = document.getElementById('banter-login-prompt');
    if (currentUser) {
      if (formArea) formArea.style.display = '';
      if (loginPrompt) loginPrompt.style.display = 'none';
    } else {
      if (formArea) formArea.style.display = 'none';
      if (loginPrompt) loginPrompt.style.display = '';
    }
  }

  function applyEntryState(entry) {
    const msgEl = document.getElementById('entry-status-msg');
    const enterBtn = document.getElementById('enter-btn');
    const paymentInstr = document.getElementById('payment-instructions');
    if (!msgEl || !enterBtn) return;

    msgEl.style.cssText = 'display:block;padding:.65rem .9rem;border-radius:var(--radius-md);border:1px solid;margin-bottom:.75rem;';

    if (!entry) {
      // No entry yet — default CTA
      msgEl.style.display = 'none';
      enterBtn.textContent = 'Register My Entry — $75';
      enterBtn.onclick = () => doEnter();
      return;
    }

    if (entry.status === 'confirmed') {
      msgEl.style.background = '#052e16';
      msgEl.style.borderColor = '#166534';
      msgEl.style.color = '#4ade80';
      msgEl.textContent = '✅ Entry confirmed! You can submit tips each round.';
      enterBtn.textContent = '🏉 Submit My Tips →';
      enterBtn.onclick = () => { window.location.href = '/afl-tipping/submit'; };
    } else {
      msgEl.style.background = '#1a1000';
      msgEl.style.borderColor = '#92400e';
      msgEl.style.color = '#fbbf24';
      msgEl.textContent = '⏳ Entry registered — awaiting payment confirmation from admin.';
      if (paymentInstr) paymentInstr.style.display = '';
      enterBtn.textContent = '💳 I\'ve Paid — Notify Admin';
      enterBtn.onclick = async () => {
        try {
          await req('/api/afl-tipping/pay', { method: 'POST', body: JSON.stringify({ method: 'bsb' }) });
          msgEl.textContent = '✅ Payment intent recorded. Admin will confirm shortly.';
        } catch (e) {
          msgEl.textContent = 'Error: ' + e.message;
        }
      };
    }
  }

  async function doEnter() {
    const enterBtn = document.getElementById('enter-btn');
    const msgEl = document.getElementById('entry-status-msg');
    if (!currentUser) { window.location.href = '/'; return; }
    if (enterBtn) { enterBtn.disabled = true; enterBtn.textContent = 'Registering…'; }
    try {
      const data = await req('/api/afl-tipping/enter', {
        method: 'POST',
        body: JSON.stringify({ email: currentUser.profile?.email || '' })
      });
      applyEntryState(data.entry);
    } catch (e) {
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = 'Error: ' + e.message;
      }
    } finally {
      if (enterBtn) enterBtn.disabled = false;
    }
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadOverview() {
    try {
      const data = await req(`${API}/overview`);
      overviewData = data;

      document.getElementById('afl-loading').style.display = 'none';
      document.getElementById('afl-content').style.display = '';

      renderStatusStrip(data);
      renderCurrentRound(data.currentRound);
      renderMiniLeaderboard(data.leaderboard);
      renderJackpot(data.weeklyPot, data.rollover);
      renderPrizes(data.prizes);
      renderKnockout(data.knockout, data.prizes);
      renderBanter(data.banter, data.currentRound ? data.currentRound.id : null);

      // Load jackpot trajectory + last winner async (non-blocking)
      loadWinnersInfo();
    } catch (err) {
      document.getElementById('afl-loading').innerHTML = `<p style="color:#ef4444;">Failed to load: ${escHtml(err.message)}</p>`;
    }
  }

  async function loadWinnersInfo() {
    try {
      const data = await req('/api/afl-tipping/winners');
      renderJackpotTrajectory(data);
    } catch { /* silent */ }
  }

  function renderJackpotTrajectory(data) {
    // Inject trajectory section if not already present
    let section = document.getElementById('jackpot-traj-section');
    if (!section) {
      section = document.createElement('section');
      section.id = 'jackpot-traj-section';
      section.className = 'card';
      section.style.cssText = 'margin-bottom:1.5rem;';
      section.innerHTML = '<h3 style="margin-top:0;color:#93c5fd;">🎰 Jackpot Trajectory</h3>' +
        '<p style="color:var(--muted);font-size:.85rem;margin-top:0;">Last rounds — 🟢 won · 🔄 rolled over</p>' +
        '<div id="jackpot-traj-dots" style="display:flex;gap:.5rem;flex-wrap:wrap;"></div>' +
        '<div style="margin-top:.5rem;">' +
          '<a href="/afl-tipping/winners" class="btn btn-ghost" style="font-size:.85rem;padding:.4rem .7rem;">View All Winners →</a>' +
        '</div>';
      // Insert before first mini leaderboard/jackpot grid
      const afl = document.getElementById('afl-content');
      const grid = afl && afl.querySelector('.responsive-2col');
      if (grid) afl.insertBefore(section, grid);
    }

    const dotsEl = document.getElementById('jackpot-traj-dots');
    if (!dotsEl) return;

    const weeks = (data.weeklyWinners || []).slice(-8);
    if (weeks.length === 0) {
      dotsEl.innerHTML = '<span style="color:var(--muted);font-size:.85rem;">No completed rounds yet.</span>';
      return;
    }

    dotsEl.innerHTML = weeks.map(w => {
      const won = !w.rolledOver && w.winnerMember;
      const bg = won ? '#052e16' : '#431407';
      const border = won ? '#16a34a' : '#b45309';
      const color = won ? '#4ade80' : '#fde68a';
      const icon = won ? '✅' : '🔄';
      return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:.5rem;padding:.4rem .75rem;font-size:.8rem;font-weight:700;color:' + color + ';text-align:center;min-width:72px;">' +
        '<div>' + escHtml(w.label) + '</div>' +
        '<div style="margin-top:.2rem;">' + icon + ' ' + (won ? escHtml(w.winnerMember) : 'Rolled') + '</div>' +
        '<div style="font-size:.75rem;opacity:.85;">$' + (w.jackpotTotal || 30) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderToolbox(toolbox, currentRound) {
    const card = document.getElementById('toolbox-card');
    if (!card || !toolbox) return;
    card.style.display = '';

    const remaining = toolbox.doublePointsRemaining || 0;
    const activeRounds = toolbox.doublePointsActiveRounds || [];

    const badge = document.getElementById('toolbox-dp-badge');
    const countEl = document.getElementById('toolbox-dp-count');
    const pluralEl = document.getElementById('toolbox-dp-plural');
    const statusEl = document.getElementById('toolbox-round-status');

    if (badge) badge.textContent = `${remaining} Double Point${remaining !== 1 ? 's' : ''} remaining`;
    if (countEl) countEl.textContent = remaining;
    if (pluralEl) pluralEl.textContent = remaining !== 1 ? 's' : '';

    // Show enhanced toolbox status
    renderToolboxUsage(toolbox);

    if (!statusEl) return;

    if (!currentRound) {
      statusEl.innerHTML = '';
      return;
    }

    const roundId = currentRound.id;
    const isActive = activeRounds.includes(roundId);
    const now = Date.now();
    const lockAt = currentRound.lockAt || null;
    const isLocked = currentRound.status === 'locked' || currentRound.status === 'scored' ||
      currentRound.status === 'scoring' || (lockAt && now >= lockAt);

    if (isActive && isLocked) {
      statusEl.innerHTML = `<span style="color:#4ade80;font-weight:700;">🟢 Double Points Active ✅ for ${escHtml(currentRound.label)} (locked in)</span>`;
    } else if (isActive) {
      statusEl.innerHTML = `
        <span style="color:#4ade80;font-weight:700;">🟢 Double Points Active ✅ for ${escHtml(currentRound.label)}</span>
        <button id="toolbox-deactivate-btn" class="btn btn-ghost" style="margin-left:.75rem;font-size:.82em;padding:.3rem .7rem;">Deactivate</button>
      `;
      const deactivateBtn = document.getElementById('toolbox-deactivate-btn');
      if (deactivateBtn) {
        deactivateBtn.addEventListener('click', async () => {
          deactivateBtn.disabled = true;
          deactivateBtn.textContent = '…';
          try {
            const res = await req(`${API}/toolbox/deactivate`, { method: 'POST', body: JSON.stringify({ roundId }) });
            renderToolbox(res.toolbox, currentRound);
          } catch (e) {
            deactivateBtn.disabled = false;
            deactivateBtn.textContent = 'Deactivate';
            alert('Error: ' + e.message);
          }
        });
      }
    } else if (!isLocked && remaining > 0) {
      statusEl.innerHTML = `
        <button id="toolbox-activate-btn" class="btn btn-primary" style="font-size:.9em;padding:.4rem .9rem;">
          ⚡ Activate Double Points for ${escHtml(currentRound.label)}
        </button>
      `;
      const activateBtn = document.getElementById('toolbox-activate-btn');
      if (activateBtn) {
        activateBtn.addEventListener('click', async () => {
          activateBtn.disabled = true;
          activateBtn.textContent = '…';
          try {
            const res = await req(`${API}/toolbox/activate`, { method: 'POST', body: JSON.stringify({ roundId }) });
            renderToolbox(res.toolbox, currentRound);
          } catch (e) {
            activateBtn.disabled = false;
            activateBtn.textContent = `⚡ Activate Double Points for ${currentRound.label}`;
            alert('Error: ' + e.message);
          }
        });
      }
    } else if (remaining === 0) {
      statusEl.innerHTML = `<span style="color:var(--muted);font-size:.9em;">No activations remaining.</span>`;
    } else {
      // Locked round, not active
      statusEl.innerHTML = `<span style="color:var(--muted);font-size:.9em;">Round locked — Double Points not activated for this round.</span>`;
    }
  }

  function renderToolboxUsage(toolbox, entryStatus = null) {
    const detailsEl = document.getElementById('toolbox-usage-details');
    const noEntryEl = document.getElementById('toolbox-no-entry');
    
    if (!toolbox) {
      if (detailsEl) detailsEl.style.display = 'none';
      if (noEntryEl) {
        noEntryEl.style.display = '';
        // Update message based on entry status
        if (entryStatus === 'pending') {
          noEntryEl.innerHTML = '<span style="color:#fbbf24;">⏳ Entry registered - awaiting payment confirmation to access toolbox.</span>';
        } else if (entryStatus) {
          noEntryEl.innerHTML = `<span style="color:var(--muted);">Entry status: ${escHtml(entryStatus)}. Toolbox available once confirmed.</span>`;
        } else {
          noEntryEl.innerHTML = '<a href="#enter-card" style="color:#93c5fd;">Register and confirm your entry</a> to access your toolbox.';
        }
      }
      return;
    }
    
    if (detailsEl) detailsEl.style.display = '';
    if (noEntryEl) noEntryEl.style.display = 'none';

    const remainingEl = document.getElementById('toolbox-dp-remaining');
    const seasonEl = document.getElementById('toolbox-season-year');
    const historyEl = document.getElementById('toolbox-usage-history');

    if (remainingEl) remainingEl.textContent = toolbox.doublePointsRemaining || 0;
    if (seasonEl) seasonEl.textContent = toolbox.season || new Date().getFullYear();

    if (historyEl) {
      const activeRounds = toolbox.doublePointsActiveRounds || [];
      const used = 1 - (toolbox.doublePointsRemaining || 0); // Originally had 1, now has X remaining
      
      if (activeRounds.length > 0) {
        historyEl.innerHTML = `
          <div style="background:#0c1d3a;border-radius:var(--radius-md);padding:.75rem;">
            <div style="color:#93c5fd;font-size:.85em;font-weight:600;margin-bottom:.5rem;">✅ Double Points Usage</div>
            <div style="color:var(--muted);font-size:.85em;">
              Active rounds: <strong style="color:#fff;">${activeRounds.length}</strong>
              ${activeRounds.length > 0 ? '<br>Round IDs: <code style="color:#60a5fa;">' + activeRounds.slice(0, 2).map(id => id.slice(-6)).join(', ') + '</code>' : ''}
            </div>
          </div>
        `;
      } else if (used > 0) {
        historyEl.innerHTML = `
          <div style="background:#0c1d3a;border-radius:var(--radius-md);padding:.75rem;">
            <div style="color:#93c5fd;font-size:.85em;font-weight:600;margin-bottom:.5rem;">📊 Usage History</div>
            <div style="color:var(--muted);font-size:.85em;">Used ${used} of 1 activation${used !== 1 ? 's' : ''} this season</div>
          </div>
        `;
      } else {
        historyEl.innerHTML = `
          <div style="background:#0c1d3a;border-radius:var(--radius-md);padding:.75rem;">
            <div style="color:#93c5fd;font-size:.85em;font-weight:600;margin-bottom:.5rem;">💎 Fresh Toolbox</div>
            <div style="color:var(--muted);font-size:.85em;">Your Double Points activation is ready to use!</div>
          </div>
        `;
      }
    }
  }

  function renderKnockout(knockoutData, prizes) {
    const container = document.getElementById('ko-competitions-container');
    if (!container || !Array.isArray(knockoutData)) return;

    const koPrizeEach = prizes?.knockoutEach || 0;

    container.innerHTML = knockoutData.map(ko => {
      const activePlayers = ko.activePlayers || [];
      const eliminatedCount = ko.totalEliminated || 0;
      const winner = ko.winner;
      
      let activeNamesHTML = '';
      if (activePlayers.length === 0) {
        activeNamesHTML = 'Competition over';
      } else if (activePlayers.length <= 4) {
        activeNamesHTML = activePlayers.map(p => `<span style="color:#4ade80;font-weight:600;">${escHtml(p.member)}</span>`).join(', ');
      } else {
        const shown = activePlayers.slice(0, 3).map(p => `<span style="color:#4ade80;font-weight:600;">${escHtml(p.member)}</span>`).join(', ');
        activeNamesHTML = `${shown} <span style="color:var(--muted);">+${activePlayers.length - 3} more</span>`;
      }
      
      const winnerHTML = winner ? `
        <div style="margin-top:1rem;padding:1rem;background:#052e16;border:1px solid #22c55e;border-radius:var(--radius-md);">
          <div style="color:#4ade80;font-weight:700;margin-bottom:.5rem;">🏆 Winner!</div>
          <div style="color:#fff;font-size:1.1em;">${escHtml(winner.member)}</div>
          <div style="color:var(--muted);font-size:.85em;">Prize: ${fmtMoney(winner.prize)}</div>
        </div>` : '';
        
      return `
        <div class="card" style="flex:1;min-width:280px;">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
            <h4 style="margin:0;color:#ef4444;">${escHtml(ko.name)}</h4>
            <span class="pill" style="background:#3f1d1d;color:#fca5a5;border:1px solid #ef4444;">${ko.status === 'completed' ? 'Completed' : 'Active'}</span>
            <span class="pill" style="background:#1a1000;color:#fbbf24;border:1px solid #f59e0b;margin-left:auto;">Prize: ${fmtMoney(koPrizeEach)}</span>
          </div>
          <p style="color:var(--muted);font-size:.82em;margin:-.25rem 0 .75rem;">
            Uses <strong>game ${ko.id}</strong> of each round. Tip incorrectly and you're out.
          </p>
          <div style="display:grid;gap:1rem;" class="responsive-2col">
            <div>
              <div style="color:var(--muted);font-size:.8rem;margin-bottom:.25rem;">Active</div>
              <div style="font-size:1.4rem;font-weight:800;color:#4ade80;">${activePlayers.length}</div>
              <div style="margin-top:.5rem;color:var(--muted);font-size:.85em;">${activeNamesHTML}</div>
            </div>
            <div>
              <div style="color:var(--muted);font-size:.8rem;margin-bottom:.25rem;">Eliminated</div>
              <div style="font-size:1.4rem;font-weight:800;color:#ef4444;">${eliminatedCount}</div>
            </div>
          </div>
          ${winnerHTML}
        </div>
      `;
    }).join('');
  }

  async function init() {
    // Check auth
    if (token()) {
      try {
        const me = await req('/api/me');
        currentUser = me.user || null;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        currentUser = null;
      }
    }

    await loadOverview();
    if (currentUser) {
      // Load entry status without side effects
      try {
        const entryData = await req('/api/afl-tipping/my-entry');
        applyEntryState(entryData.entry);
        // Show toolbox based on entry status
        if (entryData.entry) {
          if (entryData.entry.status === 'confirmed' && entryData.entry.toolbox) {
            // Confirmed entry with toolbox - show full toolbox
            renderToolbox(entryData.entry.toolbox, overviewData && overviewData.currentRound);
          } else if (entryData.entry.status === 'confirmed') {
            // Confirmed but no toolbox yet - initialize it
            renderToolboxUsage({ doublePointsRemaining: 1, season: new Date().getFullYear() });
          } else {
            // Pending or other status - show status message
            renderToolboxUsage(null, entryData.entry.status);
          }
        } else {
          // No entry at all - show register message
          renderToolboxUsage(null);
        }
      } catch {
        // Not logged in or no token — default state
        const enterBtn = document.getElementById('enter-btn');
        if (enterBtn) {
          enterBtn.textContent = 'Register My Entry — $75';
          enterBtn.onclick = () => doEnter();
        }
      }
    } else {
      const enterBtn = document.getElementById('enter-btn');
      if (enterBtn) {
        enterBtn.textContent = 'Log In to Enter';
        enterBtn.onclick = () => { window.location.href = '/'; };
      }
    }

    // Banter submit
    const banterSubmit = document.getElementById('banter-submit');
    const banterInput = document.getElementById('banter-input');
    if (banterSubmit && banterInput) {
      banterSubmit.addEventListener('click', async () => {
        const msg = banterInput.value.trim();
        if (!msg || !overviewData || !overviewData.currentRound) return;
        banterSubmit.disabled = true;
        try {
          await req(`${API}/banter`, {
            method: 'POST',
            body: JSON.stringify({ roundId: overviewData.currentRound.id, message: msg })
          });
          banterInput.value = '';
          // Reload banter
          const fresh = await req(`${API}/banter/${overviewData.currentRound.id}`);
          renderBanter(fresh.banter, overviewData.currentRound.id);
        } catch (e) {
          alert('Could not send: ' + e.message);
        } finally {
          banterSubmit.disabled = false;
        }
      });
      banterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); banterSubmit.click(); }
      });
    }

    // Poll every 60s
    pollTimer = setInterval(() => {
      loadOverview();
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
