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
import { handledLinkKey, LAST_PATH_KEY, openedAppLink, resumeTarget, sanitizeInternalPath, type SavedPath } from "@shared/deepLink";
import { androidStoreUrl, iosStoreUrl } from "@shared/appLinks";
import { EDGE_SWIPE_OFF_PATH, isEdgeSwipeBack, startsAtEdge, type TouchPoint } from "@shared/edgeSwipe";

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

// 적는 것은 주소 원문이 아니라 단방향 키다(2026-10-06 검토) — '앱에서 열기' 토큰이 실린 rankue:// 주소 원문이
// 앱 세션 내내 sessionStorage 에 남아 있었다(토큰은 받는 쪽이 쓰지 않고 버려도 만료까지 살아 있다).
function markLinkHandled(url: string): void {
    const key = handledLinkKey(url);
    const list = handledLinks().filter((x) => x !== key);
    list.push(key);
    storageSet("session", HANDLED_LINKS_KEY, JSON.stringify(list.slice(-HANDLED_LINKS_MAX)));
}

function wasLinkHandled(url: string): boolean {
    const list = handledLinks();
    // 원문 비교는 이 규칙이 실리기 전에 적어 둔 값(같은 앱 세션)을 알아보려는 것뿐이다 — 새로 적는 값은 전부 키다
    return list.includes(handledLinkKey(url)) || list.includes(url);
}

// ── '앱에서 열기' 토큰 ─────────────────────────────────────────────────────
// 웹의 로그인을 넘겨받는 한 번짜리 토큰(shared/loginHandoff)은 주소에 싣지 않고 여기로 건넨다(2026-10-06 검토).
// 받는 쪽(components/hiq/HandoffRedeemer)이 한 번 꺼내 가면 비워진다. 저장소에는 적지 않는다(이 모듈의 변수에만).
let deliveredHandoff: string | null = null;
const handoffListeners = new Set<() => void>();

/** 받아 둔 '앱에서 열기' 토큰을 꺼낸다 — 한 번 꺼내면 비워진다. 없으면 null. */
export function takeDeliveredHandoff(): string | null {
    const token = deliveredHandoff;
    deliveredHandoff = null;
    return token;
}

/** 토큰이 도착할 때마다 부른다. 돌려주는 함수로 끊는다. */
export function onHandoffDelivered(listener: () => void): () => void {
    handoffListeners.add(listener);
    return () => { handoffListeners.delete(listener); };
}

function openDeepLink(url: string | undefined, replace: boolean): void {
    if (!url) return;
    markLinkHandled(url);
    // 콜드 스타트엔 getLaunchUrl 과 appUrlOpen 이 같은 URL 로 둘 다 온다
    const now = Date.now();
    if (url === lastLink.url && now - lastLink.at < 3000) return;
    lastLink = { url, at: now };
    // 우리 주소가 아니면(구글 로그인 복귀 같은 다른 스킴) 건드리지 않는다.
    // '앱에서 열기' 토큰은 경로에서 떼고, 커스텀 스킴(rankue://)으로 온 것만 받는 쪽에 건넨다(shared/deepLink openedAppLink)
    const { path, handoff } = openedAppLink(url);
    if (!path) return;
    if (handoff) {
        deliveredHandoff = handoff;
        handoffListeners.forEach((l) => l());
    }
    navigateInApp(path, replace);
}

