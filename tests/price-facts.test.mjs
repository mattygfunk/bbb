import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual browser rendering and filter handlers without a browser dependency.
async function page(script, query = '') {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: /type|budget|format|guarantee/.test(selector) ? 'all' : '',
      innerHTML: '', textContent: '', listeners: {}, dataset: {},
      classList: {toggle() {}, add() {}, remove() {}},
      setAttribute() {}, querySelector: child => element(`${selector} ${child}`),
      querySelectorAll: () => [],
      addEventListener(type, callback) { this.listeners[type] = callback; },
    });
    return elements.get(selector);
  }
  const records = [
    ['missing', undefined, undefined], ['null', null, null], ['blank', '', ''],
    ['string', '50', '20000'], ['negative', -10, -500], ['boolean', false, true],
    ['free', 0, 0], ['paid', 50, 20000],
  ].map(([id, buyInMin, guaranteeAmount]) => ({
    id, title: id, buyInMin, guaranteeAmount, city: 'Melbourne', state: 'VIC',
    venue: 'Venue', organiser: 'Organiser', label: 'Tournament', type: 'series',
    startDate: '2099-01-01', endDate: '2099-01-02', checkedAt: '2026-10-15',
    sourceUrl: 'https://example.com/', formats: id === 'blank' ? 'malformed' : [],
  }));
  const context = vm.createContext({
    document: {querySelector: element, querySelectorAll: () => []},
    window: {location: {search: query, pathname: '/', hash: ''},
      history: {replaceState() {}, pushState() {}}, addEventListener() {}},
    localStorage: {getItem: () => null}, URL, URLSearchParams, Intl, Date,
    fetch: async () => ({ok: true, json: async () => ({events: records})}),
  });
  vm.runInContext(await readFile(new URL(`../${script}`, import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const html = () => element(script === 'app.js' ? '#event-grid' : '#search-results').innerHTML;
  const filter = (kind, value) => {
    const control = element(script === 'app.js' ? `#${kind}-filter` : `#search-${kind}`);
    control.value = value;
    if (script === 'app.js') control.listeners.change();
    else element('#full-search').listeners.submit({preventDefault() {}});
    return html();
  };
  return {html, filter};
}

for (const script of ['app.js', 'search.js']) {
  test(`${script}: absent and malformed prices never become zero-dollar facts`, async () => {
    const p = await page(script);
    assert.match(p.html(), /(?:From|Entry from) \$0/); // Explicit free entry remains valid.
    assert.doesNotMatch(p.html(), /\$0 GTD|\$-10|\$-500/);
    // Only the explicit free entry and the verified $50 entry match a budget.
    const budget = p.filter('budget', '0-100');
    assert.match(budget, /\/events\/free\.html/);
    assert.match(budget, /\/events\/paid\.html/);
    for (const id of ['missing', 'null', 'blank', 'string', 'negative', 'boolean']) {
      assert.ok(!budget.includes(`/events/${id}.html`), `${id} must not match a budget`);
    }
    p.filter('budget', 'all');
    const guaranteed = p.filter('guarantee', 'listed');
    assert.match(guaranteed, /\/events\/paid\.html/);
    assert.ok(!guaranteed.includes('/events/free.html'));
    assert.ok(!guaranteed.includes('/events/null.html'));
  });
}
