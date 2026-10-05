/**
 * 골프장 '근처'(맛집·카페·숙소) — 네이버 지역 검색(2026-10-05 오너: "순서대로 하자"의 2번).
 *
 * 골프장 이름에 붙여 찾는 말 2위가 '맛집'이다(네이버 검색량: 날씨 100 · 맛집 30).
 * 검색어는 실측으로 골랐다(골프장 12곳): "{골프장 이름} 근처 맛집" 정확도순이 12곳 전부 5건 · 전부 10km 안(중앙 2.2km).
 * "이름 맛집"은 2곳이 0건, "시군 맛집"은 13km 밖이었다. 카페 6/6 · 숙소 5/6 도 같은 꼴로 잘 나온다.
 *
 * 네이버 검색 API 특약(2026-09-07 시행 — 기사 요약으로 확인) 때문에 지키는 것 — 바꾸기 전에 약관 원문을 볼 것:
 *   · 저장·캐싱 금지 → 열 때마다 실시간으로 부른다. DB·CDN·검색엔진용 화면에 두지 않는다.
 *   · 가공 금지 → 순서·낱말 그대로. 거리로 거르거나 다시 줄 세우지 않고, 거리 표시도 얹지 않는다.
 *   · 결과가 나오는 화면에 광고 금지 · AI 활용(요약 등) 금지.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
export const NEARBY_KINDS = ["food", "cafe", "stay"] as const;
export type NearbyKind = (typeof NEARBY_KINDS)[number];
export const NEARBY_WORD: Record<NearbyKind, string> = { food: "맛집", cafe: "카페", stay: "숙소" };
export const isNearbyKind = (v: unknown): v is NearbyKind => typeof v === "string" && (NEARBY_KINDS as readonly string[]).includes(v);

/** 네이버에 보내는 검색어 — 화면의 '네이버 지도에서 더 보기'도 같은 말로 연다 */
export const nearbyQuery = (courseName: string, kind: NearbyKind) => `${courseName} 근처 ${NEARBY_WORD[kind]}`;

/** 네이버 지도 검색 주소(앱이 있으면 앱으로 넘어간다). 결과에 가게 주소(link)는 대개 비어 있어 이름으로 찾아 준다. */
export const naverMapSearchUrl = (query: string) => `https://map.naver.com/p/search/${encodeURIComponent(query)}`;

/** 한 곳 — 네이버가 준 글 그대로(강조 태그만 뗀다) */
export interface NearbyPlace { name: string; category: string; address: string }
export interface NearbyResult { query: string; items: NearbyPlace[] }

/** 응답의 강조 태그(<b>)를 떼고 HTML 엔티티를 글자로 — 낱말은 건드리지 않는다 */
export function plainText(s: unknown): string {
    return String(s ?? "").replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
}
