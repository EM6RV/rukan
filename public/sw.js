/* Service worker لرُكن: إشعارات الطلبيات (Web Push) فقط. ما نخزّن صفحات ولا بيانات. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
