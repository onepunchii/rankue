import { describe, it, expect } from "vitest";
import { highlightsOf, sortWatch, type RankableMatch } from "./watchRank.js";

const m = (o: Partial<RankableMatch> = {}): RankableMatch => ({
    gameType: "3c", scores: [15, 12], targets: [15, 15], highRuns: [4, 3], innings: 20,
    finishedAt: "2026-09-10T00:00:00.000Z", ...o,
});

describe("highlightsOf", () => {
    it("4구는 캐롬으로 읽는다 — 점수로 섞으면 4구가 언제나 이긴다", () => {
        const h = highlightsOf(m({ gameType: "4c", scores: [200, 100], targets: [200, 200], highRuns: [60, 20], innings: 20 }));
        expect(h.highRun).toBe(6);
        expect(h.avg).toBeCloseTo(20 / 20, 10);
    });
    it("접전이면 closeness 가 1 에 가깝다", () => {
        expect(highlightsOf(m({ scores: [15, 14] })).closeness).toBeGreaterThan(0.9);
        expect(highlightsOf(m({ scores: [15, 2] })).closeness).toBeLessThan(0.3);
    });
    it("다마수가 다르면 비율로 본다 — 20:5 도 각자 목표를 채웠으면 접전이다", () => {
        expect(highlightsOf(m({ scores: [20, 5], targets: [20, 5] })).closeness).toBeGreaterThan(0.9);
    });
    it("하이런은 목표 대비다 — 같은 8연속도 20점 경기가 더 크다", () => {
        const short = highlightsOf(m({ highRuns: [8, 0], targets: [20, 20], scores: [20, 5] }));
        const long = highlightsOf(m({ highRuns: [8, 0], targets: [60, 60], scores: [60, 15] }));
        expect(short.score).toBeGreaterThan(long.score);
    });
    it("이닝이 0 이어도 나눗셈이 깨지지 않는다", () => {
        expect(highlightsOf(m({ innings: 0 })).avg).toBeCloseTo(15, 10);
    });
});

describe("sortWatch", () => {
    const rows = [
        m({ finishedAt: "2026-09-01T00:00:00.000Z", highRuns: [9, 1], scores: [15, 3] }),   // 큰 런, 일방적
        m({ finishedAt: "2026-09-05T00:00:00.000Z", highRuns: [3, 3], scores: [15, 14] }),  // 접전
        m({ finishedAt: "2026-09-09T00:00:00.000Z", highRuns: [2, 2], scores: [15, 5] }),   // 최근
    ];
    it("최근순은 시간만 본다", () => {
        expect(sortWatch(rows, "recent").map((r) => r.finishedAt)).toEqual([
            "2026-09-09T00:00:00.000Z", "2026-09-05T00:00:00.000Z", "2026-09-01T00:00:00.000Z",
        ]);
    });
    it("하이런순은 연속 득점이 큰 판이 위", () => {
        expect(sortWatch(rows, "highRun")[0].highRuns).toEqual([9, 1]);
    });
    it("명경기는 런·에버·접전을 함께 본다", () => {
        const best = sortWatch(rows, "best");
        expect(best[0].highRuns).toEqual([9, 1]);          // 9연속이 가장 크게 작용
        expect(best[1].scores).toEqual([15, 14]);          // 그 다음이 접전
    });
    it("같은 값이면 최근 것이 위 — 목록이 흔들리지 않게", () => {
        const same = [m({ finishedAt: "2026-09-01T00:00:00.000Z" }), m({ finishedAt: "2026-09-08T00:00:00.000Z" })];
        expect(sortWatch(same, "highRun")[0].finishedAt).toBe("2026-09-08T00:00:00.000Z");
    });
});
