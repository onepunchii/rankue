import { useEffect } from "react";
import { hasPlugin } from "@shared/nativeCaps";

// 켜 둔 동안 화면이 꺼지지 않게 한다(감사 L-O2). '손안의 당구 점수판'은 폰을 테이블에 두고 쓰는데,
// 샷 사이 대기 중에 화면이 어두워지고 잠기면 점수를 넣을 때마다 잠금을 풀어야 한다.
//  - 새 앱: @capacitor-community/keep-awake (안드로이드 FLAG_KEEP_SCREEN_ON, iOS isIdleTimerDisabled).
//  - 옛 앱·웹: 브라우저 Screen Wake Lock 이 있으면 그걸로(안드로이드 웹뷰엔 없어서 조용히 넘어간다).
// 켜기·끄기를 한 줄로 세운다 — 화면을 빨리 오가면 앞 화면의 '끄기'가 뒤 화면의 '켜기'보다 늦게 도착해
// 켜져 있어야 할 화면이 잠길 수 있다.

let nativeQueue: Promise<void> = Promise.resolve();

function runNative(op: "keepAwake" | "allowSleep"): void {
    nativeQueue = nativeQueue
        .then(() => import("@capacitor-community/keep-awake"))
        .then(({ KeepAwake }) => KeepAwake[op]())
        .catch(() => { /* 플러그인 오류는 무시 — 화면이 꺼지는 것 말고는 잃는 게 없다 */ });
}

type Sentinel = { released?: boolean; release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

/** 브라우저 Wake Lock — 화면이 가려지면 브라우저가 풀어 버리므로 다시 보일 때 다시 잡는다. */
function holdWebWakeLock(): (() => void) | undefined {
    const api = typeof navigator !== "undefined" ? (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock : undefined;
    if (!api || typeof api.request !== "function") return undefined;
    let sentinel: Sentinel | null = null;
    let done = false;
    const acquire = () => {
        if (done || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
        api.request("screen").then(
            (s) => {
                if (done) void s.release().catch(() => { /* 무시 */ });
                else sentinel = s;
            },
            () => { /* 권한 정책·배터리 절약 등으로 거절 — 무시 */ },
        );
    };
    document.addEventListener("visibilitychange", acquire);
    acquire();
    return () => {
        done = true;
        document.removeEventListener("visibilitychange", acquire);
        void sentinel?.release().catch(() => { /* 무시 */ });
        sentinel = null;
    };
}

export function useKeepAwake(active: boolean): void {
    useEffect(() => {
        if (!active) return;
        if (hasPlugin("KeepAwake")) {
            runNative("keepAwake");
            return () => runNative("allowSleep");
        }
        return holdWebWakeLock();
    }, [active]);
}
