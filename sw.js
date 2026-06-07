// FootyHub TV service worker — installability + (future) push alerts.
// Network-first, no aggressive caching (the site updates often + needs live data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Push: show a notification when the channel sends one (kick-off alerts, etc.)
self.addEventListener('push', (e) => {
  let d = { title: 'FootyHub TV', body: "We're live now! 🔴", url: '/' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', data: d.url || '/',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data || '/'));
});
