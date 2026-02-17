async function loadWinners(){
  const featured = document.getElementById('featured-winner');
  const historyBody = document.getElementById('winner-history-body');
  const streakBody = document.getElementById('streak-body');
  const pokerHighlightsSummary = document.getElementById('poker-highlights-summary');
  const pokerHighlightsBody = document.getElementById('poker-highlights-body');
  const pokerResultsBody = document.getElementById('poker-results-body');
  const jackpotPill = document.getElementById('winners-jackpot-pill');

  const esc = (s) => String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const fmt1 = (n) => Number(n || 0).toFixed(1);
  const aud = (n) => `$${Number(n || 0).toFixed(2)}`;

  try {
    const [milestonesRes, pokerLbRes, pokerResultsRes, jackpotRes, pokerDashRes, pokerEventsRes] = await Promise.all([
      fetch('/api/milestones'),
      fetch('/api/poker/leaderboards?tab=all-time'),
      fetch('/api/poker/results?page=1&pageSize=250'),
      fetch('/api/jackpot'),
      fetch('/api/poker/dashboard'),
      fetch('/api/poker/events')
    ]);

    const data = await milestonesRes.json();
    const pokerLb = await pokerLbRes.json();
    const pokerResults = await pokerResultsRes.json();
    const jackpot = await jackpotRes.json();
    const pokerDash = await pokerDashRes.json();
    const pokerEvents = await pokerEventsRes.json();

    if (jackpotPill) jackpotPill.textContent = `Jackpot: $${Number(jackpot?.totalPot || 0).toFixed(2)}`;

    const biggestScoreEl = document.getElementById('biggest-score');
    const hotStreakEl = document.getElementById('hot-streak');
    const ftMachineEl = document.getElementById('ft-machine');
    const cashKingEl = document.getElementById('cash-king');
    if (biggestScoreEl) biggestScoreEl.textContent = pokerDash?.hype?.biggestScore?.player ? `${pokerDash.hype.biggestScore.player} • ${aud(pokerDash.hype.biggestScore.biggestScore)} AUD` : 'No data yet';
    if (hotStreakEl) hotStreakEl.textContent = pokerDash?.hype?.hotStreak || 'No streak yet';
    if (ftMachineEl) ftMachineEl.textContent = pokerDash?.hype?.finalTableMachine?.player ? `${pokerDash.hype.finalTableMachine.player} • ${fmt1(pokerDash.hype.finalTableMachine.ftPct)}% FT` : 'No data yet';
    if (cashKingEl) cashKingEl.textContent = pokerDash?.hype?.cashKing?.player ? `${pokerDash.hype.cashKing.player} • ${fmt1(pokerDash.hype.cashKing.cashPct)}% cash` : 'No data yet';

    const latest = data.latestRound || null;
    const fw = data.featuredWinner;
    if (latest) {
      const when = latest.archivedAt ? new Date(latest.archivedAt).toLocaleDateString('en-AU') : '';
      const raceDate = latest.raceDate ? ` • Race date: ${latest.raceDate}` : '';
      if (latest.outrightWinner) {
        const pts = fw && fw.member === latest.outrightWinner ? ` • ${aud(fw.points)} AUD` : '';
        featured.textContent = `${latest.outrightWinner} • ${latest.weekLabel}${when ? ` • ${when}` : ''}${raceDate}${pts}`;
      } else {
        const liveJackpot = Number(jackpot?.totalPot || latest.rolloverToNextWeek || 0).toFixed(2);
        featured.textContent = `${latest.weekLabel}${when ? ` • ${when}` : ''}${raceDate} • No outright winner — jackpot rolls to $${liveJackpot}`;
      }
    } else if (fw) {
      const when = fw.archivedAt ? new Date(fw.archivedAt).toLocaleDateString('en-AU') : '';
      featured.textContent = `${fw.member} • ${fw.weekLabel} ${when ? `• ${when}` : ''} • ${aud(fw.points)} AUD`;
    } else {
      featured.textContent = 'No archived winners yet.';
    }

    historyBody.innerHTML = '';
    (data.winnerHistory || []).forEach((w)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(w.weekLabel||'-')}</td><td>${esc(w.member||'-')}</td><td>${aud(w.points)}</td><td>${Number(w.winners||0)}</td>`;
      historyBody.appendChild(tr);
    });
    if (!(data.winnerHistory||[]).length) historyBody.innerHTML = "<tr><td colspan='4' class='muted'>No history yet.</td></tr>";

    streakBody.innerHTML = '';
    (data.streakLeaderboard || []).forEach((r)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.rank}</td><td>${esc(r.member)}</td><td>${r.currentStreak}</td><td>${r.bestStreak}</td><td>${r.totalWins}</td><td>${(r.badges||[]).map(esc).join(' • ')||'—'}</td>`;
      streakBody.appendChild(tr);
    });
    if (!(data.streakLeaderboard||[]).length) streakBody.innerHTML = "<tr><td colspan='6' class='muted'>No milestones yet.</td></tr>";

    pokerHighlightsBody.innerHTML = '';
    const leaderboardRows = (pokerLb.leaderboard || []).slice(0, 10);
    if (pokerHighlightsSummary) {
      const activeCount = leaderboardRows.length;
      pokerHighlightsSummary.textContent = `${activeCount} players shown • All-time tab • Values shown in AUD.`;
    }

    leaderboardRows.forEach((row) => {
      const tr = document.createElement('tr');
      const href = row.playerId ? `/poker/players/${encodeURIComponent(row.playerId)}` : '';
      if (href) {
        tr.style.cursor = 'pointer';
        tr.title = 'Open player profile';
        tr.addEventListener('click', () => { window.location.href = href; });
      }
      tr.innerHTML = `
        <td>${row.rank}</td>
        <td>${href ? `<a href="${href}" onclick="event.stopPropagation()">${esc(row.player)}</a>` : esc(row.player)}</td>
        <td>${aud(row.points)}</td>
        <td>${Number(row.events || 0)}</td>
        <td>${fmt1(row.avgPoints)}</td>
        <td><span class='pill'>${fmt1(row.ftPct)}%</span></td>
        <td><span class='pill'>${fmt1(row.cashPct)}%</span></td>`;
      pokerHighlightsBody.appendChild(tr);
    });
    if (!leaderboardRows.length) pokerHighlightsBody.innerHTML = "<tr><td colspan='7' class='muted'>No poker leaderboard data yet.</td></tr>";

    pokerResultsBody.innerHTML = '';

    const events = (pokerEvents?.events || []).slice(0, 15);
    if (events.length) {
      const detailRows = await Promise.all(events.map(async (ev) => {
        try {
          const r = await fetch(`/api/poker/events/${encodeURIComponent(ev.id)}`);
          const d = await r.json();
          const winner = (d.leaderboard || [])[0] || null;
          const when = ev.startAt ? new Date(Number(ev.startAt)).toLocaleDateString('en-AU') : '-';
          return {
            when,
            gameName: ev.name || 'Event',
            eventId: ev.id,
            winner,
            entries: (d.leaderboard || []).length,
            loggedBy: ev.createdBy || 'Admin'
          };
        } catch {
          return null;
        }
      }));

      const games = detailRows.filter(Boolean);
      games.forEach((game) => {
        const tr = document.createElement('tr');
        const winnerName = game.winner?.player || '-';
        const href = game.winner?.playerId ? `/poker/players/${encodeURIComponent(game.winner.playerId)}` : '';
        const eventHref = `/poker/events/${encodeURIComponent(game.eventId)}`;
        tr.innerHTML = `
          <td><a href="${eventHref}" title="View all results for this game">${game.when}</a></td>
          <td>${esc(game.gameName)}</td>
          <td>${href ? `<a href="${href}">${esc(winnerName)}</a>` : esc(winnerName)}</td>
          <td>${aud(game.winner?.points || 0)}</td>
          <td>${Number(game.entries || 0)}</td>
          <td>${esc(game.loggedBy || 'Admin')}</td>`;
        pokerResultsBody.appendChild(tr);
      });
      if (!games.length) pokerResultsBody.innerHTML = "<tr><td colspan='6' class='muted'>No poker events found.</td></tr>";
    } else {
      pokerResultsBody.innerHTML = "<tr><td colspan='6' class='muted'>No poker results logged yet.</td></tr>";
    }

  } catch(e){
    featured.textContent = 'Could not load winner data.';
    if (jackpotPill) jackpotPill.textContent = 'Jackpot: unavailable';
    if (pokerHighlightsSummary) pokerHighlightsSummary.textContent = 'Could not load poker highlights.';
    if (pokerHighlightsBody) pokerHighlightsBody.innerHTML = "<tr><td colspan='7' class='muted'>Could not load poker leaderboard.</td></tr>";
    if (pokerResultsBody) pokerResultsBody.innerHTML = "<tr><td colspan='7' class='muted'>Could not load poker results.</td></tr>";
    const ids=['biggest-score','hot-streak','ft-machine','cash-king'];
    ids.forEach((id)=>{ const el=document.getElementById(id); if(el) el.textContent='Unavailable'; });
  }
}
loadWinners();
