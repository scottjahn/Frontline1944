// Frontline 1944 service worker: makes the whole game available offline.
// Bump VERSION whenever the list of files changes; file contents refresh on their own (see fetch).
const VERSION = 'v2';
const CACHE = 'frontline1944-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'js/vendor/three.min.js',
  'js/defs.js',
  'js/account.js',
  'js/models.js',
  'js/world.js',
  'js/game.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('frontline1944-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cached copy first so the game starts instantly and works offline; a fresh copy is
// fetched in the background and used on the next launch.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch: "?touch" and similar launch parameters all map to the same page
    const hit = await cache.match(req, { ignoreSearch: true }) ||
                (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const refresh = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const key = req.mode === 'navigate' ? 'index.html' : url.origin + url.pathname;
        cache.put(key, res.clone());
        if (req.mode === 'navigate') cache.put('./', res.clone());
      }
      return res;
    });
    if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
    try { return await refresh; }
    catch (err) { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
