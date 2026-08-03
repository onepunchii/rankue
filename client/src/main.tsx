import { createRoot } from "react-dom/client";
import { IconContext } from "@phosphor-icons/react";
import App from "./App";
import "./index.css";
import { initErrorReporter } from "./lib/errorReporter";
import { initNativeBridge } from "./lib/nativeBridge";
import { initKeyboardAvoid } from "./lib/keyboardAvoid";

// 클라이언트 에러 수집기 마운트 (프로덕션에서 /api/errors 로 익명 전송)
initErrorReporter();

// 네이티브 앱(Capacitor) 브릿지 — 안드 뒤로가기·푸시 등록. 웹에선 no-op.
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

// Register Service Worker
if ('serviceWorker' in navigator) {
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

