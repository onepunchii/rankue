// 클라이언트 에러 수집기 — window error / unhandledrejection → POST /api/errors
// 세션당 최대 5건, 같은 메시지는 1회만, 소음(확장프로그램·ResizeObserver 등)은 제외.
// 수집 실패는 조용히 무시 (앱 동작에 영향 금지)

const sent = new Set<string>();
let count = 0;

function report(message: string, stack?: string | null) {
    if (!message || count >= 5) return;
    // 로컬 개발 중 발생한 에러는 쌓지 않음 (프로덕션 모니터링 전용)
    if (/^(localhost|127\.|192\.168\.|0\.0\.0\.0)/.test(location.hostname)) return;
    // 브라우저 확장·네트워크 순단 등 조치 불가능한 소음 제외
    if (/ResizeObserver|Script error\.?|Load failed|NetworkError|Failed to fetch|AbortError/i.test(message)) return;
    const key = message.slice(0, 200);
    if (sent.has(key)) return;
    sent.add(key);
    count++;

    const payload = JSON.stringify({
        message: message.slice(0, 500),
        stack: stack?.slice(0, 2000) ?? null,
        url: location.pathname, // 쿼리스트링 제외 (개인정보 유입 방지)
    });
    try {
        // sendBeacon: 페이지 이탈 중에도 전송 보장. 실패하면 keepalive fetch로 폴백.
        if (!navigator.sendBeacon?.("/api/errors", new Blob([payload], { type: "application/json" }))) {
            fetch("/api/errors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            }).catch(() => { });
        }
    } catch {
        /* 무시 */
    }
}

// 앱 엔트리(main.tsx)에서 1회 호출
export function initErrorReporter() {
    window.addEventListener("error", (e: ErrorEvent) => {
        report(e.message || "unknown error", e.error?.stack);
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
        const r = e.reason as { message?: string; stack?: string } | undefined;
        report("unhandledrejection: " + (r?.message ?? String(e.reason)), r?.stack);
    });
}
