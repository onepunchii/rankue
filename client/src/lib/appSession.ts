/**
 * 앱 접속 세션 추적(2026-09-13 오너: "회원들이 우리 앱에 얼마나 잔류하는지").
 *
 * 앱(또는 탭)이 앞으로 오면 open, 뒤로 가면 close, 열려 있는 동안 HEARTBEAT_MS 마다 touch.
 * 로그인한 회원일 때만 돈다 — 누군지 모르면 잔류를 셀 수 없고, 비회원 추적은 하지 않는다.
 *
 * close 는 페이지가 사라지는 순간에 보내야 해서 fetch 가 아니라 sendBeacon 을 쓴다(브라우저가 언로드 뒤에도 보내 준다).
 * 추적은 절대 앱을 방해하면 안 된다 — 모든 호출을 삼키고, 실패해도 다음 신호에서 다시 연다.
 */
import { App } from "@capacitor/app";
import { HEARTBEAT_MS, type AppPlatform } from "@shared/appSession";
import { hasPlugin, isNative, platform } from "@shared/nativeCaps";

const OPEN_URL = "/api/hiq/me/app-session/open";
const TOUCH_URL = "/api/hiq/me/app-session/touch";
const CLOSE_URL = "/api/hiq/me/app-session/close";

function currentPlatform(): AppPlatform {
    if (!isNative()) return "web";
    const p = platform();
    return p === "ios" || p === "android" ? p : "web";
}

async function post(url: string, body: unknown): Promise<unknown> {
    const r = await fetch(url, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json())?.data;
}

/** 언로드 직전에도 나가는 전송. sendBeacon 이 없으면(옛 웹뷰) keepalive fetch 로. */
function beacon(url: string, body: unknown): void {
    const json = JSON.stringify(body);
    try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            if (navigator.sendBeacon(url, new Blob([json], { type: "application/json" }))) return;
        }
    } catch { /* 아래 fetch 로 */ }
    try { void fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: json, keepalive: true }); } catch { /* 무시 */ }
}

/**
 * 추적 시작. 되돌리는 함수를 돌려준다(로그아웃·언마운트 때 부른다).
 * 같은 창에서 두 번 부르지 않게 호출부(AppSessionTracker)가 한 번만 마운트한다.
 */
export function startAppSessionTracking(): () => void {
    if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
    let sessionId: string | null = null;
    let opening: Promise<void> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const open = () => {
        if (stopped || opening) return;
        opening = post(OPEN_URL, { platform: currentPlatform() })
            .then((d) => { const id = (d as { id?: string } | undefined)?.id; if (typeof id === "string") sessionId = id; })
            .catch(() => { /* 다음 신호에서 다시 */ })
            .finally(() => { opening = null; });
    };
    const touch = () => {
        if (stopped || !sessionId || document.visibilityState !== "visible") return;
        void post(TOUCH_URL, { id: sessionId }).catch(() => { /* 무시 */ });
    };
    const close = () => {
        if (!sessionId) return;
        beacon(CLOSE_URL, { id: sessionId });
        sessionId = null;
    };

    const onVisibility = () => { if (document.visibilityState === "visible") open(); else close(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);

    // 네이티브 앱: 포그라운드/백그라운드는 visibilitychange 로도 오지만, 웹뷰에 따라 빠질 때가 있어 플러그인 신호도 듣는다.
    let nativeHandle: { remove: () => Promise<void> } | null = null;
    if (isNative() && hasPlugin("App")) {
        App.addListener("appStateChange", ({ isActive }) => { if (isActive) open(); else close(); })
            .then((h) => { nativeHandle = h; })
            .catch(() => { /* 옛 바이너리 */ });
    }

    if (document.visibilityState === "visible") open();
    timer = setInterval(touch, HEARTBEAT_MS);

    return () => {
        stopped = true;
        close();
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", close);
        void nativeHandle?.remove().catch(() => { /* 무시 */ });
    };
}
