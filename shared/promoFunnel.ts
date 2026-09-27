/**
 * 검색 유입 → 가입 깔때기(2026-09-27 오너: "매장·선수 검색으로 많이 들어오는데 가입으로 이끌자").
 * 매장·선수 페이지의 '길 찾기' 배너(당구대 애니메이션) → 온라인게임 길 찾기(비회원 3번 무료) → 가입.
 * 단계별로 하루 한 번씩(방문자 난수 id 기준) 센다 — 서버 promo_events, 화면 lib/promo.ts.
 */

/** 배너가 붙은 곳 */
export const PROMO_SRCS = ["store", "pba", "umb"] as const;
export type PromoSrc = (typeof PROMO_SRCS)[number];

/**
 * 단계 — view(배너가 화면에 보임) · click(배너 누름) · use(비회원이 길 찾기를 끝까지 씀)
 * · gate(무료 횟수를 다 써서 가입 안내를 봄) · signup(가입을 마침)
 */
export const PROMO_STEPS = ["view", "click", "use", "gate", "signup"] as const;
export type PromoStep = (typeof PROMO_STEPS)[number];

/** 비회원 무료 길 찾기 횟수 */
export const GUEST_PATH_FREE = 3;

export const isPromoSrc = (v: unknown): v is PromoSrc => typeof v === "string" && (PROMO_SRCS as readonly string[]).includes(v);
export const isPromoStep = (v: unknown): v is PromoStep => typeof v === "string" && (PROMO_STEPS as readonly string[]).includes(v);

/** 남은 무료 횟수(0 이하로 내려가지 않는다) */
export function guestPathLeft(used: number): number {
    const n = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
    return Math.max(0, GUEST_PATH_FREE - n);
}

/** 가입 뒤 돌아갈 주소 — 우리 사이트 안의 경로만(열린 리다이렉트 방지). '//' 로 시작하면 다른 도메인이라 막는다. */
export function safeReturnPath(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.length > 300) return null;
    return v;
}
