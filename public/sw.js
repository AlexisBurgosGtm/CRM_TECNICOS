const CACHE_PREFIX = 'calendario-eventos';
let activeCache = `${CACHE_PREFIX}-init`;

async function fetchCacheVersion() {
  try {
    const res = await fetch('/cache-version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

async function resolveCacheName() {
  const version = await fetchCacheVersion();
  return version ? `${CACHE_PREFIX}-${version}` : `${CACHE_PREFIX}-${Date.now()}`;
}

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/manifest.json',
  '/favicon.png',
  '/js/format.js',
  '/js/main.js',
  '/js/auth.js',
  '/js/api.js',
  '/js/router.js',
  '/js/alerts.js',
  '/js/views/login.js',
  '/js/views/home.js',
  '/js/views/calendar.js',
  '/js/views/employees.js',
  '/js/views/clients.js',
  '/js/views/tickets.js',
  '/js/views/archivo.js',
  '/js/components/layout.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    resolveCacheName().then((cacheName) => {
      activeCache = cacheName;
      return caches.open(cacheName).then((cache) => cache.addAll(PRECACHE_URLS));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    resolveCacheName().then(async (cacheName) => {
      activeCache = cacheName;
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName)
          .map((key) => caches.delete(key))
      );
      await caches.open(cacheName);
      await self.clients.claim();
    })
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.png' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(activeCache).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (isStaticAsset(url) || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(activeCache).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
