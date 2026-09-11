// Capacitor 네이티브 쉘 브릿지 — shell-kit 표준 (mapix/onp 이식).
// 원격 URL 모드라 이 코드는 옛 바이너리(iOS 1.0.x·1.1(6), 안드로이드 1.0.2)와 새 바이너리에서 동시에 돈다.
// 그래서 네이티브 호출은 전부 hasPlugin(=isNativePlatform + isPluginAvailable)으로 확인하고 try/catch 로 감싼다
// (판별 규칙은 shared/nativeCaps.ts). 웹 브라우저에선 전부 no-op.
//
// 여기서 하는 일(모두 앱 부팅 때 main.tsx 가 initNativeBridge 를 한 번 부른다):
//  - 안드로이드 하드웨어 뒤로가기
//  - 오프라인 안내 페이지에서 돌아왔을 때(?resume=1) 보던 화면으로 복귀 (감사 C8)
//  - 딥링크(App Links·Universal Links·rankue:// 스킴)를 라우터 이동으로 (감사 N5)
//  - 푸시: 리스너·안드로이드 채널·이미 허용된 기기만 등록. 권한 창은 여기서 띄우지 않는다(감사 P3·L6) —
//    로그인한 뒤 PushPermissionSheet 가 무엇을 알려 주는지 설명하고 묻는다.

import { App } from "@capacitor/app";
import { PushNotifications, type PushNotificationSchema, type ActionPerformed, type Token } from "@capacitor/push-notifications";
import { navigate } from "wouter/use-browser-location";
import { apiRequest } from "@/lib/queryClient";
import { hasPlugin, isNative, nativeSupports, platform } from "@shared/nativeCaps";
import { deepLinkToPath, LAST_PATH_KEY, resumeTarget, sanitizeInternalPath, type SavedPath } from "@shared/deepLink";
import { androidStoreUrl, iosStoreUrl } from "@shared/appLinks";

export function isNativeApp(): boolean {
    return isNative();
}

export function nativePlatform(): string | null {
    return isNative() ? platform() : null;
}

function storageGet(store: "local" | "session", key: string): string | null {
    try {
        return (store === "local" ? localStorage : sessionStorage).getItem(key);
    } catch {
        return null;
    }
}

function storageSet(store: "local" | "session", key: string, value: string | null): void {
    try {
        const s = store === "local" ? localStorage : sessionStorage;
        if (value === null) s.removeItem(key);
        else s.setItem(key, value);
    } catch { /* 저장소를 못 쓰는 환경 */ }
}

// ── 앱 안 이동 ─────────────────────────────────────────────────────────────

/**
 * 라우터(wouter)로 이동한다 — 원격 URL 모드에서 location.href 는 페이지 전체를 다시 받아 온다(감사 P15).
 * 내부 경로가 아니면 무시하고, 이미 그 주소면 아무것도 하지 않는다.
 */
export function navigateInApp(path: string, replace = false): void {
    const safe = sanitizeInternalPath(path);
    if (!safe) return;
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (here === safe) return;
    navigate(safe, { replace });
}

/** 이 기기의 스토어 페이지를 연다. 외부 주소로의 최상위 이동은 Capacitor 가 스토어 앱으로 넘긴다(옛 바이너리 포함). */
export function openStorePage(): void {
    const p = platform();
    const url = p === "ios" ? iosStoreUrl("install_banner") : p === "android" ? androidStoreUrl("install_banner") : null;
    if (url) window.location.href = url;
}

// ── 푸시 토큰 ─────────────────────────────────────────────────────────────
// 규약(서버와 합의): 토큰은 `${접두사}:${토큰}` 로 localStorage 'fcm_token' 에 둔다. iOS 는 APNs 토큰이라 apns:,
// 안드로이드는 FCM 토큰이라 fcm: — 무조건 fcm: 을 붙이면 iOS 토큰이 FCM 으로 가서 실패한다.
// 서버 저장(/api/hiq/push-token)은 로그인 상태에서만 된다. 로그인 전에 받은 토큰은 여기 남아 있다가
// 로그인이 확인되면(App.tsx 의 /api/hiq/me 확인) 다시 보낸다 — 예전엔 이 저장이 없어 신규 가입자 토큰이 버려졌다.

const PUSH_TOKEN_KEY = "fcm_token";

export function storedPushToken(): string | null {
    return storageGet("local", PUSH_TOKEN_KEY);
}

/** 로그아웃 뒤 호출 — 다음에 이 기기로 로그인한 사람에게 이전 계정 토큰이 붙지 않게. */
export function forgetPushToken(): void {
    storageSet("local", PUSH_TOKEN_KEY, null);
}

