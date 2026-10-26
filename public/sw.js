// RxPOS service worker, retired in 1.5.1: the web version is online only and keeps nothing on the computer.
// Browsers that installed the old offline worker fetch this file on their next visit; it deletes every cache the old
// worker made, unregisters itself and reloads open pages so they come straight from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
// no fetch handler: every request goes to the network
