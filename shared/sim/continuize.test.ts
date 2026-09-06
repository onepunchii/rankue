/**
 * continuize.ts 검증: stateAt 이 직전 스냅샷에서 닫힌 식으로 전진하고 이벤트를 넘지 않는다, frames 의 경계·간격.
 */
import { describe, it, expect } from "vitest";
import { stateAt, frames } from "./continuize";
import { simulateFrom } from "./simulate";
import { evolveBall } from "./evolve";
import { TABLES, DEFAULT_CUE, type SimParams } from "./params";
import type { BallState, SimResult } from "./types";

const T = TABLES.DAEDAE;
const R = T.ball.R;
const P: SimParams = { table: T, cue: DEFAULT_CUE, cushionModel: "han2005", condition: 1 };

function rolling(id: string, x: number, y: number, vx: number, vy: number): BallState {
    return { id, r: [x, y, R], v: [vx, vy, 0], w: [-vy / R, vx / R, 0], state: "rolling" };
}
function still(id: string, x: number, y: number): BallState {
    return { id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
}

function deepFreeze<T>(o: T): T {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) {
        const v = (o as Record<string, unknown>)[k];
        if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
    return o;
}

// 큐볼이 상단 쿠션을 맞고 돌아오며 적구를 맞히는 샷: 전이·쿠션·볼–볼 이벤트가 모두 들어 있다.
const result = deepFreeze(simulateFrom([rolling("c", 0.5, 1.2, 0.3, 2.0), still("o", 0.75, 1.0)], P));

describe("stateAt", () => {
    it("스냅샷 시각에서는 스냅샷 그대로(비트 동일), 사이에서는 직전 스냅샷의 evolveBall", () => {
        const h = result.history;
        expect(h.length).toBeGreaterThan(3);
        for (let k = 0; k < h.length; k++) {
            const s = stateAt(result, h[k].t, T.ball);
            // 같은 시각 스냅샷이 여럿이면 마지막 것과 같아야 한다
            let last = k;
            while (last + 1 < h.length && h[last + 1].t === h[k].t) last++;
            expect(s).toEqual(h[last].balls);
        }
        for (let k = 0; k + 1 < h.length; k++) {
            if (h[k + 1].t === h[k].t) continue;
            const t = h[k].t + (h[k + 1].t - h[k].t) * 0.37;
            const s = stateAt(result, t, T.ball);
            expect(s).toEqual(h[k].balls.map((b) => evolveBall(b, t - h[k].t, T.ball)));
        }
    });

    it("이벤트를 넘어 외삽하지 않는다: 쿠션 직전엔 접근 중, 이벤트 시각엔 반사된 상태", () => {
        const k = result.events.findIndex((e) => e.type === "ball-cushion");
        expect(k).toBeGreaterThanOrEqual(0);
        const te = result.events[k].t;
        const before = stateAt(result, te - 1e-6, T.ball).find((b) => b.id === "c")!;
        const at = stateAt(result, te, T.ball).find((b) => b.id === "c")!;
        expect(before.v[1]).toBeGreaterThan(0);    // 상단 쿠션(+y)으로 접근 중
        expect(at.v[1]).toBeLessThan(0);           // 반사됨
        expect(before.r[1]).toBeLessThanOrEqual(T.length - R + 1e-9);
    });

    it("시작 전은 시작 상태, 끝 이후는 최종(정지) 상태", () => {
        expect(stateAt(result, -1, T.ball)).toEqual(result.history[0].balls);
        const after = stateAt(result, result.duration + 100, T.ball);
        expect(after).toEqual(result.final);
        expect(after.every((b) => b.state === "stationary")).toBe(true);
    });

    it("history 가 비면 []", () => {
        expect(stateAt({ history: [] }, 1, T.ball)).toEqual([]);
    });

    it("동시 이벤트(코너) 뒤 상태는 두 이벤트를 모두 반영한다", () => {
        const corner = simulateFrom([rolling("c", R + 0.4, R + 0.4, -1.5, -1.5)], P);
        const t = corner.events[0].t;
        expect(corner.events[1].t).toBe(t);
        const s = stateAt(corner, t, T.ball)[0];
        expect(s.v[0]).toBeGreaterThan(0);
        expect(s.v[1]).toBeGreaterThan(0);
    });
});

describe("frames", () => {
    it("0 부터 duration 까지 dt 간격, 마지막 프레임은 정확히 끝 시각", () => {
        const dt = 1 / 60;
        const fr = frames(result, dt, T.ball);
        expect(fr[0].t).toBe(0);
        expect(fr[fr.length - 1].t).toBe(result.duration);
        const n = Math.floor(result.duration / dt);
        // k·dt 프레임 n+1 개 + (나머지가 있으면) 끝 프레임 1개
        expect(fr.length === n + 1 || fr.length === n + 2).toBe(true);
        for (let k = 1; k < fr.length - 1; k++) {
            expect(fr[k].t - fr[k - 1].t).toBeCloseTo(dt, 12);
        }
        for (let k = 1; k < fr.length; k++) expect(fr[k].t).toBeGreaterThan(fr[k - 1].t);
        // 각 프레임은 stateAt 과 같다
        for (const f of fr) expect(f.balls).toEqual(stateAt(result, f.t, T.ball));
        expect(fr[fr.length - 1].balls).toEqual(result.final);
    });

    it("dt 가 duration 을 정확히 나누면 끝 프레임이 중복되지 않는다", () => {
        const fake: Pick<SimResult, "history"> = {
            history: [
                { t: 0, balls: [still("a", 0.5, 0.5)] },
                { t: 1, balls: [still("a", 0.5, 0.5)] },
            ],
        };
        const fr = frames(fake, 0.25, T.ball);
        expect(fr.map((f) => f.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it("t0 ≠ 0 인 simulateFrom 결과도 history[0].t 부터 샘플한다", () => {
        const r2 = simulateFrom([rolling("c", 0.5, 1.2, 0.3, 2.0)], P, 5);
        expect(r2.history[0].t).toBe(5);
        const fr = frames(r2, 0.5, T.ball);
        expect(fr[0].t).toBe(5);
        expect(fr[fr.length - 1].t).toBe(5 + r2.duration);
    });

    it("dt ≤ 0 이나 비유한이면 RangeError", () => {
        expect(() => frames(result, 0, T.ball)).toThrow(RangeError);
        expect(() => frames(result, -1, T.ball)).toThrow(RangeError);
        expect(() => frames(result, Infinity, T.ball)).toThrow(RangeError);
    });
});
