import { describe, expect, it } from "vitest";
import type { BallState, Vec3 } from "./types.js";
import { TABLES } from "./params.js";
import {
    evolveBall,
    kineticEnergy,
    landingTime,
    nextTransition,
    positionPolynomial,
    rollTime,
    slideTime,
    slipVelocity,
    spinTime,
} from "./evolve.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;

function ball(partial: Partial<BallState> & { state: BallState["state"] }): BallState {
    return {
        id: "cue",
        r: [0.5, 1.0, R],
        v: [0, 0, 0],
        w: [0, 0, 0],
        ...partial,
    };
}

function norm(v: Vec3): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 자연 구름 각속도 ω = (1/R) k̂ × v 에 topspin 비율 x 를 곱한 것 (x = 1 이면 정확히 구름). */
function rollSpin(v: Vec3, x: number): Vec3 {
    return [(-v[1] * x) / R, (v[0] * x) / R, 0];
}

function deepFreeze(b: BallState): BallState {
    Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w);
    return Object.freeze(b);
}

function snapshot(b: BallState) {
    return JSON.stringify(b);
}

describe("slipVelocity", () => {
    it("u = (v_x − R ω_y, v_y + R ω_x, 0)", () => {
        const b = ball({ state: "sliding", v: [1, 2, 0], w: [3, 4, 5] });
        expect(slipVelocity(b, P)).toEqual([1 - R * 4, 2 + R * 3, 0]);
    });
    it("자연 구름이면 u = 0", () => {
        const v: Vec3 = [1.3, -0.7, 0];
        const b = ball({ state: "rolling", v, w: rollSpin(v, 1) });
        expect(norm(slipVelocity(b, P))).toBeLessThan(1e-15);
    });
});

describe("sliding (TP A.4)", () => {
    it("5/7 법칙: 스핀 없는 미끄럼이 구름으로 바뀔 때 v_f = (5/7) v0", () => {
        const v0: Vec3 = [2.4, -1.1, 0];
        const b = ball({ state: "sliding", v: v0 });
        const ts = slideTime(b, P);
        expect(ts).toBeCloseTo((2 / 7) * norm(v0) / (P.muS * P.g), 12);
        const e = evolveBall(b, ts, P);
        expect(e.v[0]).toBeCloseTo((5 / 7) * v0[0], 12);
        expect(e.v[1]).toBeCloseTo((5 / 7) * v0[1], 12);
        expect(e.v[2]).toBe(0);
    });

    it("탑스핀 포함: v_f = (5/7) v0 + (2/7) ω0 × (R k̂)  (TP A.4 식 24, μ_s 무관)", () => {
        const v0: Vec3 = [1.8, 0.6, 0];
        for (const x of [-1, -0.4, 0.3, 0.7, 1.5, 2.5]) {
            const w0 = rollSpin(v0, x);
            const b = ball({ state: "sliding", v: v0, w: w0 });
            const ts = slideTime(b, P);
            const e = evolveBall(b, ts, P);
            const term = cross(w0, [0, 0, R]);
            const expected: Vec3 = [
                (5 / 7) * v0[0] + (2 / 7) * term[0],
                (5 / 7) * v0[1] + (2 / 7) * term[1],
                0,
            ];
            expect(e.v[0]).toBeCloseTo(expected[0], 12);
            expect(e.v[1]).toBeCloseTo(expected[1], 12);
            // μ_s 를 바꿔도 v_f 는 같다(경로 길이만 달라진다)
            const P2 = { ...P, muS: P.muS * 1.7 };
            const e2 = evolveBall(b, slideTime(b, P2), P2);
            expect(e2.v[0]).toBeCloseTo(expected[0], 12);
            expect(e2.v[1]).toBeCloseTo(expected[1], 12);
        }
    });

    it("미끄럼 방향은 일정: u(t) ∥ u0 이고 크기는 선형 감소", () => {
        const v0: Vec3 = [1.5, 0.4, 0];
        const b = ball({ state: "sliding", v: v0, w: [6, -15, 20] });
        const u0 = slipVelocity(b, P);
        const uHat: Vec3 = [u0[0] / norm(u0), u0[1] / norm(u0), 0];
        const ts = slideTime(b, P);
        for (const f of [0.05, 0.2, 0.5, 0.8, 0.99]) {
            const t = ts * f;
            const u = slipVelocity(evolveBall(b, t, P), P);
            const along = u[0] * uHat[0] + u[1] * uHat[1];
            const perp = Math.abs(u[0] * uHat[1] - u[1] * uHat[0]);
            expect(perp).toBeLessThan(1e-12);
            expect(along).toBeGreaterThan(0);
            expect(along).toBeCloseTo(norm(u0) - 3.5 * P.muS * P.g * t, 10);
        }
    });

    it("slideTime 에 미끄럼이 정확히 0 이 되고 구름 조건이 성립한다", () => {
        const b = ball({ state: "sliding", v: [-0.9, 2.2, 0], w: [-30, 5, -12] });
        const ts = slideTime(b, P);
        const e = evolveBall(b, ts, P);
        expect(norm(slipVelocity(e, P))).toBeLessThan(1e-9);
        // 구름 조건 ω_xy = (1/R) k̂ × v
        expect(e.w[0]).toBeCloseTo(-e.v[1] / R, 9);
        expect(e.w[1]).toBeCloseTo(e.v[0] / R, 9);
        expect(e.state).toBe("sliding"); // evolveBall 은 전이하지 않는다
    });

    it("z 위치는 항상 R", () => {
        const b = ball({ state: "sliding", v: [1, 1, 0], w: [10, 0, 0] });
        expect(evolveBall(b, 0.1, P).r[2]).toBe(R);
        const rb = ball({ state: "rolling", v: [1, 1, 0], w: rollSpin([1, 1, 0], 1) });
        expect(evolveBall(rb, 0.1, P).r[2]).toBe(R);
    });

    it("미끄럼이 없는(u=0) sliding 공은 slideTime 0, 등속 이동", () => {
        const v0: Vec3 = [1, 0, 0];
        const b = ball({ state: "sliding", v: v0, w: rollSpin(v0, 1) });
        expect(slideTime(b, P)).toBe(0);
        const e = evolveBall(b, 0.2, P);
        expect(e.v).toEqual(v0);
        expect(e.r[0]).toBeCloseTo(0.5 + 0.2, 14);
    });
});

