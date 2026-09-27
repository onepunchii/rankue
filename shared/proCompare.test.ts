import { describe, it, expect } from "vitest";
import { nearestPros, normalizeAvg, proRatio, rankAmong, reachMonths, type ComparePro } from "./proCompare";

describe("나와 비교하기 — 순수 계산", () => {
    it("입력 정리: 범위·숫자·소수 둘째 자리", () => {
        expect(normalizeAvg("0.8123")).toBe(0.81);
        expect(normalizeAvg(1.006)).toBe(1.01);
        expect(normalizeAvg("abc")).toBeNull();
        expect(normalizeAvg(0.05)).toBeNull();
        expect(normalizeAvg(3)).toBeNull();
        expect(normalizeAvg(null)).toBeNull();
    });
    it("순위·상위 %: 나보다 큰 값 수 + 1, 같은 값은 공동, 최소 1%", () => {
        const d = [1.5, 1.2, 1.0, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2];
        expect(rankAmong(d, 1.0)).toEqual({ rank: 3, total: 10, topPct: 30 });
        expect(rankAmong(d, 2.0)).toEqual({ rank: 1, total: 10, topPct: 10 });
        expect(rankAmong(d, 0.1)).toEqual({ rank: 11, total: 10, topPct: 100 });
        expect(rankAmong([], 1)).toBeNull();
        const big = Array.from({ length: 1000 }, (_, i) => 2 - i / 1000);
        expect(rankAmong(big, 2.5)?.topPct).toBe(1);
    });
    it("프로 대비 %", () => {
        expect(proRatio(0.812, 1.582)).toBe(51);
        expect(proRatio(1, null)).toBeNull();
        expect(proRatio(1, 0)).toBeNull();
    });
    it("예상 기간: 오르지 않거나 10년 넘으면 없음", () => {
        expect(reachMonths(0.77, 0.041 / 3 * 3)).toBe(19);
        expect(reachMonths(0.77, 0.001)).toBeNull();
        expect(reachMonths(0.77, null)).toBeNull();
        expect(reachMonths(-0.1, 0.05)).toBeNull();
        expect(reachMonths(2, 0.01)).toBeNull(); // 200개월
    });
    it("비슷한 프로: 가까운 순, 이 선수는 뺀다", () => {
        const pool: ComparePro[] = [
            { memCode: "A", nameKo: "A", nameEn: null, league: "LPBA", nationCode: "KR", average: 0.82 },
            { memCode: "B", nameKo: "B", nameEn: null, league: "LPBA", nationCode: "KR", average: 0.78 },
            { memCode: "C", nameKo: "C", nameEn: null, league: "PBA", nationCode: "KR", average: 1.6 },
            { memCode: "D", nameKo: "D", nameEn: null, league: "LPBA", nationCode: "KR", average: 0.8 },
        ];
        expect(nearestPros(pool, 0.8).map((p) => p.memCode)).toEqual(["D", "A"]);
        expect(nearestPros(pool, 0.8, 2, "D").map((p) => p.memCode)).toEqual(["A", "B"]);
    });
});

import { nextPro, proTier } from "./proCompare";
describe("온라인 닮은 프로 — 재미 등급·다음 목표", () => {
    const mk = (i: number, league: "PBA" | "LPBA", average: number): ComparePro => ({ memCode: `${league}${i}`, nameKo: `${league}${i}`, nameEn: null, league, nationCode: "KR", average });
    // LPBA 0.60~0.95(8명), PBA 1.00~1.95(20명)
    const pool = [
        ...Array.from({ length: 8 }, (_, i) => mk(i, "LPBA", 0.6 + i * 0.05)),
        ...Array.from({ length: 20 }, (_, i) => mk(i, "PBA", 1.0 + i * 0.05)),
    ];
    it("경계: LPBA 하위 25%·중앙값·PBA 중앙값·PBA 10번째", () => {
        expect(proTier(pool, 0.3)?.tier).toBe(0);
        expect(proTier(pool, 0.7)?.tier).toBe(1);   // LPBA q25=0.65 이상, 중앙값 0.75 미만
        expect(proTier(pool, 0.9)?.tier).toBe(2);
        expect(proTier(pool, 1.47)?.tier).toBe(3);  // PBA 중앙값 1.45 이상, 10번째(1.50) 미만
        expect(proTier(pool, 1.9)?.tier).toBe(4);
        // 점은 내 등급 칸 안에 — 5칸 사다리의 칸 폭은 20
        const inSeg = (avg: number) => { const r = proTier(pool, avg)!; return r.pos >= r.tier * 20 && r.pos <= (r.tier + 1) * 20; };
        for (const a of [0.1, 0.3, 0.7, 0.9, 1.47, 1.9, 5]) expect(inSeg(a), String(a)).toBe(true);
        expect(proTier(pool, 5)?.pos).toBe(98);
    });
    it("표본이 모자라면 등급 없음", () => {
        expect(proTier(pool.slice(0, 5), 1)).toBeNull();
    });
    it("다음 목표: 나보다 높은 가장 가까운 프로, 없으면 null", () => {
        expect(nextPro(pool, 0.62)?.average).toBeCloseTo(0.65);
        expect(nextPro(pool, 0.62, "LPBA1")?.average).toBeCloseTo(0.7);
        expect(nextPro(pool, 3)).toBeNull();
    });
});
