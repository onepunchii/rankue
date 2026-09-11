// 랭큐 서비스 워커 — main.tsx 가 '/' 범위로 등록한다.
// 하는 일: 앱 껍데기('/', '/index.html', '/manifest.json')를 미리 받아 두고, 화면 이동이 아닌 요청은
// 캐시에 있으면 캐시로, 없으면 네트워크로 보낸다. 오프라인이면 콘솔 오류 대신 404 를 돌려준다.
// 웹 푸시는 2026-09-11 오너 결정으로 없앴다. 예전 Polli 시절 Firebase 메시징(gstatic importScripts,
// polli-a71b7 설정, 'Polli' 제목·아이콘, 알림 탭 처리)이 이 파일 끝에 붙어 있었다. 앱 푸시는 네이티브(FCM/APNs)가 따로 한다.
// 캐시 이름을 바꿨으니 activate 가 옛 'polli-pwa-v3' 캐시를 지운다 — 거기 묵어 있던 manifest.json 도 새로 받는다.
const CACHE_NAME = 'rankue-pwa-v1';
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
                    console.warn('[sw.js] Network fetch failed for', event.request.url);
                    // Return a fake 404 response to prevent "Uncaught (in promise)" error in console
                    return new Response(null, { status: 404, statusText: 'Network Unavailable' });
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
