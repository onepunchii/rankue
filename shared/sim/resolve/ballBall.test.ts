/**
 * resolve/ballBall 검증 — pooltool tests/physics/resolve/ball_ball/test_ball_ball.py 의 불변량을 옮기고
 * 운동량 보존·에너지 비증가·불변성·결정론·반두께 분리각을 더했다.
 * 각도→벡터 변환은 절대 규칙 1 에 따라 dmath 만 쓴다.
 */
import { describe, expect, it } from "vitest";
import type { BallState, Vec3 } from "../types";
import type { BallParams } from "../params";
import { TABLES } from "../params";
import { HALF_PI, PI, TWO_PI, atan2, cos, exp, sin } from "../dmath";
import { add, cross, dot, length, scale, sub, unit, upCross } from "../vec";
import { kineticEnergy } from "../evolve";
import { ballBallFriction, resolveBallBall } from "./ballBall";
import { mulberry32 } from "../rng";

const P = TABLES.DAEDAE.ball;
const R = P.R;

// ── 픽스처 (pooltool 테스트의 helper 를 그대로 옮김) ─────────────────────────

function fromAngle(mag: number, ang: number): Vec3 {
    return [mag * cos(ang), mag * sin(ang), 0];
}

function ball(id: string, r: Vec3, v: Vec3 = [0, 0, 0], w: Vec3 = [0, 0, 0], p: BallParams = P): BallState {
    return { id, r: [r[0], r[1], p.R], v, w, state: "sliding" };
}

/** 큐볼을 원점에, 목적구를 중심선 각 θ 방향으로 정확히 2R 떨어진 곳에 둔다. */
function pair(locAngle: number, p: BallParams = P): [BallState, BallState] {
    const off = fromAngle(2 * p.R, locAngle);
    return [ball("cue", [0, 0, 0], [0, 0, 0], [0, 0, 0], p), ball("ob", [off[0], off[1], 0], [0, 0, 0], [0, 0, 0], p)];
}

function headOn(p: BallParams = P): [BallState, BallState] {
    const [cb, ob] = pair(0, p);
    return [{ ...cb, v: [1, 0, 0] }, ob];
}

/** 접점(중심에서 d 방향)의 표면 속도 접평면 성분 — pooltool tangent_surface_velocity. 모듈과 독립적으로 다시 씀. */
function tangentSurfaceVelocity(b: BallState, d: Vec3, Rb: number): Vec3 {
    const vt = sub(b.v, scale(d, dot(b.v, d)));
    return add(vt, cross(b.w, scale(d, Rb)));
}

/** 접점 상대속도가 0 이 되는(기어링) z-스핀: 접선 속도 s 에 대해 ω_z = −s/R. */
function gearingZSpin(b: BallState, n: Vec3, Rb: number): number {
    const s = length(sub(b.v, scale(n, dot(b.v, n))));
    return -s / Rb;
}

function deepFreeze(b: BallState): BallState {
    Object.freeze(b.r);
    Object.freeze(b.v);
    Object.freeze(b.w);
    return Object.freeze(b);
}

function clone(b: BallState): BallState {
    return { ...b, r: [...b.r], v: [...b.v], w: [...b.w] };
}

function bitEqual(a: Vec3, b: Vec3): boolean {
    return Object.is(a[0], b[0]) && Object.is(a[1], b[1]) && Object.is(a[2], b[2]);
}

/** 접근 중인(중심선 상대속도 > 0) 무작위 충돌 쌍 N 개. */
function randomCollisions(n: number, seed: number): Array<[BallState, BallState]> {
    const rnd = mulberry32(seed);
    const u = (lo: number, hi: number) => lo + (hi - lo) * rnd();
    const out: Array<[BallState, BallState]> = [];
    while (out.length < n) {
        const loc = u(0, TWO_PI);
        const [cb0, ob0] = pair(loc);
        const nHat = fromAngle(1, loc);
        const v1 = fromAngle(u(0, 6), u(0, TWO_PI));
        const v2 = fromAngle(u(0, 3), u(0, TWO_PI));
        if (dot(sub(v1, v2), nHat) <= 0.05) continue;
        const w1: Vec3 = [u(-150, 150), u(-150, 150), u(-150, 150)];
        const w2: Vec3 = [u(-100, 100), u(-100, 100), u(-100, 100)];
        out.push([{ ...cb0, v: v1, w: w1 }, { ...ob0, v: v2, w: w2 }]);
    }
    return out;
}

