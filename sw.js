const CACHE_NAME = 'triage-pwa-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './translations.json'
];

// Install Event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // Use catch to handle single fetch failures without crashing the whole installation
                return Promise.all(
                    urlsToCache.map(url => {
                        return cache.add(url).catch(error => console.error(`Failed to cache ${url}:`, error));
                    })
                );
            })
    );
});

// Fetch Event (Network first, then fallback to Cache)
self.addEventListener('fetch', event => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // If good response from network, cache a copy and return
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                // Network failed, serve from cache (Offline Mode)
                return caches.match(event.request);
            })
    );
});
