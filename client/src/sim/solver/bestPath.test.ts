import { describe, it, expect } from "vitest";
import { bestCandidate, successPct, cushionCount, rankedPaths } from "./bestPath";
import type { SolveCandidate } from "./search";

/** 필요한 필드만 채운 가짜 후보 — 카드는 순수 함수 세 개만 테스트한다(그리기는 jsdom 스모크가 따로 없다). */
function candidate(o: { score: number; robustness: number | null; cushions?: number }): SolveCandidate {
    return {
        input: { cueBallId: "white", phi: 1, V0: 3, a: 0, b: 0, theta: 0 },
        outcome: { code: "point", points: 1, cushionsBeforeSecond: o.cushions ?? 3, foul: false } as SolveCandidate["outcome"],
        result: { events: [], final: [], history: [], duration: 0, hash: "", truncated: false } as unknown as SolveCandidate["result"],
        score: o.score, tried: 1, aim: { kind: "none" }, robustness: o.robustness,
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
});
