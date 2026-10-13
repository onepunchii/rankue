/**
 * 크루의 종목(2026-10-13) — 등산이 세 번째 크루 종목으로 들어왔다. 산악회는 당구 · 골프 크루와 섞이지 않는 따로 선 한 종류다.
 * 표의 열은 글자(text)라 DB 는 그대로다 — shared/schema 의 enum 만 넓혔다.
 * 서버(크루 · 채팅 라우트)가 요청의 종목을 읽는 규칙을 여기 한 곳에 둔다(두 라우트가 따로 적으면 한쪽만 등산을 모른다).
 */
export type CrewSport = "BILLIARDS" | "GOLF" | "HIKING" | "FISHING";

/** 요청(질의 · 본문)의 종목. 빈 값 · 모르는 값은 당구 — 예전 규칙 그대로다(종목을 안 주면 당구로 본다). */
export function crewSportOf(v: unknown): CrewSport {
    return v === "GOLF" || v === "HIKING" || v === "FISHING" ? v : "BILLIARDS";
}

/**
 * 따로 선 종목(2026-10-14 오너: "낚시도 골프 · 등산처럼 완전히 구별") — 등산 · 낚시. 당구 · 골프의 것(다마 · 타수 · 친구 · 1:1 방 · 도전)이
 * 없는 세계다. '산악회라서 뺀다'던 자리들은 이 물음을 쓴다 — 산에만 있는 것(고른 산 · 정상 인증)은 그대로 등산만 본다.
 */
export const isOwnWorldSport = (v: unknown): v is "HIKING" | "FISHING" => v === "HIKING" || v === "FISHING";

/** 낚시 크루의 일정의 종류 — 하나뿐이다(출조). 산악회와 같은 까닭으로 카드에 라벨을 붙이지 않는다 */
export const FISHING_ACTIVITY_CATEGORY = "FISHING_TRIP";

/**
 * 산악회 일정의 종류 — 하나뿐이다(당구 · 골프처럼 정기 · 번개 · 대회를 고르게 하지 않는다).
 * 만들기 창이 이 값을 채워 보내고, 종류가 하나라 카드에 라벨은 붙이지 않는다(shared/crewActivity activityCategoryLabelKey → null).
 */
export const HIKING_ACTIVITY_CATEGORY = "HIKING_TRIP";
