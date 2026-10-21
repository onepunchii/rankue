/**
 * 앱 안에서 밀어 넣은 기록에 표시 남기기(2026-10-21 오너: "대시보드에서 다시보기 하고 나가면 초대 만들기 화면이 나오던가 이런 중복 페이지가 많이 보이는데").
 *
 * 화면의 '닫기 · 나가기'가 온 곳으로 돌아가려면 "한 칸 뒤가 앱 안인가"를 알아야 한다. 첫 기록(링크 · 알림으로 바로 들어온 화면)에서
 * history.back() 을 부르면 검색 결과 · 다른 사이트로 나가거나(웹) 아무 일도 안 일어난다(앱). 그래서 앱이 pushState 로 밀어 넣는 기록마다
 * state 에 RK_IN 을 붙여 둔다(wouter 의 이동 · Link 가 다 pushState 를 탄다). replaceState 는 앞 칸이 그대로라 지금 표시를 이어 준다.
 * 화면은 cameInApp() 이 참이면 한 칸 뒤로, 아니면 정해 둔 곳으로 바꿔 끼운다(sim/SimulatorPage 의 backOr).
 */
const KEY = "__rkIn";

export function cameInApp(): boolean {
    try { return (window.history.state as Record<string, unknown> | null)?.[KEY] === 1; } catch { return false; }
}

const mark = (state: unknown): unknown => (state && typeof state === "object" ? { ...(state as Record<string, unknown>), [KEY]: 1 } : { [KEY]: 1 });

let installed = false;
export function installInAppHistory(): void {
    if (installed || typeof window === "undefined" || !window.history) return;
    installed = true;
    const push = window.history.pushState.bind(window.history);
    const replace = window.history.replaceState.bind(window.history);
    window.history.pushState = function (state: unknown, unused: string, url?: string | URL | null) {
        return push(mark(state), unused, url);
    };
    window.history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
        // 바꿔 끼워도 앞 칸은 그대로다 — 지금 칸이 앱 안에서 온 것이면 새 칸도 그렇다
        return replace(cameInApp() ? mark(state) : state, unused, url);
    };
}
