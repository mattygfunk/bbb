/* afl-home.js — AFL Tipping Live block for homepage */
(function () {
  'use strict';

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtCountdown(msLeft) {
    if (msLeft <= 0) return 'Locked';
    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return d + 'd ' + (h % 24) + 'h';
    }
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }

  async function loadAflBlock() {
    const entrantsEl = document.getElementById('afl-home-entrants');
    const jackpotEl = document.getElementById('afl-home-jackpot');
    const lockoutEl = document.getElementById('afl-home-lockout');
    const leaderEl = document.getElementById('afl-home-leader');
    const rolloverEl = document.getElementById('afl-home-rollover');
    const top10El = document.getElementById('afl-home-top10');
    const roundLabelEl = document.getElementById('afl-home-round-label');
    const banterEl = document.getElementById('afl-home-banter');

    if (!entrantsEl) return; // not on homepage

    try {
      const res = await fetch('/api/afl/summary');
      const d = await res.json();
      if (!d.ok) return;

      // Entrants
      const confirmed = d.confirmedCount || 0;
      const pending = d.pendingCount || 0;
      entrantsEl.textContent = confirmed + (pending > 0 ? ' (+' + pending + ' pending)' : '');

      // Jackpot
      const weeklyPot = d.weeklyPot || 30;
      const rollover = d.rollover || 0;
      jackpotEl.textContent = '$' + weeklyPot;
      if (rollover > 0 && rolloverEl) {
        rolloverEl.style.display = 'block';
        rolloverEl.textContent = '🔄 JACKPOT ROLLED OVER — $' + weeklyPot + ' up for grabs';
      }

      // Round label + next lockout (from summary API)
      if (d.roundLabel && roundLabelEl) roundLabelEl.textContent = d.roundLabel;
      if (d.nextLockout && lockoutEl) {
        const lockTime = new Date(d.nextLockout.kickoff);
        const updateLock = () => {
          const msLeft = lockTime - Date.now();
          lockoutEl.textContent = msLeft > 0
            ? fmtCountdown(msLeft) + ' (' + d.nextLockout.homeTeam + ' v ' + d.nextLockout.awayTeam + ')'
            : 'All games locked';
        };
        updateLock();
        const iv = setInterval(() => { updateLock(); if (lockTime - Date.now() <= 0) clearInterval(iv); }, 60000);
      } else if (lockoutEl) {
        lockoutEl.textContent = d.roundLabel ? 'Active round' : 'No active round';
      }

      // Season leader
      const ladder = d.leaderboard || [];
      if (ladder.length > 0 && leaderEl) {
        const top = ladder[0];
        leaderEl.textContent = escHtml(top.member || top.handle || 'Unknown') + ' — ' + (top.points || top.seasonPoints || 0) + ' pts';
      } else if (leaderEl) {
        leaderEl.textContent = 'No scores yet';
      }

      // Top 10 table
      if (top10El) {
        if (ladder.length === 0) {
          top10El.innerHTML = '<tr><td colspan="4" style="color:var(--muted);padding:.5rem .35rem;">Season hasn\'t started yet.</td></tr>';
        } else {
          top10El.innerHTML = ladder.slice(0, 10).map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
            return '<tr style="border-bottom:1px solid var(--line);">' +
              '<td style="padding:.3rem .35rem;color:var(--muted);">' + medal + '</td>' +
              '<td style="padding:.3rem .35rem;font-weight:600;">' + escHtml(p.member || p.handle || 'Unknown') + '</td>' +
              '<td style="padding:.3rem .35rem;text-align:right;color:#93c5fd;font-weight:700;">' + (p.points || p.seasonPoints || 0) + '</td>' +
              '<td style="padding:.3rem .35rem;text-align:right;color:var(--muted);">' + (p.weeklyWins || p.wins || 0) + '</td>' +
              '</tr>';
          }).join('');
        }
      }

      // Banter teaser
      if (banterEl && d.banter && d.banter.length > 0) {
        const last = d.banter.slice(-2);
        banterEl.innerHTML = '💬 ' + last.map(b => '<strong>' + escHtml(b.member || b.handle || 'Someone') + '</strong>: ' + escHtml(b.message || b.text || '')).join(' · ');
      } else if (banterEl) {
        banterEl.innerHTML = '💬 <a href="/afl-tipping" style="color:#93c5fd;">Log in to join the banter</a>';
      }

    } catch (err) {
      console.warn('AFL home block error:', err);
      // Fail silently — don't break the homepage
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAflBlock);
  } else {
    loadAflBlock();
  }
})();
