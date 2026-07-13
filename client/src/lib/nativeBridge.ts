// Capacitor 네이티브 쉘 브릿지 — shell-kit 표준 (mapix/onp 이식).
// 원격 URL 모드에선 네이티브 런타임이 페이지에 주입되므로 window.Capacitor 전역으로 접근.
// 웹 브라우저에선 전부 no-op — 번들 크기·동작 영향 없음.

type CapApp = {
    exitApp?: () => void;
    addListener?: (ev: "backButton", cb: () => void) => Promise<{ remove: () => void }>;
};
type CapPush = {
    checkPermissions?: () => Promise<{ receive: string }>;
    requestPermissions?: () => Promise<{ receive: string }>;
    register?: () => Promise<void>;
    addListener?: (ev: string, cb: (arg: unknown) => void) => Promise<unknown>;
};
type Cap = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: { App?: CapApp; PushNotifications?: CapPush };
};

function cap(): Cap | undefined {
    return (globalThis as { Capacitor?: Cap }).Capacitor;
}

export function isNativeApp(): boolean {
    return !!cap()?.isNativePlatform?.();
}

export function nativePlatform(): string | null {
    return isNativeApp() ? cap()?.getPlatform?.() ?? null : null;
}

let pushRegistered = false;

async function initNativePush(): Promise<void> {
    if (pushRegistered) return;
    const push = cap()?.Plugins?.PushNotifications;
    if (!push?.register) return;
    try {
        let perm = await push.checkPermissions?.();
        if (perm?.receive === "prompt") perm = await push.requestPermissions?.();
        if (perm?.receive !== "granted") return;
        pushRegistered = true;
        await push.addListener?.("registration", (t) => {
            const token = (t as { value?: string })?.value;
            if (!token) return;
            // 서버 저장 — 로그인 상태(hiq_user_id 쿠키)에서만 성공, 아니면 401 무시
            fetch("/api/hiq/push-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ token: `fcm:${token}` }),
            }).catch(() => {});
        });
        // 알림 탭 → 페이로드 url 딥링크
        await push.addListener?.("pushNotificationActionPerformed", (ev) => {
            const url = ((ev as { notification?: { data?: { url?: string } } })?.notification?.data)?.url;
            if (url && url.startsWith("/")) window.location.href = url;
        });
        await push.register();
    } catch {
        /* 푸시는 부가 기능 — 실패 무시 */
    }
}

// 앱 진입점(main.tsx)에서 1회 호출.
export function initNativeBridge(): void {
    if (!isNativeApp()) return;
    if (nativePlatform() === "android") document.documentElement.classList.add("native-android");

    // 안드로이드 하드웨어 뒤로가기: 히스토리 있으면 back, 루트면 앱 종료 (wouter는 history API 기반)
    const app = cap()?.Plugins?.App;
    try {
        app?.addListener?.("backButton", () => {
            if (window.location.pathname === "/" || window.history.length <= 1) app.exitApp?.();
            else window.history.back();
        });
    } catch { /* 무시 */ }

    initNativePush();
}
