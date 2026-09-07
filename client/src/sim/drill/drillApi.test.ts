import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { weekUrl, ladderUrl, attemptUrl, weekProgress, createDrillApi } from "./drillApi";

describe("드릴 API 매퍼", () => {
    it("URL", () => {
        expect(weekUrl()).toBe("/api/hiq/sim/drills/week");
        expect(weekUrl("2026-W37")).toBe("/api/hiq/sim/drills/week?weekId=2026-W37");
        expect(ladderUrl("2026-W37")).toContain("ladder?weekId=");
        expect(attemptUrl("back1")).toBe("/api/hiq/sim/drills/back1/attempt");
    });
    it("주간 진행 요약", () => {
        const week = { drills: [
            { attempt: { success: true } }, { attempt: { success: false } }, { attempt: null }, { attempt: null }, { attempt: null },
        ] } as any;
        expect(weekProgress(week)).toEqual({ attempted: 2, successes: 1, remaining: 3, total: 5 });
    });
    it("attempt 는 POST 본문에 input·clientHash 를 싣는다", async () => {
        const calls: any[] = [];
        const api = createDrillApi(async (url, o) => { calls.push([url, o]); return { attempt: { id: "x" } }; });
        await api.attempt("back1", { cueBallId: "white", phi: 1, V0: 2, a: 0, b: 0, theta: 0 }, "0123456789abcdef");
        expect(calls[0][0]).toBe("/api/hiq/sim/drills/back1/attempt");
        expect(calls[0][1].method).toBe("POST");
        expect(calls[0][1].body.clientHash).toBe("0123456789abcdef");
    });
});