// ── 마찰 계수 ────────────────────────────────────────────────────────────────

describe("ballBallFriction", () => {
    it("μ(v) = a + b·exp(−c·v): 정지 표면에서 a+b, 빠르면 a 로 수렴, 단조 감소", () => {
        const { a, b, c } = P.muBB;
        expect(ballBallFriction(0, P)).toBe(a + b);
        expect(ballBallFriction(1, P)).toBe(a + b * exp(-c));
        expect(ballBallFriction(50, P)).toBeCloseTo(a, 12);
        let prev = Infinity;
        for (let v = 0; v <= 10; v += 0.25) {
            const mu = ballBallFriction(v, P);
            expect(mu).toBeLessThan(prev);
            expect(mu).toBeGreaterThan(0);
            prev = mu;
        }
    });
});

// ── pooltool 불변량 ──────────────────────────────────────────────────────────

describe("resolveBallBall — pooltool 불변량", () => {
    it("정면 무스핀, e=1 → 속도가 완전히 교환된다", () => {
        const [cb, ob] = headOn({ ...P, eB: 1 });
        const [cbF, obF] = resolveBallBall(cb, ob, { ...P, eB: 1 });
        expect(Math.abs(cbF.v[0])).toBeLessThan(1e-12);
        expect(Math.abs(cbF.v[1])).toBeLessThan(1e-12);
        expect(Math.abs(obF.v[0] - 1)).toBeLessThan(1e-12);
        expect(Math.abs(obF.v[1])).toBeLessThan(1e-12);
        expect(length(cbF.w)).toBe(0);
        expect(length(obF.w)).toBe(0);
    });

    it.each([0.5, 0.7, 0.93, 1.0])("e=%s: 분리 속도 = 접근 속도 × e (1e-12), 목적구 전진, 큐볼은 e<1 일 때만 따라감", (e) => {
        const p = { ...P, eB: e };
        const [cb, ob] = headOn(p);
        const [cbF, obF] = resolveBallBall(cb, ob, p);
        const approach = length(sub(cb.v, ob.v));
        const separation = length(sub(cbF.v, obF.v));
        expect(Math.abs(separation - approach * e)).toBeLessThan(1e-12);
        expect(obF.v[0]).toBeGreaterThan(0);
        if (e === 1) expect(Math.abs(cbF.v[0])).toBeLessThan(1e-12);
        else expect(cbF.v[0]).toBeGreaterThan(0);
    });

    it("같은 속도로 나란히 움직이는 대칭 쌍은 그대로 함께 간다", () => {
        const [cb0, ob0] = pair(0.7);
        const v: Vec3 = [0.3, -0.7, 0];
        const [cbF, obF] = resolveBallBall({ ...cb0, v }, { ...ob0, v }, P);
        expect(length(sub(cbF.v, v))).toBeLessThan(1e-12);
        expect(length(sub(obF.v, v))).toBeLessThan(1e-12);
        expect(length(cbF.w)).toBeLessThan(1e-12);
        expect(length(obF.w)).toBeLessThan(1e-12);
    });

    it.each([0.6, 0.8, 1.0])("e=%s: 병진 정면 충돌(pooltool translating_head_on) 후 y 속도가 같다", (e) => {
        const p = { ...P, eB: e };
        const [cb0, ob0] = pair(0, p);
        const [cbF, obF] = resolveBallBall({ ...cb0, v: [1, 1, 0] }, { ...ob0, v: [0, 1, 0] }, p);
        expect(Math.abs(cbF.v[1] - obF.v[1])).toBeLessThan(1e-10);
    });

    it.each([0.1, 1, 10, 100])("큐볼 z-스핀 %s rad/s 정면 → 목적구는 ω×n̂ 쪽으로 던져지고 반대 스핀, 큐볼 스핀 감소", (wz) => {
        const [cb0, ob] = headOn();
        const cb = { ...cb0, w: [0, 0, wz] as Vec3 };
        const nHat: Vec3 = [1, 0, 0];
        // 공 1 접점 속도는 ω×(R n̂), 마찰은 그 반대로 공 1 에, 같은 크기 반대 방향으로 공 2 에 → 공 2 는 ω×n̂ 쪽.
        const expectedDir = cross(cb.w, nHat);
        const [cbF, obF] = resolveBallBall(cb, ob, P);
        expect(dot(obF.v, expectedDir)).toBeGreaterThan(0);
        expect(obF.v[1]).toBeGreaterThan(0);              // ω_z>0, n̂=+x → +y 로 던져짐
        expect(Math.sign(obF.w[2])).toBe(-Math.sign(wz));  // 목적구는 반대 z-스핀
        expect(cbF.w[2]).toBeGreaterThan(0);
        expect(cbF.w[2]).toBeLessThan(wz);
        // 큐볼도 반대편 접선 속도를 얻는다(운동량 보존)
        expect(cbF.v[1]).toBeLessThan(0);
    });

    it("기어링 아웃사이드 잉글리시(접점 상대속도 0) → 던지기 < 1e-3 rad, 유도 스핀 < 5e-3", () => {
        const speeds = [0.1, 0.46415888336127786, 2.154434690031884, 10];
        let checked = 0;
        for (const speed of speeds) {
            for (let i = 0; i < 6; i++) {
                const loc = (TWO_PI * i) / 6;
                for (let j = 0; j < 6; j++) {
                    const cut = (HALF_PI * j) / 6;
                    const nHat = fromAngle(1, loc);
                    const [cb0, ob] = pair(loc);
                    const cb1 = { ...cb0, v: fromAngle(speed, loc + cut) };
                    const cb = { ...cb1, w: [0, 0, gearingZSpin(cb1, nHat, R)] as Vec3 };
                    expect(length(tangentSurfaceVelocity(cb, nHat, R))).toBeLessThan(1e-10);
                    const [, obF] = resolveBallBall(cb, ob, P);
                    // 던지기 각 = 목적구 속도와 중심선 사이 각
                    const throwAngle = Math.abs(atan2(length(cross(obF.v, nHat)), dot(obF.v, nHat)));
                    expect(throwAngle).toBeLessThan(1e-3);
                    expect(length(cross(obF.v, nHat))).toBeLessThan(1e-3);
                    expect(Math.abs(obF.w[2])).toBeLessThan(5e-3);
                    checked++;
                }
            }
        }
        expect(checked).toBe(144);
    });

    it("낮은 표면 상대속도(≤ 0.05 m/s) → 충돌 후 접점 상대속도 ≈ 0 (무슬립 분기)", () => {
        const speeds = [1, 2.154434690031884, 4.641588833612778, 10];
        const relSpeeds = [0, 0.05 / 3, 0.1 / 3, 0.05];
        for (const speed of speeds) {
            for (let i = 0; i < 6; i++) {
                const loc = (TWO_PI * i) / 6;
                for (let j = 0; j < 6; j++) {
                    const cut = (HALF_PI * j) / 6;
                    for (const rel of relSpeeds) {
                        const nHat = fromAngle(1, loc);
                        const [cb0, ob] = pair(loc);
                        const cb1 = { ...cb0, v: fromAngle(speed, loc + cut) };
                        const wz = gearingZSpin(cb1, nHat, R) + rel / R;
                        const cb = { ...cb1, w: [0, 0, wz] as Vec3 };
                        expect(Math.abs(rel - length(tangentSurfaceVelocity(cb, nHat, R)))).toBeLessThan(1e-10);
                        const [cbF, obF] = resolveBallBall(cb, ob, P);
                        const cbC = tangentSurfaceVelocity(cbF, nHat, R);
                        const obC = tangentSurfaceVelocity(obF, scale(nHat, -1), R);
                        expect(length(sub(cbC, obC))).toBeLessThan(1e-3);
                    }
                }
            }
        }
    });
});

