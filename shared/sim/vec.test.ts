import { describe, expect, it } from "vitest";
import type { Vec3 } from "./types";
import { HALF_PI, PI } from "./dmath";
import { add, angleOf, cross, dot, length, lengthSq, lerp, negate, scale, sub, unit, upCross } from "./vec";

const A: Vec3 = [1, 2, 3];
const B: Vec3 = [-4, 0.5, 2];

describe("vec — 기본 연산", () => {
    it("add / sub / scale / negate", () => {
        expect(add(A, B)).toEqual([-3, 2.5, 5]);
        expect(sub(A, B)).toEqual([5, 1.5, 1]);
        expect(scale(A, -2)).toEqual([-2, -4, -6]);
        expect(negate(B)).toEqual([4, -0.5, -2]);
    });

    it("dot / length / lengthSq", () => {
        expect(dot(A, B)).toBe(-4 + 1 + 6);
        expect(lengthSq(A)).toBe(14);
        expect(length([3, 4, 0])).toBe(5);
        expect(length([0, 0, 0])).toBe(0);
    });

    it("cross 는 오른손 법칙: x̂ × ŷ = ẑ, ŷ × ẑ = x̂, ẑ × x̂ = ŷ, 반교환", () => {
        expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
        expect(cross([0, 1, 0], [0, 0, 1])).toEqual([1, 0, 0]);
        expect(cross([0, 0, 1], [1, 0, 0])).toEqual([0, 1, 0]);
        const ab = cross(A, B);
        const ba = cross(B, A);
        expect(ab).toEqual(negate(ba));
        // 결과는 두 인자에 수직
        expect(dot(ab, A)).toBeCloseTo(0, 12);
        expect(dot(ab, B)).toBeCloseTo(0, 12);
    });

    it("unit 은 단위벡터, 영벡터면 [0,0,0] (NaN 없음)", () => {
        const u = unit([3, 0, 4]);
        expect(u).toEqual([0.6, 0, 0.8]);
        expect(length(unit(A))).toBeCloseTo(1, 15);
        expect(unit([0, 0, 0])).toEqual([0, 0, 0]);
    });

    it("upCross(v) = k̂ × v = (−v_y, v_x, 0): 위에서 봐서 반시계 90°", () => {
        expect(upCross([1, 0, 0])).toEqual([-0, 1, 0]);
        expect(upCross([0, 1, 0])).toEqual([-1, 0, 0]);
        expect(upCross(A)).toEqual(cross([0, 0, 1], A));
        // 구르는 공: ω_xy = (1/R)·k̂ × v 이면 접점 미끄럼 u = (v_x − R ω_y, v_y + R ω_x) = 0
        const R = 0.03075;
        const v: Vec3 = [1.3, -0.7, 0];
        const w = scale(upCross(v), 1 / R);
        expect(v[0] - R * w[1]).toBeCloseTo(0, 15);
        expect(v[1] + R * w[0]).toBeCloseTo(0, 15);
    });

    it("angleOf: +x 축 0, 반시계 양수, (−π, π], 영벡터 0", () => {
        expect(angleOf([1, 0, 0])).toBe(0);
        expect(angleOf([0, 1, 0])).toBe(HALF_PI);
        expect(angleOf([0, -1, 0])).toBe(-HALF_PI);
        expect(angleOf([-1, 0, 0])).toBe(PI);
        expect(angleOf([1, 1, 5])).toBeCloseTo(PI / 4, 15); // z 는 무시
        expect(angleOf([-1, -1, 0])).toBeCloseTo(-3 * PI / 4, 15);
        expect(angleOf([0, 0, 0])).toBe(0);
        // 큐 방향 규약: d = (cos φ, sin φ) 의 각을 되돌린다 — 3-4-5 삼각형으로 φ 를 확인
        expect(angleOf([0.6, 0.8, 0])).toBeCloseTo(angleOf([3, 4, 0]), 15);
    });

    it("lerp: t=0 → a, t=1 → b, t=0.5 → 중점", () => {
        expect(lerp(A, B, 0)).toEqual(A);
        expect(lerp(A, B, 1)).toEqual(B);
        expect(lerp(A, B, 0.5)).toEqual([-1.5, 1.25, 2.5]);
    });
});

describe("vec — 입력 불변·새 튜플", () => {
    it("어떤 함수도 인자를 바꾸지 않고, 결과는 항상 새 길이 3 배열이다", () => {
        const a: Vec3 = [1, 2, 3];
        const b: Vec3 = [4, 5, 6];
        const snapshotA = [...a];
        const snapshotB = [...b];
        const results = [
            add(a, b), sub(a, b), scale(a, 2), cross(a, b), unit(a), negate(a), upCross(a), lerp(a, b, 0.3),
        ];
        for (const r of results) {
            expect(r).toHaveLength(3);
            expect(r).not.toBe(a);
            expect(r).not.toBe(b);
        }
        expect(a).toEqual(snapshotA);
        expect(b).toEqual(snapshotB);
        // 같은 입력이면 같은 값이되 다른 객체
        expect(add(a, b)).toEqual(add(a, b));
        expect(add(a, b)).not.toBe(add(a, b));
    });
});
