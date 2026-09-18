import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as util from '../../web/js/util.js';
import { el, clear, button } from './view-fixture.mjs';

const calls = [];
let finishApproval;
const approval = new Promise((resolve) => { finishApproval = resolve; });
await mock.module('../../web/js/util.js', { namedExports: {
  ...util, el, clear, input: (attrs) => el('input', attrs),
  field: (label, node) => el('label', {}, label, node),
  select: (_options, attrs) => el('select', attrs),
  checkbox: (label, attrs) => { const input = el('input', attrs); return { input, wrap: el('label', {}, input, label) }; },
  shrinkImage: async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', blob: new Blob(['photo']) }),
  toast: (message, type) => { assert.notEqual(type, 'error', message); },
} });
await mock.module('../../web/js/api.js', { namedExports: {
  photoUrl: (url) => url,
  api: {
    get: async () => ({ counts: { recognized: 0, pending: 0, failed: 0 } }),
    uploadPhoto: async () => ({ key: 'labels/test.jpg' }),
    post: async (path, body) => {
      calls.push({ path, body });
      if (path === '/api/ai/recognize') return { wine: { name: 'Herkend', type: 'rood', confidence: 0.8 } };
      if (path === '/api/wines') { await approval; return { wine: { id: 'added', name: body.name } }; }
      throw new Error(`Unexpected request: ${path}`);
    },
  },
} });
await mock.module('../../web/js/data.js', { namedExports: { loadWines: async () => [], invalidateWines() {} } });
await mock.module('../../web/js/views/wine.js', { namedExports: {
  destinationForm: () => ({ node: el('div'), values: () => null }), duplicateDialog: async () => null,
} });
globalThis.window = { location: { hash: '#/toevoegen' }, history: { replaceState() {} } };
const { render } = await import('../../web/js/views/bulk.js');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('adding photos retains corrected bulk fields and does not recreate a busy approval button', async () => {
  const main = el('main');
  await render(main, { query: new URLSearchParams() });
  const file = main.querySelectorAll('input').find((input) => input.attrs.type === 'file');
  const upload = async () => { file.files = [{ type: 'image/jpeg', name: 'photo.jpg' }]; await file.fire('change'); await flush(); };
  await upload();
  const name = main.querySelector('[placeholder="Naam *"]');
  const quantity = main.querySelector('[aria-label="Aantal"]');
  assert.ok(name && quantity, main.textContent);
  name.value = 'Mijn correctie'; quantity.value = '7';
  await upload();
  assert.equal(main.querySelector('[placeholder="Naam *"]'), name);
  assert.equal(name.value, 'Mijn correctie');
  assert.equal(quantity.value, '7');
  const approve = button(main, 'Goedkeuren en toevoegen');
  const inProgress = approve.click();
  await flush();
  assert.equal(approve.disabled, true);
  await upload();
  assert.ok(main.querySelectorAll('button').includes(approve));
  assert.equal(approve.disabled, true);
  assert.equal(calls.filter((call) => call.path === '/api/wines').length, 1);
  const saved = calls.find((call) => call.path === '/api/wines').body;
  assert.equal(saved.name, 'Mijn correctie');
  assert.equal(saved.quantity, 7);
  finishApproval();
  await inProgress;
});