/**
 * 저장된 토큰을 서버에 등록한다. 미인증(401)·네트워크 오류는 조용히 무시한다 — 로그인·부팅 때 다시 불린다.
 * 서버 저장이 upsert 라 반복 호출해도 괜찮다.
 */
export async function syncPushToken(): Promise<void> {
    const token = storedPushToken();
    if (!token) return;
    try {
        await apiRequest("/api/hiq/push-token", { method: "POST", body: { token } });
    } catch { /* 다음 인증 시점에 재시도 */ }
}

// ── 푸시 권한 ─────────────────────────────────────────────────────────────

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

function toPushPermission(receive: string | undefined): PushPermission {
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    // 안드로이드는 한 번 거부하면 'prompt-with-rationale' — 아직 한 번 더 물을 수 있다는 뜻이다
    if (receive === "prompt" || receive === "prompt-with-rationale") return "prompt";
    return "unsupported";
}

export async function pushPermission(): Promise<PushPermission> {
    if (!hasPlugin("PushNotifications")) return "unsupported";
    try {
        return toPushPermission((await PushNotifications.checkPermissions()).receive);
    } catch {
        return "unsupported";
    }
}

// registration 리스너가 붙기 전에 register() 하면 토큰 이벤트를 놓친다 — 등록은 늘 이걸 기다린다.
let pushListenersReady: Promise<void> = Promise.resolve();

async function registerForPush(): Promise<void> {
    await pushListenersReady;
    try {
        await PushNotifications.register();
    } catch (err) {
        console.warn("[push] register failed:", err);
    }
}

/** OS 권한 창을 띄운다. 허용되면 바로 등록까지. 사용자가 버튼을 눌렀을 때만 부른다. */
export async function requestPushPermission(): Promise<PushPermission> {
    if (!hasPlugin("PushNotifications")) return "unsupported";
    try {
        const perm = toPushPermission((await PushNotifications.requestPermissions()).receive);
        if (perm === "granted") await registerForPush();
        return perm;
    } catch {
        return "unsupported";
    }
}

/**
 * 로그인이 확인됐을 때 부른다. 같은 세션에서 로그아웃 → 다른 계정으로 로그인하면 저장 토큰이 지워져 있다 —
 * 이미 허용된 기기면 register() 로 토큰 이벤트를 다시 받아 새 계정에 붙인다.
 */
export async function ensurePushRegistered(): Promise<void> {
    if (storedPushToken()) return;
    if ((await pushPermission()) === "granted") await registerForPush();
}

// iOS 는 플러그인 없이 'app-settings:'(= UIApplication.openSettingsURLString)로 최상위 이동하면 된다 —
// Capacitor 가 앱 주소가 아닌 최상위 이동을 UIApplication.shared.open 으로 넘겨 이 앱의 설정 화면(알림 항목 포함)이 열린다.
// 옛 바이너리(Capacitor 7)도 같은 처리라 모든 iOS 앱에서 된다. capacitor-native-settings 는 애플 비공개 설정 주소
// (App-prefs:…) 30여 개를 바이너리에 박아 심사 거절(2.5.1) 위험이 있어 iOS 빌드에서 뺐다(capacitor.config ios.includePlugins).
export function canOpenNotificationSettings(): boolean {
    if (platform() === "ios") return true;
    return nativeSupports("openSettings");
}

/** 앱 알림 설정 화면을 연다(거부한 사람의 유일한 복구 경로 — iOS 는 한 번 거부하면 다시 물을 수 없다). */
export async function openNotificationSettings(): Promise<boolean> {
    if (!canOpenNotificationSettings()) return false;
    if (platform() === "ios") {
        try {
            window.location.href = "app-settings:";
            return true;
        } catch {
            return false;
        }
    }
    try {
        const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings");
        const r = await NativeSettings.open({ optionAndroid: AndroidSettings.AppNotification, optionIOS: IOSSettings.AppNotification });
        if (r?.status) return true;
        // 알림 설정 화면을 못 여는 기기면 앱 정보 화면이라도
        const r2 = await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
        return !!r2?.status;
    } catch {
        return false;
    }
}

// ── 앱을 보는 중에 온 푸시 ────────────────────────────────────────────────
// 2세대 바이너리는 capacitor.config presentationOptions 로 OS 가 배너를 띄운다. 옛 바이너리는 조용히 버리므로
// 화면(PushPermissionSheet)이 넣어 준 처리기로 토스트를 띄운다. 둘 다 띄우면 두 번 뜬다.

export type ForegroundPush = { title?: string; body?: string; url: string | null };
let foregroundHandler: ((push: ForegroundPush) => void) | null = null;

