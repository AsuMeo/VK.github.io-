// VK-TG Service Worker - CORS Proxy for VK Upload
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Проксируем только VK upload запросы
  if (url.hostname.includes('vk.com') || url.hostname.includes('vk.ru') || url.hostname.includes('vkuser') || url.hostname.includes('pu.vk')) {
    event.respondWith(
      fetch(event.request).catch(err => {
        console.error('SW fetch error:', err);
        return new Response(JSON.stringify({error: err.message}), {
          status: 500,
          headers: {'Content-Type': 'application/json'}
        });
      })
    );
  }
});