describe("rolling (TP A.16)", () => {
    it("자연 구름 정지 거리 d = v0²/(2 μ_r g)", () => {
        for (const speed of [0.5, 1.0, 2.0, 3.0]) {
            const v0: Vec3 = [speed * 0.6, speed * 0.8, 0];
            const b = ball({ state: "rolling", v: v0, w: rollSpin(v0, 1) });
            const tr = rollTime(b, P);
            expect(tr).toBeCloseTo(speed / (P.muR * P.g), 12);
            const e = evolveBall(b, tr, P);
            const d = Math.sqrt((e.r[0] - b.r[0]) ** 2 + (e.r[1] - b.r[1]) ** 2);
            expect(Math.abs(d - (speed * speed) / (2 * P.muR * P.g))).toBeLessThan(1e-9);
            expect(norm(e.v)).toBeLessThan(1e-9);
        }
    });

    it("구름 중에는 항상 구름 조건이 유지되고 방향이 변하지 않는다", () => {
        const v0: Vec3 = [-1.2, 0.5, 0];
        const b = ball({ state: "rolling", v: v0, w: rollSpin(v0, 1) });
        const tr = rollTime(b, P);
        for (const f of [0.1, 0.5, 0.9]) {
            const e = evolveBall(b, tr * f, P);
            expect(norm(slipVelocity(e, P))).toBeLessThan(1e-12);
            expect(e.v[0] * v0[1] - e.v[1] * v0[0]).toBeCloseTo(0, 12);
            expect(norm(e.v)).toBeCloseTo(norm(v0) * (1 - f), 12);
        }
    });
});

