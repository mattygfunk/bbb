(() => {
  const MEL_TZ = 'Australia/Melbourne';
  const CONFIG = {
    statusWindows: { registeringMinutesBefore: 45, runningMinutesAfter: 150 },
    events: [
      { title: 'Sunday Main', day: 0, hour: 18, minute: 0, value: '$1,300 GTD Sunday flagship' },
      { title: 'Nightly Prime', day: 'daily', hour: 20, minute: 0, value: '$500 GTD + Sunday Ticket Pathway' },
      { title: 'Late Night GTD', day: 'daily', hour: 22, minute: 0, value: '$700 GTD late-session value' }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const exists = () => $('dynamic-next-heading') && $('dynamic-next-title');

  function melParts(date = new Date()) {
    const p = new Intl.DateTimeFormat('en-AU', {
      timeZone: MEL_TZ, hour12: false,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).reduce((a, c) => (a[c.type] = c.value, a), {});
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { year:+p.year, month:+p.month, day:+p.day, hour:+p.hour, minute:+p.minute, weekday: days.indexOf(String(p.weekday||'').slice(0,3)) };
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

  function nextOccurrence(e) {
    const now = new Date();
    const m = melParts(now);
    let add = 0;
    if (e.day === 'daily') {
      add = (e.hour*60 + e.minute) > (m.hour*60 + m.minute) ? 0 : 1;
    } else {
      add = (Number(e.day)-m.weekday+7)%7;
      if (add===0 && (e.hour*60+e.minute) <= (m.hour*60+m.minute)) add = 7;
    }
    const base = new Date(Date.UTC(m.year, m.month-1, m.day+add, 12));
    const bp = new Intl.DateTimeFormat('en-AU', { timeZone:MEL_TZ, year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(base).reduce((a,c)=>(a[c.type]=c.value,a),{});
    const start = melDateFromParts({ year:+bp.year, month:+bp.month, day:+bp.day, hour:e.hour, minute:e.minute });
    return { event:e, start };
  }

  function status(start) {
    const now = Date.now();
    const regFrom = start.getTime() - CONFIG.statusWindows.registeringMinutesBefore*60*1000;
    const runUntil = start.getTime() + CONFIG.statusWindows.runningMinutesAfter*60*1000;
    if (now < regFrom) return 'Starts in';
    if (now < start.getTime()) return 'Registering';
    if (now <= runUntil) return 'Running';
    return 'Finished';
  }

  function fmt(d, tz) {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday:'short', hour:'2-digit', minute:'2-digit' }).format(d);
  }

  function countdown(ms) {
    const s = Math.max(0, Math.floor(ms/1000));
    const h = String(Math.floor(s/3600)).padStart(2,'0');
    const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const sec = String(s%60).padStart(2,'0');
    return `${h}:${m}:${sec}`;
  }

  let next = null;
  function render() {
    if (!exists()) return;
    if (!next || (Date.now() - next.start.getTime()) > CONFIG.statusWindows.runningMinutesAfter*60*1000) {
      next = CONFIG.events.map(nextOccurrence).sort((a,b)=>a.start-b.start)[0];
    }
    if (!next) return;
    $('dynamic-next-title').textContent = `${next.event.title} • NLH`;
    $('dynamic-next-value').textContent = next.event.value;
    $('dynamic-next-status').textContent = status(next.start);
    $('dynamic-next-when').textContent = `Melbourne: ${fmt(next.start, MEL_TZ)} • Local: ${fmt(next.start, Intl.DateTimeFormat().resolvedOptions().timeZone)}`;
    $('dynamic-next-countdown').textContent = countdown(next.start.getTime() - Date.now());
  }

  function boot() {
    if (!exists()) return;
    render();
    setInterval(render, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
