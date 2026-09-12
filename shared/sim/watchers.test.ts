import { describe, it, expect } from "vitest";
import { countWatchers, WATCHER_WINDOW_MS } from "./watchers.js";

const NOW = 1_800_000_000_000;

describe("countWatchers", () => {
    it("창 안에 있는 사람만 센다", () => {
        expect(countWatchers({ a: NOW - 1000, b: NOW - WATCHER_WINDOW_MS + 1, c: NOW - WATCHER_WINDOW_MS - 1 }, NOW)).toBe(2);
    });
    it("비어 있거나 이상한 값은 0", () => {
        expect(countWatchers(null, NOW)).toBe(0);
        expect(countWatchers({}, NOW)).toBe(0);
        expect(countWatchers([1, 2], NOW)).toBe(0);
        expect(countWatchers({ a: "언제인지 모름" }, NOW)).toBe(0);
    });
    it("bigint 가 문자열로 실려 와도 센다(jsonb 왕복)", () => {
        expect(countWatchers({ a: String(NOW - 500) }, NOW)).toBe(1);
    });
});
