/* B&M Vourla — Service Worker (FAZ 5 PWA)
 * Bağımlılıksız, Next.js ile uyumlu basit SW:
 *  - Navigation isteklerinde network-first, çevrimdışıysa offline.html'e düş.
 *  - Statik asset'lerde cache-first (sonradan doldur).
 * next-pwa/Workbox yerine bilinçli olarak el yazımı tercih edildi: yeni bir
 * build-time bağımlılık eklemeden offline fallback + statik önbellekleme sağlar.
 */
const CACHE_NAME = "bm-vourla-v1";
const OFFLINE_URL = "/offline.html";
const CORE_ASSETS = ["/", "/offline.html", "/manifest.json", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && new URL(request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    })
  );
});
