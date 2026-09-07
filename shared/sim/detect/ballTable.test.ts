/**
 * detect/ballTable.ts 검증: 착지 시각이 evolveBall 이분법 오라클과 일치, 근 선택(상승/하강), EPS 필터, 비 airborne, 입력 불변.
 */
import { describe, expect, it } from "vitest";
import type { BallState, Vec3 } from "../types.js";
import { TABLES } from "../params.js";
import { evolveBall, landingTime } from "../evolve.js";
import { ballTableTime, EVENT_EPS } from "./index.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;
const g = P.g;

function air(z: number, v: Vec3, w: Vec3 = [0, 0, 0]): BallState {
    return { id: "cue", r: [0.5, 1.0, z], v, w, state: "airborne" };
}

/** [0, tmax] 를 훑어 f 가 처음 양 → 음이 되는 구간을 찾고 이분법 (감지기와 독립인 오라클). */
function bisect(f: (t: number) => number, tmax: number, steps = 4000): number {
    let lo = 0, hi = NaN;
    for (let i = 1; i <= steps; i++) {
        const t = (tmax * i) / steps;
        if (f(t) < 0) { hi = t; break; }
        lo = t;
    }
    expect(Number.isFinite(hi)).toBe(true);
    for (let i = 0; i < 200; i++) {
        const mid = 0.5 * (lo + hi);
        if (mid === lo || mid === hi) break;
        if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

describe("ballTableTime / landingTime", () => {
    it("위로 떠난 공: t = 2 v_z / g, evolveBall 오라클과 1e-12 안에서 일치하고 그 순간 z = R", () => {
        for (const vz of [0.4, 1.2, 3.5]) {
            const b = air(R, [1, -0.5, vz], [10, 20, 30]);
            const t = ballTableTime(b, P);
            expect(t).toBeCloseTo((2 * vz) / g, 12);
            // 오라클: 상승 구간을 지난 뒤 z − R 이 음이 되는 첫 시각
            const ref = bisect((s) => evolveBall(b, s, P).r[2] - R + (s < vz / g ? 1 : 0), 1.5);
            expect(Math.abs(t - ref)).toBeLessThan(1e-10);
            const at = evolveBall(b, t, P);
            expect(Math.abs(at.r[2] - R)).toBeLessThan(1e-12);
            expect(at.v[2]).toBeLessThan(0);
            expect(at.w).toEqual([10, 20, 30]);
        }
    });

    it("높이 h 에서 정지(v_z = 0)·상승·하강 중인 공: 하강 근만 고른다", () => {
        const h = 0.08;
        expect(ballTableTime(air(R + h, [0, 0, 0]), P)).toBeCloseTo(Math.sqrt((2 * h) / g), 12);
        const up = air(R + h, [0, 0, 1]);
        const tUp = ballTableTime(up, P);
        expect(evolveBall(up, tUp, P).v[2]).toBeLessThan(0);
        expect(Math.abs(evolveBall(up, tUp, P).r[2] - R)).toBeLessThan(1e-12);
        const down = air(R + h, [0, 0, -1]);
        const tDown = ballTableTime(down, P);
        expect(tDown).toBeLessThan(tUp);
        expect(Math.abs(evolveBall(down, tDown, P).r[2] - R)).toBeLessThan(1e-12);
    });

    it("z = R 에서 내려가는 공(타격 직후)은 landingTime 0, 감지기는 Infinity(즉시 스윕의 몫)", () => {
        const struck = air(R, [2, 0, -1]);
        expect(landingTime(struck, P)).toBe(0);
        expect(ballTableTime(struck, P)).toBe(Infinity);
        // R 아래로 새어 들어간(반올림) 공도 0
        expect(landingTime(air(R - 1e-15, [2, 0, -1]), P)).toBe(0);
        expect(landingTime(air(R, [2, 0, 0]), P)).toBe(0);
        // 아주 작은 v_z 로 떠난 공: 비행이 EVENT_EPS 안에 끝나면 감지기는 버리고 landingTime 은 그 작은 값을 준다
        const tiny = air(R, [2, 0, 1e-12]);
        expect(landingTime(tiny, P)).toBeLessThanOrEqual(EVENT_EPS);
        expect(ballTableTime(tiny, P)).toBe(Infinity);
    });

    it("R 아래에서 올라가는 병적 상태: R 를 넘었다 내려오는 근이 있으면 그것, 없으면 0", () => {
        // z(t) − R = −1e-6 + t − ½ g t² = 0 의 큰 근
        expect(landingTime(air(R - 1e-6, [0, 0, 1]), P)).toBeCloseTo((1 + Math.sqrt(1 - 2 * g * 1e-6)) / g, 12);
        expect(landingTime(air(R - 1e-3, [0, 0, 1e-4]), P)).toBe(0);
    });

    it("airborne 이 아닌 상태는 Infinity; g = 0 이면 내려가는 공만 선형 근", () => {
        for (const state of ["stationary", "sliding", "rolling", "spinning"] as const) {
            expect(landingTime({ ...air(R + 0.1, [0, 0, -1]), state }, P)).toBe(Infinity);
            expect(ballTableTime({ ...air(R + 0.1, [0, 0, -1]), state }, P)).toBe(Infinity);
        }
        const P0 = { ...P, g: 0 };
        expect(landingTime(air(R + 0.1, [0, 0, -2]), P0)).toBeCloseTo(0.05, 12);
        expect(landingTime(air(R + 0.1, [0, 0, 2]), P0)).toBe(Infinity);
        expect(landingTime(air(R + 0.1, [1, 0, 0]), P0)).toBe(Infinity);
    });

    it("입력을 바꾸지 않는다", () => {
        const b = air(R + 0.05, [1, 2, 0.3], [4, 5, 6]);
        Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w); Object.freeze(b);
        const snap = JSON.stringify(b);
        expect(() => ballTableTime(b, P)).not.toThrow();
        expect(JSON.stringify(b)).toBe(snap);
    });
});
