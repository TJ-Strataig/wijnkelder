// Service worker: maakt de app installeerbaar en laadt de schil offline. API-verzoeken worden nooit gecachet.
const CACHE = 'wijnkelder-shell-v7';
const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest', './css/app.css', './css/app.css?v=6', './icons/icon.svg', './icons/apple-touch-icon.png',
  './js/app.js', './js/api.js', './js/auth.js', './js/util.js', './js/pairings.js', './js/data.js',
  './js/views/login.js', './js/views/cellar.js', './js/views/wine.js', './js/views/add.js', './js/views/history.js',
  './js/views/pairing.js', './js/views/stats.js', './js/views/wishlist.js', './js/views/admin.js', './js/views/settings.js', './js/views/map.js', './js/views/bulk.js', './js/views/tonight.js', './js/views/chat.js', './js/views/insights.js', './js/views/manage.js', './js/barcode.js', './js/views/producers.js', './js/minimap.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API en foto's: altijd live
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

// Pushmeldingen
self.addEventListener('push', (e) => {
  let data = {}; try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Wijnkelder', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Wijnkelder', { body: data.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { link: data.link || '#/kelder' }, tag: data.tag || 'wijnkelder' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./' + (e.notification.data?.link || '#/kelder'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
