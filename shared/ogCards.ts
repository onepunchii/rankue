/**
 * 검색 썸네일·링크 미리보기 카드의 주소(2026-10-08) — 골프장·당구장.
 *
 * 프리렌더·사이트맵(서버)과 화면의 useSeo(클라이언트)가 **같은 주소**를 써야 한다 — 예전에는 화면 쪽이 글자로 따로 적어 두었다.
 * 그림을 바꾸면 CARD_VERSION 을 올린다: 주소가 달라져야 검색엔진·메신저가 새 그림을 다시 가져간다(같은 주소면 예전 그림을 오래 쥐고 있다).
 *   v2 (2026-10-08) 오너: "이미지 너무 별로인데 … 썸네일 시안 몇 개 만들어 줘 봐" → "골프는 시안 C, 당구장은 시안 B"
 *      골프장 = 로고 판(위는 로고, 아래는 이름) · 당구장 = 당구대 그림(위는 당구대, 아래는 이름)
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙) — 이 파일은 아무것도 임포트하지 않는다.
 */
export const CARD_VERSION = 2;

/** 골프장 카드 — 슬러그는 한글이라 인코딩한다 */
export const golfCourseCardUrl = (origin: string, slug: string) => `${origin}/og/golf-course/${encodeURIComponent(slug)}.png?v=${CARD_VERSION}`;
/** 당구장 카드 — 매장 코드는 영숫자 */
export const storeCardUrl = (origin: string, code: string) => `${origin}/og/store/${encodeURIComponent(code)}.png?v=${CARD_VERSION}`;

/**
 * 카드 그림의 설명(alt) — 카드에 있는 것만 말한다. 이름에 이미 그 말이 있으면 되풀이하지 않는다
 * ("허슬러1 당구장 당구장 카드" — 매장 이름의 절반쯤이 '당구장'으로 끝난다).
 */
export const cardAlt = (name: string, kind: "골프장" | "당구장") => (name.includes(kind) ? `${name} 카드` : `${name} ${kind} 카드`);