describe("ω_z 감쇠", () => {
    it("spinDecel 로 선형 감소하고 0 을 절대 넘지 않는다 (양·음 모두)", () => {
        for (const wz of [25, -25, 0.3, -0.3]) {
            const b = ball({ state: "spinning", w: [0, 0, wz] });
            const tsp = spinTime(b, P);
            expect(tsp).toBeCloseTo(Math.abs(wz) / P.spinDecel, 12);
            let prev = Math.abs(wz);
            for (const t of [0, tsp * 0.25, tsp * 0.5, tsp * 0.999, tsp, tsp * 1.5, tsp * 10, 1e6]) {
                const e = evolveBall(b, t, P);
                const z = e.w[2];
                // 부호가 뒤집히지 않는다
                expect(z * wz >= 0).toBe(true);
                expect(Math.abs(z)).toBeLessThanOrEqual(prev + 1e-12);
                prev = Math.abs(z);
                if (t < tsp) expect(z).toBeCloseTo(wz - Math.sign(wz) * P.spinDecel * t, 12);
                if (t >= tsp) expect(z).toBe(0);
                expect(e.r).toEqual(b.r);
                expect(e.v).toEqual(b.v);
            }
        }
    });

    it("미끄럼·구름 중에도 ω_z 는 같은 식으로 독립 감쇠한다", () => {
        const v0: Vec3 = [3, 0, 0];
        const s = ball({ state: "sliding", v: v0, w: [0, 0, 8] });
        const r = ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, -8] });
        for (const t of [0.1, 0.5, 0.72, 0.8]) {
            const expected = Math.max(0, 8 - P.spinDecel * t);
            expect(evolveBall(s, t, P).w[2]).toBeCloseTo(expected, 12);
            expect(evolveBall(r, t, P).w[2]).toBeCloseTo(-expected, 12);
        }
    });

    it("spinDecel = 0 이면 감쇠하지 않고 spinTime 은 Infinity", () => {
        const P0 = { ...P, spinDecel: 0 };
        const b = ball({ state: "spinning", w: [0, 0, 5] });
        expect(spinTime(b, P0)).toBe(Infinity);
        expect(evolveBall(b, 3, P0).w[2]).toBe(5);
        expect(nextTransition(b, P0)).toBeNull();
    });
});

describe("nextTransition", () => {
    it("sliding → rolling", () => {
        const b = ball({ state: "sliding", v: [1, 0, 0] });
        const c = nextTransition(b, P)!;
        expect(c.dt).toBe(slideTime(b, P));
        expect(c.event).toEqual({ type: "transition", t: c.dt, ids: ["cue"], from: "sliding", to: "rolling" });
    });
    it("rolling → spinning (구름이 끝난 뒤 ω_z 가 남으면)", () => {
        const v0: Vec3 = [0.5, 0, 0];
        // rollTime = 0.5/(0.01·9.81) ≈ 5.1 s. ω_z = 100 → 5.1 s 뒤 ≈ 44 rad/s 남음
        const b = ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, 100] });
        const c = nextTransition(b, P)!;
        expect(c.dt).toBe(rollTime(b, P));
        expect(c.event.type).toBe("transition");
        if (c.event.type === "transition") {
            expect(c.event.from).toBe("rolling");
            expect(c.event.to).toBe("spinning");
        }
    });
    it("rolling → stationary (ω_z 가 먼저 소진되면)", () => {
        const v0: Vec3 = [0.5, 0, 0];
        const b = ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, 3] });
        const c = nextTransition(b, P)!;
        if (c.event.type === "transition") expect(c.event.to).toBe("stationary");
        const b2 = ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, 0] });
        const c2 = nextTransition(b2, P)!;
        if (c2.event.type === "transition") expect(c2.event.to).toBe("stationary");
    });
    it("spinning → stationary, stationary → null", () => {
        const s = ball({ state: "spinning", w: [0, 0, -7] });
        const c = nextTransition(s, P)!;
        expect(c.dt).toBeCloseTo(7 / P.spinDecel, 12);
        if (c.event.type === "transition") expect(c.event.to).toBe("stationary");
        expect(nextTransition(ball({ state: "stationary" }), P)).toBeNull();
    });
    it("상태에 맞지 않는 시간 함수는 Infinity", () => {
        const s = ball({ state: "stationary", v: [1, 0, 0], w: [0, 0, 3] });
        expect(slideTime(s, P)).toBe(Infinity);
        expect(rollTime(s, P)).toBe(Infinity);
        expect(spinTime(s, P)).toBe(Infinity);
        expect(slideTime(ball({ state: "sliding", v: [1, 0, 0] }), { ...P, muS: 0 })).toBe(Infinity);
        expect(rollTime(ball({ state: "rolling", v: [1, 0, 0] }), { ...P, muR: 0 })).toBe(Infinity);
    });
});

