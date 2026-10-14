(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#mobile-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.hidden = !open;
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    nav.hidden = true;
  }));
  const escapeIcs = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const nextDay = (value) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10).replaceAll('-', ''); };
  const saveCalendar = (event) => {
    const start = event.startDate.replaceAll('-', '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Big Bluff Bay//Australian Poker Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${escapeIcs(event.id)}@bigbluffbay.au`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${nextDay(event.endDate)}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs([event.venue, event.city, event.state].filter(Boolean).join(', '))}`, `DESCRIPTION:${escapeIcs(`${event.organiser || ''} — ${event.sourceUrl || ''}`)}`, ...(event.sourceUrl ? [`URL:${event.sourceUrl}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' })); link.download = `${String(event.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  document.addEventListener('click', async (click) => {
    const calendar = click.target.closest('[data-event-calendar]');
    const share = click.target.closest('[data-share-event]');
    if (!calendar && !share) return;
    try {
      const response = await fetch('/data/events.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Calendar data unavailable');
      const data = await response.json();
      const id = (calendar || share).dataset.eventCalendar || (calendar || share).dataset.shareEvent;
      const event = data.events?.find((item) => item.id === id);
      if (!event) throw new Error('Event not found');
      if (calendar) saveCalendar(event);
      else {
        const url = location.href;
        if (navigator.share) await navigator.share({ title: event.title, text: `${event.title} · ${event.city} · ${event.startDate}`, url });
        else { await navigator.clipboard.writeText(url); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Share event ↗'; }, 1800); }
      }
    } catch (error) { if (error.name !== 'AbortError') { const button = calendar || share; button.setAttribute('aria-label', error.message); } }
  });
})();
