import { createRoot } from "react-dom/client";
import { IconContext } from "@phosphor-icons/react";
import App from "./App";
import "./index.css";
import { initErrorReporter } from "./lib/errorReporter";
import { initNativeBridge, isNativeApp } from "./lib/nativeBridge";
import { initKeyboardAvoid } from "./lib/keyboardAvoid";

// 클라이언트 에러 수집기 마운트 (프로덕션에서 /api/errors 로 익명 전송)
initErrorReporter();

// 네이티브 앱(Capacitor) 브릿지 — 뒤로가기·오프라인 복귀·딥링크·푸시 리스너. 웹에선 no-op.
// 오프라인 복귀 경로를 첫 렌더 전에 적용하므로 반드시 render 보다 먼저 부른다.
initNativeBridge();

// 소프트 키보드가 하단 입력창을 가리지 않도록 --keyboard-height 추적
initKeyboardAvoid();

// Suppress AbortError from showing Vite error overlay
// This error occurs during React component cleanup and is harmless
window.addEventListener('error', (event) => {
    if (event.error?.name === 'AbortError' || event.error?.message?.includes('abort')) {
        event.preventDefault();
        console.log('⚠️ [Global] Suppressed AbortError from error overlay');
    }
});

// Also handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.name === 'AbortError' || event.reason?.message?.includes('abort')) {
        event.preventDefault();
        console.log('⚠️ [Global] Suppressed AbortError promise rejection');
    }
});

createRoot(document.getElementById("root")!).render(
    <IconContext.Provider value={{ weight: "duotone" }}>
        <App />
    </IconContext.Provider>
);

// 네이티브 앱 웹뷰에서는 서비스워커를 쓰지 않는다 — 웹 푸시를 걷어냈고(오너 2026-09-11), 앱 안의 SW 는
// 옛 Firebase 스크립트만 받아 오고 있었다(감사 P9). 예전에 등록된 것도 여기서 풀어 준다. 웹 브라우저는 그대로.
if ('serviceWorker' in navigator && isNativeApp()) {
    navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => { void r.unregister(); }))
        .catch(() => { /* 무시 */ });
} else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ [PWA] Service Worker registered:', registration.scope);
            })
            .catch(err => {
                console.error('❌ [PWA] Service Worker registration failed:', err);
            });
    });
}