// ── 보존 법칙·형식 ───────────────────────────────────────────────────────────

describe("resolveBallBall — 보존·형식", () => {
    const cases = randomCollisions(400, 20260907);

    it("xy 운동량 보존 (|Δp| < 1e-12), 질량 동일", () => {
        for (const [b1, b2] of cases) {
            const [f1, f2] = resolveBallBall(b1, b2, P);
            const before = scale(add(b1.v, b2.v), P.m);
            const after = scale(add(f1.v, f2.v), P.m);
            expect(Math.abs(before[0] - after[0])).toBeLessThan(1e-12);
            expect(Math.abs(before[1] - after[1])).toBeLessThan(1e-12);
        }
    });

    it("운동에너지는 절대 늘지 않는다", () => {
        let dissipated = 0;
        for (const [b1, b2] of cases) {
            const [f1, f2] = resolveBallBall(b1, b2, P);
            const before = kineticEnergy(b1, P) + kineticEnergy(b2, P);
            const after = kineticEnergy(f1, P) + kineticEnergy(f2, P);
            expect(after).toBeLessThanOrEqual(before * (1 + 1e-12) + 1e-12);
            if (after < before) dissipated++;
        }
        // e<1 이므로 사실상 모든 충돌이 에너지를 잃어야 한다
        expect(dissipated).toBe(cases.length);
    });

    it("e=1 이고 마찰이 없으면(μ≡0) 에너지가 보존된다", () => {
        const p: BallParams = { ...P, eB: 1, muBB: { a: 0, b: 0, c: 1 } };
        for (const [b1, b2] of cases.slice(0, 50)) {
            const [f1, f2] = resolveBallBall(b1, b2, p);
            // z 속도가 없는 입력이므로 z 제거로 잃는 에너지도 없다
            const before = kineticEnergy(b1, p) + kineticEnergy(b2, p);
            const after = kineticEnergy(f1, p) + kineticEnergy(f2, p);
            expect(Math.abs(after - before)).toBeLessThan(1e-9 * before);
        }
    });

    it("결과: v_z = 0, 두 공 모두 'sliding', 위치·id 유지, 입력 순서대로 반환", () => {
        for (const [b1, b2] of cases.slice(0, 20)) {
            const [f1, f2] = resolveBallBall(b1, b2, P);
            expect(f1.id).toBe(b1.id);
            expect(f2.id).toBe(b2.id);
            expect(f1.v[2]).toBe(0);
            expect(f2.v[2]).toBe(0);
            expect(f1.state).toBe("sliding");
            expect(f2.state).toBe("sliding");
            expect(f1.r).toEqual(b1.r);
            expect(f2.r).toEqual(b2.r);
        }
    });

    it("법선 축 스핀(ω·n̂)은 변하지 않는다", () => {
        for (const [b1, b2] of cases.slice(0, 50)) {
            const nHat = unit(sub(b2.r, b1.r));
            const [f1, f2] = resolveBallBall(b1, b2, P);
            expect(Math.abs(dot(f1.w, nHat) - dot(b1.w, nHat))).toBeLessThan(1e-10);
            expect(Math.abs(dot(f2.w, nHat) - dot(b2.w, nHat))).toBeLessThan(1e-10);
        }
    });

    it("두 공의 Δω 가 같다 (같은 각임펄스)", () => {
        for (const [b1, b2] of cases.slice(0, 50)) {
            const [f1, f2] = resolveBallBall(b1, b2, P);
            const dw1 = sub(f1.w, b1.w);
            const dw2 = sub(f2.w, b2.w);
            expect(length(sub(dw1, dw2))).toBeLessThan(1e-9 * (1 + length(dw1)));
        }
    });

    it("인자 순서를 바꿔도 같은 물리 (b2,b1 → 결과가 뒤집혀 나옴)", () => {
        for (const [b1, b2] of cases.slice(0, 50)) {
            const [f1, f2] = resolveBallBall(b1, b2, P);
            const [g2, g1] = resolveBallBall(b2, b1, P);
            expect(length(sub(f1.v, g1.v))).toBeLessThan(1e-11);
            expect(length(sub(f2.v, g2.v))).toBeLessThan(1e-11);
            expect(length(sub(f1.w, g1.w))).toBeLessThan(1e-9);
            expect(length(sub(f2.w, g2.w))).toBeLessThan(1e-9);
        }
    });

    it("입력을 변형하지 않는다 (동결된 입력, 전후 동일)", () => {
        const [b1, b2] = cases[0];
        const c1 = clone(b1), c2 = clone(b2);
        const f1 = deepFreeze(clone(b1)), f2 = deepFreeze(clone(b2));
        expect(() => resolveBallBall(f1, f2, P)).not.toThrow();
        expect(f1).toEqual(c1);
        expect(f2).toEqual(c2);
        const [o1, o2] = resolveBallBall(f1, f2, P);
        expect(o1).not.toBe(f1);
        expect(o2).not.toBe(f2);
        expect(o1.v).not.toBe(f1.v);
        expect(o1.w).not.toBe(f1.w);
    });

    it("결정론: 같은 입력 → 비트 단위로 같은 출력", () => {
        for (const [b1, b2] of cases.slice(0, 100)) {
            const [a1, a2] = resolveBallBall(b1, b2, P);
            const [c1, c2] = resolveBallBall(clone(b1), clone(b2), P);
            expect(bitEqual(a1.v, c1.v)).toBe(true);
            expect(bitEqual(a1.w, c1.w)).toBe(true);
            expect(bitEqual(a2.v, c2.v)).toBe(true);
            expect(bitEqual(a2.w, c2.w)).toBe(true);
        }
    });

    it("퇴화 입력(중심 일치)에도 NaN 을 내지 않는다", () => {
        const a = ball("a", [0.5, 0.5, 0], [1, 0, 0]);
        const b = ball("b", [0.5, 0.5, 0], [0, 0, 0]);
        const [f1, f2] = resolveBallBall(a, b, P);
        for (const x of [...f1.v, ...f1.w, ...f2.v, ...f2.w]) expect(Number.isFinite(x)).toBe(true);
        expect(f2.v[0]).toBeGreaterThan(0);
    });
});

