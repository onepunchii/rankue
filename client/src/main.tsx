import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);

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

