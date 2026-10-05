/**
 * 앱 설치 팝업의 규칙 — 누구에게 · 언제 · 어느 화면에서 띄우는가.
 * 2026-10-06 오너: "지금 웹 가입 사람이 많은데 웹으로 진입 시 기기에 따른 앱 설치 팝업창 잘 디자인해서 만들어줘. 지금 팝업보다 잘." · "앱에서 열기도."
 *
 * 예전의 떠 있는 띠(HiqInstallBanner)는 들어오자마자 떴고, 닫아도 기억하지 않아 화면을 옮길 때마다 다시 떴고,
 * 점수판·가입 화면까지 덮었다. 여기서 그 셋을 규칙으로 못 박는다:
 *   · 들어오자마자 띄우지 않는다 — 이 방문에서 화면을 2번 이상 보았거나 20초 넘게 머문 뒤.
 *   · 닫으면 7일, 세 번 닫으면 30일, 스토어 단추를 눌렀으면 14일 쉰다.
 *   · 앱 안 · 홈 화면에 추가한 웹앱 · 막는 주소(경기 중 · 게임 · 로그인/가입 · 바닥에 다른 줄이 있는 화면)에서는 안 띄운다.
 *   · PC 에서 옆 패널의 설치 구역(QR · 스토어 단추)이 보이는 동안은 스스로 띄우지 않는다(받으러 온 ?install=1 은 띄운다).
 *
 * 여기에는 순수 함수와 숫자만 둔다(화면 번들에도 실린다). 화면은 components/hiq/AppInstallSheet,
 * 시험은 shared/installPrompt.test.ts. 주소 목록은 이 파일 **한 곳**에만 둔다 — App.tsx 의 게이트는 주소를 건네기만 한다.
 */
import { WEB_URL } from "./appLinks.js";
import { HANDOFF_ANDROID_PACKAGE, HANDOFF_SCHEME } from "./loginHandoff.js";

/* ── 기기 ─────────────────────────────────────────────────────────────── */

export type InstallDevice = "ios" | "android" | "desktop";

export interface DeviceHints {
    /** navigator.maxTouchPoints — 아이패드는 맥 UA 를 보내지만 터치 점이 여럿이다(맥은 0) */
    maxTouchPoints?: number | null;
    /** navigator.standalone — iOS 웹킷에만 있는 칸. 터치 점 수를 모를 때만 본다(칸이 있으면 애플 터치 기기) */
    standalone?: boolean | null;
}

/**
 * 스토어 단추를 고르는 기기 판별. 아이폰에 Play 를, 안드로이드에 App Store 를 주지 않으려는 것이다.
 * PC 는 "desktop" — 스토어로 보내도 깔 수 없으니 QR 을 준다.
 */
export function installDevice(ua: unknown, hints: DeviceHints = {}): InstallDevice {
    const s = typeof ua === "string" ? ua : "";
    if (/android/i.test(s)) return "android";
    if (/iphone|ipad|ipod/i.test(s)) return "ios";
    if (/macintosh/i.test(s)) {
        // iPadOS 13+ 는 맥인 척한다 — 터치로 가른다
        const touch = hints.maxTouchPoints;
        if (typeof touch === "number") return touch > 1 ? "ios" : "desktop";
        if (typeof hints.standalone === "boolean") return "ios";
    }
    return "desktop";
}

