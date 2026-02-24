(() => {
  const token = localStorage.getItem('bbb-token-v3') || '';
  const msg = document.getElementById('advanced-msg');

  async function req(path, opt = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`/api${path}`, { ...opt, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }

  document.getElementById('clear-poker-records-btn')?.addEventListener('click', async () => {
    const typed = prompt('This will permanently delete ALL Poker V2 results. Type CLEAR to confirm.');
    if (typed !== 'CLEAR') {
      if (msg) msg.textContent = 'Cancelled.';
      return;
    }
    try {
      const out = await req('/poker/results', { method: 'DELETE', body: JSON.stringify({ confirm: 'CLEAR' }) });
      if (msg) msg.textContent = `Poker records cleared. Removed ${Number(out?.removed || 0)} rows.`;
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Could not clear poker records.';
    }
  });
})();