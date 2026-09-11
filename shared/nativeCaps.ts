// 네이티브 앱(Capacitor) 능력 판별 — "지금 이 기기에서 무엇을 부를 수 있나"의 단일 진입점.
//
// 왜 필요한가: 원격 URL 모드라 웹은 배포 즉시 모든 사용자에게 가지만, 네이티브 바이너리는 사용자가
// 업데이트해야 바뀐다. 그래서 같은 웹이 옛 바이너리(iOS 1.0.x 는 SocialLogin 플러그인조차 없다)와
// 새 바이너리에서 동시에 돈다. isNativePlatform() 하나로 가르면 옛 앱에서 없는 플러그인을 불러
// Unimplemented 예외가 난다(감사 C1 — 실제로 iOS 1.0.x 소셜 로그인이 그렇게 깨졌다).
//
// 판별 규칙
//  - 세대(generation): 새 바이너리는 capacitor.config 의 appendUserAgent 로 UA 끝에 'RankueNative/<n>' 을 붙인다.
//    네이티브인데 토큰이 없으면 1세대(옛 바이너리), 네이티브가 아니면 0(웹).
//    플러그인이 아닌 네이티브 변경(presentationOptions·errorPath 같은 번들 설정)은 isPluginAvailable 로
//    알 수 없어서 세대로만 가른다.
//  - 플러그인: isNativePlatform() && isPluginAvailable(name). 웹에서는 늘 false —
//    웹 구현이 있는 플러그인도 isPluginAvailable 이 true 를 줄 수 있어서 네이티브 여부를 먼저 본다.
//
// @capacitor/core 를 import 하지 않고 전역 window.Capacitor 를 읽는다 — shared/ 는 서버·테스트에서도
// 불리고, 원격 URL 모드에서는 네이티브가 이 전역을 페이지보다 먼저 주입한다.
// 'RankueApp' 문자열은 쓰지 않는다 — hooks/useNativeBridge.ts 가 옛 React Native 래퍼로 오인한다.

export const NATIVE_UA_TOKEN = "RankueNative";

export type NativePlatform = "ios" | "android" | "web";

type CapGlobal = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    isPluginAvailable?: (name: string) => boolean;
    PluginHeaders?: { name?: string }[];
};

function cap(): CapGlobal | undefined {
    return (globalThis as { Capacitor?: CapGlobal }).Capacitor;
}

/**
 * UA 문자열 → 네이티브 세대(순수). 웹 0, 토큰 없는 네이티브 1, 'RankueNative/<n>' 이면 n.
 * 토큰이 깨졌으면(0·음수·숫자 아님) 옛 바이너리로 본다 — 모르는 기능을 켜는 것보다 안전하다.
 */
export function parseNativeGeneration(userAgent: string | null | undefined, native: boolean): number {
    if (!native) return 0;
    const m = /RankueNative\/(\d+)/.exec(userAgent ?? "");
    if (!m) return 1;
    const n = Number.parseInt(m[1], 10);
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

export function isNative(): boolean {
    try {
        return !!cap()?.isNativePlatform?.();
    } catch {
        return false;
    }
}

export function platform(): NativePlatform {
    if (!isNative()) return "web";
    try {
        const p = cap()?.getPlatform?.();
        return p === "ios" || p === "android" ? p : "web";
    } catch {
        return "web";
    }
}

export function generation(): number {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return parseNativeGeneration(ua, isNative());
}

/** 이 바이너리에 네이티브 플러그인이 들어 있는가. 웹이면 늘 false. 절대 throw 하지 않는다. */
export function hasPlugin(name: string): boolean {
    if (!isNative()) return false;
    try {
        const c = cap();
        if (typeof c?.isPluginAvailable === "function") return !!c.isPluginAvailable(name);
        // @capacitor/core 가 아직 전역을 채우기 전이면 네이티브가 넣어 둔 플러그인 목록을 직접 본다
        return Array.isArray(c?.PluginHeaders) && c.PluginHeaders.some((h) => h?.name === name);
    } catch {
        return false;
    }
}

/**
 * 기능별 요구 조건 표 — 새 기능을 켤 때 여기에 "필요 세대 또는 필요 플러그인"을 적는다(감사 C1).
 * 플러그인으로 알 수 있는 건 플러그인으로, 번들 설정처럼 알 수 없는 건 세대로 가른다.
 */
export const NATIVE_FEATURES = {
    /** OS 가 앱을 보는 중에도 푸시 배너를 띄운다(capacitor.config presentationOptions, 2세대부터). */
    osForegroundBanner: { minGeneration: 2 },
    /** 네이티브 구글·애플 로그인. iOS 1.0.x 에는 없다. */
    nativeSocialLogin: { plugin: "SocialLogin" },
    /** 앱 설정·알림 설정 화면 열기(안드로이드). iOS 는 플러그인 없이 'app-settings:' 이동으로 연다 — lib/nativeBridge.ts. */
    openSettings: { plugin: "NativeSettings" },
} as const satisfies Record<string, FeatureRequirement>;

export type FeatureRequirement = { minGeneration?: number; plugin?: string };
export type NativeFeature = keyof typeof NATIVE_FEATURES;

/** 요구 조건 판정(순수). 조건을 모두 만족해야 true, 조건이 없으면 네이티브이기만 하면 된다. */
export function meetsRequirement(req: FeatureRequirement, gen: number, has: (name: string) => boolean): boolean {
    if (gen < 1) return false;
    if (req.minGeneration !== undefined && gen < req.minGeneration) return false;
    if (req.plugin !== undefined && !has(req.plugin)) return false;
    return true;
}

export function nativeSupports(feature: NativeFeature): boolean {
    return meetsRequirement(NATIVE_FEATURES[feature], generation(), hasPlugin);
}
