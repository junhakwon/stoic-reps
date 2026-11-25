// Offline support. Online, every app file comes from the network (so updates show up right away) and the copy is
// kept for offline use; offline, the kept copy is used. Bump VERSION when any file changes so phones pick it up.
const VERSION = "stoicreps-17";
const FILES = ["./", "index.html", "style.css", "app.js", "quotes.js", "garmin.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "spidey.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f =>
    fetch(f, { cache: "reload" }).then(r => r.ok && c.put(f, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