/** 대소문자를 가리지 않아도 되는 표식. '; wv)' 는 안드로이드 웹뷰가 붙인다 */
const IN_APP_ANY_CASE = /kakaotalk|naver\(inapp|instagram|fban|fbav|;\s*wv\)/i;
/** 라인은 'Line/버전' — 대소문자를 풀면 다른 낱말과 섞일 수 있어 그대로 본다 */
const IN_APP_LINE = /(?:^|[\s;(])Line\//;

/**
 * 다른 앱 안의 브라우저인가(카카오톡 · 네이버 · 인스타그램 · 페이스북 · 라인 · 안드로이드 웹뷰).
 * **표시 문구가 아니라 동작 선택에만** 쓴다 — 스토어 링크를 새 창이 아니라 그 자리에서 연다(인앱 웹뷰는 새 창을 막거나 버린다).
 */
export function isInAppBrowser(ua: unknown): boolean {
    const s = typeof ua === "string" ? ua : "";
    return IN_APP_ANY_CASE.test(s) || IN_APP_LINE.test(s);
}

/* ── 막는 주소 ─────────────────────────────────────────────────────────── */

/** 이 주소 그대로일 때만 — 로그인 화면(그냥 연 비로그인은 예시 홈으로 넘어간다) */
const BLOCKED_EXACT = ["/", "/hiq"] as const;

/** 이 주소와 그 아래 전부('/game' 은 '/game/12' 와 맞고 '/games' 와는 안 맞는다) */
const BLOCKED_UNDER = [
    // 가입 · 카카오에서 돌아오는 화면 · 약관류 — 폼을 덮거나 읽던 글을 끊는다
    "/register", "/auth", "/terms", "/privacy", "/support", "/account-delete",
    // 점수판 · 경기 결과 · 골프 스코어카드 — 경기 중인 사람을 가로막지 않는다
    "/game", "/golf/game",
    // 온라인게임 · 골프 아크/레인지 · 필드/미니골프 — 화면 아래가 조작부다(2026-09-07 · 09-15 실측: 샷 단추 · 스윙 패드를 덮었다)
    "/online-game", "/golf/arcade", "/golf/range", "/golf/play", "/golf/minigolf",
    // 공개 골프 페이지(CourseShell) — 비로그인에게 바닥에 '로그인하고 취소티 알림 받기' 줄을 깐다. 한 화면에 바닥 권유 둘은 소음이다.
    // '/golf/booking' 은 '/golf/booking-list' 와 맞지 않는다(회원 화면).
    "/golf/course", "/golf/courses", "/golf/booking", "/golf/join", "/golf/urgent",
    "/golf/checklist", "/golf/terms", "/golf/find",
    // 초대 수락(바닥 단추) · 운영 콘솔 · 등록 폼
    "/join", "/admin", "/partner", "/stores/register", "/club/create",
] as const;

/** 질의 · 해시 · 끝의 '/' 를 뗀 경로 */
function barePath(path: unknown): string {
    const s = typeof path === "string" ? path : "";
    const p = s.split(/[?#]/)[0] || "/";
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/**
 * 그 화면이 곧 로그인 · 가입인 주소('/' · '/hiq' · '/register' · '/auth/…').
 * 여기서 넘어온 직후의 회원은 방금 로그인한 사람이다 — 화면이 그 순간부터 잠깐 쉰다(QUIET_AFTER_LOGIN_SECONDS).
 */
export function isLoginScreenPath(path: unknown): boolean {
    const p = barePath(path);
    return p === "/" || p === "/hiq" || ["/register", "/auth"].some((b) => p === b || p.startsWith(b + "/"));
}

/** 이 주소에서는 설치 팝업을 띄우지 않는다. */
export function isPromptBlockedPath(path: unknown): boolean {
    const p = barePath(path);
    if (!p.startsWith("/")) return true;
    if ((BLOCKED_EXACT as readonly string[]).includes(p)) return true;
    if (BLOCKED_UNDER.some((b) => p === b || p.startsWith(b + "/"))) return true;
    // 채팅방(바닥이 입력칸이다). 채팅 목록('/chat')은 띄워도 된다
    return p.startsWith("/chat/");
}

/* ── 쉬는 기간 ─────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;
/** 닫으면 이만큼 쉰다 */
export const REST_AFTER_DISMISS_DAYS = 7;
/** 이만큼 닫았으면 더 길게 쉰다 */
export const MANY_DISMISSALS = 3;
export const REST_AFTER_MANY_DISMISSALS_DAYS = 30;
/** 스토어 단추를 눌렀으면 — 깔았을 사람이다. 그 뒤에도 웹으로 오면 그때 다시 */
export const REST_AFTER_STORE_DAYS = 14;

/** 기기에 적어 두는 것(localStorage). 시각은 ms. */
export interface PromptRecord {
    lastDismissedAt: number | null;
    dismissCount: number;
    lastStoreClickAt: number | null;
}

export const EMPTY_RECORD: PromptRecord = { lastDismissedAt: null, dismissCount: 0, lastStoreClickAt: null };

const asTime = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** 저장된 글자를 읽는다 — 깨졌거나 없으면 빈 기록(처음 온 사람처럼). */
export function parsePromptRecord(raw: unknown): PromptRecord {
    if (typeof raw !== "string" || !raw) return EMPTY_RECORD;
    try {
        const o = JSON.parse(raw) as { d?: unknown; n?: unknown; s?: unknown } | null;
        if (!o || typeof o !== "object") return EMPTY_RECORD;
        const n = typeof o.n === "number" && Number.isFinite(o.n) ? Math.max(0, Math.floor(o.n)) : 0;
        return { lastDismissedAt: asTime(o.d), dismissCount: n, lastStoreClickAt: asTime(o.s) };
    } catch {
        return EMPTY_RECORD;
    }
}

export function serializePromptRecord(r: PromptRecord): string {
    return JSON.stringify({ d: r.lastDismissedAt, n: r.dismissCount, s: r.lastStoreClickAt });
}

/** 닫았다(바깥 탭 · X · 끌어내림 · '웹으로 계속 볼게요' · 화면을 떠남). */
export function recordAfterDismiss(r: PromptRecord, now: number): PromptRecord {
    return { ...r, lastDismissedAt: now, dismissCount: r.dismissCount + 1 };
}

/** 스토어 단추를 눌렀다. 닫은 횟수에는 넣지 않는다. */
export function recordAfterStoreClick(r: PromptRecord, now: number): PromptRecord {
    return { ...r, lastStoreClickAt: now };
}

/**
 * 이 시각까지 쉰다(ms). 쉴 일이 없으면 0.
 * 미래 시각(기기 시계를 돌렸다)은 없는 것으로 본다 — 그대로 믿으면 시계를 되돌린 뒤 영영 안 뜬다.
 */
export function restUntil(r: Pick<PromptRecord, "lastDismissedAt" | "dismissCount" | "lastStoreClickAt">, now: number): number {
    let until = 0;
    const d = r.lastDismissedAt;
    if (d != null && d <= now) {
        const days = r.dismissCount >= MANY_DISMISSALS ? REST_AFTER_MANY_DISMISSALS_DAYS : REST_AFTER_DISMISS_DAYS;
        until = Math.max(until, d + days * DAY_MS);
    }
    const s = r.lastStoreClickAt;
    if (s != null && s <= now) until = Math.max(until, s + REST_AFTER_STORE_DAYS * DAY_MS);
    return until;
}

/* ── 이 방문에서 본 것 ─────────────────────────────────────────────────── */

/** 이 방문(탭)에서 화면을 이만큼 보았거나 */
export const PROMPT_MIN_PAGES = 2;
/** 이 초를 넘겨 머문 뒤에 띄운다 */
export const PROMPT_MIN_SECONDS = 20;
/** 화면이 바뀐 직후에는 띄우지 않는다 — 새 화면이 그려지는 동안 팝업이 덮으면 '들어오자마자'와 같다 */
export const PROMPT_SETTLE_SECONDS = 3;
/**
 * 가입 팝업이 닫힌 뒤 · 방금 로그인한 뒤 이만큼은 띄우지 않는다 — 팝업을 닫자마자, 가입을 마치자마자 다른 팝업이 올라오지 않게
 * (가입 직후에는 약관 동의 · 주 종목 묻기가 이미 차례로 뜬다).
 */
export const QUIET_AFTER_LOGIN_SECONDS = 60;

/** 이 방문(탭)에서 센 것(sessionStorage). 막는 주소에서 보낸 시간 · 본 화면은 세지 않는다. */
export interface InstallVisit {
    /** 권유할 수 있는 화면을 **보고 있던** 시간(초) — 탭이 가려진 동안은 흐르지 않는다 */
    seconds: number;
    /** 권유할 수 있는 화면을 본 횟수 */
    pages: number;
    /** 마지막으로 본 경로(막는 주소 포함) — 같은 화면을 두 번 세지 않으려고 */
    lastPath: string | null;
    /** 이 방문에서 이미 한 번 띄웠다 — 한 방문에 한 번만 */
    shown: boolean;
}

export const EMPTY_VISIT: InstallVisit = { seconds: 0, pages: 0, lastPath: null, shown: false };

export function parseVisit(raw: unknown): InstallVisit {
    if (typeof raw !== "string" || !raw) return EMPTY_VISIT;
    try {
        const o = JSON.parse(raw) as Partial<InstallVisit> | null;
        if (!o || typeof o !== "object") return EMPTY_VISIT;
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
        return {
            seconds: num(o.seconds),
            pages: num(o.pages),
            lastPath: typeof o.lastPath === "string" ? o.lastPath : null,
            shown: o.shown === true,
        };
    } catch {
        return EMPTY_VISIT;
    }
}

/**
 * 화면(경로)이 바뀌었다. 같은 경로가 이어지면(질의만 바뀜 · 다시 그림) 세지 않는다.
 * 막는 주소는 '본 화면'에 넣지 않는다 — 맨 '/' 를 연 비로그인은 곧바로 예시 홈으로 넘어가는데, 그 한 번의 넘어감을
 * 화면 두 번으로 세면 들어오자마자 뜬다. 가입 화면에서 보낸 시간도 같은 이유로 세지 않는다(가입 직후에 덮지 않게).
 */
export function visitAfterPath(v: InstallVisit, path: unknown): InstallVisit {
    const p = barePath(path);
    if (p === v.lastPath) return v;
    return { ...v, lastPath: p, pages: isPromptBlockedPath(p) ? v.pages : v.pages + 1 };
}

/** 1초가 흘렀다 — 탭이 보이고, 권유할 수 있는 화면일 때만 센다. */
export function visitAfterSecond(v: InstallVisit, path: unknown, visible: boolean): InstallVisit {
    if (!visible || isPromptBlockedPath(path)) return v;
    return { ...v, seconds: v.seconds + 1 };
}

/* ── 띄울지 ────────────────────────────────────────────────────────────── */

export interface PromptInput {
    /** 지금 경로 */
    path: string;
    /** 랭큐 앱(Capacitor) 안이다 */
    isNative: boolean;
    /** 홈 화면에 추가한 웹앱으로 열었다 — 사실상 깐 사람이다 */
    standalone: boolean;
    /** 가입 · 로그인 팝업이 열려 있다 */
    loginSheetOpen: boolean;
    /** 가입 팝업이 마지막으로 닫힌 시각 · 방금 로그인한 시각(ms) 가운데 늦은 쪽. 그 직후에는 띄우지 않는다 */
    quietSince?: number | null;
    /** 화면이 바쁘다 — 다른 창이 떠 있다 · 글자를 넣는 중이다 · 본문 끝의 설치 카드가 보인다 · 로그인 확인 중이다 */
    busy?: boolean;
    lastDismissedAt: number | null;
    dismissCount: number;
    lastStoreClickAt: number | null;
    now: number;
    /** 이 방문에서 권유할 수 있는 화면을 보고 있던 시간(초) */
    secondsOnSite: number;
    /** 이 방문에서 본 화면 수 */
    pagesSeen: number;
    /** 지금 화면에 머문 시간(초). 안 주면 충분히 머문 것으로 본다 */
    secondsOnPage?: number;
    /** 이 방문에서 이미 한 번 띄웠다 */
    shownThisVisit?: boolean;
    /** QR 을 찍고 들어온 사람(?install=1) — 앱을 받으러 온 사람이라 기다림 · 쉬는 기간 · '한 방문에 한 번'을 건너뛴다 */
    forced?: boolean;
    /**
     * 같은 화면에 다른 설치 권유가 **늘 붙어** 보인다 — PC 옆 패널(DesktopFrame)의 QR · 스토어 단추(2026-10-06 검토).
     * 스스로 뜨는 팝업만 막는다. busy 와 달리 받으러 온 사람(forced)은 막지 않는다 — 옆 패널은 화면에서 사라지지 않아,
     * busy 로 치면 PC 에서 ?install=1 이 영영 안 뜬다.
     */
    otherInstallVisible?: boolean;
}

/** 지금 설치 팝업을 띄울 것인가. */
export function shouldPrompt(i: PromptInput): boolean {
    // 이미 앱을 쓰는 사람에게 "앱을 받으세요"가 뜨는 사고를 막는다
    if (i.isNative || i.standalone) return false;
    if (isPromptBlockedPath(i.path)) return false;
    // 가입 팝업과 겹치지 않는다. 다른 창이 떠 있거나 입력 중이어도 기다린다
    if (i.loginSheetOpen || i.busy) return false;
    // 받으러 온 사람(QR · 직접 누른 링크)에게는 바로 — 이 방문에서 이미 한 번 봤어도
    if (i.forced) return true;
    // 한 화면에 설치 권유 둘은 소음이다(2026-09-09 오너) — PC 옆 패널의 QR · 스토어 단추가 보이는 동안은 스스로 띄우지 않는다
    if (i.otherInstallVisible) return false;
    if (i.shownThisVisit) return false;
    if (i.quietSince != null && i.now - i.quietSince < QUIET_AFTER_LOGIN_SECONDS * 1000) return false;
    if (i.now < restUntil(i, i.now)) return false;
    if (i.secondsOnPage != null && i.secondsOnPage < PROMPT_SETTLE_SECONDS) return false;
    // 들어오자마자 띄우지 않는다
    return i.pagesSeen >= PROMPT_MIN_PAGES || i.secondsOnSite > PROMPT_MIN_SECONDS;
}

/* ── 무엇을 보여 줄지 ──────────────────────────────────────────────────── */

export type SheetAction = "store" | "open";

export interface SheetPlan {
    /** 띄울 사람인가 */
    show: boolean;
    /** 큰 단추 순서(위 → 아래). "store" = 이 기기의 스토어, "open" = 앱에서 열기. PC 는 비어 있다 */
    actions: SheetAction[];
    /** PC — QR 과 두 스토어 링크 */
    qr: boolean;
    /** "앱에는 카카오 로그인이 아직 없어요…" 한 줄 */
    kakaoNote: boolean;
}

/**
 * 기기 · 로그인 · 가입 수단으로 팝업의 모양을 정한다.
 *   휴대폰 · 비로그인        스토어 단추 하나. '앱에서 열기'는 **없다**(넘겨줄 로그인이 없다).
 *   휴대폰 · 회원            스토어 + "이미 깔았어요 · 앱에서 열기".
 *   휴대폰 · 카카오로만 가입   '앱에서 열기'가 첫째 — 스토어 앱에는 카카오 단추가 없어 깔기만 해서는 자기 계정으로 못 들어간다.
 *                           예전에는 이 회원에게 설치를 권하지 않았다(2026-10-05). '앱에서 열기'가 그 막다른 길을 뚫었다.
 *   PC                      QR + 두 스토어 링크. 카카오로만 가입한 회원에게는 여전히 띄우지 않는다 — PC 에는 '앱에서 열기'가 없다.
 */
export function installSheetPlan(i: { device: InstallDevice; loggedIn: boolean; kakaoOnly: boolean }): SheetPlan {
    const kakaoOnly = i.loggedIn && i.kakaoOnly;
    if (i.device === "desktop") {
        return { show: !kakaoOnly, actions: [], qr: true, kakaoNote: false };
    }
    if (kakaoOnly) return { show: true, actions: ["open", "store"], qr: false, kakaoNote: true };
    return { show: true, actions: i.loggedIn ? ["store", "open"] : ["store"], qr: false, kakaoNote: false };
}

/* ── 앱에서 열기 ───────────────────────────────────────────────────────── */

/** 주소를 연 뒤 이만큼 지나도 화면이 그대로 보이면 앱이 안 열린 것으로 본다(ms) */
export const OPEN_CHECK_MS = 1500;

/**
 * POST /api/hiq/handoff 의 답에서 이 기기가 열 주소를 고른다.
 *   안드로이드 → intent 주소(패키지를 못 박아 다른 앱이 토큰을 받아 가지 못한다. 앱이 없으면 Play 로 간다)
 *   아이폰     → 앱 스킴 주소
 * 꼴이 다르면 null — 서버 답이라도 엉뚱한 주소로는 옮기지 않는다.
 */
export function handoffLaunchUrl(device: InstallDevice, issued: { appUrl?: unknown; intentUrl?: unknown } | null | undefined): string | null {
    if (!issued) return null;
    if (device === "android") {
        // 머리뿐 아니라 꼬리(스킴 · 패키지)까지 본다 — 패키지가 다른 intent 는 토큰을 다른 앱에 넘긴다
        const tail = `#Intent;scheme=${HANDOFF_SCHEME};package=${HANDOFF_ANDROID_PACKAGE};end`;
        return typeof issued.intentUrl === "string" && issued.intentUrl.startsWith("intent://open?") && issued.intentUrl.endsWith(tail)
            ? issued.intentUrl : null;
    }
    if (device === "ios") {
        return typeof issued.appUrl === "string" && issued.appUrl.startsWith(`${HANDOFF_SCHEME}://open?`) ? issued.appUrl : null;
    }
    return null;
}

/* ── PC 의 QR ──────────────────────────────────────────────────────────── */

/** QR 을 찍고 들어온 사람 표시 */
export const INSTALL_FLAG_PARAM = "install";
/**
 * QR 이 여는 경로 — 홈 + 표시. 스토어가 둘이라 QR 하나로는 스토어에 바로 못 보낸다. 휴대폰이 이 주소를 열면
 * 그 기기에 맞는 스토어 단추가 달린 팝업이 **바로** 뜬다(기다림 없이). 홈('/dashboard')은 앱 링크 목록에 있어
 * 앱이 이미 깔린 휴대폰은 앱으로 열린다(앱 안에서는 팝업이 뜨지 않는다).
 */
export const INSTALL_QR_PATH = `/dashboard?${INSTALL_FLAG_PARAM}=1`;
export const installQrUrl = (): string => `${WEB_URL}${INSTALL_QR_PATH}`;

/**
 * 주소에서 표시(?install=1)를 꺼내고, 표시를 지운 주소를 돌려준다 — 새로고침 · 공유로 팝업이 또 뜨지 않게 화면이 주소를 바꿔 끼운다.
 * 다른 질의는 글자 그대로 둔다.
 */
export function takeInstallFlag(href: unknown): { present: boolean; forced: boolean; cleaned: string } {
    if (typeof href !== "string") return { present: false, forced: false, cleaned: "/" };
    const rest = href.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*/, "");
    const hashAt = rest.indexOf("#");
    const hash = hashAt === -1 ? "" : rest.slice(hashAt);
    const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
    const queryAt = beforeHash.indexOf("?");
    const path = (queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)) || "/";
    const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);

    let present = false;
    let forced = false;
    const kept: string[] = [];
    for (const pair of query.split("&")) {
        if (pair === "") continue;
        const eq = pair.indexOf("=");
        const key = eq === -1 ? pair : pair.slice(0, eq);
        if (key !== INSTALL_FLAG_PARAM) {
            kept.push(pair);
            continue;
        }
        present = true;
        if (eq !== -1 && pair.slice(eq + 1) === "1") forced = true;
    }
    return { present, forced, cleaned: path + (kept.length ? `?${kept.join("&")}` : "") + hash };
}
