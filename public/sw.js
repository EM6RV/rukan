/* Service worker لرُكن: إشعارات الطلبيات (Web Push) + تشغيل الكاشير بدون نت.
   التخزين للكاشير بس (/pos وملفاته الثابتة وصور المنتجات). بيانات البيع تتخزن في IndexedDB داخل التطبيق، مش هنا. */
const POS_CACHE = "rukn-pos-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("rukn-pos-") && k !== POS_CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const isPosPage = (url) => url.origin === self.location.origin && (url.pathname === "/pos" || url.pathname.startsWith("/pos/"));
const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || url.pathname === "/pos.webmanifest");
const isMedia = (url) => url.origin === self.location.origin && url.pathname.startsWith("/api/media/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // صفحة الكاشير: من الشبكة أول (أحدث نسخة)، ولو ما فيش نت من المخزن
  if (req.mode === "navigate" && isPosPage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(POS_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put("/pos", res.clone());
        return res;
      } catch {
        return (await cache.match("/pos")) || Response.error();
      }
    })());
    return;
  }
  // الملفات الثابتة (أسماءها فيها hash) والصور: من المخزن أول، وتتحدث في الخلفية (لصفحة الكاشير بس)
  if (isStatic(url) || isMedia(url)) {
    event.respondWith((async () => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      const fromPos = (client && isPosPage(new URL(client.url))) || url.pathname === "/pos.webmanifest";
      if (!fromPos) {
        const cached = await caches.match(req, { cacheName: POS_CACHE });
        return fetch(req).catch(() => cached || Response.error());
      }
      const cache = await caches.open(POS_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok && res.type === "basic") cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "رُكن", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "طلبية جديدة";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "ar",
      dir: "rtl",
      tag: data.tag || "order",
      renotify: true,
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard/orders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard/orders", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
