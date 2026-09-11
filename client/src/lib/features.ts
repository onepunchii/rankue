/**
 * 기능 플래그.
 *
 * 골프 접근은 여기가 아니라 서버(server/lib/golfAccess.ts)가 정하고 /api/hiq/me 의 golfAccess 로 알려 준다.
 * 화면에선 useGolfAccess() 훅을 쓴다. 전면 공개는 shared/golfAccess.ts 의 GOLF_PUBLIC 하나만 바꾸면 된다.
 */
export {};
