// Offline-Zwischenspeicher: Seite immer frisch aus dem Netz (Fallback Cache), Ton, Texterkennung und Bundles aus dem Cache.
const CACHE = 'vw-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const cacheFirst = /^\/(audio|ocr|assets)\//.test(url.pathname) || /\.(png|webmanifest)$/.test(url.pathname);
  if (cacheFirst) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
  } else if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put('/', r.clone())); return r; })
      .catch(() => caches.match('/')));
  }
});
