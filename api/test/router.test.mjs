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

  const mainLinks = (id) => document.getElementById(id).querySelectorAll('a').map((a) => a.attrs.href);
  for (const id of ['sidenav', 'bottomnav']) {
    for (const path of ['/toevoegen', '/herkomst', '/wijnhuizen', '/vanavond', '/verlanglijst']) {
      assert.ok(!mainLinks(id).includes(`#${path}`));
    }
  }
  assert.deepEqual(mainLinks('bottomnav'), ['#/kelder', '#/sommelier', '#/meer']);
  for (const [parent, routes, views, bottom] of [
    ['/voorraad', ['/voorraad', '/herkomst', '/wijnhuizen'], ['manage', 'map', 'producers'], '/meer'],
    ['/sommelier', ['/sommelier', '/vanavond', '/verlanglijst'], ['chat', 'tonight', 'wishlist'], '/sommelier'],
  ]) {
    for (const [i, path] of routes.entries()) {
      location.hash = `#${path}${path === '/vanavond' ? '?tab=restaurant' : ''}`;
      await listeners.hashchange();
      const main = document.getElementById('main');
      const menu = main.querySelector('.section-menu');
      assert.deepEqual(menu.querySelectorAll('a').map((a) => a.attrs.href), routes.map((p) => `#${p}`));
      assert.equal(menu.querySelector('[aria-current="page"]').attrs.href, `#${path}`);
      assert.equal(main.querySelector('p').textContent, views[i]);
      assert.equal(document.getElementById('sidenav').querySelector('.active').attrs.href, `#${parent}`);
      assert.equal(document.getElementById('bottomnav').querySelector('.active').attrs.href, `#${bottom}`);
    }
  }
  location.hash = '#/toevoegen?tab=bulk';
  await listeners.hashchange();
  assert.equal(document.getElementById('main').querySelector('p').textContent, 'add');
  assert.equal(document.getElementById('sidenav').querySelector('.active').attrs.href, '#/kelder');
  location.hash = '#/meer';
  await listeners.hashchange();
  const moreLinks = mainLinks('main');
  for (const path of ['/toevoegen', '/herkomst', '/wijnhuizen', '/vanavond', '/verlanglijst']) {
    assert.ok(!moreLinks.some((link) => link.startsWith(`#${path}`)));
  }
  assert.ok(moreLinks.includes('#/voorraad'));
  assert.ok(moreLinks.includes('#/sommelier'));
});
