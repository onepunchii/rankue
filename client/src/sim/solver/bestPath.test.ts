import { describe, it, expect } from "vitest";
import { bestCandidate, successPct, cushionCount, rankedPaths, marginLevel, tipSpot } from "./bestPath";
import type { SolveCandidate } from "./search";

/** 필요한 필드만 채운 가짜 후보 — 카드는 순수 함수 세 개만 테스트한다(그리기는 jsdom 스모크가 따로 없다). */
function candidate(o: { score: number; robustness: number | null; cushions?: number; bank?: boolean }): SolveCandidate {
    return {
        input: { cueBallId: "white", phi: 1, V0: 3, a: 0, b: 0, theta: 0 },
        outcome: { code: "point", points: 1, cushionsBeforeSecond: o.cushions ?? 3, foul: false } as SolveCandidate["outcome"],
        result: { events: [], final: [], history: [], duration: 0, hash: "", truncated: false } as unknown as SolveCandidate["result"],
        score: o.score, tried: 1, robustness: o.robustness,
        aim: o.bank ? { kind: "bank", cushion: "left" } : { kind: "none" },
        terms: {} as SolveCandidate["terms"],
    };
}

describe("길 찾기 카드", () => {
    it("가장 잘 들어가는 길 = 오차 허용이 가장 큰 후보(같으면 점수)", () => {
        const a = candidate({ score: 9, robustness: 0.1 });
        const b = candidate({ score: 2, robustness: 0.5 });
        const c = candidate({ score: 5, robustness: 0.5 });
        expect(bestCandidate([a, b, c])).toBe(c);
        expect(bestCandidate([a, b])).toBe(b);
    });
    it("오차 허용을 못 잰 후보는 뒤로, 그것뿐이면 점수 순", () => {
        const measured = candidate({ score: 1, robustness: 0 });
        const unmeasured = candidate({ score: 9, robustness: null });
        expect(bestCandidate([unmeasured, measured])).toBe(measured);
        const onlyUnmeasured = [candidate({ score: 1, robustness: null }), candidate({ score: 7, robustness: null })];
        expect(bestCandidate(onlyUnmeasured)).toBe(onlyUnmeasured[1]);
        expect(bestCandidate([])).toBeNull();
    });
    it("성공률은 반올림한 백분율, 못 쟀으면 null · 쿠션은 판정값", () => {
        expect(successPct(candidate({ score: 1, robustness: 0.364 }))).toBe(36);
        expect(successPct(candidate({ score: 1, robustness: null }))).toBeNull();
        expect(cushionCount(candidate({ score: 1, robustness: 0, cushions: 5 }))).toBe(5);
    });
    it("길 1·2·3 은 성공 확률 순으로 최대 세 개", () => {
        const list = [
            candidate({ score: 9, robustness: 0.1 }),
            candidate({ score: 1, robustness: 0.9 }),
            candidate({ score: 1, robustness: 0.5 }),
            candidate({ score: 1, robustness: 0.3 }),
        ];
        const top = rankedPaths(list);
        expect(top.length).toBe(3);
        expect(top.map((c) => c.robustness)).toEqual([0.9, 0.5, 0.3]);
        expect(rankedPaths(list, 2).length).toBe(2);
        expect(rankedPaths([])).toEqual([]);
    });
    it("여유 등급: 30% 이상 넉넉 · 15% 이상 보통 · 그 아래 까다로움", () => {
        expect(marginLevel(candidate({ score: 1, robustness: 0.64 }))).toBe("wide");
        expect(marginLevel(candidate({ score: 1, robustness: 0.30 }))).toBe("wide");
        expect(marginLevel(candidate({ score: 1, robustness: 0.29 }))).toBe("mid");
        expect(marginLevel(candidate({ score: 1, robustness: 0.15 }))).toBe("mid");
        expect(marginLevel(candidate({ score: 1, robustness: 0.07 }))).toBe("tight");
        expect(marginLevel(candidate({ score: 1, robustness: null }))).toBeNull();
    });
    it("당점은 팁 표기: 최대 옆당점이 3팁, 위아래는 상·중·하단", () => {
        const M = 0.5;
        expect(tipSpot(0, 0, M)).toEqual({ tips: 0, side: null, vertical: "mid" });
        expect(tipSpot(0.5, 0, M)).toEqual({ tips: 3, side: "right", vertical: "mid" });
        expect(tipSpot(-0.33, 0, M)).toEqual({ tips: 2, side: "left", vertical: "mid" });
        expect(tipSpot(0.17, 0.25, M)).toEqual({ tips: 1, side: "right", vertical: "high" });
        expect(tipSpot(0, -0.25, M).vertical).toBe("low");
        expect(tipSpot(0.02, 0.05, M)).toEqual({ tips: 0, side: null, vertical: "mid" });
    });
    it("뱅크가 다 차지하지 않게 적구 먼저 길에 두 자리를 남긴다", () => {
        const banks = [0.9, 0.8, 0.7, 0.6, 0.5].map((r) => candidate({ score: 1, robustness: r, bank: true }));
        const balls = [0.2, 0.1].map((r) => candidate({ score: 1, robustness: r }));
        const top = rankedPaths([...banks, ...balls], 5);
        expect(top.length).toBe(5);
        expect(top.filter((c) => c.aim.kind !== "bank").length).toBe(2);
        expect(top[0].robustness).toBe(0.9);                       // 1등은 그대로 여유가 가장 큰 길
        expect(top.map((c) => c.robustness)).toEqual([0.9, 0.8, 0.7, 0.2, 0.1]);
        // 적구 먼저 길이 없으면 그냥 여유 순
        expect(rankedPaths(banks, 3).map((c) => c.robustness)).toEqual([0.9, 0.8, 0.7]);
    });
});
