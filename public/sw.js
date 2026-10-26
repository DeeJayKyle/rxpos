// RxPOS 1.5.0's offline service worker, retired in 1.5.1 (a trusted browser now uses public/sw-offline.js instead).
// Browsers that installed the old offline worker fetch this file on their next visit; it deletes every cache the old
// worker made, unregisters itself and reloads open pages so they come straight from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rxpos')) await caches.delete(k); // RxPOS's own caches only
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
// no fetch handler: every request goes to the network
