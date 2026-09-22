import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';

const classes = new Set();
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.document = {
  documentElement: { dataset: {} },
  body: { classList: {
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    contains: (name) => classes.has(name),
  } },
};

const { applyDesign, getDesign, setDesign, toggleDesign } = await import('../src/../../web/js/design.js?design-test');

afterEach(() => {
  storage.clear();
  classes.clear();
  delete document.documentElement.dataset.design;
});

test('ontwerpmodus gebruikt Modern als veilige standaard en normaliseert onbekende waarden', () => {
  assert.equal(getDesign(), 'modern');
  assert.equal(applyDesign('onbekend'), 'modern');
  assert.equal(document.documentElement.dataset.design, 'modern');
  assert.ok(document.body.classList.contains('design-modern'));
  assert.equal(document.body.classList.contains('design-classic'), false);
});

test('ontwerpmodus bewaart Klassiek en zet beide body-klassen correct', () => {
  assert.equal(setDesign('classic'), 'classic');
  assert.equal(getDesign(), 'classic');
  assert.equal(document.documentElement.dataset.design, 'classic');
  assert.ok(document.body.classList.contains('design-classic'));
  assert.equal(document.body.classList.contains('design-modern'), false);
});

test('ontwerpmodus wisselt tussen Modern en Klassiek', () => {
  assert.equal(toggleDesign(), 'classic');
  assert.equal(toggleDesign(), 'modern');
  assert.equal(getDesign(), 'modern');
});
