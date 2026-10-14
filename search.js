(() => {
  const form = document.querySelector('#full-search');
  const queryInput = document.querySelector('#search-query');
  const typeSelect = document.querySelector('#search-type');
  const results = document.querySelector('#search-results');
  const count = document.querySelector('#search-count');
  const params = new URLSearchParams(window.location.search);
  let events = [];

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const today = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dateLabel = (value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne'
    }).format(date);
  };
  const validUrl = (value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };

  queryInput.value = (params.get('q') || '').slice(0, 80);
  if (['all', 'series', 'league'].includes(params.get('type'))) typeSelect.value = params.get('type');

  function render() {
    const query = queryInput.value.trim().toLocaleLowerCase('en-AU');
    const type = typeSelect.value;
    const found = events.filter((event) => {
      const text = [event.title, event.organiser, event.label, event.city, event.state, event.venue].join(' ').toLocaleLowerCase('en-AU');
      return event.endDate >= today && (!query || text.includes(query)) && (type === 'all' || event.type === type);
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));

    count.textContent = `${found.length} ${found.length === 1 ? 'event' : 'events'}${query ? ` matching “${queryInput.value.trim()}”` : ''}`;
    results.setAttribute('aria-busy', 'false');
    if (!found.length) {
      results.innerHTML = '<div class="empty-state"><strong>No upcoming events match that search.</strong><p>Try a broader city or organiser name, or clear the type filter to see more.</p><a href="/search.html">Show all upcoming events ↗</a></div>';
      return;
    }
    results.innerHTML = found.map((event) => {
      const dates = event.startDate === event.endDate
        ? dateLabel(event.startDate)
        : `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`;
      let official = '';
      const sourceUrl = validUrl(event.sourceUrl);
      if (sourceUrl) official = `<a class="official-link" href="${safe(sourceUrl)}" target="_blank" rel="noopener noreferrer">Official details <span aria-hidden="true">↗</span></a>`;
      return `<article class="search-card">
        <div class="search-card-top"><span class="event-kind">${safe(event.label)}</span><span class="search-date">${safe(dates)}</span></div>
        <h3>${safe(event.title)}</h3>
        <p class="search-organiser">${safe(event.organiser)}</p>
        <p class="search-location-line">${safe(event.venue)} · ${safe(event.city)}, ${safe(event.state)}</p>
        <div class="search-card-bottom">${official}<span>Checked ${safe(dateLabel(event.checkedAt))}</span></div>
      </article>`;
    }).join('');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (queryInput.value.trim()) next.set('q', queryInput.value.trim());
    if (typeSelect.value !== 'all') next.set('type', typeSelect.value);
    window.history.replaceState({}, '', `${window.location.pathname}${next.size ? `?${next.toString()}` : ''}`);
    render();
  });
  document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => {
    queryInput.value = button.dataset.query;
    typeSelect.value = 'all';
    form.requestSubmit();
  }));

  document.querySelector('#year').textContent = new Date().getFullYear();
  fetch('/data/events.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('Calendar unavailable'); return response.json(); })
    .then((data) => {
      events = Array.isArray(data.events)
        ? data.events.filter((event) => event && typeof event.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate))
        : [];
      render();
    })
    .catch(() => {
      count.textContent = 'Calendar unavailable';
      results.setAttribute('aria-busy', 'false');
      results.innerHTML = '<div class="empty-state"><strong>The event calendar could not be loaded.</strong><p>Please try again, or go to the <a href="/">Big Bluff Bay homepage</a>.</p></div>';
    });
})();
