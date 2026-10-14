import { readFile } from 'node:fs/promises';

const title = 'Big Bluff Bay calendar maintenance';
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const offline = process.env.CHECK_EVENTS_OFFLINE === '1';
const issues = [];
const candidates = [];

const data = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const events = Array.isArray(data.events) ? data.events : [];
const timezone = data.timezone || 'Australia/Melbourne';
const today = process.env.CHECK_DATE || new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
if (!events.length) issues.push('Calendar has no event records to monitor.');
const ids = new Set();
const dateMs = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(`${value}T00:00:00Z`) : NaN;
const ageDays = (date) => Math.floor((dateMs(today) - dateMs(date)) / 86400000);
const daysUntil = (date) => Math.ceil((dateMs(date) - dateMs(today)) / 86400000);
const normalise = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Set(events.map((event) => normalise(event.title)));

for (const event of events) {
  const label = event.title || event.id || 'Untitled event';
  if (!event.id || ids.has(event.id)) issues.push(`Duplicate or missing event ID: ${label}`);
  if (event.id) ids.add(event.id);
  for (const field of ['title', 'organiser', 'label', 'type', 'city', 'state', 'venue', 'sourceUrl']) {
    if (!event[field]) issues.push(`${label}: missing ${field}`);
  }
  if (!Number.isFinite(dateMs(event.startDate)) || !Number.isFinite(dateMs(event.endDate))) {
    issues.push(`${label}: startDate/endDate must use YYYY-MM-DD`);
  } else if (dateMs(event.endDate) < dateMs(event.startDate)) {
    issues.push(`${label}: endDate is before startDate`);
  }
  if (!Number.isFinite(dateMs(event.checkedAt))) {
    issues.push(`${label}: checkedAt must use YYYY-MM-DD`);
  } else if (dateMs(event.endDate) >= dateMs(today)) {
    const threshold = daysUntil(event.startDate) <= 30 ? 7 : 30;
    if (ageDays(event.checkedAt) > threshold) {
      issues.push(`${label}: source last checked ${ageDays(event.checkedAt)} days ago (recheck within ${threshold} days)`);
    }
  }
  try {
    const url = new URL(event.sourceUrl);
    if (url.protocol !== 'https:') issues.push(`${label}: source link should use HTTPS`);
  } catch {
    issues.push(`${label}: sourceUrl is not a valid URL`);
  }
}

function collectJsonLd(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLd(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => ['Event', 'SportsEvent'].includes(type)) && value.name && value.startDate) found.push(value);
  if (value['@graph']) collectJsonLd(value['@graph'], found);
  return found;
}

function htmlEvents(html) {
  const found = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLd(JSON.parse(match[1].trim()), found); } catch { /* Ignore malformed third-party schema blocks. */ }
  }
  return found;
}

function candidateText(item, sourceUrl) {
  const location = item.location;
  const place = Array.isArray(location) ? location[0] : location;
  const organiser = Array.isArray(item.organizer) ? item.organizer[0] : item.organizer;
  const address = place?.address;
  const city = typeof address === 'string' ? address : address?.addressLocality;
  const venue = place?.name;
  const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
  const startDate = String(item.startDate).slice(0, 10);
  const endDate = String(item.endDate || item.startDate).slice(0, 10);
  const plain = (value, max = 180) => String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&')
    .replace(/@/g, '\\@');
  if (!Number.isFinite(dateMs(startDate)) || !Number.isFinite(dateMs(endDate)) || dateMs(endDate) < dateMs(today)) return null;
  const key = normalise(item.name);
  if (seen.has(key)) return null;
  seen.add(key);
  const details = [
    `**${plain(item.name, 120)}**`,
    `Dates: ${startDate}${endDate !== startDate ? ` to ${endDate}` : ''}`,
    venue ? `Venue: ${plain(venue)}` : null,
    city ? `City: ${plain(city)}` : null,
    organiser?.name ? `Host: ${plain(organiser.name)}` : null,
    item.description ? `Details to verify: ${plain(item.description)}` : null,
    offer?.price ? `Offer price to verify: ${plain(`${offer.price} ${offer.priceCurrency || ''}`)}` : null,
    `Verify and review: ${sourceUrl}`,
  ].filter(Boolean);
  return details.join('  \n');
}

