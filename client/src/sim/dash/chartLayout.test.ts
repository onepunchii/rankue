import { describe, it, expect } from "vitest";
import { areaPath, columnLayout, columnPath, linePath, nearestIndex, niceStep, niceTicks, scale, xPositions } from "./chartLayout";

describe("chartLayout", () => {
    it("눈금: 깔끔한 단계로 양 끝을 덮는다", () => {
        expect(niceStep(0.945, 3)).toBe(0.5);
        expect(niceTicks(0, 0.945, 3)).toEqual([0, 0.5, 1]);
        expect(niceTicks(0, 5, 3)).toEqual([0, 2, 4, 6]);
        expect(niceTicks(0, 1, 2)).toEqual([0, 0.5, 1]);
        const t = niceTicks(0.3, 1.27, 4);
        expect(t[0]).toBeLessThanOrEqual(0.3);
        expect(t[t.length - 1]).toBeGreaterThanOrEqual(1.27);
        expect(niceTicks(2, 2, 1)).toEqual([2, 3]); // max ≤ min → min..min+1
        expect(niceTicks(0, 12, 3)).toEqual([0, 5, 10, 15]);
    });

    it("스케일·x 위치", () => {
        const y = scale(0, 1, 100, 0);
        expect(y(0)).toBe(100);
        expect(y(0.25)).toBe(75);
        expect(scale(1, 1, 7, 9)(5)).toBe(7);
        expect(xPositions(3, 10, 30)).toEqual([10, 20, 30]);
        expect(xPositions(1, 10, 30)).toEqual([20]);
        expect(xPositions(0, 10, 30)).toEqual([]);
    });

    it("경로: 직선 폴리라인·영역", () => {
        const pts = [{ x: 0, y: 10 }, { x: 10, y: 5.25 }];
        expect(linePath(pts)).toBe("M0.0 10.0 L10.0 5.3");
        expect(areaPath(pts, 20)).toBe("M0.0 10.0 L10.0 5.3 L10.0 20.0 L0.0 20.0 Z");
        expect(areaPath([], 20)).toBe("");
    });

    it("막대: 두께 ≤ 24, 간격 ≥ 2, 위만 둥글게, 높이 0 이면 없음", () => {
        const wide = columnLayout(4, 320);
        expect(wide.w).toBe(24);
        expect(wide.x(1)).toBeCloseTo(80 + (80 - 24) / 2);
        const dense = columnLayout(30, 300);
        expect(dense.band).toBe(10);
        expect(dense.w).toBe(8);
        expect(dense.band - dense.w).toBeGreaterThanOrEqual(2);
        expect(columnLayout(0, 100).w).toBe(24);
        expect(columnPath(10, 50, 100, 8)).toBe("M10.0 100.0 V54.0 Q10.0 50.0 14.0 50.0 H14.0 Q18.0 50.0 18.0 54.0 V100.0 Z");
        expect(columnPath(10, 100, 100, 8)).toBe("");
        expect(columnPath(10, 98, 100, 8)).toMatch(/^M10\.0 100\.0 V100\.0 Q10\.0 98\.0 12\.0 98\.0 H16\.0/); // 둥근 반지름은 높이(2) 이하
    });

    it("가장 가까운 인덱스", () => {
        expect(nearestIndex([0, 10, 20], 12)).toBe(1);
        expect(nearestIndex([0, 10, 20], 16)).toBe(2);
        expect(nearestIndex([0, 10, 20], -5)).toBe(0);
        expect(nearestIndex([], 1)).toBe(-1);
    });
});
