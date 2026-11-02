// Service Worker for PWA - Bình Chọn Hoa Khôi
const CACHE_NAME = 'muce-hoakhoi-v5';
const ASSETS_TO_CACHE = [
  './style.css',
  './pwa-install.css',
  './pwa-install.js',
  './app-icon-192.png',
  './app-icon-512.png',
  './app-icon.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bỏ qua các API calls và các HTTP POST/PUT/DELETE
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  const url = new URL(event.request.url);

  // Đối với trang HTML chính (navigation / index.html): LUÔN LẤY TỪ NETWORK (Network First)
  // để người dùng luôn cập nhật tính năng mới nhất, không bao giờ bị dính cache cũ
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./index.html') || caches.match(event.request))
    );
    return;
  }

  // Các static assets khác (ảnh icons, css...)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
