async function loadWinners(){
  const featured = document.getElementById('featured-winner');
  const historyBody = document.getElementById('winner-history-body');
  const streakBody = document.getElementById('streak-body');
  try {
    const res = await fetch('/api/milestones');
    const data = await res.json();
    const fw = data.featuredWinner;
    if (fw) {
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
  } catch(e){
    featured.textContent = 'Could not load winner data.';
  }
}
loadWinners();
