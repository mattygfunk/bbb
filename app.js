(() => {
  const grid = document.querySelector('#event-grid');
  const searchForm = document.querySelector('#event-search');
  const locationInput = document.querySelector('#location-filter');
  const whenSelect = document.querySelector('#when-filter');
  const typeSelect = document.querySelector('#type-filter');
  const resultsNote = document.querySelector('#results-note');
  const listingCount = document.querySelector('#listing-count');
  const savedToggle = document.querySelector('#saved-toggle');
  const savedCount = document.querySelector('#saved-count');
  const storageNote = document.querySelector('#storage-note');
  const shareButton = document.querySelector('#share-search');
  const clearFiltersButton = document.querySelector('#clear-filters');
  const cityButtons = [...document.querySelectorAll('[data-location]')];
  const storageKey = 'bbb-saved-events-v1';
  let events = [];
  let savedIds = new Set();
  let onlySaved = false;

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const today = `${dateParts.find((part) => part.type === 'year').value}-${dateParts.find((part) => part.type === 'month').value}-${dateParts.find((part) => part.type === 'day').value}`;
  const monthKey = today.slice(0, 7);
  const dateLabel = (value) => new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne'
  }).format(new Date(`${value}T12:00:00Z`));
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const validUrl = (value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };

  function loadSaved() {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      savedIds = new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
    } catch {
      savedIds = new Set();
      storageNote.textContent = 'Saving is unavailable in this browser';
    }
    updateSavedCount();
  }

  function updateSavedCount() {
    savedCount.textContent = String(savedIds.size);
    savedToggle.setAttribute('aria-pressed', String(onlySaved));
    savedToggle.classList.toggle('is-active', onlySaved);
    savedToggle.querySelector('span').textContent = onlySaved ? 'Show all events' : 'Saved events';
  }

  function syncFromUrl() {
    const params = new URLSearchParams(window.location.search);
    locationInput.value = params.get('location') || '';
    if (['upcoming', 'this-month', 'all'].includes(params.get('when'))) whenSelect.value = params.get('when');
    if (['all', 'series', 'league'].includes(params.get('type'))) typeSelect.value = params.get('type');
    onlySaved = params.get('saved') === '1';
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === locationInput.value.trim().toLowerCase()));
    updateSavedCount();
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (locationInput.value.trim()) params.set('location', locationInput.value.trim());
    if (whenSelect.value !== 'upcoming') params.set('when', whenSelect.value);
    if (typeSelect.value !== 'all') params.set('type', typeSelect.value);
    if (onlySaved) params.set('saved', '1');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  function statusFor(event) {
    if (event.startDate <= today && event.endDate >= today) return 'Happening now';
    return 'Upcoming';
  }

  function matches(event) {
    const query = locationInput.value.trim().toLowerCase();
    const when = whenSelect.value;
    const type = typeSelect.value;
    const matchesLocation = !query || `${event.city} ${event.state} ${event.venue} ${event.organiser}`.toLowerCase().includes(query);
    const overlapsThisMonth = event.startDate.slice(0, 7) <= monthKey && event.endDate.slice(0, 7) >= monthKey;
    const matchesWhen = when === 'all' || (when === 'this-month' ? overlapsThisMonth : event.endDate >= today);
    const matchesType = type === 'all' || event.type === type;
    const matchesSaved = !onlySaved || savedIds.has(event.id);
    return matchesLocation && matchesWhen && matchesType && matchesSaved && event.endDate >= today;
  }

  function escapeIcs(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function nextCalendarDay(isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10).replaceAll('-', '');
  }

  function addToCalendar(event) {
    const sourceUrl = validUrl(event.sourceUrl);
    const start = event.startDate.replaceAll('-', '');
    const end = nextCalendarDay(event.endDate);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Big Bluff Bay//Australian Poker Events//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:${escapeIcs(event.id)}@bigbluffbay.au`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `LOCATION:${escapeIcs([event.venue, event.city, event.state].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${escapeIcs(`${event.organiser || ''}${sourceUrl ? ` — ${sourceUrl}` : ''}`)}`,
      ...(sourceUrl ? [`URL:${sourceUrl}`] : []), 'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(event.title || 'poker-event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poker-event'}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function render() {
    const shown = events.filter(matches).sort((a, b) => a.startDate.localeCompare(b.startDate));
    grid.setAttribute('aria-busy', 'false');
    resultsNote.textContent = `${shown.length} ${shown.length === 1 ? 'event' : 'events'} found`;
    if (!shown.length) {
      const message = onlySaved
        ? '<strong>No saved events match these filters.</strong><p>Save an event with the star button, or clear filters to see all saved events.</p>'
        : '<strong>No checked events match those filters yet.</strong><p>Try another city or date, or browse the organisers’ calendars below.</p>';
      grid.innerHTML = `<div class="empty-state">${message}</div>`;
      updateUrl();
      return;
    }
    grid.innerHTML = shown.map((event, index) => {
      const featured = index === 0 && statusFor(event) === 'Happening now';
      const dates = event.startDate === event.endDate ? dateLabel(event.startDate) : `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`;
      const sourceUrl = validUrl(event.sourceUrl);
      const saved = savedIds.has(event.id);
      const organiserLink = sourceUrl
        ? `<a class="official-link" href="${safe(sourceUrl)}" target="_blank" rel="noopener noreferrer">Official details <span aria-hidden="true">↗</span></a>`
        : '<span class="official-link is-unavailable">Official link unavailable</span>';
      return `<article class="event-card${featured ? ' featured' : ''}" id="event-${safe(event.id)}" data-event-id="${safe(event.id)}">
        <div class="event-topline"><span class="event-kind">${safe(event.label)}</span><span class="event-live"><span aria-hidden="true"></span>${statusFor(event)}</span></div>
        <h3>${safe(event.title)}</h3><p class="event-organiser">${safe(event.organiser)}</p>
        <div class="event-details"><span class="detail"><span class="detail-icon" aria-hidden="true">⌖</span>${safe(event.city)}, ${safe(event.state)}</span><span class="detail"><span class="detail-icon" aria-hidden="true">▦</span>${safe(event.venue)}</span></div>
        <div class="event-card-footer"><span class="date-range">${dates}</span>${organiserLink}</div>
        <div class="event-actions">
          <button class="card-action save-event${saved ? ' is-saved' : ''}" type="button" data-save="${safe(event.id)}" aria-pressed="${saved}">${saved ? '★ Saved' : '☆ Save event'}</button>
          <button class="card-action" type="button" data-calendar="${safe(event.id)}">▦ Add to calendar</button>
        </div>
        <div class="event-source">Checked ${dateLabel(event.checkedAt)} · Confirm details with organiser</div>
      </article>`;
    }).join('');
    updateUrl();
  }

  function persistSaved() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...savedIds]));
    } catch {
      storageNote.textContent = 'Saved only until this page closes';
    }
    updateSavedCount();
  }

  function setLocation(value) {
    locationInput.value = value;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === value.toLowerCase()));
    render();
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
    document.querySelector('#events-title').focus();
  });
  locationInput.addEventListener('input', () => {
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === locationInput.value.trim().toLowerCase()));
    render();
  });
  [whenSelect, typeSelect].forEach((control) => control.addEventListener('change', render));
  cityButtons.forEach((button) => button.addEventListener('click', () => {
    if (button.classList.contains('city-card') && button.tagName === 'BUTTON') document.querySelector('#events').scrollIntoView({ behavior: 'smooth' });
    setLocation(button.dataset.location);
  }));

  savedToggle.addEventListener('click', () => {
    onlySaved = !onlySaved;
    updateSavedCount();
    render();
  });
  clearFiltersButton.addEventListener('click', () => {
    locationInput.value = '';
    whenSelect.value = 'upcoming';
    typeSelect.value = 'all';
    onlySaved = false;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location === ''));
    updateSavedCount();
    render();
  });
  grid.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) {
      const id = saveButton.dataset.save;
      if (savedIds.has(id)) savedIds.delete(id);
      else savedIds.add(id);
      persistSaved();
      render();
      return;
    }
    const calendarButton = event.target.closest('[data-calendar]');
    if (calendarButton) {
      const selected = events.find((item) => item.id === calendarButton.dataset.calendar);
      if (selected) addToCalendar(selected);
    }
  });

  async function shareSearch() {
    const sharedUrl = new URL(window.location.href);
    sharedUrl.searchParams.delete('saved');
    const url = sharedUrl.href;
    const shareData = { title: 'Poker events | Big Bluff Bay', text: 'Check out these Australian poker events.', url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Copy unavailable');
      }
      shareButton.querySelector('span').textContent = 'Link copied';
      window.setTimeout(() => { shareButton.querySelector('span').textContent = 'Share this search'; }, 2200);
    } catch (error) {
      if (error.name !== 'AbortError') {
        shareButton.querySelector('span').textContent = 'Could not share';
        window.setTimeout(() => { shareButton.querySelector('span').textContent = 'Share this search'; }, 2200);
      }
    }
  }
  shareButton.addEventListener('click', shareSearch);

  document.querySelectorAll('.quiz-option').forEach((button) => button.addEventListener('click', () => {
    const isContext = button.dataset.answer === 'context';
    document.querySelectorAll('.quiz-option').forEach((option) => {
      option.disabled = true;
      if (option.dataset.answer === 'context') option.classList.add('is-correct');
      else if (option === button) option.classList.add('is-incorrect');
    });
    const feedback = document.querySelector('#quiz-feedback');
    feedback.textContent = isContext
      ? 'That’s the useful first step. Position helps, but the raise size, opener’s range, stack depth and players behind you all shape the decision. There isn’t one automatic answer.'
      : 'There isn’t one automatic answer. Start with the raise size, opener’s range, stack depth and players behind you; then compare your options.';
    feedback.hidden = false;
    document.querySelector('#quiz-reset').hidden = false;
  }));
  document.querySelector('#quiz-reset').addEventListener('click', () => {
    document.querySelectorAll('.quiz-option').forEach((option) => { option.disabled = false; option.classList.remove('is-correct', 'is-incorrect'); });
    document.querySelector('#quiz-feedback').hidden = true;
    document.querySelector('#quiz-reset').hidden = true;
  });

  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    mobileNav.hidden = !open;
  });
  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { menuToggle.setAttribute('aria-expanded', 'false'); mobileNav.hidden = true; }));
  document.querySelector('#year').textContent = new Date().getFullYear();

  loadSaved();
  syncFromUrl();
  fetch('/data/events.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('Calendar unavailable'); return response.json(); })
    .then((data) => {
      events = Array.isArray(data.events) ? data.events.filter((event) => event && typeof event.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate) && event.endDate >= today) : [];
      listingCount.textContent = `${events.length} checked events to start`;
      render();
    })
    .catch(() => {
      events = [];
      listingCount.textContent = 'Event calendar loading soon';
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '<div class="empty-state"><strong>The calendar is taking a breather.</strong><p>Please try again shortly, or check an organiser’s official schedule.</p></div>';
      resultsNote.textContent = 'Calendar unavailable';
    });
})();
