import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { readFile } from 'node:fs/promises';

// Lightweight view fixture: exercise the real views and pairing rules without a browser or network.
class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.events = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = { toggle: () => {} };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) this.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'text') this.textContent = value;
      else this.setAttribute(key, value);
    }
    this.append(...children);
  }
  setAttribute(key, value) {
    this.attrs[key] = value;
    if (['value', 'hidden', 'disabled'].includes(key)) this[key] = value;
  }
  append(...nodes) { this.children.push(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined)); }
  prepend(node) { this.children.unshift(node); }
  get textContent() { return this.children.map((n) => n instanceof Element ? n.textContent : String(n)).join(' '); }
  set textContent(value) { this.children = [value]; }
  get childElementCount() { return this.children.filter((n) => n instanceof Element).length; }
  querySelectorAll(selector) {
    return this.children.filter((n) => n instanceof Element).flatMap((n) => [
      ...((selector.startsWith('.') ? String(n.attrs.class || '').split(' ').includes(selector.slice(1)) : n.tag === selector) ? [n] : []),
      ...n.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  addEventListener(event, fn) { (this.events[event] ??= []).push(fn); }
  async fire(event) { for (const fn of this.events[event] || []) await fn(); }
  click() { return this.disabled ? Promise.resolve() : this.fire('click'); }
}
const el = (tag, attrs, ...children) => new Element(tag, attrs, children);
const clear = (node) => { node.children = []; return node; };
const notices = [];
const calls = [];
let response;
let load;
const red = { id: 'red', name: 'Rode testwijn', type: 'rood', grapes: ['syrah'], body: 'vol', bottles_in_cellar: 2 };
const empty = { ...red, id: 'empty', name: 'Lege testwijn', bottles_in_cellar: 0 };
await mock.module('../../web/js/util.js', { namedExports: {
  el, clear,
  input: (attrs) => el('input', attrs),
  field: (label, node) => el('label', {}, label, node),
  select: (options, attrs) => el('select', attrs, options.map(([value, text]) => el('option', { value, text }))),
  toast: (...args) => notices.push(args),
  typeLabel: (type) => type,
  TYPE_ICONS: {},
  wineTitle: (wine) => wine.name,
  drinkStatus: () => null,
  money: (value) => String(value),
  shrinkImage: async () => ({ dataUrl: 'data:image/jpeg;base64,fixture' }),
} });
await mock.module('../../web/js/api.js', { namedExports: {
  api: { post: async (path, payload) => { calls.push({ path, payload }); return response(path, payload); } },
} });
await mock.module('../../web/js/data.js', { namedExports: { loadWines: () => load() } });
await mock.module('../../web/js/views/cellar.js', { namedExports: {
  wineCard: (wine) => el('a', { href: `#/wijn/${wine.id}`, text: wine.name }, el('div', { class: 'badges' })),
} });
const { render } = await import('../../web/js/views/tonight.js');
const flush = () => new Promise((resolve) => setImmediate(resolve));
let hash;
globalThis.window = { history: { replaceState: (_state, _title, url) => { hash = url; } } };
beforeEach(() => {
  notices.length = 0;
  calls.length = 0;
  load = async () => [red, empty];
  response = async () => ({ picks: [], suggestions: [], summary: 'Testadvies' });
  hash = '';
});
const button = (root, text) => root.querySelectorAll('button').find((b) => b.textContent.includes(text));
async function fixture(tab = '') {
  const main = el('main');
  await render(main, { query: new URLSearchParams(tab ? { tab } : {}) });
  await flush();
  const [dish, mood] = main.querySelectorAll('input');
  return { main, dish, mood, select: main.querySelector('select') };
}

test('shared dish and mood drive evening advice; rules match cellar stock without AI', async () => {
  const { main, dish, mood } = await fixture();
  assert.equal(dish.attrs.maxlength, 200);
  assert.equal(mood.attrs.maxlength, 100);
  dish.value = ' lamsrack met rozemarijn ';
  await dish.fire('input');
  mood.value = ' rustige avond ';
  await mood.fire('input');
  assert.match(main.textContent, /Uit onze kelder bij lamsvlees/);
  assert.match(main.textContent, /Rode testwijn/);
  assert.doesNotMatch(main.textContent, /Lege testwijn/);
  assert.equal(calls.length, 0);
  response = async () => ({ summary: 'Passend avondadvies', picks: [
    { role: 'veilig', wine: { ...red, bottles: 2 }, reason: 'Past bij lam', serve: '16 graden' },
  ] });
  await button(main, 'Kies voor vanavond').click();
  assert.deepEqual(calls[0], { path: '/api/sommelier/tonight', payload: { dish: 'lamsrack met rozemarijn', mood: 'rustige avond' } });
  assert.match(main.textContent, /Veilige keuze.*2 flessen.*Past bij lam.*16 graden/);
  assert.match(main.textContent, /Uit onze kelder bij lamsvlees/);
  assert.ok(main.querySelectorAll('a').some((a) => a.attrs.href === '#/wijn/red' && a.textContent.includes('Openen')));
});

test('changing dish source clears old input and advice; detailed pairing uses that same dish', async () => {
  const { main, dish, select } = await fixture();
  dish.value = 'lam';
  await dish.fire('input');
  await button(main, 'Kies voor vanavond').click();
  select.value = 'biefstuk';
  await select.fire('change');
  assert.equal(dish.value, '');
  assert.doesNotMatch(main.textContent, /Testadvies/);
  response = async () => ({ summary: 'Gerechtadvies', suggestions: [{ wine_id: 'red', score: 95, reason: 'Bij steak', serving_tip: 'Decanteren' }] });
  await button(main, 'Uitgebreid wijnadvies').click();
  assert.deepEqual(calls.at(-1), { path: '/api/ai/pair', payload: { dish: 'Biefstuk / rood vlees' } });
  assert.match(main.textContent, /Gerechtadvies.*Bij steak.*Decanteren/);
  dish.value = 'onbekend gerecht';
  await dish.fire('input');
  assert.equal(select.value, '');
  assert.doesNotMatch(main.textContent, /Gerechtadvies/);
  assert.match(main.textContent, /Geen vaste spijs-wijnregel/);
});

for (const label of ['Kies voor vanavond', 'Uitgebreid wijnadvies']) {
  test(`${label}: ignore outdated responses and allow retry after errors`, async () => {
    const { main, dish, mood } = await fixture();
    dish.value = 'lam';
    await dish.fire('input');
    let resolve;
    response = () => new Promise((done) => { resolve = done; });
    const btn = button(main, label);
    const pending = btn.click();
    assert.equal(btn.disabled, true);
    mood.value = 'vrienden';
    await mood.fire('input');
    resolve({ summary: 'Verouderd advies', picks: [], suggestions: [] });
    await pending;
    assert.doesNotMatch(main.textContent, /Verouderd advies/);
    assert.equal(btn.disabled, false);
    response = async () => { throw new Error('AI niet beschikbaar'); };
    await btn.click();
    assert.deepEqual(notices.at(-1), ['AI niet beschikbaar', 'error']);
    assert.equal(btn.disabled, false);
    assert.match(main.textContent, /Uit onze kelder bij lamsvlees/);
  });
}

test('mode switches retain input/results and wine-to-food mode filters stock', async () => {
  const { main, dish } = await fixture();
  dish.value = 'lam';
  await dish.fire('input');
  await button(main, 'Kies voor vanavond').click();
  await button(main, 'Wat eten we bij deze wijn?').click();
  await flush();
  assert.equal(hash, '#/vanavond?tab=wijn');
  const sel = main.querySelectorAll('select').find((n) => n.attrs['aria-label'] === 'Kies een wijn');
  assert.ok(sel);
  assert.equal(sel.querySelectorAll('option').length, 2);
  sel.value = 'red';
  await sel.fire('change');
  assert.match(main.textContent, /Lekker bij Rode testwijn/);
  await button(main, 'Gerecht & avondadvies').click();
  assert.equal(hash, '#/vanavond');
  assert.equal(dish.value, 'lam');
  assert.match(main.textContent, /Testadvies/);
  const panels = main.children.at(-1).children;
  assert.equal(panels[0].hidden, false);
  assert.equal(panels[1].hidden, true);
  assert.equal(calls.length, 1);
});

test('restaurant deep link remains usable without loading cellar data', async () => {
  load = async () => { throw new Error('Should not load'); };
  const { main } = await fixture('restaurant');
  assert.doesNotMatch(main.textContent, /Should not load/);
  const inputs = main.querySelectorAll('input');
  inputs[0].value = 'vis';
  inputs[1].value = '40';
  inputs[2].files = [{}];
  response = async () => ({ summary: 'Restaurantadvies', wines: [], top3: [] });
  await inputs[2].fire('change');
  assert.deepEqual(calls[0], { path: '/api/sommelier/restaurant', payload: {
    image: 'data:image/jpeg;base64,fixture', dish: 'vis', budget: '40',
  } });
  assert.match(main.textContent, /Restaurantadvies/);
});

test('cellar failures are visible and retryable, evening advice still works without a dish', async () => {
  load = async () => { throw new Error('Geen verbinding'); };
  const { main } = await fixture();
  assert.match(main.textContent, /Spijs-wijnmatches konden niet worden geladen: Geen verbinding/);
  assert.equal(button(main, 'Uitgebreid wijnadvies').disabled, true);
  await button(main, 'Kies voor vanavond').click();
  assert.deepEqual(calls[0].payload, { dish: undefined, mood: undefined });
  load = async () => [];
  await button(main, 'Kelder opnieuw laden').click();
  assert.match(main.textContent, /geen flessen in de kelder/);
  assert.doesNotMatch(main.textContent, /Geen verbinding/);
});

test('wine-first deep link handles load errors and an empty cellar', async () => {
  load = async () => { throw new Error('Geen verbinding'); };
  const { main } = await fixture('wijn');
  assert.match(main.textContent, /Kelder kon niet worden geladen: Geen verbinding/);
  load = async () => [];
  await button(main, 'Opnieuw proberen').click();
  assert.match(main.textContent, /geen flessen in de kelder/);
});

test('old pairing route redirects to Vanavond and duplicate navigation is removed', async () => {
  const source = await readFile(new URL('../../web/js/app.js', import.meta.url), 'utf8');
  assert.match(source, /pattern: \/\^\\\/spijs\$\/, view: tonight/);
  assert.match(source, /if \(path === '\/spijs'\) return location\.replace\(`#\/vanavond/);
  assert.doesNotMatch(source, /path: '\/spijs'|\['\/spijs',/);
});
