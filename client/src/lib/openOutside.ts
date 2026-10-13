/**
 * 바깥 사이트를 앱 안 브라우저 창으로 연다(2026-10-13 — 골프장 홈페이지 예약).
 *
 * 앱에서 바깥 링크(target=_blank)를 그냥 누르면 사파리 · 크롬 앱으로 **나가 버린다** — 예약을 마치고 랭큐로 돌아오려면 앱을 다시 찾아야 한다.
 * 앱 안 브라우저 창(iOS SFSafariViewController · 안드로이드 Custom Tabs — @capacitor/browser)은 위에 겹쳐 뜨고 닫으면 보던 화면이다.
 * 그 창은 휴대폰의 사파리 · 크롬과 저장된 비밀번호 · 자동 채움을 같이 쓴다 — 골프장 사이트의 로그인 · 회원가입 칸이 그대로 채워진다.
 * (오너가 물은 '자동 회원가입' — 남의 사이트 비밀번호를 우리가 보관하지 않고 휴대폰의 것을 쓰는 길이다.)
 *
 * 웹 브라우저 · 그 플러그인이 없는 옛 앱에서는 아무 일도 하지 않고 false 를 준다 — 링크의 원래 동작(새 탭)이 그대로 일어난다.
 */
import { hasPlugin } from "@shared/nativeCaps";

/** 앱 안 브라우저 창을 쓸 수 있는가 */
export const canOpenInApp = (): boolean => hasPlugin("Browser");

/** 열었으면 true. http(s) 주소만 */
export async function openInAppBrowser(url: string): Promise<boolean> {
    if (!/^https?:\/\//i.test(url) || !canOpenInApp()) return false;
    try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url });
        return true;
    } catch {
        return false;
    }
}

/**
 * 바깥 링크(<a href target="_blank">)의 onClick — 앱 안 창을 쓸 수 있으면 그쪽으로 열고 링크의 원래 동작을 막는다.
 * 못 열면(실패) 새 창으로 한 번 더 시도한다. 쓸 수 없는 환경에서는 손대지 않는다(링크가 스스로 연다).
 */
export function outsideLinkClick(url: string) {
    return (e: { preventDefault: () => void }) => {
        if (!canOpenInApp()) return;
        e.preventDefault();
        void openInAppBrowser(url).then((ok) => { if (!ok) { try { window.open(url, "_blank", "noopener"); } catch { /* 막힌 환경 */ } } });
    };
}
