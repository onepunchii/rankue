/**
 * 앱 접속 세션 규칙(2026-09-13). 서버·클라이언트가 같은 숫자를 본다.
 *
 * - 열려 있는 동안 HEARTBEAT_MS 마다 서버에 "아직 보고 있다" 를 찍는다.
 * - 닫힘 신호가 없는 세션(강제 종료·배터리 방전)은 마지막 신호 뒤 IDLE_END_MS 가 지나면 그때 끝난 것으로 본다.
 * - 세션 길이는 MAX_SESSION_MS 로 자른다 — 점수판을 켜 둔 채 잠든 폰이 8시간짜리 세션을 만들면 평균이 망가진다.
 */
export const HEARTBEAT_MS = 5 * 60 * 1000;
export const IDLE_END_MS = 30 * 60 * 1000;
export const MAX_SESSION_MS = 4 * 60 * 60 * 1000;

export type AppPlatform = "ios" | "android" | "web";

/** 세션 길이(ms). 닫힘이 있으면 그것, 없으면 마지막 신호까지. 음수·NaN 은 0, 상한은 MAX_SESSION_MS. */
export function sessionLengthMs(openedAt: number, lastSeenAt: number, closedAt: number | null): number {
    const end = closedAt ?? lastSeenAt;
    const ms = end - openedAt;
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.min(MAX_SESSION_MS, ms);
}

/** 이 세션이 지금도 살아 있나(닫힘 없음 + 마지막 신호가 IDLE_END_MS 안). */
export function isSessionLive(lastSeenAt: number, closedAt: number | null, nowMs: number): boolean {
    return closedAt === null && nowMs - lastSeenAt < IDLE_END_MS;
}

/** 분 단위 표시용 반올림. 1분 미만은 1. */
export function minutesOf(ms: number): number {
    return Math.max(1, Math.round(ms / 60_000));
}
