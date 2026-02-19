(async function () {
  const tracks = ['greyhounds', 'thoroughbreds'];
  const fmtMoney = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

  const fmtCountdown = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return 'opens soon';
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}h ${m}m`;
  };

  await Promise.all(tracks.map(async (trackId) => {
    const meta = document.getElementById(`hub-meta-${trackId}`);
    const cta = document.getElementById(`hub-cta-${trackId}`);
    const copy = document.getElementById(`hub-copy-${trackId}`);
    if (!meta || !cta || !copy) return;

    try {
      const res = await fetch(`/api/punters/overview?track=${encodeURIComponent(trackId)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const status = String(data?.round?.status || 'OPEN').toUpperCase();
      const paid = Number(data?.tiers?.jackpotEligible || 0);
      const entries = Number(data?.tiers?.free || 0);
      const pot = Number(data?.jackpot?.totalPot || 0);
      const winner = data?.winnerBanner?.member || data?.pastRounds?.[0]?.winner || 'TBA';
      const opensAt = Number(data?.nextRoundOpensAt || 0);

      meta.textContent = `Status: ${status} • Pot: ${fmtMoney.format(pot)} • Paid: ${paid} • Entries: ${entries} • Last winner: ${winner}`;

      if (status === 'CLOSED') {
        cta.textContent = 'View Results';
      } else if (status === 'LOCKED') {
        cta.textContent = 'Track Locked';
        cta.classList.add('btn-ghost');
      } else {
        cta.textContent = 'Enter Tips';
      }

      if (status !== 'OPEN' && opensAt > 0) {
        copy.textContent = `${copy.textContent} Next round opens in ${fmtCountdown(opensAt - Date.now())}.`;
      }
    } catch {
      meta.textContent = 'Status unavailable right now — refresh in a moment.';
      cta.textContent = 'Open Track';
    }
  }));
})();
