const CACHE = 'clonedash-BUILD_ID';
const SHELL = ['/', '/index.html', '/app.css?v=BUILD_ID', '/app.js?v=BUILD_ID', '/engine.js', '/levels.js', '/render.js', '/music.js', '/install.js', '/manifest.json', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('clonedash-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.searchParams.has('update-probe')) return;
  // Network-first modules as well as navigations prevent an updated shell using stale physics.
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('/index.html') : Response.error())));
});
