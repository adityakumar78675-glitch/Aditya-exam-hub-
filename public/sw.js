// Aditya Exam Hub — Web Push service worker
// This is a messaging service worker (per PWA skill: exempt from app-shell caching rules).
// It only handles push events; it does NOT cache the app shell.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Aditya Exam Hub", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Aditya Exam Hub";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: "/favicon.ico",
    image: payload.image || undefined,
    data: {
      url: payload.url || "/dashboard",
      notificationId: payload.notificationId || null,
    },
    tag: payload.notificationId || undefined,
    requireInteraction: false,
  };
  if (payload.buttonText) {
    options.actions = [{ action: "open", title: payload.buttonText }];
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            try { client.navigate(url); } catch {}
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
