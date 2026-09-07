/**
 * rng.ts 검증: 시드 재현성, 범위, 대략 균등, 시드별 상이.
 */
import { describe, it, expect } from "vitest";
import { mulberry32, uniform, uniformInt } from "./rng.js";

describe("mulberry32", () => {
    it("같은 시드 → 같은 수열, 다른 시드 → 다른 수열", () => {
        const a = mulberry32(20260907), b = mulberry32(20260907), c = mulberry32(7);
        const sa: number[] = [], sb: number[] = [], sc: number[] = [];
        for (let i = 0; i < 1000; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
        expect(sa).toEqual(sb);
        expect(sa).not.toEqual(sc);
    });

    it("[0, 1) 범위, 평균 ≈ 0.5, 2^32 격자값", () => {
        const r = mulberry32(1);
        let sum = 0;
        for (let i = 0; i < 100000; i++) {
            const x = r();
            expect(x >= 0 && x < 1).toBe(true);
            expect(x * 4294967296).toBe(Math.floor(x * 4294967296));
            sum += x;
        }
        expect(Math.abs(sum / 100000 - 0.5)).toBeLessThan(0.01);
    });

    it("시드는 32비트로 잘린다(음수·실수 시드도 결정론적)", () => {
        expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
        expect(mulberry32(2 ** 32 + 5)()).toBe(mulberry32(5)());
    });

    it("uniform / uniformInt 범위", () => {
        const r = mulberry32(3);
        for (let i = 0; i < 10000; i++) {
            const x = uniform(r, -2, 3);
            expect(x >= -2 && x < 3).toBe(true);
            const n = uniformInt(r, 4, 9);
            expect(Number.isInteger(n) && n >= 4 && n <= 9).toBe(true);
        }
    });
});