describe("positionPolynomial", () => {
    const cases: BallState[] = [
        ball({ state: "sliding", v: [5, -1, 0], w: [10, 25, -8] }), // t_s ≈ 0.62 s > 0.5 s
        ball({ state: "rolling", v: [2, 3, 0], w: [-3 / R, 2 / R, 4] }),
        ball({ state: "spinning", w: [0, 0, 9] }),
        ball({ state: "stationary" }),
        ball({ state: "airborne", r: [0.5, 1.0, R + 0.02], v: [1.5, -0.5, 2.5], w: [10, 25, -8] }),  // 착지까지 ≈ 0.52 s
    ];
    it("r(t) = r0 + r1 t + r2 t² 이 evolveBall 과 1e-12 안에서 일치 (t = 0.01, 0.1, 0.5)", () => {
        for (const b of cases) {
            const { r0, r1, r2 } = positionPolynomial(b, P);
            expect(r0).toEqual(b.r);
            expect(r1).toEqual(b.v);
            for (const t of [0.01, 0.1, 0.5]) {
                // 전이 시각 이전에서만 비교한다 (sliding: t_s ≈ 0.6 s, rolling: t_r ≈ 37 s)
                expect(t).toBeLessThan(b.state === "sliding" ? slideTime(b, P) : Infinity);
                const e = evolveBall(b, t, P);
                for (let i = 0; i < 3; i++) {
                    expect(Math.abs(r0[i] + r1[i] * t + r2[i] * t * t - e.r[i])).toBeLessThan(1e-12);
                }
            }
        }
    });
    it("가속도 크기: sliding ½μ_s g, rolling ½μ_r g, airborne (0, 0, −½g), 그 외 0", () => {
        expect(norm(positionPolynomial(cases[0], P).r2)).toBeCloseTo(0.5 * P.muS * P.g, 12);
        expect(norm(positionPolynomial(cases[1], P).r2)).toBeCloseTo(0.5 * P.muR * P.g, 12);
        expect(positionPolynomial(cases[2], P).r2).toEqual([0, 0, 0]);
        expect(positionPolynomial(cases[3], P).r2).toEqual([0, 0, 0]);
        expect(positionPolynomial(cases[4], P).r2).toEqual([0, 0, -0.5 * P.g]);
    });
});

describe("kineticEnergy", () => {
    it("½ m v² + ½ (2/5 m R²) ω² (천 위: 위치에너지 항이 정확히 0 이라 2.1.0 값과 비트 동일)", () => {
        const b = ball({ state: "sliding", v: [3, 4, 0], w: [0, 0, 10] });
        expect(kineticEnergy(b, P)).toBe(0.5 * P.m * (3 * 3 + 4 * 4 + 0 * 0) + 0.5 * (0.4 * P.m * R * R) * (0 * 0 + 0 * 0 + 10 * 10));
        expect(kineticEnergy(b, P)).toBeCloseTo(0.5 * P.m * 25 + 0.5 * 0.4 * P.m * R * R * 100, 14);
        expect(kineticEnergy(ball({ state: "stationary" }), P)).toBe(0);
    });

    it("v2.2: 위치에너지 m g (z − R) 가 더해진다 — 공중 공의 KE + PE 는 비행 중 일정", () => {
        const b = ball({ state: "airborne", r: [0.5, 1.0, R + 0.03], v: [1, 0, 2], w: [0, 0, 0] });
        expect(kineticEnergy(b, P)).toBeCloseTo(0.5 * P.m * 5 + P.m * P.g * 0.03, 14);
        const E0 = kineticEnergy(b, P);
        for (const t of [0.05, 0.1, 0.2, 0.3, 0.4]) {
            expect(Math.abs(kineticEnergy(evolveBall(b, t, P), P) - E0)).toBeLessThan(1e-12 * E0);
        }
    });

    it("모든 상태에서 시간에 대해 단조 비증가", () => {
        const v0: Vec3 = [2.5, -1.5, 0];
        const balls: BallState[] = [
            ball({ state: "sliding", v: v0, w: [40, 20, 30] }),      // 강한 미끄럼
            ball({ state: "sliding", v: v0, w: rollSpin(v0, 2.5) }), // 탑스핀 (마찰이 가속하는 경우도 에너지는 감소)
            ball({ state: "sliding", v: v0, w: rollSpin(v0, -1) }),  // 드로우
            ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, -12] }),
            ball({ state: "spinning", w: [0, 0, 30] }),
            ball({ state: "stationary" }),
            ball({ state: "airborne", r: [0.5, 1.0, R], v: [1, 1, 1.5], w: [5, 5, 5] }),   // KE + PE 일정(비증가로 통과)
        ];
        for (const b of balls) {
            const T = Math.min(slideTime(b, P), rollTime(b, P), spinTime(b, P), landingTime(b, P), 5);
            const horizon = Number.isFinite(T) ? T : 1;
            let prev = kineticEnergy(b, P);
            for (let i = 1; i <= 200; i++) {
                const e = kineticEnergy(evolveBall(b, (horizon * i) / 200, P), P);
                expect(e).toBeLessThanOrEqual(prev + 1e-12);
                prev = e;
            }
        }
    });
});

