self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    }).then(() => {
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => {
        if (client.url) client.navigate(client.url);
      });
    })
  );
});

self.addEventListener('fetch', e => {
  // Always fetch from network, bypassing cache completely
  e.respondWith(fetch(e.request));
});
