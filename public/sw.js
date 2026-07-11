// GreenEco CRM service worker — offline app shell (spec §PWA).
const CACHE = "greeneco-v1";
const SHELL = ["/", "/dashboard", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // mutations go through the app's offline queue
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Network-first for navigations, cache fallback when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/dashboard"))),
    );
    return;
  }

  // Cache-first for static assets.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});
