import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { el, clear } from './view-fixture.mjs';

test('late navigation renders are detached, disposed and cannot redirect the current view', async () => {
  const body = el('body', {}, ...['main', 'sidenav', 'bottomnav', 'topbar', 'user-chip', 'theme-toggle'].map((id) => el(id === 'main' ? 'main' : 'div', { id, class: id === 'main' ? 'main' : '' })));
  const listeners = {};
  globalThis.document = { getElementById: (id) => body.querySelector(`#${id}`), documentElement: { dataset: {} } };
  globalThis.location = { hash: '#/kelder', protocol: 'http:', replace(hash) { this.hash = hash; } };
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { addEventListener: (event, fn) => { listeners[event] = fn; }, matchMedia: () => ({ matches: false }), scrollTo() {} };
  await mock.module('../../web/js/util.js', { namedExports: { el, clear, toast() {}, modal() {}, fmtDateTime() {} } });
  await mock.module('../../web/js/api.js', { namedExports: { api: {}, session: { token: 'test', user: { name: 'Test', role: 'admin' } } } });
  await mock.module('../../web/js/auth.js', { namedExports: { logout() {} } });
  await mock.module('../../web/js/data.js', { namedExports: { invalidateWines() {} } });
  let finishSlow, slowDisposed = 0, currentDisposed = 0;
  const slow = new Promise((resolve) => { finishSlow = resolve; });
  for (const name of ['login', 'cellar', 'wine', 'add', 'history', 'wishlist', 'settings', 'map', 'tonight', 'chat', 'insights', 'manage', 'producers']) {
    await mock.module(`../../web/js/views/${name}.js`, { namedExports: { render: async (main, ctx) => {
      if (name === 'cellar') {
        main.classList.add('slow-class');
        await slow;
        main.append(el('p', { text: 'obsolete' }));
        ctx.navigate('/obsolete');
        return { destroy() { slowDisposed++; main.classList.remove('slow-class'); } };
      }
      main.append(el('p', { text: name }));
      return { destroy() { currentDisposed++; } };
    } } });
  }
  await import('../../web/js/app.js');
  location.hash = '#/instellingen';
  await listeners.hashchange();
  const current = document.getElementById('main');
  assert.equal(current.textContent, 'settings');
  assert.equal(current.attrs.class, 'main');
  finishSlow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(document.getElementById('main'), current);
  assert.equal(current.textContent, 'settings');
  assert.equal(location.hash, '#/instellingen');
  assert.equal(slowDisposed, 1);
  assert.equal(currentDisposed, 0);
  location.hash = '#/historie';
  await listeners.hashchange();
  assert.equal(currentDisposed, 1);
  assert.equal(document.getElementById('main').textContent, 'history');
});
