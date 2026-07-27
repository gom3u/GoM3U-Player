const CACHE_NAME = 'apexstream-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './storage.js',
  './playlist.js',
  './player.js',
  './ui.js',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/hls.js@latest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Pass stream requests through without caching
  if (e.request.url.includes('.m3u') || e.request.url.includes('.m3u8') || e.request.url.includes('.ts')) {
    return fetch(e.request);
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});