// ── 반두께(half-ball) 8 m/s ──────────────────────────────────────────────────

describe("resolveBallBall — 반두께 8 m/s, 구르는 큐볼", () => {
    /**
     * 충돌 파라미터 R (중심선이 진행선과 30°). 목적구는 중심선 방향에서 던지기만큼 큐볼 진행 쪽으로 밀린다.
     * 큐볼은 접선(+60°)으로 튀지만 남은 구름 스핀 때문에 미끄러진 뒤 자연구름으로 돌아오며, 그 최종 방향은
     * TP A.4: v_f = (5/7)v + (2/7)R(ω×ẑ). 반두께에서 이 편향은 최대 33.7° (Dr. Dave 30° 법칙), 비탄성(e=0.93)과
     * 던지기가 조금 줄여 두 공의 분리각은 ≈ 60° ± 3° 가 된다(README 테스트 B).
     */
    it("목적구 = 30° − 던지기(0 < throw < 3°), 자연구름 후 분리각 ≈ 60° ± 3°", () => {
        const speed = 8;
        const loc = -PI / 6; // 목적구 중심이 진행선(+x) 아래쪽 30° → 충돌 파라미터 2R·sin30° = R
        const [cb0, ob] = pair(loc);
        const v: Vec3 = [speed, 0, 0];
        const cb = { ...cb0, v, w: scale(upCross(v), 1 / R), state: "rolling" as const };
        const [cbF, obF] = resolveBallBall(cb, ob, P);

        const obAngle = atan2(obF.v[1], obF.v[0]);                 // 음수(아래쪽)
        // 던지기: 중심선(−30°)에서 큐볼 진행 쪽(각이 커지는 쪽)으로 밀린 각. 8 m/s 는 μ≈0.01 이라 ≈ 0.28°
        const throwDeg = ((obAngle + PI / 6) * 180) / PI;
        expect(throwDeg).toBeGreaterThan(0);
        expect(throwDeg).toBeLessThan(3);
        const obDeg = (-obAngle * 180) / PI;
        expect(obDeg).toBeGreaterThan(27);
        expect(obDeg).toBeLessThan(30.5);

        // 큐볼: 충돌 직후는 접선 근처(≈ 60°, 비탄성 법선 성분만큼 조금 작다)
        const cbNowDeg = (atan2(cbF.v[1], cbF.v[0]) * 180) / PI;
        expect(cbNowDeg).toBeGreaterThan(50);
        expect(cbNowDeg).toBeLessThan(62);

        // 자연구름 복귀 후 방향 (TP A.4) → 분리각
        const vFinal = add(scale(cbF.v, 5 / 7), scale(cross(cbF.w, [0, 0, 1]), (2 / 7) * R));
        const cbFinalDeg = (atan2(vFinal[1], vFinal[0]) * 180) / PI;
        const separationDeg = cbFinalDeg + obDeg;
        expect(cbFinalDeg).toBeGreaterThan(28);
        expect(cbFinalDeg).toBeLessThan(34);
        expect(separationDeg).toBeGreaterThan(57);
        expect(separationDeg).toBeLessThan(63);
    });
});