describe("airborne (v2.2)", () => {
    it("포물선: r = r0 + v0 t − ½ g t² ẑ, v_z = v_z0 − g t, xy 등속, ω 불변(ω_z 도 감쇠하지 않는다), state 유지", () => {
        const b = ball({ state: "airborne", r: [0.5, 1.0, R + 0.01], v: [1.2, -0.4, 1.8], w: [3, -7, 25] });
        for (const t of [0.01, 0.1, 0.25]) {
            const e = evolveBall(b, t, P);
            expect(e.r[0]).toBeCloseTo(0.5 + 1.2 * t, 14);
            expect(e.r[1]).toBeCloseTo(1.0 - 0.4 * t, 14);
            expect(e.r[2]).toBeCloseTo(R + 0.01 + 1.8 * t - 0.5 * P.g * t * t, 14);
            expect(e.v).toEqual([1.2, -0.4, 1.8 - P.g * t]);
            expect(e.w).toEqual([3, -7, 25]);
            expect(e.state).toBe("airborne");
        }
        expect(evolveBall(b, 0, P)).toEqual(b);
    });

    it("landingTime: z = R 에서 위로 v_z 면 2 v_z/g, 높이 h 정지면 √(2h/g), 그 시각에 z = R; 전이 함수들은 airborne 에서 Infinity / null", () => {
        const up = ball({ state: "airborne", r: [0.5, 1.0, R], v: [1, 0, 1.5] });
        expect(landingTime(up, P)).toBeCloseTo(3 / P.g, 12);
        expect(Math.abs(evolveBall(up, landingTime(up, P), P).r[2] - R)).toBeLessThan(1e-12);
        const drop = ball({ state: "airborne", r: [0.5, 1.0, R + 0.05], v: [0, 0, 0] });
        expect(landingTime(drop, P)).toBeCloseTo(Math.sqrt(0.1 / P.g), 12);
        expect(landingTime(ball({ state: "airborne", r: [0.5, 1.0, R], v: [1, 0, -2] }), P)).toBe(0);
        expect(landingTime(ball({ state: "sliding", v: [1, 0, 0] }), P)).toBe(Infinity);
        expect(slideTime(up, P)).toBe(Infinity);
        expect(rollTime(up, P)).toBe(Infinity);
        expect(spinTime(up, P)).toBe(Infinity);
        expect(nextTransition(up, P)).toBeNull();
    });
});

describe("입력 불변", () => {
    it("어떤 함수도 인자를 바꾸지 않고, 반환 튜플은 입력과 별개의 배열이다", () => {
        const v0: Vec3 = [1.7, -0.3, 0];
        const balls = [
            deepFreeze(ball({ state: "sliding", v: v0, w: [5, 9, -4] })),
            deepFreeze(ball({ state: "rolling", v: v0, w: [-v0[1] / R, v0[0] / R, 6] })),
            deepFreeze(ball({ state: "spinning", w: [0, 0, 6] })),
            deepFreeze(ball({ state: "stationary" })),
            deepFreeze(ball({ state: "airborne", r: [0.5, 1.0, R + 0.02], v: [1, 1, 1], w: [1, 2, 3] })),
        ];
        const frozenP = Object.freeze({ ...P });
        for (const b of balls) {
            const before = snapshot(b);
            slipVelocity(b, frozenP);
            slideTime(b, frozenP); rollTime(b, frozenP); spinTime(b, frozenP); landingTime(b, frozenP);
            nextTransition(b, frozenP);
            positionPolynomial(b, frozenP);
            kineticEnergy(b, frozenP);
            const e = evolveBall(b, 0.05, frozenP);
            const e0 = evolveBall(b, 0, frozenP);
            expect(snapshot(b)).toBe(before);
            expect(e.r).not.toBe(b.r); expect(e.v).not.toBe(b.v); expect(e.w).not.toBe(b.w);
            expect(e0.r).not.toBe(b.r); expect(e0.v).not.toBe(b.v); expect(e0.w).not.toBe(b.w);
            expect(e0).toEqual(b);
            expect(e.id).toBe(b.id);
            expect(e.state).toBe(b.state);
        }
    });
});
