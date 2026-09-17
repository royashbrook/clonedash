/// <reference lib="webworker" />
export {};
declare const __BUILD_ID__: string;
const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `clonedash-${__BUILD_ID__}`;
// The builder substitutes emitted paths, including bundled licences.
const SHELL = JSON.parse("__SHELL_ASSETS__") as string[];
worker.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
worker.addEventListener("message", (event) => {
  if (
    event.data?.type === "ACTIVATE" ||
    (event.data?.type === "ACTIVATE_CURRENT" &&
      event.data.build === __BUILD_ID__)
  )
    event.waitUntil(worker.skipWaiting());
  if (event.data?.type === "CLIENT_BUILD" && event.data.build === __BUILD_ID__)
    event.waitUntil(
      (async () => {
        const clients = await worker.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        // Keep old assets until no other open tab can need them. Never delete a downloading update.
        if (
          clients.length !== 1 ||
          !event.source ||
          !("id" in event.source) ||
          clients[0].id !== event.source.id ||
          worker.registration.installing ||
          worker.registration.waiting
        )
          return;
        await Promise.all(
          (await caches.keys())
            .filter((key) => key.startsWith("clonedash-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        );
      })(),
    );
});
worker.addEventListener("activate", (event) => {
  // Retain old hashed assets for another tab that has not accepted the update yet.
  event.waitUntil(worker.clients.claim());
});
worker.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== worker.location.origin ||
    url.searchParams.has("update-probe")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // A complete build is immutable: a background fetch must not mix tomorrow's HTML into it.
      const cached = await cache.match(
        req.mode === "navigate" ? "/index.html" : req,
      );
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })(),
  );
});
