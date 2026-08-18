/* Offline cache.
 *
 * Cache-first: the app opens from local files and never waits on the network,
 * which matters in a clubhouse or someone's dining room where the wifi may be
 * weak, absent, or behind a portal. A fresh copy is fetched in the background
 * and used on the next launch, so an update takes one extra open to appear.
 *
 * Bump CACHE whenever an asset below changes, or installed phones keep serving
 * the old files. APP_VERSION in app.js should match.
 */

/* Every project on dandunbar.github.io shares one origin, and CacheStorage is
 * per-origin rather than per-scope — so a sweep of "everything that isn't mine"
 * would delete the Happy Hour app's cache, and its sweep would delete this
 * one. Both apps would then need a network connection to rebuild the very
 * thing that is supposed to make them work without one. Hence the prefix:
 * this worker only ever deletes caches it created. */
const PREFIX = 'bunco-';
const CACHE = `${PREFIX}v1.0.2`;
const SHELL = 'index.html';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* Only store a response that really came from this site. A captive portal —
 * hotel or clubhouse wifi with a sign-in page — answers every request with a
 * 200 that is a redirect somewhere else; caching one would overwrite the app
 * with a login page and survive long after the portal is gone. */
function isOurs(res) {
  return res && res.ok && res.type === 'basic' && !res.redirected;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never serve the worker script from the cache it manages, or a new version
  // can never be noticed and the app is frozen at this one forever.
  if (url.pathname === self.location.pathname) return;

  // Any navigation resolves to the one page this app has.
  const key = req.mode === 'navigate' ? new Request(new URL(SHELL, self.location).href) : req;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key);

      const fromNetwork = fetch(req)
        .then((res) => {
          if (isOurs(res)) cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);

      if (hit) {
        event.waitUntil(fromNetwork);   // refresh for next launch
        return hit;
      }

      const res = await fromNetwork;
      return res || new Response(
        'Bunco Scorecard is not available offline yet. Open it once with an internet connection.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } },
      );
    }),
  );
});
