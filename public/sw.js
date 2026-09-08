// v4 — push only. OS notification channel (sound + vibrate), not Web Audio media.
// Do not intercept fetch.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function vibrateFor(urgency) {
  if (urgency === "urgent") return [220, 80, 220, 80, 400];
  if (urgency === "info") return [80];
  return [140, 70, 140];
}

function showVd(data) {
  const urgency = data.urgency || "normal";
  const tag = data.id ? "vd-" + data.id : "vd-" + urgency + "-" + Date.now();
  return self.registration.showNotification(data.title || "Видеал.Док", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: vibrateFor(urgency),
    requireInteraction: urgency === "urgent",
    renotify: true,
    tag,
    data: { link: data.link || "/", urgency },
  });
}

self.addEventListener("push", (event) => {
  let data = { title: "Видеал.Док", body: "", link: "/", urgency: "normal", id: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data ? event.data.text() : "";
    } catch {
      /* empty */
    }
  }
  event.waitUntil(showVd(data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
