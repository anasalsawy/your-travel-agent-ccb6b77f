// Service worker with safe caching (network-first for app shell)
const CACHE_NAME = 'travel-agent-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache backend/API calls
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase')) return;

  // Network-first for HTML and build assets to avoid stale deployments
  const isHTML = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  const isBuildAsset = url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isHTML || isBuildAsset) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await caches.match(request);
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Cache-first for other static assets (images, fonts, etc.)
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

