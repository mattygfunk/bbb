(async function () {
  const esc = (s) => String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const trackId = location.pathname.includes('greyhounds') ? 'greyhounds' : 'thoroughbreds';
  const q = `?track=${encodeURIComponent(trackId)}`;

  const tabA = document.getElementById(`tab-${trackId}`);
  if (tabA) tabA.classList.add('active');

  const title = document.getElementById('track-title');
  const copy = document.getElementById('track-copy');
  const winner = document.getElementById('winner-banner');
  const roundMeta = document.getElementById('round-meta');
  const jackpotMeta = document.getElementById('jackpot-meta');
  const ladderBody = document.getElementById('ladder-body');
  const ladderEmpty = document.getElementById('ladder-empty');
  const fixtures = document.getElementById('fixtures');
  const archives = document.getElementById('archives');

  try {
    const res = await fetch(`/api/punters/overview${q}`);
    const data = await res.json();
    title.textContent = `${data?.track?.name || trackId} Punters Club`;
    copy.textContent = trackId === 'greyhounds'
      ? 'Wednesday card. Midweek speed, separate jackpot pool, separate archive.'
      : 'Saturday card. Main slate with independent payout and leaderboard.';

    const wb = data?.winnerBanner;
    winner.textContent = wb ? `🏆 ${wb.member} • Pot $${Number(wb.pot || 0).toFixed(2)} • ${wb.oneLiner || ''}` : 'No winner banner yet for this track.';

    roundMeta.textContent = `${data?.round?.label || 'Round'} • ${data?.round?.status || 'OPEN'}`;
    jackpotMeta.textContent = `Entries: ${Number(data?.tiers?.free || 0)} • Jackpot eligible: ${Number(data?.tiers?.jackpotEligible || 0)} • Pot: $${Number(data?.jackpot?.totalPot || 0).toFixed(2)}`;

    const rows = data?.ladder || [];
    ladderBody.innerHTML = '';
    if (!rows.length) {
      ladderBody.innerHTML = `<tr><td colspan='4' class='muted'>No scored results yet.</td></tr>`;
      ladderEmpty.hidden = false;
    } else {
      ladderEmpty.hidden = true;
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${Number(r.rank || 0)}</td><td>${esc(r.member)}</td><td>${r.points == null ? '—' : Number(r.points)}</td><td>${r.winners == null ? '—' : Number(r.winners)}</td>`;
        ladderBody.appendChild(tr);
      });
    }

    fixtures.innerHTML = (data?.fixtures || []).map((f) => `<article class='fixture'><strong>${esc(f.event)}</strong><p>${esc(f.date)} • ${esc(f.track)}</p></article>`).join('') || `<p class='muted'>No fixtures loaded for this track yet.</p>`;

    const past = data?.pastRounds || [];
    archives.innerHTML = past.length
      ? past.map((r) => `<a class='menu-link' href='/punters-club/results/${encodeURIComponent(r.id)}'>${esc(r.label || r.id)} — ${esc(r.winner || '—')}</a>`).join('')
      : `<p class='muted'>No archived rounds yet on this track.</p>`;
  } catch (err) {
    copy.textContent = `Could not load track data: ${err.message || 'request failed'}`;
  }
})();