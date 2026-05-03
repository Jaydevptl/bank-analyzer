/**
 * Fino · Service Worker (Phase 18C)
 *
 * Caches the app shell only. API calls (/api/*) always hit the network so data
 * stays fresh. Offline mode is best-effort: assets work, API does not.
 */

const CACHE = 'fino-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API responses — always go to network.
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for same-origin GETs (the built JS/CSS bundles + images).
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((res) => {
          if (res.ok && (res.type === 'basic' || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('/index.html'));
      })
    );
  }
});
