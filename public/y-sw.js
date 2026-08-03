// ─── YTracker Service Worker ─────────────────────────────────────
const CACHE_NAME = 'y-console-v1';
const ASSETS_TO_CACHE = [
  '/y-console',
  '/y-manifest.json',
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
  if (!event.request.url.includes('/y-console')) return;
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

// ─── Notification scheduling via messages from the app ───────────
let notificationTimers = [];

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SCHEDULE_NOTIFICATIONS') {
    // Clear existing timers
    notificationTimers.forEach((t) => clearTimeout(t));
    notificationTimers = [];

    const { reminders } = payload;
    if (!reminders || !Array.isArray(reminders)) return;

    const now = new Date();
    reminders.forEach((r) => {
      const [h, m] = r.time.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const delay = target.getTime() - now.getTime();
      const timer = setTimeout(() => {
        self.registration.showNotification(r.title, {
          body: r.body,
          icon: '/y-icon-192.png',
          badge: '/y-icon-192.png',
          tag: r.tag || 'y-reminder',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          data: { url: '/y-console' },
        });
      }, delay);
      notificationTimers.push(timer);
    });
  }

  if (type === 'CLEAR_NOTIFICATIONS') {
    notificationTimers.forEach((t) => clearTimeout(t));
    notificationTimers = [];
  }
});

// Click notification → open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/y-console'));
      if (existing) return existing.focus();
      return self.clients.openWindow('/y-console');
    })
  );
});