const sourceEvents = [];
const activeSources = new Map();
const sourceConfig = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
for (const source of sourceConfig.sources || []) {
  if (!source.url) continue;
  const group = activeSources.get(source.url) || [];
  group.push(source.name || source.organiser || source.url);
  activeSources.set(source.url, group);
}
for (const event of events) {
  if (!event.sourceUrl || dateMs(event.endDate) < dateMs(today)) continue;
  const group = activeSources.get(event.sourceUrl) || [];
  group.push(event.title || event.id || event.sourceUrl);
  activeSources.set(event.sourceUrl, group);
}
const checked = offline ? [] : await Promise.all([...activeSources].map(async ([sourceUrl, labels]) => {
    const label = labels.join(' / ');
    try {
      const response = await fetch(sourceUrl, {
        headers: { 'user-agent': 'BigBluffBayCalendarMonitor/1.0 (+https://bigbluffbay.au)', accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if ([404, 410].includes(response.status) || response.status >= 500) {
        issues.push(`${label}: organiser source returned HTTP ${response.status} (${response.url || sourceUrl})`);
      } else if (response.status === 403 || response.status === 429) {
        issues.push(`${label}: source check was rate-limited or blocked (HTTP ${response.status}); manual check needed`);
      } else if (!response.ok) {
        issues.push(`${label}: organiser source returned HTTP ${response.status}`);
      }
      const body = (await response.text()).slice(0, 2_000_000);
      let structured = [];
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        try { structured = collectJsonLd(JSON.parse(body)); } catch { /* Non-JSON response body. */ }
      }
      sourceEvents.push(...[...htmlEvents(body), ...structured].map((item) => ({ item, sourceUrl: response.url || sourceUrl })));
      return { label, status: response.status, finalUrl: response.url };
    } catch (error) {
      issues.push(`${label}: source could not be checked (${error.name === 'TimeoutError' ? 'timed out' : 'request failed'}); manual check needed`);
      return { label, status: 'unavailable' };
    }
  }));

for (const { item, sourceUrl } of sourceEvents) {
  const candidate = candidateText(item, sourceUrl);
  if (candidate) candidates.push(candidate);
}

const reportLines = [
  `Checked ${today} (${timezone}).`,
  `Active event sources checked: ${checked.length}.`,
];
if (issues.length) reportLines.push('', '## Needs attention', ...issues.map((item) => `- ${item}`));
if (candidates.length) reportLines.push('', '## Possible upcoming events found in official structured data', ...candidates.map((item) => `- ${item}`), '', 'Candidates are never published automatically. Confirm the dates, game details, venue and host on the organiser page before adding them.');
if (!issues.length && !candidates.length) reportLines.push('', 'No stale records, broken source links or new structured event candidates found.');
reportLines.push('', 'The site only publishes calendar records after review. This monitor does not create or promote private cash games or gambling offers.');
const body = `<!-- bigbluffbay-calendar-monitor -->\n${reportLines.join('\n')}`;

console.log(body.replace('<!-- bigbluffbay-calendar-monitor -->\n', ''));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);
}

if (!offline && repo && token) {
  const base = `https://api.github.com/repos/${repo}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', 'user-agent': 'BigBluffBayCalendarMonitor/1.0' };
  const openResponse = await fetch(`${base}/issues?state=open&per_page=100`, { headers });
  if (!openResponse.ok) throw new Error(`GitHub issue lookup failed: HTTP ${openResponse.status}`);
  const openIssues = await openResponse.json();
  const reportIssue = openIssues.find((issue) => !issue.pull_request && issue.title === title && issue.body?.includes('<!-- bigbluffbay-calendar-monitor -->'));
  if (issues.length || candidates.length) {
    const payload = { title, body };
    const response = reportIssue
      ? await fetch(`${base}/issues/${reportIssue.number}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
      : await fetch(`${base}/issues`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`GitHub report issue update failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    console.log(`${reportIssue ? 'Updated' : 'Opened'} calendar report issue.`);
  } else if (reportIssue) {
    const response = await fetch(`${base}/issues/${reportIssue.number}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ state: 'closed', body: `${body}\n\nResolved automatically: the latest scheduled source check found no follow-up items.` }),
    });
    if (!response.ok) throw new Error(`GitHub report issue close failed: HTTP ${response.status}`);
    console.log('Closed the resolved calendar report issue.');
  }
}
