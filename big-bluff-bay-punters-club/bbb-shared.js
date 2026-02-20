(() => {
  const MEL_TZ = 'Australia/Melbourne';
  const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const JOIN_CONFIG = {
    invitesOpen: true,
    approvalTimeMinutes: 15,
    supportOnline: true,
    setupEstimateMinutes: 3,
    clubId: 'BBB-POKER-001',
    joinMessageTemplate: 'Hey BBB team — I’d like to join. PPPoker username: {username}',
    supportLink: '/poker-faq.html'
  };

  const SCHEDULE_CONFIG = {
    statusWindows: { registeringMinutesBefore: 45, runningMinutesAfter: 150 },
    events: [
      { id: 'sunday-main', title: 'Sunday Main', day: 0, hour: 18, minute: 0, format: 'NLH', guarantee: '$1,300 GTD', valueLine: '$1,300 GTD Sunday flagship', whoFor: 'Players chasing a deeper weekly run.', bullets: ['Biggest weekly guarantee', 'Flagship pressure structure', 'Premier Sunday field'], detailsHref: '/poker.html' },
      { id: 'nightly-prime', title: 'Nightly Prime', day: 'daily', hour: 20, minute: 0, format: 'NLH', guarantee: '$500 GTD + Sunday Ticket Pathway', valueLine: '$500 GTD + Sunday ticket pathway', whoFor: 'Players building disciplined nightly volume.', bullets: ['Stable nightly cadence', 'Pathway into Sunday Main', 'High-value pressure reps'], detailsHref: '/poker.html' },
      { id: 'late-night-gtd', title: 'Late Night GTD', day: 'daily', hour: 22, minute: 0, format: 'NLH', guarantee: '$700 GTD', valueLine: '$700 GTD late-session window', whoFor: 'Late players who want another high-value shot.', bullets: ['Late-night lobby energy', 'Fast transition from workday', 'Strong standalone GTD'], detailsHref: '/poker.html' }
    ]
  };

  const getLocalTZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  function melParts(date = new Date()) {
    const p = new Intl.DateTimeFormat('en-AU', {
      timeZone: MEL_TZ, hour12: false,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).reduce((a, c) => (a[c.type] = c.value, a), {});
    return { year:+p.year, month:+p.month, day:+p.day, hour:+p.hour, minute:+p.minute, weekday: WEEK_DAYS.indexOf(String(p.weekday||'').slice(0,3)) };
  }

  function melDateFromParts(parts) {
    const utcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
    const p = new Intl.DateTimeFormat('en-US', { timeZone: MEL_TZ, hour12:false, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' })
      .formatToParts(utcNoon).reduce((a,c)=>(a[c.type]=c.value,a),{});
    const localAsUtc = Date.UTC(parts.year, parts.month-1, parts.day, 12,0,0);
    const melAsUtc = Date.UTC(+p.year, +p.month-1, +p.day, +p.hour, +p.minute, +p.second);
    const offset = melAsUtc - localAsUtc;
    return new Date(Date.UTC(parts.year, parts.month-1, parts.day, parts.hour, parts.minute, 0) - offset);
  }

  function nextOccurrence(event) {
    const m = melParts(new Date());
    let add = 0;
    if (event.day === 'daily') {
      add = (event.hour*60 + event.minute) > (m.hour*60 + m.minute) ? 0 : 1;
    } else {
      add = (Number(event.day)-m.weekday+7)%7;
      if (add===0 && (event.hour*60+event.minute) <= (m.hour*60+m.minute)) add = 7;
    }
    const base = new Date(Date.UTC(m.year, m.month-1, m.day+add, 12));
    const bp = new Intl.DateTimeFormat('en-AU', { timeZone:MEL_TZ, year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(base).reduce((a,c)=>(a[c.type]=c.value,a),{});
    const start = melDateFromParts({ year:+bp.year, month:+bp.month, day:+bp.day, hour:event.hour, minute:event.minute });
    return { event, start };
  }

  function getNextEvent() {
    return SCHEDULE_CONFIG.events.map(nextOccurrence).sort((a,b)=>a.start-b.start)[0] || null;
  }

  function eventStatus(start) {
    const now = Date.now();
    const regFrom = start.getTime() - SCHEDULE_CONFIG.statusWindows.registeringMinutesBefore*60*1000;
    const runUntil = start.getTime() + SCHEDULE_CONFIG.statusWindows.runningMinutesAfter*60*1000;
    if (now < regFrom) return 'Starts in';
    if (now < start.getTime()) return 'Registering';
    if (now <= runUntil) return 'Running';
    return 'Finished';
  }

  function fmtInZone(d, tz = MEL_TZ) {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday:'short', hour:'2-digit', minute:'2-digit' }).format(d);
  }

  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms/1000));
    const h = String(Math.floor(s/3600)).padStart(2,'0');
    const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const sec = String(s%60).padStart(2,'0');
    return `${h}:${m}:${sec}`;
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
    a.href = url; a.download = `${event.id}.ics`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function googleCalendarUrl(event, startDate) {
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${f(startDate)}/${f(endDate)}&details=${encodeURIComponent(event.valueLine)}&location=${encodeURIComponent('Big Bluff Bay')}`;
  }

  window.BBB_SHARED = {
    MEL_TZ,
    JOIN_CONFIG,
    SCHEDULE_CONFIG,
    getLocalTZ,
    nextOccurrence,
    getNextEvent,
    eventStatus,
    fmtInZone,
    fmtCountdown,
    downloadICS,
    googleCalendarUrl
  };
})();
