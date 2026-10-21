// RxPOS service worker: lets the browser version open and run with no connection.
// Pages: network first (so updates arrive), falling back to cache when offline. Files under /assets/ carry a content
// hash in their name and never change, so they come straight from the cache: the app opens at once even on a slow
// connection, and only new files are downloaded after an update. Sync API calls are never cached.
const CACHE = 'rxpos-v2';
const ASSETS = 'rxpos-assets-v1';
const MAX_ASSETS = 160; // old versions' files are dropped beyond this, oldest first

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const trim = async () => {
  const c = await caches.open(ASSETS);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await c.delete(k);
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (/\/assets\/[^/]+-[\w-]{8,}\.\w+$/.test(url.pathname)) {
    e.respondWith(caches.open(ASSETS).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { c.put(e.request, res.clone()).then(trim).catch(() => {}); }
      return res;
    }))));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
