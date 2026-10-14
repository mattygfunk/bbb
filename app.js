(() => {
  const grid = document.querySelector('#event-grid');
  const searchForm = document.querySelector('#event-search');
  const locationInput = document.querySelector('#location-filter');
  const whenSelect = document.querySelector('#when-filter');
  const typeSelect = document.querySelector('#type-filter');
  const resultsNote = document.querySelector('#results-note');
  const listingCount = document.querySelector('#listing-count');
  const cityButtons = [...document.querySelectorAll('[data-location]')];
  let events = [];

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const today = `${dateParts.find((part) => part.type === 'year').value}-${dateParts.find((part) => part.type === 'month').value}-${dateParts.find((part) => part.type === 'day').value}`;
  const monthKey = today.slice(0, 7);
  const dateLabel = (value) => new Date(`${value}T12:00:00+11:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' });
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function statusFor(event) {
    if (event.startDate <= today && event.endDate >= today) return 'Happening now';
    return 'Upcoming';
  }

  function matches(event) {
    const query = locationInput.value.trim().toLowerCase();
    const when = whenSelect.value;
    const type = typeSelect.value;
    const matchesLocation = !query || `${event.city} ${event.state} ${event.venue} ${event.organiser}`.toLowerCase().includes(query);
    const matchesWhen = when === 'all' || (when === 'this-month' ? event.startDate.slice(0, 7) === monthKey || event.endDate.slice(0, 7) === monthKey : event.endDate >= today);
    const matchesType = type === 'all' || event.type === type;
    return matchesLocation && matchesWhen && matchesType && event.endDate >= today;
  }

  function render() {
    const shown = events.filter(matches).sort((a, b) => a.startDate.localeCompare(b.startDate));
    grid.setAttribute('aria-busy', 'false');
    resultsNote.textContent = `${shown.length} ${shown.length === 1 ? 'event' : 'events'} found`;
    if (!shown.length) {
      grid.innerHTML = '<div class="empty-state"><strong>No checked events match those filters yet.</strong><p>Try another city or date, or browse the organisers’ calendars below.</p></div>';
      return;
    }
    grid.innerHTML = shown.map((event, index) => {
      const featured = index === 0 && statusFor(event) === 'Happening now';
      const dates = event.startDate === event.endDate ? dateLabel(event.startDate) : `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`;
      return `<article class="event-card${featured ? ' featured' : ''}">
        <div class="event-topline"><span class="event-kind">${safe(event.label)}</span><span class="event-live"><span aria-hidden="true"></span>${statusFor(event)}</span></div>
        <h3>${safe(event.title)}</h3><p class="event-organiser">${safe(event.organiser)}</p>
        <div class="event-details"><span class="detail"><span class="detail-icon" aria-hidden="true">⌖</span>${safe(event.city)}, ${safe(event.state)}</span><span class="detail"><span class="detail-icon" aria-hidden="true">▦</span>${safe(event.venue)}</span></div>
        <div class="event-card-footer"><span class="date-range">${dates}</span><a class="official-link" href="${safe(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official details <span aria-hidden="true">↗</span></a></div>
        <div class="event-source">Checked ${dateLabel(event.checkedAt)} · Confirm details with organiser</div>
      </article>`;
    }).join('');
  }

  function setLocation(value) {
    locationInput.value = value;
    cityButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.location.toLowerCase() === value.toLowerCase()));
    render();
  }

  searchForm.addEventListener('submit', (event) => { event.preventDefault(); render(); document.querySelector('#events-title').focus?.(); });
  [locationInput, whenSelect, typeSelect].forEach((control) => control.addEventListener('input', render));
  cityButtons.forEach((button) => button.addEventListener('click', () => {
    if (button.classList.contains('city-card') && button.tagName === 'BUTTON') document.querySelector('#events').scrollIntoView({ behavior: 'smooth' });
    setLocation(button.dataset.location);
  }));

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

  fetch('/data/events.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('Calendar unavailable'); return response.json(); })
    .then((data) => {
      events = Array.isArray(data.events) ? data.events.filter((event) => event.endDate >= today) : [];
      listingCount.textContent = `${events.length} checked events to start`; render();
    })
    .catch(() => {
      events = [];
      listingCount.textContent = 'Event calendar loading soon';
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '<div class="empty-state"><strong>The calendar is taking a breather.</strong><p>Please try again shortly, or check an organiser’s official schedule.</p></div>';
      resultsNote.textContent = 'Calendar unavailable';
    });
})();
