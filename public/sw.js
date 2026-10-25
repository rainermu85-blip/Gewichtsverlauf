// Only application files belong in this cache. Weight entries live in IndexedDB.
const PREFIX = `gewichtsverlauf-shell:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}v3`;
const urlFor = path => new URL(path, self.registration.scope).href;
const SHELL = ['./', 'index.html', 'app.js', 'chart.js', 'data.js', 'storage.js', 'styles.css',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'].map(urlFor);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkThenCache(event.request, urlFor('index.html')));
  } else if (SHELL.includes(url.href)) {
    event.respondWith(networkThenCache(event.request, event.request));
  }
});
async function networkThenCache(request, key) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      try { await (await caches.open(CACHE)).put(key, response.clone()); } catch {}
    }
    return response;
  } catch {
    return caches.match(key);
  }
}
