import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const data = JSON.parse(await readFile(resolve(root, 'data/events.json'), 'utf8'));
const events = Array.isArray(data.events) ? data.events : [];
const timezone = data.timezone || 'Australia/Melbourne';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const active = events.filter((event) => event.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));

const organisers = {
  'Australian Poker Tour': 'https://australianpokertour.com.au/',
  'National Poker League': 'https://www.npl.com.au/Index',
  'Crown Melbourne': 'https://www.crownmelbourne.com.au/casino/offers/victorian-poker-championship',
};
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const date = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-AU', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const dateRange = (event) => event.startDate === event.endDate
  ? date(event.startDate)
  : `${date(event.startDate)} – ${date(event.endDate)}`;
const title = (text) => escapeHtml(text);
const orgLink = (name) => `<a href="${escapeHtml(organisers[name] || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} <span aria-hidden="true">↗</span></a>`;
const venueIsUnknown = (value) => !value || /see organiser|venue varies|not confirmed/i.test(value);
const venueIsConfirmed = (event) => event.venueConfirmed !== false && !venueIsUnknown(event.venue);

function eventCard(event) {
  const venue = !venueIsConfirmed(event)
    ? `<span class="directory-muted">${escapeHtml(event.venue || 'Venue details on the organiser’s page')} · confirm details with organiser</span>`
    : `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue} ${event.city} ${event.state}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.venue)} <span aria-hidden="true">↗</span></a>`;
  return `<article class="directory-card">
    <p class="directory-kicker">${escapeHtml(event.label || 'Poker event')} · ${escapeHtml(event.city)}, ${escapeHtml(event.state)}</p>
    <h3>${escapeHtml(event.title)}</h3>
    <p class="directory-date">${dateRange(event)}</p>
    ${event.details ? `<p class="directory-details">${escapeHtml(event.details)}</p>` : ''}
    <dl class="directory-facts"><div><dt>Organiser</dt><dd>${orgLink(event.organiser)}</dd></div><div><dt>Venue</dt><dd>${venue}</dd></div></dl>
    <a class="directory-source" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Check official event details <span aria-hidden="true">↗</span></a>
  </article>`;
}
function pageShell({ pageTitle, description, canonical, eyebrow, heading, intro, body, noindex = false }) {
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#101712"><meta name="description" content="${escapeHtml(description)}">${noindex ? '<meta name="robots" content="noindex,follow">' : `<link rel="canonical" href="https://bigbluffbay.au${canonical}">`}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${escapeHtml(pageTitle)} | Big Bluff Bay</title><link rel="stylesheet" href="/styles.css"><script src="/directory.js" defer></script></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="shell nav-wrap"><a class="brand" href="/" aria-label="Big Bluff Bay home"><span class="brand-mark" aria-hidden="true">B<span>♠</span>B</span><span class="brand-name">BIG BLUFF <b>BAY</b></span></a><nav class="main-nav" aria-label="Main navigation"><a href="/">Find games</a><a href="/tournaments.html">Tournaments</a><a href="/organisers.html">Organisers</a><a href="/venues.html">Venues</a><a href="/search.html">Search</a></nav><a class="nav-cta" href="/#events">Browse events <span aria-hidden="true">↗</span></a><button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav"><span></span><span></span></button></div><nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" hidden><a href="/">Find games</a><a href="/search.html">Search events</a><a href="/tournaments.html">Tournaments</a><a href="/organisers.html">Organisers</a><a href="/venues.html">Venues</a><a href="/cities/gold-coast.html">Gold Coast</a><a href="/cities/cairns.html">Cairns</a></nav></header>
<main id="main" class="directory-main"><section class="directory-hero"><div class="shell"><p class="eyebrow">${eyebrow}</p><h1>${heading}</h1><p>${intro}</p><div class="directory-actions"><a class="search-button" href="/">Browse live calendar <span aria-hidden="true">→</span></a><a class="directory-search-link" href="/search.html">Search all listings</a></div></div></section>${body}</main>
<footer class="site-footer"><div class="shell footer-top"><a class="brand footer-brand" href="/" aria-label="Big Bluff Bay home"><span class="brand-mark" aria-hidden="true">B<span>♠</span>B</span><span class="brand-name">BIG BLUFF <b>BAY</b></span></a><p>Find a game. Check the details. Enjoy the night.</p><a class="back-top" href="#main">Back to top ↑</a></div><div class="shell footer-bottom"><span>© 2026 Big Bluff Bay</span><span>18+ only · Play within your limits</span><span>Event details belong to their respective organisers.</span></div></footer></body></html>`;
}
function listingGrid(items, emptyText) {
  return items.length ? `<div class="directory-grid">${items.map(eventCard).join('\n')}</div>` : `<div class="directory-empty"><h2>No verified events listed yet</h2><p>${emptyText}</p></div>`;
}

const tournamentBody = `<section class="shell directory-section"><div class="directory-section-head"><div><p class="eyebrow">${active.length} CURRENT LISTING${active.length === 1 ? '' : 'S'}</p><h2>Upcoming tournaments</h2></div><p>Event dates and details are sourced from organisers. Open the official listing before booking or travelling.</p></div>${listingGrid(active, 'Check organiser schedules below; new listings are added after their dates and details can be verified.')}</section>`;
const organiserEntries = [...new Set(active.map((event) => event.organiser))].sort().map((name) => {
  const items = active.filter((event) => event.organiser === name);
  return `<article class="organiser-card"><div class="organiser-card-head"><div><p class="directory-kicker">${items.length} UPCOMING LISTING${items.length === 1 ? '' : 'S'}</p><h3>${escapeHtml(name)}</h3></div><a href="${escapeHtml(organisers[name] || '#')}" target="_blank" rel="noopener noreferrer">Official site ↗</a></div><ul>${items.map((event) => `<li><span>${escapeHtml(event.title)}</span><time>${dateRange(event)}</time></li>`).join('')}</ul></article>`;
}).join('\n');
const organiserBody = `<section class="shell directory-section"><div class="directory-section-head"><div><p class="eyebrow">DIRECT FROM THE SOURCE</p><h2>Organisers</h2></div><p>Follow the tour or league for full schedules, registrations, structure sheets and updates.</p></div><div class="organiser-grid">${organiserEntries || '<p>No organisers have upcoming listings at the moment.</p>'}</div></section>`;
const venueMap = new Map();
for (const event of active) {
  const confirmed = venueIsConfirmed(event);
  const venueName = event.venue || 'Venue details on organiser page';
  const key = `${confirmed ? venueName : `${venueName} (verify)`}|${event.city}|${event.state}`;
  const list = venueMap.get(key) || { venue: confirmed ? venueName : `${venueName} · verify with organiser`, city: event.city, state: event.state, confirmed, events: [] };
  list.events.push(event);
  venueMap.set(key, list);
}
const venueEntries = [...venueMap.values()].sort((a, b) => a.city.localeCompare(b.city)).map((entry) => `<article class="venue-card"><p class="directory-kicker">${entry.confirmed ? 'CONFIRMED VENUE' : 'VENUE TO CHECK'} · ${escapeHtml(entry.city)}, ${escapeHtml(entry.state)}</p><h3>${escapeHtml(entry.venue)}</h3><ul>${entry.events.map((event) => `<li><span>${escapeHtml(event.title)}</span><a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official details ↗</a></li>`).join('')}</ul>${entry.confirmed ? `<a class="venue-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${entry.venue} ${entry.city} ${entry.state}`)}" target="_blank" rel="noopener noreferrer">Open map ↗</a>` : ''}</article>`).join('\n');
const venueBody = `<section class="shell directory-section"><div class="directory-section-head"><div><p class="eyebrow">PLAN THE TRIP</p><h2>Venues</h2></div><p>Confirmed venues link to a map search. Where a series uses multiple rooms or its venue is not confirmed, check the organiser’s current schedule.</p></div><div class="organiser-grid">${venueEntries || '<p>No venues attached to upcoming listings yet.</p>'}</div></section>`;

