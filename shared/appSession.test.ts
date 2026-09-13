import { describe, it, expect } from "vitest";
import { isSessionLive, IDLE_END_MS, MAX_SESSION_MS, minutesOf, sessionLengthMs } from "./appSession.js";

const T = 1_800_000_000_000;

describe("sessionLengthMs", () => {
    it("닫힘이 있으면 닫힘까지, 없으면 마지막 신호까지", () => {
        expect(sessionLengthMs(T, T + 60_000, T + 600_000)).toBe(600_000);
        expect(sessionLengthMs(T, T + 60_000, null)).toBe(60_000);
    });
    it("잠든 폰이 만든 8시간짜리는 상한으로 자른다", () => {
        expect(sessionLengthMs(T, T, T + 8 * 3_600_000)).toBe(MAX_SESSION_MS);
    });
    it("시계가 뒤로 갔거나 값이 이상하면 0", () => {
        expect(sessionLengthMs(T, T - 5, null)).toBe(0);
        expect(sessionLengthMs(Number.NaN, T, null)).toBe(0);
    });
});

describe("isSessionLive", () => {
    it("닫히지 않았고 30분 안에 신호가 있었으면 살아 있다", () => {
        expect(isSessionLive(T, null, T + IDLE_END_MS - 1)).toBe(true);
        expect(isSessionLive(T, null, T + IDLE_END_MS)).toBe(false);
        expect(isSessionLive(T, T + 10, T + 20)).toBe(false);
    });
});

describe("minutesOf", () => {
    it("반올림, 1분 미만은 1", () => {
        expect(minutesOf(29_000)).toBe(1);
        expect(minutesOf(150_000)).toBe(3);   // 2.5분 → 3
    });
});
