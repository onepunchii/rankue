/**
 * 떠 있는 팝업이 기기의 '뒤로'를 먼저 받는다(2026-10-06 검토 — 가입·로그인 팝업 · 앱 설치 팝업).
 *
 * 두 팝업은 화면을 옮기지 않고 그 자리에서 올라온다(히스토리 항목이 없다). 그래서 닫으려고 누른 '뒤로'가 팝업이 아니라
 * **보던 화면**을 닫았다 — 검색에서 바로 들어온 사람은 사이트를 떠났고, 앱의 예시 홈에서는 앱이 꺼졌다.
 *   · 앱(안드로이드): 하드웨어 뒤로가기는 Capacitor 가 가로채 lib/nativeBridge 로 온다 — 거기에 한 겹 얹는다(pushBackHandler).
 *     화면이 걸어 둔 핸들러(게임의 '나가기 확인')는 건드리지 않는다.
 *   · 웹: 브라우저에 CloseWatcher 가 있으면(크롬 계열 126 이후 — 안드로이드 크롬이 여기 든다) 그것으로 받는다 — '뒤로'가 히스토리를
 *     건드리지 않고 close 로 온다. 스스로 뜨는 설치 팝업처럼 사람이 누르지 않고 열린 것도 받을 수 있다.
 *   · CloseWatcher 가 없는 브라우저는 예전 그대로다. 히스토리에 표식 항목을 쌓는 길은 쓰지 않는다: 닫으면서 다른 화면으로
 *     옮길 때 되감기(history.back)가 그 이동을 되돌리고, 크롬은 누르지 않고 쌓은 항목을 '뒤로'에서 건너뛴다.
 * onClose 는 여러 번 불려도 되는 것이어야 한다(Esc 는 Radix 와 CloseWatcher 가 둘 다 받는다).
 */
import { useEffect, useRef } from "react";
import { isNativeApp, pushBackHandler } from "@/lib/nativeBridge";

/** lib.dom 에 아직 없는 브라우저가 있어 쓰는 만큼만 적는다 */
type CloseWatcherLike = { onclose: (() => void) | null; destroy: () => void };

export function useBackToClose(open: boolean, onClose: () => void): void {
    // 부른 쪽이 다시 그려져도 걸어 둔 것을 다시 걸지 않게 ref 로 읽는다
    const close = useRef(onClose);
    close.current = onClose;

    useEffect(() => {
        if (!open) return;
        if (isNativeApp()) {
            return pushBackHandler(() => {
                close.current();
                return true;
            });
        }
        const Watcher = (window as unknown as { CloseWatcher?: new () => CloseWatcherLike }).CloseWatcher;
        if (typeof Watcher !== "function") return;
        let watcher: CloseWatcherLike;
        try {
            watcher = new Watcher();
        } catch {
            return; // 만들지 못하는 환경 — 예전 그대로 둔다
        }
        watcher.onclose = () => close.current();
        return () => {
            try { watcher.destroy(); } catch { /* 이미 닫힌 것 */ }
        };
    }, [open]);
}
