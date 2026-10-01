import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { GOLF_PUSH_FROM_HOUR, GOLF_PUSH_UNTIL_HOUR, isGolfQuietHour } from "./golfPushQuiet";

/** 한국 시각 2026-10-01 h:m 의 ms */
const kst = (h: number, m = 0) => Date.UTC(2026, 9, 1, h, m) - 9 * 3600_000;

describe("골프 알림 조용한 시간(한국 21:00~07:59)", () => {
    it("아침 8시 정각부터 보낸다", () => {
        expect(isGolfQuietHour(kst(7, 59))).toBe(true);
        expect(isGolfQuietHour(kst(8, 0))).toBe(false);
    });

    it("밤 9시 정각부터 조용하다", () => {
        expect(isGolfQuietHour(kst(20, 59))).toBe(false);
        expect(isGolfQuietHour(kst(21, 0))).toBe(true);
    });

    it("자정·새벽도 조용하고 한낮은 아니다 — 서버(UTC) 시각이 아니라 한국 시각으로 판다", () => {
        expect(isGolfQuietHour(kst(0, 0))).toBe(true);
        expect(isGolfQuietHour(kst(3, 30))).toBe(true);
        expect(isGolfQuietHour(kst(13, 0))).toBe(false);
        // 한국 오후 1시 = UTC 04시 — UTC 로 판정하면 조용한 시간으로 잘못 걸린다
        expect(new Date(kst(13, 0)).getUTCHours()).toBe(4);
    });

    it("긴급 조인 방송(golf.ts)과 같은 시간을 쓴다 — 한쪽만 바꾸면 여기서 깨진다", () => {
        const route = readFileSync(path.resolve(process.cwd(), "server/routes/modules/golf.ts"), "utf8");
        const from = /const URGENT_PUSH_FROM_HOUR = (\d+);/.exec(route);
        const until = /const URGENT_PUSH_UNTIL_HOUR = (\d+);/.exec(route);
        expect(from && Number(from[1])).toBe(GOLF_PUSH_FROM_HOUR);
        expect(until && Number(until[1])).toBe(GOLF_PUSH_UNTIL_HOUR);
    });
});
