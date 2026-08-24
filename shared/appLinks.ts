// 랭큐 앱 스토어 링크 — 설치 배너·데스크톱 패널·마케팅 랜딩·공유가 모두 여기를 본다.
//
// 왜 공유하는가: 예전에는 세 파일에 각각 하드코딩돼 있었다(HiqInstallBanner, DesktopFrame,
// marketing-landing). 스토어 ID 가 바뀌거나 링크가 죽으면 한 곳만 고치고 나머지를 놓친다 —
// 실제로 xong 안드로이드 링크가 그런 식으로 404 인 채 남아 있었다.
//
// ct / referrer 는 유입 출처 추적용이다. 이게 없으면 "어느 자리가 설치를 만들었나"를
// App Store Connect·Play Console 에서 영영 알 수 없다.

const IOS_APP_ID = "6760333313";
const ANDROID_PACKAGE = "com.rankue.app";
export const WEB_URL = "https://www.rankue.co.kr";

/** 유입 자리 이름 — 스토어 콘솔에서 이 값으로 구분된다. */
export type AppLinkSource =
    | "install_banner"
    | "desktop_side_panel"
    | "web_landing"
    | "share";          // 유저가 친구에게 직접 보낸 링크

export const iosStoreUrl = (source: AppLinkSource) =>
    `https://apps.apple.com/app/id${IOS_APP_ID}?ct=${source}`;

export const androidStoreUrl = (source: AppLinkSource) =>
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}` +
    `&referrer=${encodeURIComponent(`utm_source=rankue&utm_medium=${source}`)}`;

export type DevicePlatform = "ios" | "android" | "web";

/** UA 기반 기기 판별. 애플 기기에 Play 링크를, 안드로이드에 App Store 링크를 주지 않기 위한 것. */
export function detectPlatform(userAgent?: string): DevicePlatform {
    const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase();
    if (/android/.test(ua)) return "android";
    // iPadOS 13+ 는 UA 가 Macintosh 로 위장하므로 터치 지원 여부로 가른다.
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/macintosh/.test(ua) && typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 1) return "ios";
    return "web";
}

/**
 * 이 기기에서 앱을 받을 수 있는 주소.
 * PC 는 스토어 대신 웹으로 보낸다 — 데스크톱에서 모바일 스토어 페이지를 열면 막다른 길이다.
 */
export function appDownloadUrl(source: AppLinkSource, platform?: DevicePlatform): string {
    const p = platform ?? detectPlatform();
    if (p === "ios") return iosStoreUrl(source);
    if (p === "android") return androidStoreUrl(source);
    return WEB_URL;
}
