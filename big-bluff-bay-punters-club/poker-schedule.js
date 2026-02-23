(() => {
  const shared = window.BBB_SHARED;
  if (!shared) return;
  const { JOIN_CONFIG, SCHEDULE_CONFIG, eventStatus, fmtInZone, fmtCountdown, downloadICS, googleCalendarUrl, getLocalTZ, MEL_TZ } = shared;
  const state = { view: 'cards', tzMode: 'melbourne', nextEvent: null, events: Array.isArray(SCHEDULE_CONFIG?.events) ? [...SCHEDULE_CONFIG.events] : [] };

  const getNextEventLocal = () => state.events.map((e) => shared.nextOccurrence(e)).sort((a,b)=>a.start-b.start)[0] || null;
  const $ = (id) => document.getElementById(id);

  function renderInviteChips() {
    const invites = $('invite-open-chip');
    const setup = $('setup-chip');
    const next = $('next-game-chip');
    if (invites) invites.textContent = JOIN_CONFIG.invitesOpen ? '✅ Invites Open' : '🟠 Invites Paused';
    if (setup) setup.textContent = `🕒 Setup ~${Number(JOIN_CONFIG.setupEstimateMinutes || 3)} mins`;
    if (next) next.textContent = '⏱ Next game starts in --:--:--';
  }

  function renderNextEventWidget() {
    const n = getNextEventLocal();
    if (!n) return;
    state.nextEvent = n;
    $('next-event-title').textContent = `${n.event.title} • ${n.event.format}`;
    $('next-event-value').textContent = n.event.valueLine;
    $('next-event-status').textContent = eventStatus(n.start);
    $('next-event-when').textContent = `Melbourne: ${fmtInZone(n.start, MEL_TZ)} • Local: ${fmtInZone(n.start, getLocalTZ())}`;
    $('next-event-gcal').href = googleCalendarUrl(n.event, n.start);
    $('next-event-details').href = n.event.detailsHref || '/poker.html';
    $('next-event-ics-btn').onclick = () => downloadICS(n.event, n.start);
  }

  function updateEventCardStatuses() {
    document.querySelectorAll('[data-event-start]').forEach((el) => {
      const startMs = Number(el.getAttribute('data-event-start') || 0);
      if (!Number.isFinite(startMs) || startMs <= 0) return;
      const start = new Date(startMs);
      const status = eventStatus(start);
      const remaining = fmtCountdown(startMs - Date.now());
      el.textContent = status === 'Starts in' ? `Starts in ${remaining}` : status;
    });
  }

  function renderCountdown() {
    if (!state.nextEvent) return;
    const ms = state.nextEvent.start.getTime() - Date.now();
    const text = fmtCountdown(ms);
    $('next-event-countdown').textContent = text;
    const nextStatus = eventStatus(state.nextEvent.start);
    $('next-event-status').textContent = nextStatus === 'Starts in' ? `Starts in ${text}` : nextStatus;
    const chip = $('next-game-chip');
    if (chip) chip.textContent = `⏱ Next game starts in ${text}`;
    updateEventCardStatuses();
  }

  function renderEventCards() {
    const wrap = $('poker-view-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    state.events.forEach((e) => {
      const occ = shared.nextOccurrence(e);
      const article = document.createElement('article');
      article.className = 'card poker-event-card';
      const statusNow = eventStatus(occ.start);
      const statusText = statusNow === 'Starts in' ? `Starts in ${fmtCountdown(occ.start.getTime() - Date.now())}` : statusNow;
      article.innerHTML = `
        <p class='pill' data-event-start='${occ.start.getTime()}'>${statusText}</p>
        <h2>${e.title}</h2>
        <p class='muted'><strong>${fmtInZone(occ.start, state.tzMode === 'local' ? getLocalTZ() : MEL_TZ)}</strong> • ${e.format}</p>
        <p class='muted'>${e.whoFor}</p>
        <ul class='feature-list'>${e.bullets.slice(0,3).map((b) => `<li>${b}</li>`).join('')}</ul>
        <p class='muted'><strong>${e.guarantee}</strong></p>
        <div class='row-actions'>
          <button class='btn btn-ghost' type='button' data-ics='${e.id}'>Add to Calendar</button>
          <a class='btn chip-btn' href='/join.html'>Join / Register</a>
        </div>
      `;
      wrap.appendChild(article);
      article.querySelector(`[data-ics='${e.id}']`)?.addEventListener('click', () => downloadICS(e, occ.start));
    });
  }

  function renderWeekGrid() {
    const wrap = $('poker-week-grid');
    if (!wrap) return;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    wrap.innerHTML = '';
    days.forEach((d, i) => {
      const cell = document.createElement('article');
      cell.className = 'card poker-week-cell';
      const rows = state.events
        .filter((e) => e.day === 'daily' || Number(e.day) === i)
        .map((e) => `<p><strong>${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')}</strong> ${e.title}</p>`)
        .join('');
      cell.innerHTML = `<h3>${d}</h3>${rows || `<p class='muted'>No fixed events</p>`}`;
      wrap.appendChild(cell);
    });
  }

  async function loadEventsFromAdminSchedule() {
    try {
      const r = await fetch('/api/poker/schedule-events', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(d.events) && d.events.length) state.events = d.events;
    } catch {}
  }

  function wireControls() {
    const cardsBtn = $('view-cards-btn');
    const weekBtn = $('view-week-btn');
    const tzBtn = $('tz-toggle-btn');
    const cards = $('poker-view-cards');
    const week = $('poker-view-week');
    cardsBtn.onclick = () => { cards.hidden = false; week.hidden = true; cardsBtn.classList.add('active'); weekBtn.classList.remove('active'); };
    weekBtn.onclick = () => { cards.hidden = true; week.hidden = false; weekBtn.classList.add('active'); cardsBtn.classList.remove('active'); };
    tzBtn.onclick = () => {
      state.tzMode = state.tzMode === 'melbourne' ? 'local' : 'melbourne';
      tzBtn.textContent = state.tzMode === 'melbourne' ? 'Show: Melbourne time' : 'Show: Your local time';
      renderEventCards();
    };

    document.querySelectorAll('.session-option').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('.session-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const reco = $('session-reco');
      const mode = btn.getAttribute('data-session');
      if (mode === 'short') reco.textContent = 'Recommendation: Nightly Prime (8PM). Best value in a short session.';
      else if (mode === 'medium') reco.textContent = 'Recommendation: Nightly Prime with Sunday pathway focus.';
      else reco.textContent = 'Recommendation: Run 8PM and 10PM for all-night momentum.';
    }));
  }

  async function boot() {
    const heroJoin = $('schedule-join-cta');
    if (heroJoin) heroJoin.href = '/join.html';
    await loadEventsFromAdminSchedule();
    renderInviteChips();
    renderNextEventWidget();
    renderEventCards();
    renderWeekGrid();
    wireControls();
    renderCountdown();
    setInterval(renderCountdown, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot().catch(()=>{}); });
  else boot().catch(()=>{});
})();
