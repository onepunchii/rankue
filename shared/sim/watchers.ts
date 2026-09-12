/**
 * 관전자 수 세기(2026-09-12). 대전 행의 watchers 는 {"<회원 id>": epoch ms} 이고,
 * 최근 WATCHER_WINDOW_MS 안에 폴링한 사람만 "보고 있는 중"으로 센다.
 *
 * 창(window)은 관전 폴링 주기(4 s)의 네 배쯤 잡는다 — 한두 번 걸러도 사라지지 않고,
 * 화면을 닫으면 폴링이 멈추므로 15 초쯤 뒤에는 목록에서 빠진다.
 * 서버·클라이언트가 같은 기준으로 세도록 순수 함수로 둔다.
 */
export const WATCHER_WINDOW_MS = 15_000;

/** 지금 보고 있는 사람 수. 값이 이상하면(문자열·NaN) 세지 않는다. */
export function countWatchers(watchers: unknown, nowMs: number): number {
    if (!watchers || typeof watchers !== "object" || Array.isArray(watchers)) return 0;
    let n = 0;
    for (const v of Object.values(watchers as Record<string, unknown>)) {
        const at = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (Number.isFinite(at) && nowMs - at <= WATCHER_WINDOW_MS) n += 1;
    }
    return n;
}