export function setForegroundPushHandler(fn: ((push: ForegroundPush) => void) | null): void {
    foregroundHandler = fn;
}

function isCurrentPage(path: string): boolean {
    try {
        return new URL(path, window.location.origin).pathname === window.location.pathname;
    } catch {
        return false;
    }
}

function payloadUrl(data: unknown): string | null {
    // APNs 는 루트 url, FCM 은 data.url — 플러그인이 둘 다 notification.data.url 로 넘긴다
    return sanitizeInternalPath((data as { url?: unknown } | undefined)?.url);
}

// 안드로이드 기본 채널. 서버가 이 id 로 보낸다(규약). 중요도 4 = 헤드업 팝업, 소리는 기본 알림음.
const ANDROID_CHANNEL_ID = "rankue_default";

async function ensureAndroidChannel(): Promise<void> {
    try {
        await PushNotifications.createChannel({
            id: ANDROID_CHANNEL_ID,
            name: "랭큐 알림",
            importance: 4,
            visibility: 1,
            // 플러그인 기본값이 진동 꺼짐이라 명시한다
            vibration: true,
        });
    } catch (err) {
        console.warn("[push] createChannel failed:", err);
        return;
    }
    // 채널이 생기기 전 받은 푸시가 만든 FCM 폴백 채널(영문 'Miscellaneous')은 앱 알림 설정에 계속 남는다 — 치운다(감사 P7 검증)
    try {
        await PushNotifications.deleteChannel({ id: "fcm_fallback_notification_channel" });
    } catch { /* 없으면 그만 */ }
}

let pushInitStarted = false;

function initNativePush(): void {
    if (pushInitStarted || !hasPlugin("PushNotifications")) return;
    pushInitStarted = true;
    const settle = (p: Promise<unknown>) => p.then(() => undefined, (err) => console.warn("[push] addListener failed:", err));
    try {
        pushListenersReady = Promise.all([
            settle(PushNotifications.addListener("registration", (t: Token) => {
                if (!t?.value) return;
                const prefix = platform() === "ios" ? "apns" : "fcm";
                storageSet("local", PUSH_TOKEN_KEY, `${prefix}:${t.value}`);
                void syncPushToken();
            })),
            settle(PushNotifications.addListener("registrationError", (err) => {
                console.warn("[push] registration error:", err?.error);
            })),
            // 알림 탭 → 페이로드 url. 권한과 무관하게 먼저 붙인다 — 트레이에 남은 알림은 권한이 바뀌어도 눌린다(감사 P15).
            settle(PushNotifications.addListener("pushNotificationActionPerformed", (ev: ActionPerformed) => {
                const url = payloadUrl(ev?.notification?.data);
                if (url) navigateInApp(url);
            })),
            settle(PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
                if (nativeSupports("osForegroundBanner")) return;
                const url = payloadUrl(n?.data);
                if (url && isCurrentPage(url)) return; // 그 화면을 이미 보고 있다
                foregroundHandler?.({ title: n?.title, body: n?.body, url });
            })),
        ]).then(() => undefined);
    } catch (err) {
        console.warn("[push] listener setup failed:", err);
    }
    if (platform() === "android") void ensureAndroidChannel();
    // 이미 허용된 기기만 조용히 등록한다. 'prompt' 면 아무것도 하지 않는다 — 부팅 때 권한 창을 띄우지 않는다.
    void (async () => {
        if ((await pushPermission()) === "granted") await registerForPush();
    })();
}

// ── 딥링크 ────────────────────────────────────────────────────────────────

// 이번 앱 세션에 이미 처리한 링크들. getLaunchUrl 은 웹뷰가 다시 로드될 때마다(오프라인 복귀, 결과 화면의 reload,
// iOS 웹 프로세스가 죽어 Capacitor 가 자동 reload) 또 불리는데, 돌려주는 값이 플랫폼마다 다르다:
//  - 안드로이드: 앱을 처음 켠 링크(콜드 스타트 intent)를 계속 준다.
//  - iOS: '가장 최근에 앱을 연 링크'를 준다 — 앱이 켜진 채 appUrlOpen 으로 받은 링크도 여기로 돌아온다.
// 그래서 어느 경로로 왔든 처리한 링크는 모두 적어 두고, getLaunchUrl 이 준 값이 그중 하나면 무시한다.
// 하나만 적으면 안드로이드에서 '처음 링크 A → 나중 링크 B' 뒤 reload 때 A 로 끌려간다. sessionStorage 는 앱을 새로 켜면 비워진다.
const HANDLED_LINKS_KEY = "rankue_handled_links";
const HANDLED_LINKS_MAX = 20;
let lastLink = { url: "", at: 0 };

