/**
 * 카카오톡 공유(2026-10-25 오너: "카카오 API 쓸 만한 것 다 해 줘" — 콘솔 [유료 API] 카카오톡 공유 '사용 중').
 * 카카오톡 대화방에 카드(그림 · 제목 · 한 줄)와 '랭큐에서 보기' 단추로 보낸다. 지금까지의 공유(기기 공유 창)도 카톡으로 가지만
 * 링크 미리보기만 붙었다 — 이 카드는 단추가 있어 눌리기 쉽다.
 *
 *   · **웹에서만.** 앱 안에서는 웹 카카오 SDK 를 쓰지 않는다(lib/kakaoLogin loadKakaoSdk — 앱의 웹뷰는 카카오톡으로 넘겨주지 못한다).
 *     앱은 예전처럼 기기 공유 창 — 거기에 카카오톡이 있다.
 *   · 유료 API 목록에 있다(건당 값은 공개 표에 없다) — 사람이 눌러야만 나가지만, 기기 하나의 하루 상한(KAKAO_SHARE_DEVICE_DAILY)을 둔다.
 *   · 링크는 우리 정본 주소(www.rankue.co.kr)로만 — 카카오는 앱에 등록된 도메인의 링크만 연다. 그림이 없으면 화면의 og:image.
 */
import { isNativeApp } from "@/lib/nativeBridge";
import { loadKakaoSdk } from "@/lib/kakaoLogin";
import { KAKAO_SHARE_DEVICE_DAILY, deviceAllows, kakaoShareUrl, kstDay } from "@shared/kakaoMap";

const KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
const ORIGIN = "https://www.rankue.co.kr";
const DEVICE_KEY = "rankue_kshare_day";
const FALLBACK_IMAGE = `${ORIGIN}/og.png`;

export type KakaoShareInput = { title: string; description?: string; imageUrl?: string | null; url: string; buttonTitle?: string };

/** 이 기기에서 카카오톡 공유를 쓸 수 있는가 — 웹 · 키가 있을 때 */
export function kakaoShareAvailable(): boolean {
    return !!KEY && !isNativeApp();
}

/** 우리 정본 도메인의 절대 주소로 — 규칙은 shared/kakaoMap kakaoShareUrl */
export const shareAbsUrl = (u: string): string => kakaoShareUrl(u, ORIGIN);

/** 화면이 걸어 둔 og:image(useSeo) — 없으면 기본 그림 */
export function pageOgImage(): string {
    const v = typeof document !== "undefined" ? document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content : null;
    return v ? shareAbsUrl(v) : FALLBACK_IMAGE;
}

/** 카카오톡으로 보낸다. "device" = 오늘 이 기기 상한, "failed" = SDK · 카카오 오류(부르는 쪽이 다른 공유로 넘긴다) */
export async function sendKakaoShare(o: KakaoShareInput): Promise<"sent" | "device" | "failed"> {
    if (!kakaoShareAvailable()) return "failed";
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(DEVICE_KEY); } catch { /* 못 읽으면 막지 않는다 */ }
    const device = deviceAllows(stored, kstDay(new Date()), KAKAO_SHARE_DEVICE_DAILY);
    if (!device.ok) return "device";
    try {
        const sdk = (await loadKakaoSdk()) as unknown as { Share?: { sendDefault: (t: unknown) => void } };
        if (!sdk.Share) return "failed";
        const url = shareAbsUrl(o.url);
        const link = { mobileWebUrl: url, webUrl: url };
        sdk.Share.sendDefault({
            objectType: "feed",
            content: { title: o.title.slice(0, 80), description: (o.description ?? "").slice(0, 120), imageUrl: o.imageUrl ? shareAbsUrl(o.imageUrl) : pageOgImage(), link },
            buttons: [{ title: o.buttonTitle ?? "랭큐에서 보기", link }],
        });
        try { window.localStorage.setItem(DEVICE_KEY, device.next); } catch { /* 이번만 */ }
        return "sent";
    } catch { return "failed"; }
}
