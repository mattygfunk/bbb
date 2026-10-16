(() => {
  const grid = document.querySelector('#event-grid');
  const searchForm = document.querySelector('#event-search');
  const locationInput = document.querySelector('#location-filter');
  const whenSelect = document.querySelector('#when-filter');
  const typeSelect = document.querySelector('#type-filter');
  const budgetSelect = document.querySelector('#budget-filter');
  const formatSelect = document.querySelector('#format-filter');
  const guaranteeSelect = document.querySelector('#guarantee-filter');
  const advancedFilters = document.querySelector('#advanced-filters');
  const advancedFilterCount = document.querySelector('#advanced-filter-count');
  const resultsNote = document.querySelector('#results-note');
  const listingCount = document.querySelector('#listing-count');
  const savedToggle = document.querySelector('#saved-toggle');
  const savedCount = document.querySelector('#saved-count');
  const storageNote = document.querySelector('#storage-note');
  const shareButton = document.querySelector('#share-search');
  const downloadSavedButton = document.querySelector('#download-saved');
  const actionFeedback = document.querySelector('#action-feedback');
  const clearFiltersButton = document.querySelector('#clear-filters');
  const cityButtons = [...document.querySelectorAll('[data-location]')];
  const storageKey = 'bbb-saved-events-v1';
  let events = [];
  let savedIds = new Set();
  let onlySaved = false;
  let sharedEventIds = null;

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
  const formatKey = (value) => {
    const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (key.includes('mixed')) return 'mixed games';
    if (key.includes('omaha') || key === 'plo') return 'plo';
    if (key.includes('hold em') || key === 'holdem' || key === 'nlh') return 'holdem';
    return key;
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
    shareButton.querySelector('span').textContent = onlySaved || sharedEventIds ? 'Share shortlist' : 'Share this search';
    downloadSavedButton.disabled = savedIds.size === 0;
  }

  function updateAdvancedFilterSummary(resetDisclosure = false) {
    const activeCount = [budgetSelect, formatSelect, guaranteeSelect]
      .filter((control) => control.value !== 'all').length;
    advancedFilterCount.textContent = activeCount ? `${activeCount} active` : 'Optional';
    advancedFilterCount.classList.toggle('is-active', activeCount > 0);
    if (activeCount) advancedFilters.open = true;
    else if (resetDisclosure) advancedFilters.open = false;
  }

  function syncFromUrl() {
    const params = new URLSearchParams(window.location.search);
    locationInput.value = params.get('location') || '';
    whenSelect.value = 'upcoming';
    typeSelect.value = 'all';
    budgetSelect.value = 'all';
    formatSelect.value = 'all';
    guaranteeSelect.value = 'all';
    if (['upcoming', 'this-month', 'all'].includes(params.get('when'))) whenSelect.value = params.get('when');
    if (['all', 'series', 'league'].includes(params.get('type'))) typeSelect.value = params.get('type');
    if (['all', '0-100', '100-500', '500-1500', '1500+'].includes(params.get('budget'))) budgetSelect.value = params.get('budget');
    if (['all', 'holdem', 'plo', 'mixed games'].includes(params.get('format'))) formatSelect.value = params.get('format');
    if (['all', 'listed', '100000+'].includes(params.get('guarantee'))) guaranteeSelect.value = params.get('guarantee');
    const shared = (params.get('events') || '').split(',').filter((id) => /^[a-z0-9-]{1,100}$/i.test(id));
    sharedEventIds = shared.length ? new Set(shared) : null;
    onlySaved = params.get('saved') === '1' && !sharedEventIds;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === locationInput.value.trim().toLowerCase()));
    updateSavedCount();
    updateAdvancedFilterSummary(true);
  }

  function updateUrl(push = false) {
    const params = new URLSearchParams();
    if (locationInput.value.trim()) params.set('location', locationInput.value.trim());
    if (whenSelect.value !== 'upcoming') params.set('when', whenSelect.value);
    if (typeSelect.value !== 'all') params.set('type', typeSelect.value);
    if (budgetSelect.value !== 'all') params.set('budget', budgetSelect.value);
    if (formatSelect.value !== 'all') params.set('format', formatSelect.value);
    if (guaranteeSelect.value !== 'all') params.set('guarantee', guaranteeSelect.value);
    if (onlySaved) params.set('saved', '1');
    if (sharedEventIds?.size) params.set('events', [...sharedEventIds].join(','));
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (push && url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState({}, '', url);
    else window.history.replaceState({}, '', url);
  }

  function statusFor(event) {
    if (event.startDate <= today && event.endDate >= today) return 'Happening now';
    return 'Upcoming';
  }

  function matches(event) {
    const query = locationInput.value.trim().toLowerCase();
    const when = whenSelect.value;
    const type = typeSelect.value;
    const budget = budgetSelect.value;
    const format = formatSelect.value;
    const guarantee = guaranteeSelect.value;
    const matchesLocation = !query || `${event.city} ${event.state} ${event.venue} ${event.organiser}`.toLowerCase().includes(query);
    const overlapsThisMonth = event.startDate.slice(0, 7) <= monthKey && event.endDate.slice(0, 7) >= monthKey;
    const matchesWhen = when === 'all' || (when === 'this-month' ? overlapsThisMonth : event.endDate >= today);
    const matchesType = type === 'all' || event.type === type;
    const entry = event.buyInMin;
    const matchesBudget = budget === 'all' || ((Number.isFinite(entry) && entry >= 0) && (budget === '0-100' ? entry <= 100 : budget === '100-500' ? entry > 100 && entry <= 500 : budget === '500-1500' ? entry > 500 && entry <= 1500 : entry > 1500));
    const formats = Array.isArray(event.formats) ? event.formats.map(formatKey) : [];
    const matchesFormat = format === 'all' || formats.includes(format);
    const prize = event.guaranteeAmount;
    const matchesGuarantee = guarantee === 'all' || (guarantee === 'listed' ? (Number.isFinite(prize) && prize > 0) : (Number.isFinite(prize) && prize > 0) && prize >= 100000);
    const matchesSaved = !onlySaved || savedIds.has(event.id);
    const matchesShared = !sharedEventIds || sharedEventIds.has(event.id);
    return matchesLocation && matchesWhen && matchesType && matchesBudget && matchesFormat && matchesGuarantee && matchesSaved && matchesShared && event.endDate >= today;
  }

  function escapeIcs(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function nextCalendarDay(isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10).replaceAll('-', '');
  }

  function downloadCalendar(selectedEvents, filename = 'big-bluff-bay-events') {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Big Bluff Bay//Australian Poker Events//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Big Bluff Bay saved poker events'
    ];
    for (const event of selectedEvents) {
      const sourceUrl = validUrl(event.sourceUrl);
      lines.push('BEGIN:VEVENT', `UID:${escapeIcs(event.id)}@bigbluffbay.au`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${event.startDate.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${nextCalendarDay(event.endDate)}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs([event.venue, event.city, event.state].filter(Boolean).join(', '))}`, `DESCRIPTION:${escapeIcs(`${event.organiser || ''}${sourceUrl ? ` — ${sourceUrl}` : ''}`)}`, ...(sourceUrl ? [`URL:${sourceUrl}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '')}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function addToCalendar(event) {
    downloadCalendar([event], String(event.title || 'poker-event').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    setFeedback('Calendar file downloaded.');
  }

  function setFeedback(message) {
    actionFeedback.textContent = message;
    window.clearTimeout(setFeedback.timer);
    setFeedback.timer = window.setTimeout(() => { actionFeedback.textContent = ''; }, 3500);
  }

  async function shareOrCopy({ title, text, url }) {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
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
    return 'copied';
  }

  function render(pushHistory = false) {
    const shown = events.filter(matches).sort((a, b) => a.startDate.localeCompare(b.startDate));
    grid.setAttribute('aria-busy', 'false');
    resultsNote.textContent = `${shown.length} ${shown.length === 1 ? 'event' : 'events'} found`;
    if (!shown.length) {
      const message = onlySaved
        ? '<strong>No saved events match these filters.</strong><p>Save an event with the star button, or clear filters to see all saved events.</p>'
        : '<strong>No checked events match those filters yet.</strong><p>Try another city or date, or browse the organisers’ calendars below.</p>';
      grid.innerHTML = `<div class="empty-state">${message}</div>`;
      updateUrl(pushHistory);
      return;
    }
    grid.innerHTML = shown.map((event, index) => {
      const featured = index === 0 && statusFor(event) === 'Happening now';
      const dates = event.startDate === event.endDate ? dateLabel(event.startDate) : `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`;
      const sourceUrl = validUrl(event.sourceUrl);
      const saved = savedIds.has(event.id);
      const entryLabel = (Number.isFinite(event.buyInMin) && event.buyInMin >= 0) ? `From $${event.buyInMin.toLocaleString('en-AU')}` : '';
      const guaranteeLabel = (Number.isFinite(event.guaranteeAmount) && event.guaranteeAmount > 0) ? `$${event.guaranteeAmount.toLocaleString('en-AU')} GTD` : '';
      const formatLabel = Array.isArray(event.formats) ? event.formats.join(' · ') : '';
      const facts = [entryLabel, guaranteeLabel, formatLabel].filter(Boolean);
      const detailLink = `/events/${String(event.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
      const mapLink = event.venueConfirmed !== false && event.venue
        ? `<a class="detail" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue} ${event.city} ${event.state}`)}" target="_blank" aria-label="Directions to ${safe(event.venue)}, ${safe(event.city)}, ${safe(event.state)}" rel="noopener noreferrer">Directions ↗</a>` : '';
      const organiserLink = sourceUrl
        ? `<a class="official-link" href="${safe(sourceUrl)}" target="_blank" rel="noopener noreferrer">Official details <span aria-hidden="true">↗</span></a>`
        : '<span class="official-link is-unavailable">Official link unavailable</span>';
      return `<article class="event-card${featured ? ' featured' : ''}" id="event-${safe(event.id)}" data-event-id="${safe(event.id)}">
        <div class="event-topline"><span class="event-kind">${safe(event.label)}</span><span class="event-live"><span aria-hidden="true"></span>${statusFor(event)}</span></div>
        <h3><a href="${safe(detailLink)}">${safe(event.title)}</a></h3><p class="event-organiser"><a href="/organisers/${String(event.organiser).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html">${safe(event.organiser)}</a></p>
        <div class="event-details"><span class="detail"><span class="detail-icon" aria-hidden="true">⌖</span>${safe(event.city)}, ${safe(event.state)}</span><span class="detail"><span class="detail-icon" aria-hidden="true">▦</span>${safe(event.venue)}</span>${mapLink}</div>
        ${facts.length ? `<p class="event-facts">${facts.map((fact) => `<span>${safe(fact)}</span>`).join('')}</p>` : ''}
        <div class="event-card-footer"><span class="date-range">${dates}</span>${organiserLink}</div>
        <div class="event-actions">
          <button class="card-action save-event${saved ? ' is-saved' : ''}" type="button" data-save="${safe(event.id)}" aria-pressed="${saved}">${saved ? '★ Saved' : '☆ Save event'}</button>
          <button class="card-action" type="button" data-calendar="${safe(event.id)}">▦ Add to calendar</button>
          <button class="card-action" type="button" data-share-event="${safe(event.id)}">↗ Share</button>
        </div>
        <div class="event-source">Checked ${dateLabel(event.checkedAt)} · Confirm details with organiser</div>
      </article>`;
    }).join('');
    updateUrl(pushHistory);
  }

  function persistSaved() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...savedIds]));
    } catch {
      storageNote.textContent = 'Saved only until this page closes';
    }
    updateSavedCount();
  }

  function setLocation(value, pushHistory = false) {
    locationInput.value = value;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === value.toLowerCase()));
    render(pushHistory);
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    render(true);
    document.querySelector('#events-title').focus();
  });
  locationInput.addEventListener('input', () => {
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === locationInput.value.trim().toLowerCase()));
    render();
  });
  [whenSelect, typeSelect, budgetSelect, formatSelect, guaranteeSelect].forEach((control) => control.addEventListener('change', () => {
    updateAdvancedFilterSummary();
    render(true);
  }));
  cityButtons.forEach((button) => button.addEventListener('click', () => {
    if (button.classList.contains('city-card') && button.tagName === 'BUTTON') document.querySelector('#events').scrollIntoView({ behavior: 'smooth' });
    setLocation(button.dataset.location, true);
  }));

  savedToggle.addEventListener('click', () => {
    onlySaved = !onlySaved;
    updateSavedCount();
    render(true);
  });
  clearFiltersButton.addEventListener('click', () => {
    locationInput.value = '';
    whenSelect.value = 'upcoming';
    typeSelect.value = 'all';
    budgetSelect.value = 'all';
    formatSelect.value = 'all';
    guaranteeSelect.value = 'all';
    onlySaved = false;
    sharedEventIds = null;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location === ''));
    updateSavedCount();
    updateAdvancedFilterSummary(true);
    render(true);
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
      return;
    }
    const eventShareButton = event.target.closest('[data-share-event]');
    if (eventShareButton) {
      const selected = events.find((item) => item.id === eventShareButton.dataset.shareEvent);
      if (!selected) return;
      const url = new URL(`/events/${selected.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, window.location.origin).href;
      shareOrCopy({ title: selected.title, text: `${selected.title} · ${selected.city} · ${dateLabel(selected.startDate)}`, url })
        .then((result) => { if (result === 'copied') setFeedback('Event link copied.'); })
        .catch((error) => { if (error.name !== 'AbortError') setFeedback('Could not share this event.'); });
    }
  });

  async function shareSearch() {
    const sharedUrl = new URL(window.location.href);
    sharedUrl.searchParams.delete('saved');
    if (onlySaved) {
      const selectedIds = events.filter(matches).map((item) => item.id);
      if (!selectedIds.length) { setFeedback('Save events that match your filters to share a shortlist.'); return; }
      sharedUrl.searchParams.set('events', selectedIds.join(','));
    }
    const url = sharedUrl.href;
    try {
      const result = await shareOrCopy({ title: 'Poker events | Big Bluff Bay', text: onlySaved ? 'Here’s my Australian poker event shortlist.' : 'Check out these Australian poker events.', url });
      if (result === 'copied') setFeedback(onlySaved ? 'Shortlist link copied.' : 'Search link copied.');
    } catch (error) {
      if (error.name !== 'AbortError') setFeedback('Could not share this link.');
    }
  }
  shareButton.addEventListener('click', shareSearch);
  downloadSavedButton.addEventListener('click', () => {
    const selected = events.filter((item) => savedIds.has(item.id));
    if (!selected.length) { setFeedback('Save one or more events first.'); return; }
    downloadCalendar(selected, 'big-bluff-bay-shortlist');
    setFeedback(`${selected.length} saved ${selected.length === 1 ? 'event' : 'events'} added to your calendar file.`);
  });

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
  window.addEventListener('popstate', () => { syncFromUrl(); render(); });
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
