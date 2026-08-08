// Caches only the app SHELL (the UI itself) so the app opens instantly and
// even offline. It never caches API responses — your positions, prices,
// and balances always come live from Apps Script when you have a signal.
const CACHE_NAME = 'margin-tracker-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './config.js',
  './shim.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept the Apps Script API calls - those must always hit the network live.
  if (url.hostname.indexOf('script.google.com') !== -1 || url.hostname.indexOf('googleusercontent.com') !== -1) {
    return;
  }
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
