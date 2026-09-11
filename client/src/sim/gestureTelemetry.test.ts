import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionGate, detectPlatform, reportGestureRecover, resetTelemetrySession, TELEMETRY_URL } from "./gestureTelemetry";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

describe("gestureTelemetry", () => {
    it("기기 OS: 앱이면 네이티브 값, 웹이면 UA(아이패드 맥 UA 는 터치 지점으로)", () => {
        expect(detectPlatform(WINDOWS, 0, "android")).toBe("android");
        expect(detectPlatform(IPHONE, 5, null)).toBe("ios");
        expect(detectPlatform(IPAD_DESKTOP, 5, null)).toBe("ios");
        expect(detectPlatform(IPAD_DESKTOP, 0, null)).toBe("web"); // 진짜 맥
        expect(detectPlatform(ANDROID, 5, null)).toBe("android");
        expect(detectPlatform(WINDOWS, 0, null)).toBe("web");
    });

    it("세션 게이트: 같은 사유는 한 번, 모두 합쳐 5건까지", () => {
        const gate = createSessionGate();
        expect(gate("lostcapture")).toBe(true);
        expect(gate("lostcapture")).toBe(false);
        for (const r of ["a", "b", "c", "d"]) expect(gate(r)).toBe(true);
        expect(gate("e")).toBe(false);
    });

    describe("전송", () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        beforeEach(() => {
            resetTelemetrySession();
            fetchMock.mockClear();
            vi.stubGlobal("fetch", fetchMock);
            // Node 의 navigator 에는 sendBeacon 이 없다 — keepalive fetch 로 떨어지는 길을 본다
            vi.stubGlobal("navigator", { userAgent: ANDROID, maxTouchPoints: 5 });
        });
        afterEach(() => { vi.unstubAllGlobals(); });

        it("허용 목록 값만 담아 /api/sim-telemetry 로 보낸다(사유별 한 번)", () => {
            reportGestureRecover({ reason: "stale-pointerdown", view: "top", mode: "online" });
            reportGestureRecover({ reason: "stale-pointerdown", view: "top", mode: "online" });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe(TELEMETRY_URL);
            expect(init.keepalive).toBe(true);
            expect(JSON.parse(String(init.body))).toEqual({
                kind: "sim-gesture-recover", reason: "stale-pointerdown", platform: "android", native: false, view: "top", mode: "online",
            });
        });

        it("sendBeacon 이 받아 주면 fetch 를 부르지 않는다", () => {
            const sendBeacon = vi.fn(() => true);
            vi.stubGlobal("navigator", { userAgent: IPHONE, maxTouchPoints: 5, sendBeacon });
            reportGestureRecover({ reason: "hidden", view: "player", mode: "practice" });
            expect(sendBeacon).toHaveBeenCalledTimes(1);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("로컬 개발 주소는 보내지 않고, 전송이 터져도 예외가 새지 않는다", () => {
            vi.stubGlobal("location", { hostname: "localhost" });
            reportGestureRecover({ reason: "blur", view: "top", mode: "drill" });
            expect(fetchMock).not.toHaveBeenCalled();
            vi.stubGlobal("location", { hostname: "rankue.com" });
            vi.stubGlobal("fetch", () => { throw new Error("offline"); });
            expect(() => reportGestureRecover({ reason: "pagehide", view: "top", mode: "drill" })).not.toThrow();
        });
    });
});
