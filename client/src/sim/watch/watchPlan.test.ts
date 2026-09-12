import { describe, it, expect } from "vitest";
import { planWatch, shouldSkipAnimation, nextPollMs, normalizeShots, WATCH_POLL_MS } from "./watchPlan";
import type { MatchShot } from "../matchApi";

const shot = (idx: number): MatchShot => ({
    idx, playerIndex: (idx % 2) as 0 | 1, preState: [], input: {} as any, hash: "h",
    outcomeCode: "miss", points: 0, cushions: 0, createdAt: "2026-09-12T00:00:00.000Z",
});

describe("planWatch", () => {
    it("서버에 새 샷이 있으면 내가 본 다음 번호부터 받아온다", () => {
        expect(planWatch({ serverShots: 5, playedShots: 3, animating: false })).toEqual({ kind: "fetch", from: 3 });
    });
    it("따라잡았으면 아무것도 안 한다", () => {
        expect(planWatch({ serverShots: 3, playedShots: 3, animating: false })).toEqual({ kind: "idle" });
    });
    it("재생 중에는 새 샷을 받아오지 않는다 — 중간에 갈아치우면 공이 순간이동한다", () => {
        expect(planWatch({ serverShots: 9, playedShots: 3, animating: true })).toEqual({ kind: "idle" });
    });
});

describe("nextPollMs", () => {
    it("진행 중이고 화면이 보이면 4초", () => {
        expect(nextPollMs("playing", true)).toBe(WATCH_POLL_MS);
    });
    it("끝난 대전이나 가려진 화면은 쉰다", () => {
        expect(nextPollMs("finished", true)).toBeNull();
        expect(nextPollMs("playing", false)).toBeNull();
    });
});

describe("shouldSkipAnimation", () => {
    it("많이 밀렸으면 재생을 건너뛴다", () => {
        expect(shouldSkipAnimation(1)).toBe(false);
        expect(shouldSkipAnimation(3)).toBe(false);
        expect(shouldSkipAnimation(4)).toBe(true);
    });
});

describe("normalizeShots", () => {
    it("순서대로 이어지는 구간만 돌려준다", () => {
        expect(normalizeShots([shot(3), shot(4), shot(5)], 3).map((s) => s.idx)).toEqual([3, 4, 5]);
    });
    it("중복은 버리고, 번호가 비면 거기서 끊는다", () => {
        expect(normalizeShots([shot(1), shot(3), shot(4)], 3).map((s) => s.idx)).toEqual([3, 4]);
        expect(normalizeShots([shot(3), shot(5)], 3).map((s) => s.idx)).toEqual([3]);
    });
});
