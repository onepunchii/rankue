/**
 * 크루의 종목(2026-10-13) — 등산이 세 번째 크루 종목으로 들어왔다. 산악회는 당구 · 골프 크루와 섞이지 않는 따로 선 한 종류다.
 * 표의 열은 글자(text)라 DB 는 그대로다 — shared/schema 의 enum 만 넓혔다.
 * 서버(크루 · 채팅 라우트)가 요청의 종목을 읽는 규칙을 여기 한 곳에 둔다(두 라우트가 따로 적으면 한쪽만 등산을 모른다).
 */
export type CrewSport = "BILLIARDS" | "GOLF" | "HIKING";

/** 요청(질의 · 본문)의 종목. 빈 값 · 모르는 값은 당구 — 예전 규칙 그대로다(종목을 안 주면 당구로 본다). */
export function crewSportOf(v: unknown): CrewSport {
    return v === "GOLF" || v === "HIKING" ? v : "BILLIARDS";
}

/**
 * 산악회 일정의 종류 — 하나뿐이다(당구 · 골프처럼 정기 · 번개 · 대회를 고르게 하지 않는다).
 * 만들기 창이 이 값을 채워 보내고, 종류가 하나라 카드에 라벨은 붙이지 않는다(shared/crewActivity activityCategoryLabelKey → null).
 */
export const HIKING_ACTIVITY_CATEGORY = "HIKING_TRIP";
