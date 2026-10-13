/**
 * 기기에 남기면 안 되는 답(2026-10-13) — 네이버 검색 결과.
 *
 * 화면의 답은 일주일 동안 기기 저장소에 남는다(client/src/lib/queryClient 의 영속화). 그런데 네이버 검색 API 의 결과는
 * **저장 · 캐시하면 안 된다**(이용약관 — shared/golfAround 머리말). 골프장 '근처 맛집'과 투어 소식이 그 저장에 딸려 들어가고 있었다
 * (등산의 근처 맛집을 만들던 작업자가 찾음). 여기 적힌 열쇠의 답은 저장하지 않는다 — 화면에 떠 있는 동안만 메모리에 있다.
 * 새로 네이버 결과를 내는 화면을 만들면 여기에 그 열쇠를 더한다(등산의 근처 맛집은 저장소를 아예 거치지 않는다).
 */

/** 이 열쇠의 답이 네이버 검색 결과인가 */
export function isSearchResultKey(queryKey: readonly unknown[]): boolean {
    const head = String(queryKey[0] ?? "");
    // 투어 소식 — 네이버 뉴스 검색
    if (head.startsWith("/api/hiq/tour-news")) return true;
    // 골프장 근처(맛집 · 카페 · 대표 메뉴) — 네이버 지역 검색. 열쇠는 [골프장 목록, "nearby", slug, 종류]
    if (head === "/api/hiq/golf-courses" && queryKey[1] === "nearby") return true;
    // 주소에 바로 적힌 꼴(…/<slug>/nearby)도 막는다 — 등산 · 골프 어느 쪽이든
    if (/^\/api\/hiq\/(golf-courses|hiking\/mountains)\/[^/]+\/nearby(\?|$)/.test(head)) return true;
    return false;
}
