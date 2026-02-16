async function loadWinners(){
  const featured = document.getElementById('featured-winner');
  const historyBody = document.getElementById('winner-history-body');
  const streakBody = document.getElementById('streak-body');
  const pokerHighlightsSummary = document.getElementById('poker-highlights-summary');
  const pokerHighlightsBody = document.getElementById('poker-highlights-body');
  const pokerResultsBody = document.getElementById('poker-results-body');
  const jackpotPill = document.getElementById('winners-jackpot-pill');

  try {
    const [milestonesRes, pokerLbRes, pokerResultsRes, jackpotRes] = await Promise.all([
      fetch('/api/milestones'),
      fetch('/api/poker-leaderboard?range=all'),
      fetch('/api/poker-results?limit=30'),
      fetch('/api/jackpot')
    ]);

    const data = await milestonesRes.json();
    const pokerLb = await pokerLbRes.json();
    const pokerResults = await pokerResultsRes.json();
    const jackpot = await jackpotRes.json();
    if (jackpotPill) jackpotPill.textContent = `Jackpot: $${Number(jackpot?.totalPot || 0).toFixed(2)}`;

    const latest = data.latestRound || null;
    const fw = data.featuredWinner;
    if (latest) {
      const when = latest.archivedAt ? new Date(latest.archivedAt).toLocaleDateString('en-AU') : '';
      const raceDate = latest.raceDate ? ` • Race date: ${latest.raceDate}` : '';
      if (latest.outrightWinner) {
        const pts = fw && fw.member === latest.outrightWinner ? ` • ${fw.points} pts` : '';
        featured.textContent = `${latest.outrightWinner} • ${latest.weekLabel}${when ? ` • ${when}` : ''}${raceDate}${pts}`;
      } else {
        const liveJackpot = Number(jackpot?.totalPot || latest.rolloverToNextWeek || 0).toFixed(2);
        featured.textContent = `${latest.weekLabel}${when ? ` • ${when}` : ''}${raceDate} • No outright winner — jackpot rolls to $${liveJackpot}`;
      }
    } else if (fw) {
      const when = fw.archivedAt ? new Date(fw.archivedAt).toLocaleDateString('en-AU') : '';
      featured.textContent = `${fw.member} • ${fw.weekLabel} ${when ? `• ${when}` : ''} • ${fw.points} pts`;
    } else {
      featured.textContent = 'No archived winners yet.';
    }

    historyBody.innerHTML = '';
    (data.winnerHistory || []).forEach((w)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${w.weekLabel||'-'}</td><td>${w.member||'-'}</td><td>${w.points||0}</td><td>${w.winners||0}</td>`;
      historyBody.appendChild(tr);
    });
    if (!(data.winnerHistory||[]).length) historyBody.innerHTML = "<tr><td colspan='4' class='muted'>No history yet.</td></tr>";

    streakBody.innerHTML = '';
    (data.streakLeaderboard || []).forEach((r)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.rank}</td><td>${r.member}</td><td>${r.currentStreak}</td><td>${r.bestStreak}</td><td>${r.totalWins}</td><td>${(r.badges||[]).join(' • ')||'—'}</td>`;
      streakBody.appendChild(tr);
    });
    if (!(data.streakLeaderboard||[]).length) streakBody.innerHTML = "<tr><td colspan='6' class='muted'>No milestones yet.</td></tr>";

    pokerHighlightsBody.innerHTML = '';
    const leaderboardRows = (pokerLb.leaderboard || []).slice(0, 10);
    if (pokerHighlightsSummary) {
      pokerHighlightsSummary.textContent = `${Number(pokerLb?.stats?.events || 0)} events • ${Number(pokerLb?.stats?.players || 0)} players tracked all-time.`;
    }
    leaderboardRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.rank}</td><td>${row.player}</td><td>${Number(row.points || 0)}</td><td>${Number(row.finalTables || 0)}</td><td>${Number(row.cashes || 0)}</td>`;
      pokerHighlightsBody.appendChild(tr);
    });
    if (!leaderboardRows.length) pokerHighlightsBody.innerHTML = "<tr><td colspan='5' class='muted'>No poker leaderboard data yet.</td></tr>";

    pokerResultsBody.innerHTML = '';
    const recentRows = pokerResults.results || [];
    recentRows.forEach((row) => {
      const tr = document.createElement('tr');
      const when = row.createdAt ? new Date(Number(row.createdAt)).toLocaleDateString('en-AU') : '-';
      tr.innerHTML = `<td>${when}</td><td>${row.player || '-'}</td><td>${row.eventName || 'Event'}</td><td>${Number(row.points || 0)}</td><td>${row.finalTable ? '✅' : '—'}</td><td>${row.cashed ? '✅' : '—'}</td>`;
      pokerResultsBody.appendChild(tr);
    });
    if (!recentRows.length) pokerResultsBody.innerHTML = "<tr><td colspan='6' class='muted'>No poker results logged yet.</td></tr>";

  } catch(e){
    featured.textContent = 'Could not load winner data.';
    if (jackpotPill) jackpotPill.textContent = 'Jackpot: unavailable';
    if (pokerHighlightsSummary) pokerHighlightsSummary.textContent = 'Could not load poker highlights.';
    if (pokerHighlightsBody) pokerHighlightsBody.innerHTML = "<tr><td colspan='5' class='muted'>Could not load poker leaderboard.</td></tr>";
    if (pokerResultsBody) pokerResultsBody.innerHTML = "<tr><td colspan='6' class='muted'>Could not load poker results.</td></tr>";
  }
}
loadWinners();
