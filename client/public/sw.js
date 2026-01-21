
const CACHE_NAME = 'polli-pwa-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    // Navigation requests (HTML) should typically bypass the service worker
    // to ensure auth redirects (like Supabase/Google OAuth) are handled correctly by the browser.
    if (event.request.mode === 'navigate') {
        return;
    }

    // Exclude Next.js / Vite development files and HMR from Service Worker
    const url = new URL(event.request.url);
    if (url.pathname.includes('@vite') ||
        url.pathname.includes('node_modules') ||
        url.pathname.endsWith('.ts') ||
        url.pathname.endsWith('.tsx') ||
        url.search.includes('t=')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).catch((error) => {
                    console.warn('[sw.js] Network fetch failed for', event.request.url, error);
                    // Return a 408 or similar if needed, or just let the browser handle the failure gracefully
                    // throwing here is what causes "Uncaught (in promise)" if not handled, 
                    // but we are inside evaluate respondWith.
                    // Returning a safe specific offline response might be better for images/etc.
                    throw error;
                });
            })
    );
});


self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// These config values will be injected or used if available
firebase.initializeApp({
    apiKey: "AIzaSyDcyFj0c6aWbkCk0nH4sJ3_PS1CxLjLeOw",
    authDomain: "polli-a71b7.firebaseapp.com",
    projectId: "polli-a71b7",
    storageBucket: "polli-a71b7.firebasestorage.app",
    messagingSenderId: "737747715451",
    appId: "1:737747715451:web:143bfcb0396cc68acf69de",
    measurementId: "G-JER9YDSNWY"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message ', payload);
    const notificationTitle = payload.notification?.title || 'Polli';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: 'https://www.polli.co.kr/polli_og_marketing_v1.png',
        badge: 'https://www.polli.co.kr/polli_og_marketing_v1.png',
        data: payload.data,
        tag: 'polli-notification',
        renotify: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || '/')
    );
});