const pages = new Map([
  ['tournaments.html', pageShell({ pageTitle: 'Australian poker tournaments', description: 'Upcoming Australian live poker tournaments and league events with official organiser links and venue details.', canonical: '/tournaments.html', eyebrow: 'THE AUSTRALIAN EVENT BOARD', heading: 'Tournaments, lined up.', intro: 'A practical calendar of live poker series and league events, with dates, locations and a direct path to the organiser.', body: tournamentBody })],
  ['organisers.html', pageShell({ pageTitle: 'Poker tournament organisers', description: 'Browse Australian poker tour and league organisers with upcoming events and official links.', canonical: '/organisers.html', eyebrow: 'WHO’S DEALING', heading: 'Know the organisers.', intro: 'Find the tours and leagues behind the listings, then go straight to their official schedules and registration details.', body: organiserBody })],
  ['venues.html', pageShell({ pageTitle: 'Australian poker venues', description: 'Browse venues hosting upcoming Australian live poker tournaments and league games.', canonical: '/venues.html', eyebrow: 'WHERE THE GAME IS', heading: 'Venues and rooms.', intro: 'See where upcoming events are scheduled, open confirmed locations on a map, and spot listings that still need venue details.', body: venueBody })],
]);

const priorityCities = [
  { slug: 'gold-coast', name: 'Gold Coast', state: 'QLD', sources: [['Australian Poker Tour', organisers['Australian Poker Tour']], ['National Poker League events', 'https://www.npl.com.au/Events/List']] },
  { slug: 'cairns', name: 'Cairns', state: 'QLD', sources: [['Cairns RSL Club NPL venue calendar', 'https://www.npl.com.au/Venues/QLD/Cairns/Cairns-RSL-Club'], ['NPL league events', 'https://www.npl.com.au/Events/List'], ['Australian Poker Tour', organisers['Australian Poker Tour']]] },
];
for (const city of priorityCities) {
  const cityEvents = active.filter((event) => event.city.toLowerCase() === city.name.toLowerCase());
  const body = `<section class="shell directory-section"><div class="directory-section-head"><div><p class="eyebrow">${cityEvents.length} VERIFIED UPCOMING LISTING${cityEvents.length === 1 ? '' : 'S'}</p><h2>${escapeHtml(city.name)} poker events</h2></div><p>We publish dated events with an organiser source. Check the official schedule for newly announced games and final details.</p></div>${listingGrid(cityEvents, `There are no verified ${escapeHtml(city.name)} events in the calendar right now. Browse organiser schedules for the latest announcements.`)}<div class="priority-sources"><h2>Official schedules to check</h2>${city.sources.map(([name, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a>`).join('')}</div></section>`;
  const slug = `/cities/${city.slug}.html`;
  pages.set(`cities/${city.slug}.html`, pageShell({ pageTitle: `${city.name} poker events`, description: `Verified upcoming live poker tournament listings in ${city.name}, ${city.state}, with direct organiser links.`, canonical: slug, eyebrow: `LOCAL POKER · ${city.state}`, heading: `${escapeHtml(city.name)} poker calendar.`, intro: `Tournament series and league listings around ${escapeHtml(city.name)}, updated from official sources. Only confirmed dates are listed.`, body, noindex: cityEvents.length < 3 }));
}

for (const [path, content] of pages) {
  const file = resolve(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${content}\n`);
}
const publicUrls = ['/', '/tournaments.html', '/organisers.html', '/venues.html'];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicUrls.map((path) => `  <url><loc>https://bigbluffbay.au${path}</loc><changefreq>${path === '/' ? 'daily' : 'weekly'}</changefreq><priority>${path === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
await writeFile(resolve(root, 'sitemap.xml'), sitemap);
console.log(`Built ${pages.size} directory pages from ${active.length} active event listings as at ${today}.`);
