/**
 * 테이블 조준 기록 자가 복구 계측(2026-09-11). 조준 기록이 비정상 경로(캡처 상실 · 옛 손가락 위 새 터치 · 제스처 중 앱 가려짐)로
 * 풀릴 때마다 한 건씩 서버에 알린다. 몇 주 뒤 플랫폼별 숫자로 먹통 계기(복사하기 메뉴가 뗌 신호를 삼키는지)를 확정하고,
 * 선택 금지(index.css html.sim-no-select)가 효과를 봤는지 판단하는 데 쓴다.
 *
 * - 에러가 아니므로 /api/errors(error_logs → 슈퍼 대시보드 '에러 24h')에 섞지 않고 /api/sim-telemetry 로 따로 보낸다.
 * - 세션(페이지 수명)당 사유별 1건 · 총 5건. 로컬 개발 주소는 보내지 않는다(errorReporter 와 같은 규칙).
 * - 보내는 값은 사유·기기 OS·앱 여부·보기·모드뿐이다. 계정·경로·좌표는 싣지 않는다.
 * - 전송은 fire-and-forget: 실패해도, 예외가 나도 게임에 영향이 없다.
 */
import { isNative, platform as nativePlatform } from "@shared/nativeCaps";
import type { RendererView } from "./render/Renderer";
import type { GestureResetReason } from "./tableGestures";

export const TELEMETRY_URL = "/api/sim-telemetry";
export const MAX_EVENTS_PER_SESSION = 5;

export type TelemetryPlatform = "ios" | "android" | "web";
export type TelemetryMode = "practice" | "online" | "drill";

export interface GestureRecoverEvent {
    readonly kind: "sim-gesture-recover";
    readonly reason: GestureResetReason;
    readonly platform: TelemetryPlatform;
    /** Capacitor 앱 안이면 true(원격 URL 모드라 앱과 웹이 같은 코드를 돈다) */
    readonly native: boolean;
    readonly view: RendererView;
    readonly mode: TelemetryMode;
}

/**
 * 기기 OS. 앱이면 네이티브가 알려 준 값, 웹이면 UA 로 가른다 — 아이폰 사파리도 "ios"(앱 여부는 native 가 따로 말한다).
 * iPadOS 13+ 사파리는 맥 UA 를 보내므로 터치 지점 수로 가른다.
 */
export function detectPlatform(ua: string, maxTouchPoints: number, native: TelemetryPlatform | null): TelemetryPlatform {
    if (native === "ios" || native === "android") return native;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "web";
}

/** 세션 게이트: 같은 사유는 한 번, 모두 합쳐 max 건까지. */
export function createSessionGate(max = MAX_EVENTS_PER_SESSION): (reason: string) => boolean {
    const seen = new Set<string>();
    return (reason) => {
        if (seen.size >= max || seen.has(reason)) return false;
        seen.add(reason);
        return true;
    };
}

let gate = createSessionGate();

/** 테스트용: 세션 게이트를 새로 만든다. */
export function resetTelemetrySession(): void {
    gate = createSessionGate();
}

function currentPlatform(): { platform: TelemetryPlatform; native: boolean } {
    const native = isNative();
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    return {
        native,
        platform: detectPlatform(nav?.userAgent ?? "", nav?.maxTouchPoints ?? 0, native ? nativePlatform() : null),
    };
}

/** 비정상 복구 한 건. 게이트·로컬 주소에서 걸러지면 아무것도 하지 않는다. */
export function reportGestureRecover(e: { reason: GestureResetReason; view: RendererView; mode: TelemetryMode }): void {
    try {
        if (!gate(e.reason)) return;
        const host = (globalThis as { location?: { hostname?: string } }).location?.hostname ?? "";
        if (/^(localhost|127\.|192\.168\.|0\.0\.0\.0)/.test(host)) return;
        const event: GestureRecoverEvent = { kind: "sim-gesture-recover", reason: e.reason, ...currentPlatform(), view: e.view, mode: e.mode };
        const payload = JSON.stringify(event);
        // sendBeacon: 앱이 가려지는 중(visibilitychange·pagehide)에도 전송된다. 없거나 거절되면 keepalive fetch.
        const beacon = typeof navigator !== "undefined" ? navigator.sendBeacon?.bind(navigator) : undefined;
        if (!beacon?.(TELEMETRY_URL, new Blob([payload], { type: "application/json" }))) {
            fetch(TELEMETRY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            }).catch(() => { /* 계측 실패는 조용히 */ });
        }
    } catch {
        /* 계측은 게임을 막지 않는다 */
    }
}
