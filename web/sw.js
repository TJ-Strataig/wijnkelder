// Service worker: maakt de app installeerbaar en laadt de schil offline. API-verzoeken worden nooit gecachet.
const CACHE = 'wijnkelder-shell-v1';
const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest', './css/app.css', './icons/icon.svg', './icons/apple-touch-icon.png',
  './js/app.js', './js/api.js', './js/auth.js', './js/util.js', './js/pairings.js', './js/data.js',
  './js/views/login.js', './js/views/cellar.js', './js/views/wine.js', './js/views/add.js', './js/views/history.js',
  './js/views/pairing.js', './js/views/stats.js', './js/views/wishlist.js', './js/views/admin.js', './js/views/settings.js', './js/views/map.js', './js/views/producers.js', './js/minimap.js',
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
