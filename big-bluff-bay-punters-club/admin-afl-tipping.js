'use strict';
/* global showTab */

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN_KEY = 'bbb-token-v3';
const API = '/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem(TOKEN_KEY); }

async function apiReq(path, opt = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opt,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opt.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function fmt$(n) { return '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showMsg(id, msg, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? 'var(--brand)' : '#ef4444';
}

// ── Tab navigation ────────────────────────────────────────────────────────────
// Used by admin-afl-tipping.html (standalone). admin.html uses aflShowTab (inline script).
window.showTab = function (name) {
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.add('active');
  const btn = [...document.querySelectorAll('.tab-btn')].find((b) => b.getAttribute('onclick') === `showTab('${name}')`);
  if (btn) btn.classList.add('active');

  // Lazy-load tab data
  if (name === 'entries') loadEntries();
  if (name === 'rounds') loadRounds();
  if (name === 'results') loadRoundsForSelector();
  if (name === 'payouts') { loadRoundsForSelector(); loadPayoutHistory(); }
  if (name === 'email') loadRoundsForEmailSelectors();
  if (name === 'analytics') loadAnalytics();
};

// Auto-init on standalone page
if (document.getElementById('admin-content')) {
  // standalone admin-afl-tipping.html — auth handled separately above
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let adminToken = null;

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const data = await apiReq('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (!data.token) throw new Error('No token returned');
    if (data.user && data.user.role !== 'admin') throw new Error('Not an admin account');
    localStorage.setItem(TOKEN_KEY, data.token);
    adminToken = data.token;
    showAdminUI(data.user);
  } catch (err) {
    errEl.textContent = err.message || 'Login failed';
    errEl.style.display = 'block';
  }
});

function showAdminUI(user) {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  const statusEl = document.getElementById('admin-status');
  if (statusEl) statusEl.textContent = `Logged in as ${user.username}`;
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) logoutBtn.style.display = '';
  loadAdminOverview();
}

