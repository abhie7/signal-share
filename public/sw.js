// Service worker: only for wake-up pushes from paired devices. The push has no content,
// so the notification can't say anything about what is being shared.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("SignalShare", {
      body: "One of your devices wants to send you something. Tap to open.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "signalshare-wake",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((tabs) => {
        const open = tabs.find((t) => new URL(t.url).origin === self.location.origin)
        return open ? open.focus() : self.clients.openWindow("/")
      }),
  )
})
