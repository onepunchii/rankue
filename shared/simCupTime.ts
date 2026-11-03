/**
 * 월대회 경기 시각의 규칙(2026-11-03 오너: "일정시간 안들어오면 기권패 … 15분"). 홈 입구 · 대진 화면 · 서버가 같이 쓴다.
 * 대진 계산(shared/simCup)과 따로 둔다 — 홈 첫 화면 묶음에 대진 · 레이팅 코드를 싣지 않으려고. simCup 이 그대로 다시 내보낸다.
 */

/** 경기 시각 몇 분 전부터 입장할 수 있나 */
export const CUP_ENTER_EARLY_MS = 10 * 60_000;
/** 경기 시각에서 이만큼 지나도 판이 안 열렸으면 판정한다(오너 11/3 "15분") */
export const CUP_NO_SHOW_MS = 15 * 60_000;
/** 대기실에 '지금 있다'로 보는 시간 — 화면은 5초마다 다시 적는다 */
export const CUP_PRESENT_MS = 25_000;

/**
 * 입장 시간 — unscheduled(시각 없음) · early(아직 — 10분 전부터) · open(입장할 수 있다) · closed(15분이 지났다 — 판정만 남았다).
 * 시작된 판은 이것과 상관없이 이어 친다.
 */
export type CupWindow = "unscheduled" | "early" | "open" | "closed";
export function cupWindow(scheduledMs: number | null, nowMs: number): CupWindow {
    if (scheduledMs === null) return "unscheduled";
    if (nowMs < scheduledMs - CUP_ENTER_EARLY_MS) return "early";
    if (nowMs < scheduledMs + CUP_NO_SHOW_MS) return "open";
    return "closed";
}
/** 대기실에 지금 있는가(마지막으로 적은 때가 CUP_PRESENT_MS 안) */
export const cupPresent = (seenMs: number | null | undefined, nowMs: number): boolean => typeof seenMs === "number" && nowMs - seenMs <= CUP_PRESENT_MS;