document.getElementById('admin-logout-btn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

// Auto-login if token exists
(async function checkExistingSession() {
  const token = getToken();
  if (!token) return;
  try {
    const me = await apiReq('/me');
    if (me.user && me.user.role === 'admin') {
      adminToken = token;
      showAdminUI(me.user);
    }
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
})();

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadAdminOverview() {
  try {
    const data = await apiReq('/afl-tipping/admin/overview');
    setEl('ov-confirmed', data.confirmedCount ?? '—');
    setEl('ov-pending', data.pendingCount ?? '—');
    const pot = (data.confirmedCount || 0) * (data.season?.entryFee || 75);
    setEl('ov-pot', fmt$(pot));
    setEl('ov-rollover', fmt$(data.weeklyRollover || 0));

    const net = pot * 0.80;
    setEl('ov-prize-1', fmt$(net * 0.40));
    setEl('ov-prize-2', fmt$(net * 0.25));
    setEl('ov-prize-3', fmt$(net * 0.15));
  } catch (err) {
    console.error('Overview load failed:', err.message);
  }
}

// ── Entries ───────────────────────────────────────────────────────────────────
async function loadEntries() {
  const listEl = document.getElementById('entries-list');
  const loadEl = document.getElementById('entries-loading');
  try {
    const data = await apiReq('/afl-tipping/admin/entries');
    if (loadEl) loadEl.style.display = 'none';
    if (!listEl) return;

    if (!data.entries || !data.entries.length) {
      listEl.innerHTML = '<p style="color:var(--muted);">No entries yet.</p>';
      return;
    }

    // Header
    listEl.innerHTML = `
      <div class="entry-row" style="font-weight:700;color:var(--muted);font-size:.8em;border-bottom:2px solid var(--line);margin-bottom:.25rem;">
        <span>Member</span><span>Status</span><span>Paid</span><span>Entered</span><span>Action</span>
      </div>
      ${data.entries.map((e) => `
        <div class="entry-row" id="entry-row-${e.id}">
          <span style="font-weight:600;">${escHtml(e.member)}<br><span style="color:var(--muted);font-size:.8em;">${escHtml(e.email || '—')}</span></span>
          <span><span class="pill" style="
            background:${e.status === 'confirmed' ? '#052e16' : e.status === 'withdrawn' ? '#2d0808' : '#1c1800'};
            color:${e.status === 'confirmed' ? '#86efac' : e.status === 'withdrawn' ? '#fca5a5' : '#fde68a'};
            border-color:${e.status === 'confirmed' ? '#14532d' : e.status === 'withdrawn' ? '#7f1d1d' : '#78350f'};
          ">${e.status}</span></span>
          <span>${e.paid ? '✅ Paid' : '❌ Pending'}<br><span style="color:var(--muted);font-size:.8em;">${e.paidAt ? fmtDate(e.paidAt) : ''}</span></span>
          <span style="color:var(--muted);font-size:.85em;">${fmtDate(e.createdAt)}</span>
          <span style="display:flex;gap:.35rem;flex-wrap:wrap;">
            ${e.status !== 'confirmed' ? `<button class="toggle-paid btn btn-ghost" style="font-size:.8em;" onclick="confirmEntry('${e.id}')">✅ Confirm</button>` : ''}
            ${!e.paid ? `<button class="toggle-paid btn btn-ghost" style="font-size:.8em;" onclick="markPaid('${e.id}')">💰 Paid</button>` : ''}
            ${e.status !== 'withdrawn' ? `<button class="toggle-paid btn btn-danger" style="font-size:.8em;" onclick="withdrawEntry('${e.id}')">✗ Withdraw</button>` : ''}
          </span>
        </div>
      `).join('')}
    `;
  } catch (err) {
    if (loadEl) loadEl.textContent = 'Failed to load entries: ' + err.message;
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.confirmEntry = async function (entryId) {
  try {
    await apiReq(`/afl-tipping/admin/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'confirmed', paid: true })
    });
    loadEntries();
    loadAdminOverview();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

window.markPaid = async function (entryId) {
  try {
    await apiReq(`/afl-tipping/admin/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify({ paid: true })
    });
    loadEntries();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

window.withdrawEntry = async function (entryId) {
  if (!confirm('Withdraw this entry?')) return;
  try {
    await apiReq(`/afl-tipping/admin/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'withdrawn' })
    });
    loadEntries();
    loadAdminOverview();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
};

// ── Rounds ────────────────────────────────────────────────────────────────────
const AFL_TEAMS = [
  'Adelaide', 'Brisbane Lions', 'Carlton', 'Collingwood', 'Essendon',
  'Fremantle', 'Geelong', 'Gold Coast Suns', 'GWS Giants', 'Hawthorn',
  'Melbourne', 'North Melbourne', 'Port Adelaide', 'Richmond', 'St Kilda',
  'Sydney Swans', 'West Coast Eagles', 'Western Bulldogs'
];

let gameCount = 0;

function addGameInput(home = '', away = '', venue = '', kickoff = '') {
  gameCount++;
  const idx = gameCount;
  const container = document.getElementById('games-input-container');
  const div = document.createElement('div');
  div.id = `game-input-${idx}`;
  div.className = 'card';
  div.style.marginBottom = '.75rem';

  const teamOpts = AFL_TEAMS.map((t) => `<option value="${t}" ${t === home ? 'selected' : ''}>${t}</option>`).join('');
  const awayOpts = AFL_TEAMS.map((t) => `<option value="${t}" ${t === away ? 'selected' : ''}>${t}</option>`).join('');

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
      <strong style="color:var(--afl-light);">Game ${idx}</strong>
      <button type="button" class="btn btn-ghost" style="font-size:.8em;padding:.25rem .5rem;" onclick="document.getElementById('game-input-${idx}').remove()">✕ Remove</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.5rem;align-items:center;margin-bottom:.5rem;">
      <select name="game_home_${idx}" class="form-input" required><option value="">Home Team</option>${teamOpts}</select>
      <span style="color:var(--muted);font-weight:700;">vs</span>
      <select name="game_away_${idx}" class="form-input" required><option value="">Away Team</option>${awayOpts}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">
      <div>
        <label class="form-label">Venue</label>
        <input type="text" name="game_venue_${idx}" class="form-input" placeholder="MCG" value="${escHtml(venue)}" />
      </div>
      <div>
        <label class="form-label">Kickoff (Melbourne time)</label>
        <input type="datetime-local" name="game_kickoff_${idx}" class="form-input" value="${kickoff}" required />
      </div>
    </div>
  `;
  container.appendChild(div);
}

document.getElementById('add-game-btn').addEventListener('click', () => addGameInput());

// Add initial game slot
addGameInput();

document.getElementById('create-round-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('create-round-msg');
  msgEl.textContent = 'Creating…';
  msgEl.style.color = 'var(--muted)';

  try {
    const roundNumber = parseInt(document.getElementById('new-round-number').value, 10);
    const labelInput = document.getElementById('new-round-label').value.trim();
    const label = labelInput || `Round ${roundNumber}`;

    // Collect games
    const form = e.target;
    const games = [];
    const gameInputs = document.querySelectorAll('[id^="game-input-"]');
    for (const gameDiv of gameInputs) {
      const idx = gameDiv.id.replace('game-input-', '');
      const homeEl = form.querySelector(`[name="game_home_${idx}"]`);
      const awayEl = form.querySelector(`[name="game_away_${idx}"]`);
      const venueEl = form.querySelector(`[name="game_venue_${idx}"]`);
      const kickoffEl = form.querySelector(`[name="game_kickoff_${idx}"]`);
      if (!homeEl || !awayEl) continue;
      const homeTeam = homeEl.value;
      const awayTeam = awayEl.value;
      if (!homeTeam || !awayTeam) continue;
      const kickoffLocal = kickoffEl ? kickoffEl.value : '';
      // Parse datetime-local as Melbourne time
      const kickoffMs = kickoffLocal ? new Date(kickoffLocal + ':00+11:00').getTime() : null;
      games.push({
        homeTeam,
        awayTeam,
        venue: venueEl ? venueEl.value.trim() : '',
        kickoff: kickoffMs
      });
    }

    if (!games.length) throw new Error('Add at least one game');

    await apiReq('/afl-tipping/admin/rounds', {
      method: 'POST',
      body: JSON.stringify({ roundNumber, label, games })
    });

    msgEl.textContent = '✅ Round created!';
    msgEl.style.color = 'var(--brand)';
    e.target.reset();
    // Clear game inputs and re-add default
    document.getElementById('games-input-container').innerHTML = '';
    gameCount = 0;
    addGameInput();

    loadRounds();
    loadRoundsForSelector();
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
});

async function loadRounds() {
  const listEl = document.getElementById('rounds-list');
  const loadEl = document.getElementById('rounds-loading');
  try {
    const data = await apiReq('/afl-tipping/rounds');
    if (loadEl) loadEl.style.display = 'none';
    if (!listEl) return;

    if (!data.rounds || !data.rounds.length) {
      listEl.innerHTML = '<p style="color:var(--muted);">No rounds yet.</p>';
      return;
    }

    const statusColor = { pending: '#fde68a', open: '#86efac', locked: '#93c5fd', scoring: '#f59e0b', scored: '#86efac' };
    listEl.innerHTML = data.rounds.map((r) => `
      <div class="round-row">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:.5rem;">
          <strong style="color:var(--afl-light);">${escHtml(r.label)}</strong>
          <span class="pill" style="color:${statusColor[r.status] || '#e5e7eb'};">${r.status}</span>
        </div>
        <div style="color:var(--muted);font-size:.85em;margin-bottom:.75rem;">
          ${r.gameCount} game${r.gameCount !== 1 ? 's' : ''} &bull; Created ${fmtDate(r.createdAt)}
          ${r.openAt ? ` &bull; Opens ${fmtDate(r.openAt)}` : ''}
          ${r.lockAt ? ` &bull; Locks ${fmtDate(r.lockAt)}` : ''}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          ${r.status === 'pending' ? `<button class="btn btn-ghost" style="font-size:.85em;" onclick="openRound('${r.id}')">▶ Open for Tipping</button>` : ''}
          ${r.status === 'open' ? `<button class="btn btn-ghost" style="font-size:.85em;" onclick="lockRound('${r.id}')">🔒 Lock Round</button>` : ''}
          ${(r.status === 'locked' || r.status === 'open') ? `<button class="btn btn-primary" style="font-size:.85em;" onclick="goToResults('${r.id}')">📋 Set Results & Score</button>` : ''}
          ${r.status === 'scored' ? `<span style="color:#86efac;font-size:.85em;">✅ Scored</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    if (loadEl) loadEl.textContent = 'Failed to load rounds: ' + err.message;
  }
}

window.openRound = async function (roundId) {
  try {
    await apiReq(`/afl-tipping/admin/rounds/${roundId}/open`, { method: 'POST' });
    loadRounds();
  } catch (err) { alert('Failed: ' + err.message); }
};

window.lockRound = async function (roundId) {
  if (!confirm('Lock this round? Players will no longer be able to submit tips.')) return;
  try {
    await apiReq(`/afl-tipping/admin/rounds/${roundId}/lock`, { method: 'POST' });
    loadRounds();
  } catch (err) { alert('Failed: ' + err.message); }
};

window.goToResults = function (roundId) {
  // Works in both standalone (showTab) and embedded in admin.html (aflShowTab)
  if (typeof window.aflShowTab === 'function') window.aflShowTab('results');
  else showTab('results');
  document.getElementById('results-round-selector').value = roundId;
  loadRoundForResults();
};

// ── Results / Scoring ─────────────────────────────────────────────────────────
async function loadRoundsForSelector() {
  try {
    const data = await apiReq('/afl-tipping/rounds');
    ['results-round-selector', 'reminder-round-selector', 'results-email-round-selector'].forEach((id) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Select Round —</option>' +
        (data.rounds || []).map((r) => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${escHtml(r.label)} (${r.status})</option>`).join('');
    });
  } catch {}
}

window.loadRoundForResults = async function () {
  const roundId = document.getElementById('results-round-selector').value;
  const areaEl = document.getElementById('results-games-area');
  const scoreArea = document.getElementById('score-round-area');
  if (!areaEl) return;
  if (!roundId) { areaEl.innerHTML = ''; if (scoreArea) scoreArea.style.display = 'none'; return; }

  try {
    const data = await apiReq(`/afl-tipping/rounds/${roundId}`);
    const round = data.round;
    if (!round) { areaEl.innerHTML = '<p style="color:var(--muted);">Round not found.</p>'; return; }

    const games = round.games || [];
    const teamOpts = (sel) => AFL_TEAMS.map((t) => `<option value="${t}" ${t === sel ? 'selected' : ''}>${t}</option>`).join('');

    areaEl.innerHTML = `
      <h3 style="color:var(--afl-light);">${escHtml(round.label)} — Games</h3>
      ${games.map((g) => {
        const res = g.result || {};
        const winner = res.winner || '';
        const homeScore = res.homeScore != null ? res.homeScore : '';
        const awayScore = res.awayScore != null ? res.awayScore : '';
        const isLocked = g.kickoff && Date.now() >= Number(g.kickoff);
        return `
          <div class="card" style="margin-bottom:.75rem;" id="game-card-${g.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:.5rem;">
              <strong>${escHtml(g.homeTeam)} vs ${escHtml(g.awayTeam)}</strong>
              <span style="color:var(--muted);font-size:.85em;">${g.venue || ''} &bull; ${fmtDate(g.kickoff)}</span>
            </div>
            ${g.result ? `<div style="margin-bottom:.5rem;color:#86efac;font-size:.9em;">✅ Result set: <strong>${escHtml(g.result.winner)}</strong> (${g.homeTeam} ${g.result.homeScore ?? '?'} — ${g.awayTeam} ${g.result.awayScore ?? '?'})</div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:.5rem;align-items:end;">
              <div>
                <label class="form-label">Winner</label>
                <select id="result-winner-${g.id}" class="form-input">
                  <option value="">— Select Winner —</option>
                  <option value="${g.homeTeam}" ${winner === g.homeTeam ? 'selected' : ''}>${escHtml(g.homeTeam)}</option>
                  <option value="${g.awayTeam}" ${winner === g.awayTeam ? 'selected' : ''}>${escHtml(g.awayTeam)}</option>
                  <option value="Draw" ${winner === 'Draw' ? 'selected' : ''}>Draw</option>
                </select>
              </div>
              <div>
                <label class="form-label">${escHtml(g.homeTeam)} Score</label>
                <input type="number" id="result-home-${g.id}" class="form-input" min="0" value="${homeScore}" />
              </div>
              <div>
                <label class="form-label">${escHtml(g.awayTeam)} Score</label>
                <input type="number" id="result-away-${g.id}" class="form-input" min="0" value="${awayScore}" />
              </div>
              <div>
                <button class="btn btn-primary" style="font-size:.85em;" onclick="saveGameResult('${roundId}','${g.id}','${escHtml(g.homeTeam)}','${escHtml(g.awayTeam)}')">Save</button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;

    if (scoreArea) {
      scoreArea.style.display = round.status !== 'scored' ? 'block' : 'none';
      const msgEl = document.getElementById('score-round-msg');
      if (msgEl && round.status === 'scored') msgEl.textContent = '✅ Already scored';
    }
  } catch (err) {
    areaEl.innerHTML = `<p style="color:#ef4444;">Failed to load round: ${err.message}</p>`;
  }
};

window.saveGameResult = async function (roundId, gameId, homeTeam, awayTeam) {
  const winner = document.getElementById(`result-winner-${gameId}`)?.value;
  const homeScore = document.getElementById(`result-home-${gameId}`)?.value;
  const awayScore = document.getElementById(`result-away-${gameId}`)?.value;

  if (!winner) { alert('Please select a winner'); return; }

  try {
    await apiReq(`/afl-tipping/admin/rounds/${roundId}/result`, {
      method: 'POST',
      body: JSON.stringify({
        gameId,
        winner,
        homeScore: homeScore !== '' ? Number(homeScore) : null,
        awayScore: awayScore !== '' ? Number(awayScore) : null
      })
    });
    // Reload the round to show updated results
    loadRoundForResults();
  } catch (err) {
    alert('Failed to save result: ' + err.message);
  }
};

window.scoreRound = async function () {
  const roundId = document.getElementById('results-round-selector').value;
  if (!roundId) { alert('Select a round first'); return; }
  const msgEl = document.getElementById('score-round-msg');
  msgEl.textContent = 'Scoring…';
  msgEl.style.color = 'var(--muted)';

  try {
    const data = await apiReq(`/afl-tipping/admin/rounds/${roundId}/score`, { method: 'POST' });
    let msg = `✅ Scored!`;
    if (data.weeklyWinner) {
      msg += ` Weekly winner: ${data.weeklyWinner.member} (${data.weeklyWinner.correct} correct) — ${fmt$(data.payout)}`;
    } else if (data.rolledOver) {
      msg += ` Jackpot rolled over (${fmt$(data.newRollover || 0)} total)`;
    }
    msgEl.textContent = msg;
    msgEl.style.color = 'var(--brand)';
    loadRounds();
    loadAdminOverview();
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
};

// ── Payouts ───────────────────────────────────────────────────────────────────
document.getElementById('payout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('payout-msg');
  try {
    const member = document.getElementById('payout-member').value.trim();
    const place = document.getElementById('payout-place').value;
    const amount = parseFloat(document.getElementById('payout-amount').value);
    const note = document.getElementById('payout-note').value.trim();

    await apiReq('/afl-tipping/admin/season/payout', {
      method: 'POST',
      body: JSON.stringify({ member, place, amount, note })
    });
    msgEl.textContent = '✅ Payout recorded';
    msgEl.style.color = 'var(--brand)';
    e.target.reset();
    loadPayoutHistory();
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
});

async function loadPayoutHistory() {
  const el = document.getElementById('payout-history');
  if (!el) return;
  try {
    const data = await apiReq('/afl-tipping/admin/overview');
    const history = data.payoutAudit || [];
    if (!history.length) {
      el.innerHTML = '<p style="color:var(--muted);">No payouts recorded yet.</p>';
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:.9em;">
        <thead><tr style="color:var(--muted);text-align:left;">
          <th style="padding:.4rem;">Member</th><th>Place</th><th>Amount</th><th>Date</th><th>Note</th>
        </tr></thead>
        <tbody>
          ${history.map((p) => `
            <tr style="border-top:1px solid var(--line);">
              <td style="padding:.4rem;">${escHtml(p.member)}</td>
              <td>${escHtml(p.place)}</td>
              <td style="color:var(--brand);">${fmt$(p.amount)}</td>
              <td style="color:var(--muted);font-size:.85em;">${fmtDate(p.recordedAt)}</td>
              <td style="color:var(--muted);font-size:.85em;">${escHtml(p.note || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    el.textContent = 'Failed to load payout history.';
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────
function loadRoundsForEmailSelectors() {
  loadRoundsForSelector();
}

window.sendReminder = async function () {
  const roundId = document.getElementById('reminder-round-selector').value;
  const msgEl = document.getElementById('reminder-msg');
  if (!roundId) { msgEl.textContent = 'Select a round first'; return; }
  msgEl.textContent = 'Sending…';
  msgEl.style.color = 'var(--muted)';
  try {
    const data = await apiReq('/afl-tipping/admin/email/reminder', {
      method: 'POST',
      body: JSON.stringify({ roundId })
    });
    msgEl.textContent = data.sent
      ? `✅ Sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}`
      : '⚠️ ' + (data.reason || 'No recipients or SMTP not configured');
    msgEl.style.color = data.sent ? 'var(--brand)' : '#f59e0b';
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
};

window.sendResultsEmail = async function () {
  const roundId = document.getElementById('results-email-round-selector').value;
  const msgEl = document.getElementById('results-email-msg');
  if (!roundId) { msgEl.textContent = 'Select a round first'; return; }
  msgEl.textContent = 'Sending…';
  msgEl.style.color = 'var(--muted)';
  try {
    const data = await apiReq('/afl-tipping/admin/email/results', {
      method: 'POST',
      body: JSON.stringify({ roundId })
    });
    msgEl.textContent = data.sent
      ? `✅ Sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}`
      : '⚠️ ' + (data.reason || 'No recipients or SMTP not configured');
    msgEl.style.color = data.sent ? 'var(--brand)' : '#f59e0b';
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
};

// ── Analytics ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const data = await apiReq('/afl-tipping/admin/analytics');
    setEl('an-total-rounds', data.totalRounds ?? '—');
    setEl('an-scored-rounds', data.scoredRounds ?? '—');
    setEl('an-confirmed', data.confirmedCount ?? '—');
    setEl('an-pending', data.pendingCount ?? '—');

    // Render participation chart
    const canvas = document.getElementById('participation-chart');
    const tableEl = document.getElementById('participation-table');
    const rounds = data.tippersByRound || [];

    if (!rounds.length) {
      if (tableEl) tableEl.innerHTML = '<p style="color:var(--muted);">No scored rounds yet.</p>';
      return;
    }

    // Simple bar chart using Canvas API
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      const W = canvas.offsetWidth || 600;
      const H = 200;
      canvas.width = W;
      canvas.height = H;

      const maxTippers = Math.max(...rounds.map((r) => r.tipperCount || 0), 1);
      const barW = Math.floor((W - 40) / rounds.length) - 6;
      const barMaxH = H - 40;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0c1d3a';
      ctx.fillRect(0, 0, W, H);

      rounds.forEach((r, i) => {
        const barH = Math.max(4, Math.round((r.tipperCount / maxTippers) * barMaxH));
        const x = 20 + i * (barW + 6);
        const y = H - barH - 20;

        // Bar
        ctx.fillStyle = r.rolledOver ? '#f59e0b' : r.jackpotWinner ? '#22c55e' : '#3b82f6';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barW, barH, 4) : ctx.rect(x, y, barW, barH);
        ctx.fill();

        // Label
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`R${r.roundNumber}`, x + barW / 2, H - 5);

        // Count
        ctx.fillStyle = '#e5e7eb';
        ctx.fillText(r.tipperCount, x + barW / 2, y - 4);
      });
    }

    // Table
    if (tableEl) {
      tableEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:.85em;">
          <thead><tr style="color:var(--muted);text-align:left;">
            <th style="padding:.4rem;">Round</th><th>Tippers</th><th>Weekly Winner</th><th>Jackpot</th><th>Result</th>
          </tr></thead>
          <tbody>
            ${rounds.map((r) => `
              <tr style="border-top:1px solid var(--line);">
                <td style="padding:.4rem;">${escHtml(r.label)}</td>
                <td>${r.tipperCount}</td>
                <td>${r.jackpotWinner ? escHtml(r.jackpotWinner) : '<span style="color:var(--muted);">—</span>'}</td>
                <td style="color:var(--afl-light);">${fmt$(r.jackpotPot)}</td>
                <td>${r.rolledOver ? '<span style="color:#f59e0b;">Rolled Over</span>' : r.jackpotWinner ? '<span style="color:#86efac;">Won</span>' : '<span style="color:var(--muted);">—</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error('Analytics load failed:', err.message);
  }
}

// ── TAB Import ────────────────────────────────────────────────────────────────

const TAB_TEAM_MAP = {
  'Sydney':            'Sydney Swans',
  'Brisbane':          'Brisbane Lions',
  'Wst Bulldogs':      'Western Bulldogs',
  'West Bulldogs':     'Western Bulldogs',
  'Western Bulldogs':  'Western Bulldogs',
  'GWS':               'GWS Giants',
  'Gold Coast':        'Gold Coast Suns',
  'West Coast':        'West Coast Eagles',
  'Wst Coast':         'West Coast Eagles',
  'Adelaide':          'Adelaide',
  'Carlton':           'Carlton',
  'Collingwood':       'Collingwood',
  'Essendon':          'Essendon',
  'Fremantle':         'Fremantle',
  'Geelong':           'Geelong',
  'Hawthorn':          'Hawthorn',
  'Melbourne':         'Melbourne',
  'North Melbourne':   'North Melbourne',
  'Port Adelaide':     'Port Adelaide',
  'Richmond':          'Richmond',
  'St Kilda':          'St Kilda',
};

function mapTabTeam(name) {
  const clean = name.trim();
  if (TAB_TEAM_MAP[clean]) return TAB_TEAM_MAP[clean];
  // Fuzzy fallback — find AFL_TEAMS entry that starts with the clean name
  const lower = clean.toLowerCase();
  const match = AFL_TEAMS.find(
    (t) => t.toLowerCase() === lower || t.toLowerCase().startsWith(lower) || lower.startsWith(t.toLowerCase().split(' ')[0])
  );
  return match || clean;
}

let importedGames = [];

function parseTabImport() {
  const text = document.getElementById('import-paste').value;
  const msgEl = document.getElementById('import-parse-msg');
  const previewEl = document.getElementById('import-preview');
  msgEl.textContent = '';

  if (!text.trim()) {
    msgEl.textContent = '⚠️ Paste some data first';
    msgEl.style.color = '#f59e0b';
    return;
  }

  // Split on "Head To Head" — segment[i] contains game[i]'s betting info (possibly
  // prefixed with the previous game's date/venue) and segment[i+1] starts with game[i]'s date.
  const parts = text.split('Head To Head');
  const games = [];

  // Build a regex that matches any known team name at the start of a "X v Y N Markets" block
  const allTabTeams = Object.keys(TAB_TEAM_MAP).concat(AFL_TEAMS)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length); // longest first to avoid partial matches
  const teamStartRe = new RegExp(`(${allTabTeams.join('|')})\\s+v\\s+`, 'i');

  for (let i = 0; i < parts.length - 1; i++) {
    let raw = parts[i].trim();

    // For i > 0: raw starts with the previous game's date+venue text.
    // Find where the actual "Team v Team N Markets" block starts.
    if (i > 0) {
      const m = raw.match(teamStartRe);
      if (m) {
        raw = raw.slice(raw.indexOf(m[0]));
      } else {
        continue; // can't find a team name — skip
      }
    }

    // Extract home vs away: "<Home> v <Away> N Markets ..."
    const gameMatch = raw.match(/^(.+?)\s+v\s+(.+?)\s+\d+\s+Markets/i);
    if (!gameMatch) continue;

    const homeTeam = mapTabTeam(gameMatch[1].trim());
    const awayTeam = mapTabTeam(gameMatch[2].trim());

    // Line: "Line (-22.5) 1.90 1.28 3.70 (+22.5) 1.90"
    const lineMatch = raw.match(/Line\s+\(([^)]+)\)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    const line = lineMatch ? lineMatch[1] : '';
    const homeOdds = lineMatch ? lineMatch[3] : '';
    const awayOdds = lineMatch ? lineMatch[4] : '';

    // Date/time is at the START of parts[i+1]: e.g. "Thu 5 Mar 19:30Fox Footy Gold Coast v..."
    const nextPart = (parts[i + 1] || '').trim();
    const dateMatch = nextPart.match(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2}:\d{2})(\S*)/i
    );
    let kickoffMs = null;
    let venue = 'Fox Footy';

    if (dateMatch) {
      const year = new Date().getFullYear();
      const dateStr = `${dateMatch[2]} ${dateMatch[3]} ${year} ${dateMatch[4]}:00 GMT+1100`;
      kickoffMs = new Date(dateStr).getTime();
    }

    games.push({ homeTeam, awayTeam, line, homeOdds, awayOdds, kickoffMs, venue: '' });
  }

  importedGames = games;

  if (!games.length) {
    msgEl.textContent = '❌ No games found — check the pasted data format';
    msgEl.style.color = '#ef4444';
    previewEl.style.display = 'none';
    return;
  }

  msgEl.textContent = `✅ Found ${games.length} game${games.length !== 1 ? 's' : ''}`;
  msgEl.style.color = 'var(--brand)';

  // Render preview table
  const tableEl = document.getElementById('import-games-table');
  tableEl.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.9em;">
      <thead>
        <tr style="color:var(--muted);text-align:left;border-bottom:2px solid var(--line);">
          <th style="padding:.5rem;">#</th>
          <th>Home</th>
          <th>Away</th>
          <th>Line</th>
          <th>H2H (Home / Away)</th>
          <th>Kickoff (Melb)</th>
        </tr>
      </thead>
      <tbody>
        ${games.map((g, idx) => `
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:.5rem;color:var(--muted);">${idx + 1}</td>
            <td style="font-weight:600;">${escHtml(g.homeTeam)}</td>
            <td style="font-weight:600;">${escHtml(g.awayTeam)}</td>
            <td style="color:var(--afl-light);">${escHtml(g.line)}</td>
            <td style="color:var(--muted);">${g.homeOdds ? g.homeOdds + ' / ' + g.awayOdds : '—'}</td>
            <td>${g.kickoffMs ? fmtDate(g.kickoffMs) : '<span style="color:#ef4444;">⚠️ No date</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  previewEl.style.display = 'block';
}

window.clearImport = function () {
  document.getElementById('import-paste').value = '';
  document.getElementById('import-parse-msg').textContent = '';
  document.getElementById('import-preview').style.display = 'none';
  importedGames = [];
};

window.createRoundFromImport = async function () {
  const msgEl = document.getElementById('import-create-msg');
  if (!importedGames.length) {
    msgEl.textContent = '⚠️ Parse some games first';
    msgEl.style.color = '#f59e0b';
    return;
  }

  const roundNumber = parseInt(document.getElementById('import-round-number').value, 10);
  const labelInput = document.getElementById('import-round-label').value.trim();
  if (!roundNumber) { msgEl.textContent = '⚠️ Enter a round number'; msgEl.style.color = '#f59e0b'; return; }
  const label = labelInput || `Round ${roundNumber}`;

  const games = importedGames.map((g) => ({
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    venue: g.venue,
    kickoff: g.kickoffMs
  }));

  msgEl.textContent = 'Creating…';
  msgEl.style.color = 'var(--muted)';

  try {
    await apiReq('/afl-tipping/admin/rounds', {
      method: 'POST',
      body: JSON.stringify({ roundNumber, label, games })
    });
    msgEl.textContent = '✅ Round created! Go to the Rounds tab to open it.';
    msgEl.style.color = 'var(--brand)';
    importedGames = [];
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-paste').value = '';
    document.getElementById('import-parse-msg').textContent = '';
    loadRounds();
    loadRoundsForSelector();
  } catch (err) {
    msgEl.textContent = '❌ ' + err.message;
    msgEl.style.color = '#ef4444';
  }
};

// ── CSS helpers (form inputs use existing styles + these inline additions) ────
(function injectFormStyles() {
  if (document.getElementById('afl-admin-form-styles')) return;
  const style = document.createElement('style');
  style.id = 'afl-admin-form-styles';
  style.textContent = `
    .form-label { display:block; margin-bottom:.3rem; font-size:.85em; color:var(--muted); }
    .form-input { width:100%; padding:.55rem .75rem; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); color:var(--text); font-size:.95em; }
    .form-input:focus { outline:none; border-color:var(--afl-light,#60a5fa); }
    .btn-primary { background:var(--afl,#0050a0); color:#fff; border-color:var(--afl,#0050a0); }
    .btn-primary:hover { background:var(--afl-2,#003d80); }
    .stat-label { font-size:.78em; color:var(--muted); margin-bottom:.25rem; }
    .stat-value { font-size:1.8rem; font-weight:800; }
    .responsive-4col { grid-template-columns:repeat(4,1fr); }
    .responsive-3col { grid-template-columns:repeat(3,1fr); }
    .responsive-2col { grid-template-columns:repeat(2,1fr); }
    @media(max-width:700px){
      .responsive-4col,.responsive-3col,.responsive-2col { grid-template-columns:1fr 1fr !important; }
    }
    @media(max-width:480px){
      .responsive-4col { grid-template-columns:1fr 1fr !important; }
      .responsive-3col,.responsive-2col { grid-template-columns:1fr !important; }
    }
  `;
  document.head.appendChild(style);
})();
