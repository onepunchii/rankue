/**
 * 주 종목(2026-10-01 오너: "회원가입 때 당구·골프 예쁜 버튼으로 고르면 그 종목이 주 입장 통로가 되게 — 지금은 골프 사람도 당구로 들어온다").
 *
 * 그전엔 종목이 **기기 저장값**(localStorage, 기본 당구)뿐이라, 폰을 바꾸거나 다시 깔면 골프 회원도 당구 홈으로 열렸다.
 * 이제 회원 정보(hiq_members.primary_sport)에 남기고, 앱을 처음 열 때(세션마다 한 번) 그 종목으로 시작한다.
 * 아직 안 고른 회원(null)에게는 한 번 묻는다 — 기본값은 기록으로 추정(suggestPrimarySport).
 */
export type PrimarySport = "BILLIARDS" | "GOLF";

export const isPrimarySport = (v: unknown): v is PrimarySport => v === "BILLIARDS" || v === "GOLF";

/**
 * 앱을 열 때 시작하는 종목(2026-10-13) — 주 종목 둘에 등산을 더한 것. 등산은 그것을 쓸 수 있는 회원만 고른다(서버가 확인한다 — server/lib/hikingAccess).
 * PrimarySport 를 넓히지 않고 따로 둔다: 주 종목을 추정하는 식 · 문의 화면의 종목 표시는 당구 · 골프만 안다.
 */
export type StartSport = PrimarySport | "HIKING" | "FISHING";
/** 낚시로 시작하기(2026-10-24 오너: "첫 진입때 카테고리 선택에 낚시 카드도") — 등산과 같이 낚시를 쓸 수 있는 회원만(server/lib/fishingAccess) */
export const isStartSport = (v: unknown): v is StartSport => isPrimarySport(v) || v === "HIKING" || v === "FISHING";

/** 아직 안 고른 회원의 기본값 — 골프 라운드·조인/부킹 흔적이 있으면 골프, 아니면 당구 */
export function suggestPrimarySport(signals: { golfRounds: number; golfPosts: number; golfRequests: number }): PrimarySport {
    return signals.golfRounds + signals.golfPosts + signals.golfRequests > 0 ? "GOLF" : "BILLIARDS";
}
