// RxPOS offline service worker, for a browser made a trusted device only (src/webpolicy.js). A session-only browser
// never registers it (and removes it if it finds one). public/sw.js stays the retirement script for browsers that
// still have the 1.5.0 offline worker, so they don't download the app only to delete it.
//
// It keeps one build of the app in a cache named rxpos-shell-<build>: on install it reads that build's version.json and
// stores every file listed there (about 6 MB), so the app opens with no internet. Pages are network-first (an online
// visit always gets the current build), falling back to the cached app; /assets/ files carry a content hash and come
// from the cache first. API calls are never cached. A new build installs alongside and waits; the page switches to it
// only when nothing is in progress (src/update.js), never in the middle of a sale. Only caches whose names start with
// "rxpos" are ever deleted.
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = 'rxpos-shell-' + BUILD;
const NAV_TIMEOUT = 4000;

async function manifest() {
  const r = await fetch('./version.json?sw=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('version.json ' + r.status);
  const v = await r.json();
  const files = v.files.map((f) => f.path).filter((p) => p !== '_headers' && !/^sw/.test(p) && !p.startsWith('updates/'));
  return { build: String(v.build), files: ['./', ...files.map((p) => './' + p)] };
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const m = await manifest();
    const c = await caches.open(SHELL);
    // a few at a time: a slow connection shouldn't time out one huge request
    for (let i = 0; i < m.files.length; i += 8) await c.addAll(m.files.slice(i, i + 8).map((u) => new Request(u, { cache: 'reload' })));
    await c.put('./__manifest', new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));
    // the first install takes over at once; later builds wait for the page to say it is safe (skip-waiting)
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rxpos') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'status') {
    e.waitUntil((async () => {
      const c = await caches.open(SHELL);
      const m = await (await c.match('./__manifest'))?.json().catch(() => null);
      let cached = 0;
      for (const u of m?.files || []) if (await c.match(u)) cached++;
      e.source?.postMessage({ type: 'sw-status', build: BUILD, total: m?.files.length || 0, cached });
    })());
  }
});

const fromCache = async (req) => (await caches.open(SHELL)).match(req, { ignoreSearch: true });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('/version.json') || /\/sw[\w-]*\.js$/.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    // any pharmacy address (/citycare-ntinda#/pos …) is the same single-page app
    e.respondWith((async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), NAV_TIMEOUT);
        const res = await fetch(req, { signal: ctl.signal });
        clearTimeout(t);
        return res;
      } catch {
        return (await fromCache('./index.html')) || (await fromCache('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await fromCache(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && /\/assets\//.test(url.pathname)) (await caches.open(SHELL)).put(req, res.clone()).catch(() => {});
    return res;
  })());
});
