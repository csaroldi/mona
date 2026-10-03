/* ============================================================
   Service Worker - A Field Guide to Budapest
   Offline first. Serves the saved copy immediately, refreshes it in
   the background only with a genuine good response (HTTP 200).
   A missing page (404), an error or no signal can never overwrite
   the saved guide, so the files can be deleted from GitHub after
   the app has been opened once with signal.
   ============================================================ */

const CACHE_VERSION = 'budapest-shared-2026-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const ready = await Promise.all(CORE_ASSETS.map((u) => cache.match(u)));
    /* Only drop older caches once this one is complete, so a failed
       install can never leave the device with nothing. */
    if (ready.every(Boolean)) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

function isGood(res) {
  return res && res.status === 200 && (res.type === 'basic' || res.type === 'default');
}

async function refresh(cache, req, key) {
  try {
    /* A navigate-mode Request cannot be re-initialised, so fetch pages by URL */
    const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-store' });
    if (isGood(res)) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    return null;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* maps, audio: network only */

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const isPage = req.mode === 'navigate';
    const key = isPage ? './index.html' : req;

    let hit = await cache.match(key, { ignoreSearch: true });
    if (!hit && isPage) hit = await cache.match('./', { ignoreSearch: true });

    if (hit) {
      event.waitUntil(refresh(cache, req, key)); /* quiet background update, good responses only */
      return hit;
    }
    const res = await refresh(cache, req, key);
    if (res) return res;
    return new Response('Offline and not saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
