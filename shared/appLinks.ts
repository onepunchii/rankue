// 랭큐 **자기 앱**의 스토어 링크 정본.
//
// 왜 shared 인가: 같은 URL 을 네 곳이 쓴다.
//   1) client/src/components/hiq/SiteFooter.tsx — 모든 공개 페이지 푸터(사용자가 보는 링크)
//   2) client/src/pages/app-landing.tsx        — /app 다운로드 랜딩
//   3) server/prerender.ts                     — 크롤러가 JS 없이 받는 HTML 의 같은 푸터·랜딩
//   4) (기존) marketing-landing.tsx · HiqInstallBanner.tsx 의 하드코딩 값과 같은 앱을 가리킨다
// 봇이 본 링크와 사람이 본 링크가 갈리면 그건 클로킹이다. 그래서 한 곳에서 만든다.
//
// 앱 ID 의 원본은 shared/familyServices.ts(6개 레포 공용 레지스트리)다 — 여기서 그 값을
// 읽으므로 스토어 URL 이 바뀌면 레지스트리만 고치면 된다.
//
// ⚠️ 상대 임포트에 **.js 확장자를 반드시 붙인다**(파일은 .ts 다).
//    이 파일은 세 런타임이 읽는다: vite(클라이언트 번들) · esbuild(npm run build 서버 번들) ·
//    @vercel/node(프로덕션 서버리스 함수). 확장자를 빼면 앞의 둘은 통과하지만
//    @vercel/node 에서 모듈을 못 찾아 **함수 전체가 500(FUNCTION_INVOCATION_FAILED)** 이 된다
//    (2026-08-16 실측: /api/* 와 모든 프리렌더 경로가 동시에 죽었다).
//    server/*.ts 가 shared 를 ../shared/x.js 로 불러오는 것과 같은 이유·같은 규칙이다.
import { FAMILY_SERVICES } from "./familyServices.js";

const SELF = FAMILY_SERVICES.find((s) => s.id === "rankue");

/**
 * 스토어 URL. 레지스트리에 없으면 null 이다(fail-closed).
 * 호출부는 null 이면 **버튼을 그리지 않는다** — 죽은 스토어 링크는 404 화면을 띄우고
 * 링크 자산으로도 마이너스다. 지금은 iOS·Android 둘 다 게시돼 있어 값이 채워진다.
 */
export const APP_STORE_URL: string | null = SELF?.ios ?? null;
export const PLAY_STORE_URL: string | null = SELF?.android ?? null;

/**
 * 유입 출처(슬롯)를 URL 에 심는다. 없으면 "푸터·/app 랜딩이 설치를 몇 개 만들었나"를
 * Play Console·App Store Connect 에서 영영 확인할 수 없다.
 *   Play  : referrer=utm_source=web&utm_medium=<slot>
 *   Apple : ct=web_<slot>   (App Analytics 캠페인 토큰)
 * 기존 HiqInstallBanner·marketing-landing 이 쓰던 규칙과 같은 형식이다.
 */
export function playLink(slot: string): string | null {
  if (!PLAY_STORE_URL) return null;
  const ref = encodeURIComponent(`utm_source=web&utm_medium=${slot}`);
  return `${PLAY_STORE_URL}&referrer=${ref}`;
}

export function appStoreLink(slot: string): string | null {
  if (!APP_STORE_URL) return null;
  return `${APP_STORE_URL}?ct=web_${slot}`;
}
