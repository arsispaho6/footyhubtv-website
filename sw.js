// FootyHub TV service worker — installability, offline app-shell + push alerts.
// Network-first for freshness (the site updates often + needs live data), but every
// successful same-origin GET is cached so the site still opens offline.
const CACHE = 'footyhub-v3';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png',
               '/lenis.min.js', '/fixtures.js', '/results.js', '/logo-trans.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // leave YouTube / Google / Worker calls alone
  // network-first: fresh when online, fall back to the cached shell when offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html')))
  );
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