function initDeepLinks(): void {
    if (!hasPlugin("App")) return;
    // appUrlOpen 은 늘 사용자가 방금 누른 링크다 — 전에 처리한 링크라도 다시 누르면 다시 간다.
    App.addListener("appUrlOpen", (e) => openDeepLink(e?.url, false)).catch(() => { /* 무시 */ });
    void (async () => {
        try {
            const url = (await App.getLaunchUrl())?.url;
            if (!url) return;
            if (wasLinkHandled(url)) return;
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
/**
 * 하드웨어 뒤로가기 가로채기(2026-09-26 검토): 온라인게임 도중 뒤로가기·가장자리 스와이프 한 번에 확인 없이 화면을 떠나
 * 기록 중인 싱글 경기가 '중단'으로 닫혔다. 화면이 핸들러를 걸면 뒤로가기가 먼저 그쪽으로 간다 — true 를 돌려주면 처리 끝.
 * 한 번에 하나만(마지막에 건 것). 화면이 떠날 때 null 로 푼다.
 */
let backHandler: (() => boolean) | null = null;
export function setBackHandler(fn: (() => boolean) | null): void {
    backHandler = fn;
}

/**
 * 겹쳐 거는 뒤로가기 핸들러(2026-10-06 검토) — 떠 있는 팝업(가입·로그인 시트)이 화면보다 **먼저** '뒤로'를 받는다.
 * setBackHandler 는 한 칸짜리라 팝업이 그 칸을 쓰면 게임 화면이 걸어 둔 '나가기 확인'이 지워진다(게임 화면에서도 가입 팝업이 열린다).
 * 그래서 팝업은 따로 쌓는다: 맨 나중에 건 것부터 묻고, true 를 돌려주면 처리 끝. 돌려주는 함수로 자기 것만 푼다.
 */
const backLayers: Array<() => boolean> = [];
export function pushBackHandler(fn: () => boolean): () => void {
    backLayers.push(fn);
    return () => {
        const at = backLayers.lastIndexOf(fn);
        if (at !== -1) backLayers.splice(at, 1);
    };
}

/** '뒤로'를 먼저 받는 것들 — 떠 있는 팝업(맨 나중에 건 것부터) → 화면이 건 핸들러. 누가 처리했으면 true */
function runBackHandlers(): boolean {
    for (let i = backLayers.length - 1; i >= 0; i--) {
        if (backLayers[i]()) return true;
    }
    return !!backHandler && backHandler();
}

/**
 * 아이폰 — 왼쪽 가장자리를 오른쪽으로 밀면 '뒤로'(2026-10-08, shared/edgeSwipe 머리말).
 * 아이폰에는 하드웨어 뒤로가기가 없고 웹뷰의 가장자리 밀기도 꺼져 있다 — 뒤로 단추가 없는 화면에서는 갇혔다.
 * 안드로이드 하드웨어 뒤로가기와 같은 길을 탄다: 팝업·화면 핸들러가 먼저, 아니면 히스토리 한 칸. 뒤로 갈 곳이 없으면 첫 화면으로.
 * 받지 않는 곳: 게임 화면(가장자리에서 시작하는 조작) · 캔버스·슬라이더 · 가로로 밀려 있는 목록(그건 목록을 되감는 손짓이다) · data-noswipe.
 */
/**
 * 히스토리 한 칸 뒤로. 아무 일도 없으면(이 화면이 앱의 첫 화면이다 — 링크로 바로 들어왔거나, 껐다 켜며 이 화면으로 돌아왔다)
 * 첫 화면으로 보낸다. 밀어서 뒤로와, 탭도 헤더도 없는 문서 화면의 뒤로 단추(components/hiq/DocBack)가 같이 쓴다.
 */
export function backOrHome(): void {
    const before = window.location.href;
    let moved = false;
    const onPop = () => { moved = true; };
    window.addEventListener("popstate", onPop, { once: true });
    window.history.back();
    window.setTimeout(() => {
        window.removeEventListener("popstate", onPop);
        if (!moved && window.location.href === before && window.location.pathname !== "/") navigate("/", { replace: true });
    }, 450);
}

function initEdgeSwipeBack(): void {
    let start: TouchPoint | null = null;
    const blocked = (target: EventTarget | null): boolean => {
        if (EDGE_SWIPE_OFF_PATH.test(window.location.pathname)) return true;
        let el = target instanceof Element ? target : null;
        if (el?.closest("[data-noswipe], canvas, input[type=range], [role=slider]")) return true;
        for (; el && el !== document.body; el = el.parentElement) {
            if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth + 4) return true;
        }
        return false;
    };
    window.addEventListener("touchstart", (e) => {
        const t = e.touches.length === 1 ? e.touches[0] : null;
        start = t && startsAtEdge(t.clientX) && !blocked(e.target) ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    }, { passive: true });
    window.addEventListener("touchcancel", () => { start = null; }, { passive: true });
    window.addEventListener("touchend", (e) => {
        const from = start; start = null;
        const t = e.changedTouches[0];
        if (!from || !t || !isEdgeSwipeBack(from, { x: t.clientX, y: t.clientY, t: Date.now() })) return;
        if (runBackHandlers()) return;
        backOrHome();
    }, { passive: true });
}

export function initNativeBridge(): void {
    if (!isNative()) return;
    if (platform() === "android") document.documentElement.classList.add("native-android");

    // 안드로이드 하드웨어 뒤로가기: 떠 있는 팝업 → 화면이 건 핸들러 → 뒤로 갈 곳이 있으면 back, 없으면 앱 종료 (wouter는 history API 기반)
    if (hasPlugin("App")) {
        App.addListener("backButton", (e) => {
            if (runBackHandlers()) return;
            // '뒤로 갈 곳이 있는가'는 웹뷰가 알려 준 값(canGoBack = WebView.canGoBack)으로 본다(2026-10-06 검토).
            // 예전에는 주소가 '/' 이면 무조건 종료였다 — 로그인 화면이 앱의 첫 화면(뿌리)일 때의 규칙이다. 이제 비로그인은 예시 홈에서
            // 시작해 로그인 화면(/?login=1…)으로 **들어오므로**, 거기서 '뒤로'는 종료가 아니라 예시 홈으로 돌아가야 한다.
            // history.length 는 뒤로 가도 줄지 않아 뿌리 판단에 못 쓴다. 값을 못 받는 바이너리에서만 옛 판단으로 떨어진다.
            const canGoBack = typeof e?.canGoBack === "boolean"
                ? e.canGoBack
                : !(window.location.pathname === "/" || window.history.length <= 1);
            if (!canGoBack) void App.exitApp().catch(() => { /* 무시 */ });
            else window.history.back();
        }).catch(() => { /* 무시 */ });
    }

    if (platform() === "ios") initEdgeSwipeBack();
    initRouteMemory();
    initDeepLinks();
    initNativePush();
}
