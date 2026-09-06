import { describe, expect, it } from "vitest";
import { solveQuadratic } from "./quadratic";

describe("solveQuadratic", () => {
    it("두 실근을 오름차순으로", () => {
        // (t − 2)(t + 3) = t² + t − 6
        expect(solveQuadratic(1, 1, -6)).toEqual([-3, 2]);
        // 2(t − 0.5)(t − 4) = 2t² − 9t + 4
        const r = solveQuadratic(2, -9, 4);
        expect(r).toHaveLength(2);
        expect(r[0]).toBeCloseTo(0.5, 14);
        expect(r[1]).toBeCloseTo(4, 14);
    });

    it("근 소거(cancellation)가 심한 계수에서도 작은 근을 잃지 않는다", () => {
        // (t − 1e8)(t − 1e-8) = t² − (1e8 + 1e-8) t + 1. 순진한 공식은 작은 근을 0 으로 뭉갠다.
        const r = solveQuadratic(1, -(1e8 + 1e-8), 1);
        expect(r).toHaveLength(2);
        expect(Math.abs(r[0] - 1e-8) / 1e-8).toBeLessThan(1e-12);
        expect(Math.abs(r[1] - 1e8) / 1e8).toBeLessThan(1e-15);
        // 부호를 뒤집어도 (b > 0)
        const s = solveQuadratic(1, 1e8 + 1e-8, 1);
        expect(s).toHaveLength(2);
        expect(Math.abs(s[0] + 1e8) / 1e8).toBeLessThan(1e-15);
        expect(Math.abs(s[1] + 1e-8) / 1e-8).toBeLessThan(1e-12);
    });

    it("무작위 계수 1만 개: 반환된 근은 모두 방정식을 만족하고 개수가 맞다", () => {
        let seed = 12345;
        const rnd = (): number => {
            // mulberry32
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = 0; i < 10000; i++) {
            const r1 = (rnd() - 0.5) * 200;
            const r2 = (rnd() - 0.5) * 200;
            const a = (rnd() - 0.5) * 10 || 1;
            const b = -a * (r1 + r2);
            const c = a * r1 * r2;
            const roots = solveQuadratic(a, b, c);
            expect(roots).toHaveLength(2);
            const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
            const scale = Math.max(1, Math.abs(lo), Math.abs(hi));
            expect(Math.abs(roots[0] - lo) / scale).toBeLessThan(1e-12);
            expect(Math.abs(roots[1] - hi) / scale).toBeLessThan(1e-12);
        }
    });

    it("중근은 두 번 들어간다", () => {
        expect(solveQuadratic(1, -2, 1)).toEqual([1, 1]);
        expect(solveQuadratic(1, 0, 0)).toEqual([0, 0]);
        // 판별식이 반올림으로 살짝 음수: (t − 1/3)² 을 부동소수 계수로
        const r = 1 / 3;
        const roots = solveQuadratic(1, -2 * r, r * r);
        expect(roots).toHaveLength(2);
        expect(roots[0]).toBeCloseTo(r, 7);
    });

    it("복소근이면 빈 배열", () => {
        expect(solveQuadratic(1, 0, 1)).toEqual([]);
        expect(solveQuadratic(1, 2, 5)).toEqual([]);
        // 허부가 작지만 반올림 수준은 아닌 경우도 복소근 (스침 미스)
        expect(solveQuadratic(1, -2, 1 + 1e-6)).toEqual([]);
    });

    it("a = 0 이면 1차로, a = b = 0 이면 빈 배열", () => {
        expect(solveQuadratic(0, 2, -6)).toEqual([3]);
        expect(solveQuadratic(0, -4, 2)).toEqual([0.5]);
        expect(solveQuadratic(0, 0, 1)).toEqual([]);
        expect(solveQuadratic(0, 0, 0)).toEqual([]);
    });

    it("a 가 0 은 아니지만 극히 작으면 유한한 근이 정확하고 다른 근은 멀리 간다", () => {
        // 1e-30 t² + 2 t − 6: 근 ≈ 3 과 ≈ −2e30
        const r = solveQuadratic(1e-30, 2, -6);
        expect(r).toHaveLength(2);
        expect(r[1]).toBeCloseTo(3, 14);
        expect(r[0]).toBeLessThan(-1e29);
    });

    it("입력을 바꾸지 않고 새 배열을 돌려준다", () => {
        const a = solveQuadratic(1, 1, -6);
        const b = solveQuadratic(1, 1, -6);
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});
