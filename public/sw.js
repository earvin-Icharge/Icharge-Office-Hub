/* iCharge Office Hub service worker: offline page, cached app files, notifications (SPEC.md 2, 3.6). */
const CACHE = "oh-shell-v1";
const SHELL = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/mascot/thumbs-up.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// The Update button asks a waiting new worker to take over at once.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always fresh from the network; the offline page when there is no signal.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }
  // Built app files have unique names: keep them once downloaded.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/mascot/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Office Hub", body: "", url: "/today" };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* plain text */ }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", data: { url: data.url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
