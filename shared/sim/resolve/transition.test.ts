/**
 * resolve/transition.ts 검증: 각 상태 진입의 정준화, 1e-12 스냅, 미끄럼 끝에서 접점 속도가 정확히 0, 입력 불변.
 */
import { describe, it, expect } from "vitest";
import { applyTransition, SNAP_TOLERANCE } from "./transition.js";
import { evolveBall, kineticEnergy, slideTime, slipVelocity } from "../evolve.js";
import { TABLES } from "../params.js";
import { scale, upCross } from "../vec.js";
import type { BallState } from "../types.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;

function ball(v: readonly [number, number, number], w: readonly [number, number, number], state: BallState["state"] = "sliding"): BallState {
    return { id: "x", r: [0.3, 0.4, R], v, w, state };
}

function deepFreeze<T>(o: T): T {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) {
        const v = (o as Record<string, unknown>)[k];
        if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
    return o;
}

describe("applyTransition", () => {
    it("rolling 진입: ω_xy 가 정확히 (1/R)k̂×v, ω_z 유지, v_z = 0", () => {
        const b = ball([1.2, -0.7, 0.3], [5, 6, -40]);
        const out = applyTransition(b, "rolling", P);
        expect(out.state).toBe("rolling");
        expect(out.v).toEqual([1.2, -0.7, 0]);
        // evolve.ts 의 구름 식 scale(upCross(v), 1/R) 과 비트 단위로 같아야 한다
        expect(out.w[0]).toBe(0.7 * (1 / R));
        expect(out.w[1]).toBe(1.2 * (1 / R));
        expect(out.w[2]).toBe(-40);
        expect(out.w.slice(0, 2)).toEqual(scale(upCross(out.v), 1 / R).slice(0, 2));
        // 접점 속도가 정확히 0
        const u = slipVelocity(out, P);
        expect(Math.abs(u[0])).toBeLessThan(1e-15);
        expect(Math.abs(u[1])).toBeLessThan(1e-15);
    });

    it("spinning 진입: v = 0, ω_xy = 0, ω_z 유지", () => {
        const out = applyTransition(ball([1e-13, 2e-13, 0], [3e-13, -1e-13, 12.5], "rolling"), "spinning", P);
        expect(out).toEqual({ id: "x", r: [0.3, 0.4, R], v: [0, 0, 0], w: [0, 0, 12.5], state: "spinning" });
    });

    it("stationary 진입: 전부 0", () => {
        const out = applyTransition(ball([1e-13, -1e-13, 0], [0, 0, 1e-13], "spinning"), "stationary", P);
        expect(out).toEqual({ id: "x", r: [0.3, 0.4, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });
    });

    it("sliding 진입: 값 유지(스냅만), 상태만 바뀜", () => {
        const out = applyTransition(ball([0.5, 0.25, 0], [1, 2, 3], "stationary"), "sliding", P);
        expect(out).toEqual({ id: "x", r: [0.3, 0.4, R], v: [0.5, 0.25, 0], w: [1, 2, 3], state: "sliding" });
    });

    it("|x| < 1e-12 스냅, 경계값은 유지", () => {
        const tiny = SNAP_TOLERANCE / 2;
        const out = applyTransition(ball([tiny, -tiny, 0], [tiny, tiny, -tiny]), "rolling", P);
        expect(out.v).toEqual([0, 0, 0]);
        expect(out.w).toEqual([0, 0, 0]);
        // 정확히 1e-12 는 스냅하지 않는다
        const keep = applyTransition(ball([SNAP_TOLERANCE, 0, 0], [0, 0, SNAP_TOLERANCE]), "rolling", P);
        expect(keep.v[0]).toBe(SNAP_TOLERANCE);
        expect(keep.w[2]).toBe(SNAP_TOLERANCE);
    });

    it("미끄럼 공을 slideTime 까지 전진시켜 rolling 으로 전이하면 접점 속도 0, 에너지 변화 무시할 수준", () => {
        // 밀어치기·끌어치기·사이드 섞인 여러 초기 상태
        const cases: Array<[readonly [number, number, number], readonly [number, number, number]]> = [
            [[2, 0, 0], [0, 0, 0]],
            [[2, 1, 0], [0, 90, 0]],
            [[-1.5, 2.5, 0], [30, -20, 25]],
            [[0.3, -0.2, 0], [-10, 40, -5]],
        ];
        for (const [v, w] of cases) {
            const b = ball(v, w);
            const ts = slideTime(b, P);
            const before = evolveBall(b, ts, P);
            const after = applyTransition(before, "rolling", P);
            const u = slipVelocity(after, P);
            expect(Math.abs(u[0]) + Math.abs(u[1])).toBeLessThan(1e-15);
            const e0 = kineticEnergy(before, P), e1 = kineticEnergy(after, P);
            expect(Math.abs(e1 - e0)).toBeLessThan(1e-12 * Math.max(e0, 1e-30));
        }
    });

    it("입력 불변: 얼린 입력으로도 동작하고 반환 튜플은 새 배열", () => {
        const b = deepFreeze(ball([1, 2, 0], [3, 4, 5]));
        const out = applyTransition(b, "rolling", P);
        expect(out.r).not.toBe(b.r);
        expect(out.v).not.toBe(b.v);
        expect(out.w).not.toBe(b.w);
        expect(b.v).toEqual([1, 2, 0]);
        expect(b.w).toEqual([3, 4, 5]);
        expect(b.state).toBe("sliding");
    });
});
