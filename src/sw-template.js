/* FORMA Service Worker – Offline-Cache. Daten liegen in IndexedDB und sind vom Cache unabhängig. */
const VERSION = '__VERSION__';
const CACHE = `forma-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('forma-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // z. B. API-Aufrufe nie cachen
  if (req.mode === 'navigate') {
    // Online: immer die aktuelle Startseite (Revalidierung, max. 4 s warten); offline/langsam: App aus dem Cache.
    e.respondWith(
      Promise.race([
        fetch(req.url, { cache: 'no-cache' }).then((res) => { if (!res.ok || res.redirected) throw new Error('nicht nutzbar'); return res; }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 4000)),
      ]).catch(() => caches.match('./', { ignoreVary: true }).then((hit) => hit || fetch(req))),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
