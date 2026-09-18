import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as util from '../../web/js/util.js';
import { el, clear, button } from './view-fixture.mjs';

const calls = [];
const notices = [];
const navigations = [];
const session = { user: { id: 'test-member', name: 'Testlid', role: 'member' } };
let get;
const defaults = {
  '/api/auth/passkeys': { passkeys: [] },
  '/api/ai/settings': { providers: { anthropic: { label: 'Testprovider', models: [{ id: 'test', label: 'Testmodel' }] } } },
  '/api/notifications/prefs': { prefs: {}, push_available: false },
  '/api/admin/users': { users: [], invites: [] },
  '/api/intake': { items: [], counts: { pending: 0, recognized: 0, failed: 0, approved: 0, skipped: 0 } },
  '/api/insights/taste': { household: { tastings: 0 } },
  '/api/stats': {
    totals: { bottles: 12, wines: 4 }, year: 2026,
    byType: [], byCountry: [], byVintage: [], consumedPerMonth: [], topRated: [],
    drinkNow: [], drinkSoon: [], pastPeak: [], tooYoung: [],
  },
  '/api/wines/test-wine': { wine: { id: 'test-wine', name: 'Testwijn', type: 'rood' } },
};
await mock.module('../../web/js/util.js', { namedExports: {
  ...util, el, clear,
  input: (attrs) => el('input', attrs),
  field: (label, node) => el('label', {}, label, node),
  select: (options, attrs) => el('select', attrs, options.map(([value, text]) => el('option', { value, text }))),
  checkbox: (label, attrs) => { const input = el('input', attrs); return { input, wrap: el('label', {}, input, label) }; },
  toast: (...args) => notices.push(args),
} });
await mock.module('../../web/js/api.js', { namedExports: {
  session, photoUrl: (url) => url,
  api: { get: async (path) => { calls.push(path); return get(path); } },
} });
await mock.module('../../web/js/data.js', { namedExports: { loadWines: async () => [], invalidateWines: () => {} } });
await mock.module('../../web/js/auth.js', { namedExports: {
  addPasskey: async () => {}, logout: async () => {}, deviceLabel: () => 'Testapparaat',
} });
await mock.module('../../web/js/views/wine.js', { namedExports: {
  bottleForm: () => ({ node: el('div'), values: () => ({ quantity: 1 }) }),
  destinationForm: () => ({ node: el('div'), values: () => null }),
  duplicateDialog: async () => null,
} });
const { renderTabs } = await import('../../web/js/tabs.js');
const { render: renderAdd } = await import('../../web/js/views/add.js');
const { render: renderInsights } = await import('../../web/js/views/insights.js');
const { render: renderSettings } = await import('../../web/js/views/settings.js');
globalThis.window = {
  location: { hash: '' },
  history: { replaceState: (_state, _title, hash) => { window.location.hash = hash; } },
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function context(params = {}) { return { query: new URLSearchParams(params), params: [], navigate: (path) => navigations.push(path) }; }
beforeEach(() => {
  calls.length = notices.length = navigations.length = 0;
  session.user = { id: 'test-member', name: 'Testlid', role: 'member' };
  get = async (path) => {
    assert.ok(Object.hasOwn(defaults, path), `Unexpected API request: ${path}`);
    return defaults[path];
  };
  window.location.hash = '#/toevoegen';
});

test('single-wine drafts survive bulk/queue switching without duplicate autocomplete IDs', async () => {
  const main = el('main');
  await renderAdd(main, context());
  assert.doesNotMatch(main.textContent, /Laden mislukt/);
  const input = main.querySelector('input');
  input.value = 'Mijn nieuwe wijn';
  assert.equal(main.querySelectorAll('h1').length, 1);
  await button(main, 'Bulk').click();
  assert.doesNotMatch(main.textContent, /Laden mislukt/);
  assert.ok(button(main, 'Foto\'s toevoegen'));
  await button(main, 'Beoordelen').click();
  assert.match(main.textContent, /beoordelingswachtrij is leeg/);
  assert.equal(window.location.hash, '#/toevoegen?tab=bulk&bulkTab=queue');
  assert.equal(main.querySelectorAll('datalist').filter((n) => n.attrs.id === 'locaties').length, 1);
  await button(main, 'Eén wijn').click();
  assert.equal(main.querySelector('input'), input);
  assert.equal(input.value, 'Mijn nieuwe wijn');
  assert.equal(main.querySelectorAll('datalist').filter((n) => n.attrs.id === 'locaties').length, 1);
});

test('bulk queue deep link opens under Toevoegen without initializing single-wine entry', async () => {
  const main = el('main');
  await renderAdd(main, context({ tab: 'bulk', bulkTab: 'queue' }));
  assert.equal(main.querySelector('h1').textContent, 'Toevoegen');
  assert.match(main.textContent, /beoordelingswachtrij is leeg/);
  assert.equal(button(main, 'Bulk').attrs['aria-pressed'], 'true');
  assert.equal(main.querySelector('input'), undefined);
});

test('wine editing stays separate from grouped intake', async () => {
  const main = el('main');
  await renderAdd(main, { ...context(), mode: 'edit', params: ['test-wine'] });
  assert.match(main.querySelector('h1').textContent, /Bewerken.*Testwijn/);
  assert.ok(button(main, 'Wijzigingen opslaan'));
  assert.equal(button(main, 'Bulk'), undefined);
  assert.deepEqual(calls, ['/api/wines/test-wine']);
});

test('statistics are loaded on the Inzichten tab alongside existing insight tabs', async () => {
  const main = el('main');
  await renderInsights(main, context({ tab: 'stats' }));
  assert.equal(main.querySelector('h1').textContent, 'Inzichten');
  assert.match(main.textContent, /flessen in de kelder/);
  assert.equal(main.querySelectorAll('h1').length, 1);
  for (const label of ['Smaakprofielen', 'Prijs & kwaliteit', 'Jaaroverzicht']) assert.ok(button(main, label));
  assert.deepEqual(calls, ['/api/stats']);
  await button(main, 'Smaakprofielen').click();
  assert.deepEqual(calls, ['/api/stats', '/api/insights/taste']);
  assert.doesNotMatch(main.textContent, /flessen in de kelder|Laden mislukt/);
});

test('ordinary settings keep passkeys, AI, notifications and export but do not fetch household administration', async () => {
  const main = el('main');
  await renderSettings(main, context());
  await flush();
  for (const label of ['Mijn passkeys', 'AI-sommelier', 'Meldingen', 'Gegevens exporteren', 'Uitloggen']) assert.ok(main.textContent.includes(label));
  assert.equal(button(main, 'Beheer'), undefined);
  assert.ok(!calls.some((path) => path.startsWith('/api/admin/')));
});

test('member cannot open the administration tab via a crafted settings link', async () => {
  const main = el('main');
  await renderSettings(main, context({ tab: 'admin' }));
  assert.deepEqual(calls, []);
  assert.deepEqual(navigations, ['/instellingen']);
  assert.deepEqual(notices, [['Alleen voor beheerders', 'error']]);
});

test('administrator sees household management inside settings and retains personal drafts', async () => {
  session.user.role = 'admin';
  window.location.hash = '#/instellingen';
  const main = el('main');
  await renderSettings(main, context());
  await flush();
  const key = main.querySelectorAll('input').find((node) => node.attrs.type === 'password');
  key.value = 'synthetic-draft';
  await button(main, 'Beheer').click();
  assert.match(main.textContent, /Beheer van het huishouden/);
  assert.ok(button(main, 'Lid uitnodigen'));
  assert.equal(main.querySelectorAll('h1').length, 1);
  assert.ok(calls.includes('/api/admin/users'));
  await button(main, 'Persoonlijk & app').click();
  assert.equal(main.querySelectorAll('input').find((node) => node.attrs.type === 'password'), key);
  assert.equal(key.value, 'synthetic-draft');
});

test('failed tab load has a working retry without changing the selected parent', async () => {
  let failed = true;
  get = async () => { if (failed) throw new Error('Tijdelijk offline'); return defaults['/api/stats']; };
  const main = el('main');
  await renderInsights(main, context({ tab: 'stats' }));
  assert.match(main.textContent, /Laden mislukt: Tijdelijk offline/);
  assert.equal(button(main, 'Statistieken').attrs['aria-pressed'], 'true');
  failed = false;
  await button(main, 'Opnieuw proberen').click();
  assert.match(main.textContent, /flessen in de kelder/);
  assert.doesNotMatch(main.textContent, /Laden mislukt/);
});

test('slow inactive tab results cannot replace the newly selected content', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const main = el('main');
  const ready = renderTabs(main, { path: '/inzichten', query: new URLSearchParams(), tabs: [
    { key: 'slow', label: 'Slow', retain: false, render: async (body) => { await pending; body.append('Oud resultaat'); } },
    { key: 'fast', label: 'Fast', render: (body) => body.append('Actief resultaat') },
  ] });
  await button(main, 'Fast').click();
  resolve();
  await ready;
  assert.match(main.textContent, /Actief resultaat/);
  assert.doesNotMatch(main.textContent, /Oud resultaat/);
  assert.equal(button(main, 'Fast').attrs['aria-pressed'], 'true');
});

test('main menus no longer expose Bulk, Statistieken or Beheer independently; old links remain routed', async () => {
  const source = await readFile(new URL('../../web/js/app.js', import.meta.url), 'utf8');
  for (const path of ['/bulk', '/statistieken', '/beheer']) {
    assert.ok(!source.includes(`path: '${path}'`));
    assert.ok(!source.includes(`['${path}',`));
    assert.ok(source.includes(`path === '${path}'`));
  }
  assert.match(source, /query\.set\('tab', 'bulk'\); query\.set\('bulkTab', bulkTab\)/);
  assert.match(source, /query\.set\('tab', path === '\/beheer' \? 'admin' : 'stats'\)/);
  assert.ok(source.includes("view: settings, admin: true"));
});
