const CACHE_NAME = 'dataplate-mobile-v1';
const APP_SHELL = [
  './',
  './pages/adm-login.html',
  './Css/adm-login.css',
  './Css/design-system.css',
  './Css/mobile.css',
  './JavaScript/mobile-runtime.js',
  './JavaScript/adm-auth.js',
  './JavaScript/adm-login.js',
  './images/brand/logo-dataplate.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
