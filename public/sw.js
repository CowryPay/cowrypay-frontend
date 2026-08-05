// Exists only to satisfy Chrome's install-prompt requirement (a registered
// service worker with a fetch handler). Deliberately does no caching — a
// prior version cached pages/assets and once served a stale JS bundle during
// dev, causing a React hydration mismatch. This one is a pure network
// passthrough, so it can never serve stale content.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
