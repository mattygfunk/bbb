(() => {
  const SCHEDULE_CONFIG = {
    pathway: {
      copy: 'Nightly Prime feeds Sunday momentum: reps, pressure spots, and pathway upside.',
      valueLine: 'This week’s pathway value: Sunday ticket shot + $500 GTD nightly pressure'
    },
    promoBanner: 'Major-event weeks, Golden Ticket runs, and upgraded prizes are announced here.',
    statusWindows: {
      registeringMinutesBefore: 45,
      runningMinutesAfter: 150
    },
    events: [
      {
        id: 'sunday-main',
        title: 'Sunday Main',
        day: 0,
        hour: 18,
        minute: 0,
        format: 'NLH',
        guarantee: '$1,300 GTD',
        valueLine: '$1,300 GTD Sunday flagship',
        whoFor: 'Players chasing a deeper weekly run.',
        bullets: ['Biggest weekly guarantee', 'Flagship pressure structure', 'Premier Sunday field'],
        joinHref: '/poker.html#join',
        detailsHref: '/poker.html',
        buyIn: 'Configurable',
        stack: 'Deep',
        lateReg: '45 mins',
        reEntry: 'Per house rules'
      },
      {
        id: 'nightly-prime',
        title: 'Nightly Prime',
        day: 'daily',
        hour: 20,
        minute: 0,
        format: 'NLH',
        guarantee: '$500 GTD + Sunday Ticket Pathway',
        valueLine: '$500 GTD + Sunday ticket pathway',
        whoFor: 'Players building disciplined nightly volume.',
        bullets: ['Stable nightly cadence', 'Pathway into Sunday Main', 'High-value pressure reps'],
        joinHref: '/poker.html#join',
        detailsHref: '/poker.html',
        buyIn: 'Configurable',
        stack: 'Standard',
        lateReg: '35 mins',
        reEntry: 'Per house rules'
      },
      {
        id: 'late-night-gtd',
        title: 'Late Night GTD',
        day: 'daily',
        hour: 22,
        minute: 0,
        format: 'NLH',
        guarantee: '$700 GTD',
        valueLine: '$700 GTD late-session window',
        whoFor: 'Late players who want another high-value shot.',
        bullets: ['Late-night lobby energy', 'Fast transition from workday', 'Strong standalone GTD'],
        joinHref: '/poker.html#join',
        detailsHref: '/poker.html',
        buyIn: 'Configurable',
        stack: 'Late',
        lateReg: '30 mins',
        reEntry: 'Per house rules'
      }
    ]
  };

  const MEL_TZ = 'Australia/Melbourne';
  const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const state = { view: 'cards', tzMode: 'melbourne', timer: null, nextEvent: null };

  const $ = (id) => document.getElementById(id);

  function toMelbourneDateFromParts(parts) {
    const utcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
    const melParts = new Intl.DateTimeFormat('en-US', {
      timeZone: MEL_TZ,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(utcNoon).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
    const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
    const melAsUtcMs = Date.UTC(Number(melParts.year), Number(melParts.month) - 1, Number(melParts.day), Number(melParts.hour), Number(melParts.minute), Number(melParts.second));
    const offsetMs = melAsUtcMs - localAsUtcMs;
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0) - offsetMs);
  }

  function getMelNowParts() {
    const p = new Intl.DateTimeFormat('en-AU', {
      timeZone: MEL_TZ,
      hour12: false,
      weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date()).reduce((acc, cur) => (acc[cur.type] = cur.value, acc), {});
    return {
      year: Number(p.year), month: Number(p.month), day: Number(p.day),
      hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
      weekday: WEEK_DAYS.indexOf(String(p.weekday || '').slice(0,3))
    };
  }

  function nextOccurrence(event) {
    const now = new Date();
    const mel = getMelNowParts();
    const isDaily = event.day === 'daily';
    let add = 0;
    if (isDaily) {
      const nowMin = mel.hour * 60 + mel.minute;
      const eventMin = event.hour * 60 + event.minute;
      add = eventMin > nowMin ? 0 : 1;
    } else {
      add = (Number(event.day) - mel.weekday + 7) % 7;
      if (add === 0) {
        const nowMin = mel.hour * 60 + mel.minute;
        const eventMin = event.hour * 60 + event.minute;
        if (eventMin <= nowMin) add = 7;
      }
    }

    const base = new Date(Date.UTC(mel.year, mel.month - 1, mel.day + add, 12, 0, 0));
    const baseParts = new Intl.DateTimeFormat('en-AU', { timeZone: MEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(base)
      .reduce((acc, cur) => (acc[cur.type] = cur.value, acc), {});

    const start = toMelbourneDateFromParts({
      year: Number(baseParts.year), month: Number(baseParts.month), day: Number(baseParts.day),
      hour: Number(event.hour), minute: Number(event.minute)
    });

    return { event, start, diff: start.getTime() - now.getTime() };
  }

  function getNextEvent() {
    const list = SCHEDULE_CONFIG.events.map(nextOccurrence).sort((a, b) => a.start - b.start);
    return list[0] || null;
  }

  function fmtInZone(d, mode) {
    const tz = mode === 'local' ? undefined : MEL_TZ;
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  }

  function fmtCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }

  function statusFor(start) {
    const now = Date.now();
    const regFrom = start.getTime() - (SCHEDULE_CONFIG.statusWindows.registeringMinutesBefore * 60 * 1000);
    const runUntil = start.getTime() + (SCHEDULE_CONFIG.statusWindows.runningMinutesAfter * 60 * 1000);
    if (now < regFrom) return 'Starts in';
    if (now < start.getTime()) return 'Registering';
    if (now <= runUntil) return 'Running';
    return 'Finished';
  }

  function makeICS(event, startDate) {
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
    const toICS = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Big Bluff Bay//Poker Lobby//EN\nBEGIN:VEVENT\nUID:${event.id}-${startDate.getTime()}@bigbluffbay.au\nDTSTAMP:${toICS(new Date())}\nDTSTART:${toICS(startDate)}\nDTEND:${toICS(endDate)}\nSUMMARY:${event.title} (${event.guarantee})\nDESCRIPTION:${event.valueLine}\nLOCATION:Big Bluff Bay\nEND:VEVENT\nEND:VCALENDAR`;
  }

  function downloadICS(event, startDate) {
    const blob = new Blob([makeICS(event, startDate)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.id}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function googleCalendarUrl(event, startDate) {
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${f(startDate)}/${f(endDate)}&details=${encodeURIComponent(event.valueLine)}&location=${encodeURIComponent('Big Bluff Bay')}`;
  }

  function renderNextEventWidget() {
    const n = getNextEvent();
    if (!n) return;
    state.nextEvent = n;
    $('next-event-title').textContent = `${n.event.title} • ${n.event.format}`;
    $('next-event-value').textContent = n.event.valueLine;
    $('next-event-status').textContent = statusFor(n.start);
    $('next-event-when').textContent = `Melbourne: ${fmtInZone(n.start, 'melbourne')} • Local: ${fmtInZone(n.start, 'local')}`;
    $('next-event-gcal').href = googleCalendarUrl(n.event, n.start);
    $('next-event-details').href = n.event.detailsHref || '/poker.html';
    $('next-event-ics-btn').onclick = () => downloadICS(n.event, n.start);
  }

  function renderCountdown() {
    if (!state.nextEvent) return;
    const ms = state.nextEvent.start.getTime() - Date.now();
    $('next-event-countdown').textContent = fmtCountdown(ms);
    $('next-event-status').textContent = statusFor(state.nextEvent.start);
    if (ms <= 0 && statusFor(state.nextEvent.start) === 'Finished') {
      renderNextEventWidget();
    }
  }

  function renderEventCards() {
    const wrap = $('poker-view-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    SCHEDULE_CONFIG.events.forEach((e) => {
      const occ = nextOccurrence(e);
      const article = document.createElement('article');
      article.className = 'card poker-event-card';
      article.innerHTML = `
        <p class='pill'>${statusFor(occ.start)}</p>
        <h2>${e.title}</h2>
        <p class='muted'><strong>${fmtInZone(occ.start, state.tzMode)}</strong> • ${e.format}</p>
        <p class='muted'>${e.whoFor}</p>
        <ul class='feature-list'>
          ${e.bullets.slice(0,3).map((b) => `<li>${b}</li>`).join('')}
        </ul>
        <p class='muted'><strong>${e.guarantee}</strong> • Buy-in: ${e.buyIn} • Stack: ${e.stack} • Late reg: ${e.lateReg}</p>
        <div class='row-actions'>
          <button class='btn btn-ghost' type='button' data-ics='${e.id}'>Add to Calendar</button>
          <a class='btn chip-btn' href='${e.joinHref || '/poker.html#join'}'>Join / Register</a>
        </div>
      `;
      wrap.appendChild(article);
      article.querySelector(`[data-ics='${e.id}']`)?.addEventListener('click', () => downloadICS(e, occ.start));
    });
  }

  function renderWeekGrid() {
    const wrap = $('poker-week-grid');
    if (!wrap) return;
    wrap.innerHTML = '';
    const itemsByDay = new Map(WEEK_DAYS.map((d, i) => [i, []]));
    SCHEDULE_CONFIG.events.forEach((e) => {
      if (e.day === 'daily') {
        WEEK_DAYS.forEach((_, i) => itemsByDay.get(i).push(e));
      } else {
        itemsByDay.get(Number(e.day))?.push(e);
      }
    });

    WEEK_DAYS.forEach((d, i) => {
      const cell = document.createElement('article');
      cell.className = 'card poker-week-cell';
      const rows = (itemsByDay.get(i) || []).map((e) => `<p><strong>${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')}</strong> ${e.title}</p>`).join('');
      cell.innerHTML = `<h3>${d}</h3>${rows || `<p class='muted'>No fixed events</p>`}`;
      wrap.appendChild(cell);
    });
  }

  function wireViewToggles() {
    const cardsBtn = $('view-cards-btn');
    const weekBtn = $('view-week-btn');
    const cards = $('poker-view-cards');
    const week = $('poker-view-week');
    if (!cardsBtn || !weekBtn || !cards || !week) return;

    cardsBtn.onclick = () => {
      state.view = 'cards';
      cards.hidden = false;
      week.hidden = true;
      cardsBtn.classList.add('active');
      weekBtn.classList.remove('active');
    };
    weekBtn.onclick = () => {
      state.view = 'week';
      cards.hidden = true;
      week.hidden = false;
      weekBtn.classList.add('active');
      cardsBtn.classList.remove('active');
    };
  }

  function wireTimezoneToggle() {
    const btn = $('tz-toggle-btn');
    if (!btn) return;
    btn.onclick = () => {
      state.tzMode = state.tzMode === 'melbourne' ? 'local' : 'melbourne';
      btn.textContent = state.tzMode === 'melbourne' ? 'Show: Melbourne time' : 'Show: Your local time';
      renderEventCards();
    };
  }

  function wireSessionPicker() {
    const reco = $('session-reco');
    document.querySelectorAll('.session-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.session-option').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-session');
        if (!reco) return;
        if (mode === 'short') reco.textContent = 'Recommendation: Nightly Prime (8PM). Best value in a tight session with pathway upside.';
        else if (mode === 'medium') reco.textContent = 'Recommendation: Sunday Main prep via Nightly Prime. Enough time for real ladder pressure.';
        else reco.textContent = 'Recommendation: Run 8PM then Late Night GTD for all-night momentum.';
      });
    });
  }

  function boot() {
    $('pathway-copy').textContent = SCHEDULE_CONFIG.pathway.copy;
    $('pathway-value-chip').textContent = SCHEDULE_CONFIG.pathway.valueLine;
    $('promo-banner-copy').textContent = SCHEDULE_CONFIG.promoBanner;
    renderNextEventWidget();
    renderEventCards();
    renderWeekGrid();
    wireViewToggles();
    wireTimezoneToggle();
    wireSessionPicker();
    renderCountdown();
    state.timer = setInterval(renderCountdown, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