function handledLinks(): string[] {
    try {
        const v = JSON.parse(storageGet("session", HANDLED_LINKS_KEY) ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function markLinkHandled(url: string): void {
    const list = handledLinks().filter((x) => x !== url);
    list.push(url);
    storageSet("session", HANDLED_LINKS_KEY, JSON.stringify(list.slice(-HANDLED_LINKS_MAX)));
}

function openDeepLink(url: string | undefined, replace: boolean): void {
    if (!url) return;
    markLinkHandled(url);
    // 콜드 스타트엔 getLaunchUrl 과 appUrlOpen 이 같은 URL 로 둘 다 온다
    const now = Date.now();
    if (url === lastLink.url && now - lastLink.at < 3000) return;
    lastLink = { url, at: now };
    // 우리 주소가 아니면(구글 로그인 복귀 같은 다른 스킴) 건드리지 않는다
    const path = deepLinkToPath(url);
    if (path) navigateInApp(path, replace);
}

function initDeepLinks(): void {
    if (!hasPlugin("App")) return;
    // appUrlOpen 은 늘 사용자가 방금 누른 링크다 — 전에 처리한 링크라도 다시 누르면 다시 간다.
    App.addListener("appUrlOpen", (e) => openDeepLink(e?.url, false)).catch(() => { /* 무시 */ });
    void (async () => {
        try {
            const url = (await App.getLaunchUrl())?.url;
            if (!url) return;
            if (handledLinks().includes(url)) return;
            openDeepLink(url, true);
        } catch { /* 옛 바이너리·미지원 */ }
    })();
}

// ── 오프라인 복귀 ──────────────────────────────────────────────────────────
// 네이티브 오프라인 안내 페이지(native-shell/index.html, 바이너리 고정)는 다른 오리진이라 우리 localStorage 를 못 읽는다.
// 그래서 연결이 돌아오면 https://www.rankue.co.kr/?resume=1 로만 돌아온다. 보던 주소는 여기서 늘 적어 두고,
// ?resume=1 로 부팅하면 1시간 안의 기록으로 되돌린다(경기 중 끊겼다 돌아와도 점수판으로).

function rememberRoute(): void {
    const { pathname, search } = window.location;
    if (/[?&]resume=1(?:&|$)/.test(search)) return;
    storageSet("local", LAST_PATH_KEY, JSON.stringify({ path: pathname + search, at: Date.now() }));
}

function readSavedPath(): SavedPath | null {
    try {
        return JSON.parse(storageGet("local", LAST_PATH_KEY) ?? "null") as SavedPath | null;
    } catch {
        return null;
    }
}

/** 첫 렌더 전에 불러야 한다 — 그래야 랜딩이 한 번 그려졌다 바뀌는 깜빡임이 없다. */
function applyOfflineResume(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "1") return;
    params.delete("resume");
    const qs = params.toString();
    const stripped = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    const target = window.location.pathname === "/" ? resumeTarget(readSavedPath(), Date.now()) : null;
    try {
        window.history.replaceState(window.history.state, "", target ?? stripped);
    } catch { /* 무시 */ }
}

function initRouteMemory(): void {
    applyOfflineResume();
    // wouter 는 pushState/replaceState 를 감싸 같은 이름의 이벤트를 쏜다 — 라우터 밖에서도 이동을 알 수 있다
    for (const ev of ["pushState", "replaceState", "popstate"]) window.addEventListener(ev, rememberRoute);
    // 이동 시각만 적으면 한 화면에 1시간 넘게 있다 끊긴 경우를 놓친다 — 떠나는 순간에도 시각을 새로 적는다
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") rememberRoute();
    });
    window.addEventListener("pagehide", rememberRoute);
    window.addEventListener("offline", rememberRoute);
    rememberRoute();
}

// ── 진입점 ────────────────────────────────────────────────────────────────

// 앱 진입점(main.tsx)에서 첫 렌더 전에 1회 호출.
export function initNativeBridge(): void {
    if (!isNative()) return;
    if (platform() === "android") document.documentElement.classList.add("native-android");

    // 안드로이드 하드웨어 뒤로가기: 히스토리 있으면 back, 루트면 앱 종료 (wouter는 history API 기반)
    if (hasPlugin("App")) {
        App.addListener("backButton", () => {
            if (window.location.pathname === "/" || window.history.length <= 1) void App.exitApp().catch(() => { /* 무시 */ });
            else window.history.back();
        }).catch(() => { /* 무시 */ });
    }

    initRouteMemory();
    initDeepLinks();
    initNativePush();
}
