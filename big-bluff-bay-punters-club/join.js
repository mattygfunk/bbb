(() => {
  const shared = window.BBB_SHARED;
  if (!shared) return;
  const { JOIN_CONFIG, getNextEvent, eventStatus, fmtInZone, fmtCountdown, downloadICS, googleCalendarUrl, getLocalTZ, MEL_TZ } = shared;
  const $ = (id) => document.getElementById(id);
  const CHECK_KEY = 'bbb_join_checklist_v1';
  const checks = ['downloaded', 'account', 'username', 'request', 'approved'];
  let next = null;

  function toast(msg) {
    const el = $('join-tools-msg');
    if (el) el.textContent = msg;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function renderStatus() {
    $('join-invites-chip').textContent = JOIN_CONFIG.invitesOpen ? '✅ Invites Open' : '🟠 Invites Paused';
    $('join-approval-chip').textContent = `Avg approval: ~${Number(JOIN_CONFIG.approvalTimeMinutes || 15)} mins`;
    $('join-support-chip').textContent = JOIN_CONFIG.supportOnline ? 'Support online: Yes' : 'Support online: Usually evenings';
    const faq = $('faq-approval');
    if (faq) faq.textContent = `Usually around ${Number(JOIN_CONFIG.approvalTimeMinutes || 15)} minutes when admin is online.`;
  }

  function renderNext() {
    next = getNextEvent();
    if (!next) return;
    $('join-next-title').textContent = `${next.event.title} • ${next.event.format}`;
    $('join-next-value').textContent = next.event.valueLine;
    $('join-next-status').textContent = eventStatus(next.start);
    $('join-next-when').textContent = `Melbourne: ${fmtInZone(next.start, MEL_TZ)} • Local: ${fmtInZone(next.start, getLocalTZ())}`;
    $('join-next-gcal').href = googleCalendarUrl(next.event, next.start);
    $('join-next-ics').onclick = () => downloadICS(next.event, next.start);
  }

  function tick() {
    if (!next) return;
    $('join-next-countdown').textContent = fmtCountdown(next.start.getTime() - Date.now());
    $('join-next-status').textContent = eventStatus(next.start);
  }

  function loadChecklist() {
    try { return JSON.parse(localStorage.getItem(CHECK_KEY) || '{}'); } catch { return {}; }
  }
  function saveChecklist(data) { localStorage.setItem(CHECK_KEY, JSON.stringify(data)); }

  function renderChecklist() {
    const data = loadChecklist();
    let done = 0;
    checks.forEach((k) => {
      const el = document.querySelector(`input[data-check='${k}']`);
      if (!el) return;
      el.checked = Boolean(data[k]);
      if (el.checked) done += 1;
      el.onchange = () => {
        const d = loadChecklist();
        d[k] = el.checked;
        saveChecklist(d);
        renderChecklist();
      };
    });
    const pct = Math.round((done / checks.length) * 100);
    $('join-progress').textContent = `${done}/${checks.length} complete (${pct}%)`;
  }

  function wireCopyTools() {
    $('copy-club-id').onclick = async () => {
      const ok = await copyText(String(JOIN_CONFIG.clubId || 'Club ID unavailable'));
      toast(ok ? 'Copied ✅ Club ID' : 'Copy failed — select manually.');
    };
    $('copy-join-message').onclick = async () => {
      const t = String(JOIN_CONFIG.joinMessageTemplate || 'Hey BBB team — I’d like to join. PPPoker username: {username}');
      const ok = await copyText(t);
      toast(ok ? 'Copied ✅ Join message' : 'Copy failed — select manually.');
    };
    $('copy-support-intro').onclick = async () => {
      const msg = 'Hey team — I’m joining Big Bluff Bay. I’ve set up PPPoker and I’m ready to request access.';
      const ok = await copyText(msg);
      toast(ok ? 'Copied ✅ Support intro' : 'Copy failed — select manually.');
    };
  }

  function boot() {
    renderStatus();
    renderNext();
    tick();
    setInterval(tick, 1000);
    wireCopyTools();
    renderChecklist();
    $('join-reset').onclick = () => {
      localStorage.removeItem(CHECK_KEY);
      renderChecklist();
      toast('Checklist reset.');
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
