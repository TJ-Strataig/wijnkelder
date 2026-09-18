import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('service worker isolates caches, retains good responses, and only uses HTML fallback for navigation', async () => {
  const code = await readFile(new URL('../../web/sw.js', import.meta.url), 'utf8');
  const scope = 'https://example.test/wijnkelder/';
  const listeners = {};
  const stores = new Map([['another-app-cache', new Map()], ['wijnkelder-shell-v10', new Map()]]);
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: async (urls) => { for (const url of urls) store.set(key(url), new Response('shell')); },
        put: async (request, response) => store.set(key(request), response),
        match: async (request) => store.get(key(request))?.clone(),
      };
    },
  };
  let network = async () => new Response('good');
  runInNewContext(code, { URL, Response, console, caches, fetch: (...args) => network(...args), self: {
    location: new URL(scope), registration: { scope },
    clients: { claim: async () => {} }, skipWaiting: async () => {},
    addEventListener: (name, listener) => { listeners[name] = listener; },
  } });
  async function event(name, request) {
    const pending = [];
    let response;
    listeners[name]({ request, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  await event('install');
  await event('activate');
  assert.ok(stores.has('another-app-cache'));
  assert.ok(!stores.has('wijnkelder-shell-v10'));
  const request = (path, mode = 'cors') => ({ method: 'GET', url: new URL(path, scope).href, mode });
  const asset = request('js/app.js');
  assert.equal(await (await event('fetch', asset)).text(), 'good');
  network = async () => new Response('failure', { status: 503 });
  assert.equal((await event('fetch', asset)).status, 503);
  network = async () => { throw new Error('offline'); };
  assert.equal(await (await event('fetch', asset)).text(), 'good');
  assert.equal((await event('fetch', request('missing.js'))).type, 'error');
  assert.equal(await (await event('fetch', request('offline-page', 'navigate'))).text(), 'shell');
  assert.equal(await event('fetch', request('/another-app/index.html')), undefined);
  assert.equal(await event('fetch', request('https://api.example.test/wines')), undefined);
  assert.equal(await event('fetch', { ...asset, method: 'POST' }), undefined);
});
