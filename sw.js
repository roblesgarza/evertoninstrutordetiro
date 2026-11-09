// Service worker do app Everton CAC: guarda só a "casca" do painel para abrir offline.
// Dados (API do Supabase) nunca são guardados em cache.
const CACHE = "everton-cac-v1";
const CASCA = ["/painel/", "/data/app/icon-192.png", "/data/app/icon-512.png", "/offline.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("/offline.html"))));
    return;
  }
  if (u.pathname.startsWith("/data/app/")) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
