// ─── LEBTEX Client Service Worker ─────────────────────────────────────
const CACHE_NAME = 'client-portal-v1';
const ASSETS_TO_CACHE = [
  '/client',
  '/client-manifest.json',
  '/y-icon-192.png',
  '/y-icon-512.png',
];

// Install — cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (!event.request.url.includes('/client') || event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Notification trigger via message from the app ───────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/y-icon-192.png',
      badge: '/y-icon-192.png',
      tag: payload.tag || 'client-notification',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: '/client' },
    });
  }
});

// Click notification → open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/client'));
      if (existing) return existing.focus();
      return self.clients.openWindow('/client');
    })
  );
});
