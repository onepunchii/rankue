// 옛 웹 푸시(Firebase 메시징)가 쓰던 서비스 워커 자리. 웹 푸시는 2026-09-11 오너 결정으로 없앴다.
// 지금 코드는 이 파일을 등록하지 않는다(main.tsx 는 /sw.js 만 등록). 다만 예전에 Firebase SDK 가 기본값으로
// 이 파일을 등록해 둔 브라우저가 남아 있을 수 있어서, 지우지 않고 "스스로 등록 해제"하는 껍데기로 둔다.
// 파일을 지우면 Vercel 이 없는 파일 대신 index.html 을 돌려줘서(vercel.json 마지막 라우트) 브라우저의
// 업데이트 확인이 실패하고 옛 등록이 그대로 남는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(self.registration.unregister());
});
