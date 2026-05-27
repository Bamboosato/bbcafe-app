const CACHE_NAME = "bbcafe-static-assets-v1";
const STATIC_ASSETS = ["/app-icon.svg", "/app-icon-512.png", "/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        return response;
      });
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = typeof payload.title === "string" && payload.title ? payload.title : "BB Cafe Messages";
  const url = typeof payload.url === "string" && payload.url ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/apple-icon.png",
      body:
        typeof payload.body === "string" && payload.body
          ? payload.body
          : "新しいメッセージがあります",
      data: {
        url,
      },
      icon: "/app-icon-512.png",
      tag: typeof payload.tag === "string" && payload.tag ? payload.tag : "new-message",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || "/";
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (isSameAppUrl(client.url, targetUrl) && "focus" in client) {
          return client.focus().then((focusedClient) => {
            focusedClient.postMessage({
              type: "bbcafe:notification-click",
            });

            return focusedClient;
          });
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});

function readPushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return {};
  }
}

function isSameAppUrl(clientUrl, targetUrl) {
  const client = new URL(clientUrl);
  const target = new URL(targetUrl);

  return client.origin === target.origin && client.pathname === target.pathname;
}
