/* Space Arena PWA shell: game networking always stays online and is NEVER cached. */
const CACHE = 'space-arena-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (
    url.origin !== self.location.origin ||
    /^\/(?:api|health|ready|metrics|ws)(?:\/|$)/.test(url.pathname)
  )
    return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
