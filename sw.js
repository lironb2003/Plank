// Notification delivery only — deliberately no fetch handler and no caching,
// so this never sits between the page and a fresh deploy.
//
// index.html registers this best-effort. It exists because Android Chrome
// refuses `new Notification()` from a page and only delivers notifications
// through a ServiceWorkerRegistration. Where the file isn't served (file://,
// or an artifact export of index.html) registration just fails and the page
// falls back to the Notification constructor.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Tapping a phase notification should bring the running timer back up, not
// open a second copy of the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
