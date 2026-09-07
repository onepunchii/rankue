/**
 * stickBall 검증: TP A.30 속도·스핀, TP A.31 스쿼트 방향·크기, 팁 효율, 미스큐, 입력 불변, 등방성, 금지 함수 grep.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BallState, ShotInput, Vec3 } from "../types.js";
import { DEFAULT_CUE, TABLES } from "../params.js";
import { HALF_PI, PI } from "../dmath.js";
import { dot, length } from "../vec.js";
import { slipVelocity } from "../evolve.js";
import { squirtAngle, strike } from "./stickBall.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;
const CUE = DEFAULT_CUE;

function cueBall(): BallState {
    return { id: "white", r: [0.7, 0.5, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
}

function shot(partial: Partial<ShotInput> = {}): ShotInput {
    return { cueBallId: "white", phi: 0, V0: 3, a: 0, b: 0, theta: 0, ...partial };
}

/** 위에서 봐서 v 를 반시계 90° 돌린 것 = 왼쪽 */
function leftOf(d: Vec3): Vec3 {
    return [-d[1], d[0], 0];
}

function dir(phi: number): Vec3 {
    return [Math.cos(phi), Math.sin(phi), 0];
}

/** 두 평면 벡터 사이의 부호 있는 각 (a → b, 반시계 양수). 테스트에서만 Math.atan2 를 쓴다. */
function signedAngle(a: Vec3, b: Vec3): number {
    return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
}

const V_CENTRE = ((2 * 3) / (1 + P.m / CUE.M)) * CUE.tipEfficiency;

describe("strike — TP A.30 중심 타격", () => {
    it("V0=3, a=b=θ=0 → |v| = 2V0/(1+m/M)·η, ω = 0, 방향 = d, state sliding", () => {
        const out = strike(cueBall(), shot({ phi: 0.7 }), P, CUE);
        expect(length(out.v)).toBeCloseTo(V_CENTRE, 12);
        expect(out.v[2]).toBe(0);
        expect(out.w).toEqual([0, 0, 0]);
        // 스쿼트 없음(a=0) → 방향이 정확히 φ
        expect(signedAngle(dir(0.7), out.v)).toBeCloseTo(0, 12);
        expect(out.state).toBe("sliding");
        expect(out.id).toBe("white");
        expect(out.r).toEqual([0.7, 0.5, R]);
    });

    it("중심 타격의 접점 미끄럼은 정확히 v (스핀 없음)", () => {
        const out = strike(cueBall(), shot(), P, CUE);
        expect(slipVelocity(out, P)).toEqual([out.v[0], out.v[1], 0]);
    });

    it("η 는 선속도에 곱해지고 ω 는 그 v 에 묶인다 (η=1 과 비교)", () => {
        const eta1 = strike(cueBall(), shot({ b: 0.3 }), P, { ...CUE, tipEfficiency: 1 });
        const eta = strike(cueBall(), shot({ b: 0.3 }), P, { ...CUE, tipEfficiency: 0.8 });
        expect(length(eta.v)).toBeCloseTo(length(eta1.v) * 0.8, 12);
        expect(length(eta.w)).toBeCloseTo(length(eta1.w) * 0.8, 12);
    });

    it("η=1 이면 탄성 에너지 보존: ½MV0² = ½M V0'² + ½m v² + ½I ω² (평면)", () => {
        const cue = { ...CUE, tipEfficiency: 1 };
        for (const s of [shot({ a: 0.2, b: 0.3 }), shot({ b: -0.45 }), shot({ a: -0.4, phi: 1.1 })]) {
            const out = strike(cueBall(), s, P, cue);
            const v = length(out.v);
            const V0p = s.V0 - (P.m / cue.M) * v;                  // 운동량 보존 (TP A.30 식 5)
            const I = 0.4 * P.m * R * R;
            const before = 0.5 * cue.M * s.V0 * s.V0;
            const after = 0.5 * cue.M * V0p * V0p + 0.5 * P.m * v * v + 0.5 * I * dot(out.w, out.w);
            expect(after).toBeCloseTo(before, 10);
        }
    });
});

describe("strike — 오프셋 스핀 (평면)", () => {
    it("b = 0.4R (밀어치기) → |ω| = (5/2) v b/R², 방향 = k̂ × d (앞으로 구름)", () => {
        const out = strike(cueBall(), shot({ b: 0.4, phi: 0.3 }), P, CUE);
        const v = length(out.v);
        const expected = (2.5 * v * 0.4 * R) / (R * R);
        expect(length(out.w)).toBeCloseTo(expected, 10);
        expect(out.w[2]).toBe(0);
        const fwd = leftOf(dir(0.3));                                  // k̂ × d
        expect(dot(out.w, fwd) / length(out.w)).toBeCloseTo(1, 12);
        // 속도도 오프셋만큼 줄어든다 (TP A.30 식 7)
        expect(v).toBeCloseTo(((2 * 3) / (1 + P.m / CUE.M + 2.5 * 0.16)) * CUE.tipEfficiency, 12);
    });

    it("b < 0 (끌어치기) → ω_xy 가 −(k̂ × d): 접점이 앞으로 미끄러진다", () => {
        const out = strike(cueBall(), shot({ b: -0.4 }), P, CUE);
        expect(out.w[1]).toBeLessThan(0);                              // d = x̂, k̂×d = ŷ
        const u = slipVelocity(out, P);
        expect(u[0]).toBeGreaterThan(out.v[0]);                        // 역회전이면 미끄럼이 v 보다 크다
    });

    it("a > 0 (오른쪽 사이드) → ω_z > 0, 크기 = (5/2) v a/R", () => {
        const out = strike(cueBall(), shot({ a: 0.3 }), P, CUE);
        expect(out.w[2]).toBeGreaterThan(0);
        expect(out.w[2]).toBeCloseTo((2.5 * length(out.v) * 0.3) / R, 10);
        expect(out.w[0]).toBeCloseTo(0, 12);
        expect(out.w[1]).toBeCloseTo(0, 12);
        const neg = strike(cueBall(), shot({ a: -0.3 }), P, CUE);
        expect(neg.w[2]).toBeCloseTo(-out.w[2], 12);
    });
});

describe("strike — TP A.31 스쿼트", () => {
    it("a > 0 (오른쪽 사이드) → v 가 d 의 왼쪽으로 정확히 atan2(2.5a√(1−a²), 1+m_r+2.5(1−a²)) 튼다", () => {
        for (const a of [0.1, 0.3, 0.5]) {
            const phi = 0.4;
            const out = strike(cueBall(), shot({ a, phi }), P, CUE);
            const A = 1 - a * a;
            const alpha = Math.atan2(2.5 * a * Math.sqrt(A), 1 + CUE.endmassRatio + 2.5 * A);
            expect(alpha).toBeGreaterThan(0);
            expect(signedAngle(dir(phi), out.v)).toBeCloseTo(alpha, 9);
            expect(dot(out.v, leftOf(dir(phi)))).toBeGreaterThan(0);   // 왼쪽 성분 양수
            // 반대 사이드는 거울상
            const mirror = strike(cueBall(), shot({ a: -a, phi }), P, CUE);
            expect(signedAngle(dir(phi), mirror.v)).toBeCloseTo(-alpha, 9);
        }
    });

    it("a=0.5, m_b/m_e=12 → α = 식값 (1e-9) 이고 3°–5° 사이; a=0.4 → ≈ 3.3°±0.3°", () => {
        const out = strike(cueBall(), shot({ a: 0.5 }), P, { ...CUE, endmassRatio: 12 });
        const exact = Math.atan2(2.5 * 0.5 * Math.sqrt(0.75), 1 + 12 + 2.5 * 0.75);
        const got = signedAngle(dir(0), out.v);
        expect(Math.abs(got - exact)).toBeLessThan(1e-9);
        const deg = (got * 180) / PI;
        expect(deg).toBeGreaterThan(3);
        expect(deg).toBeLessThan(5);
        expect(squirtAngle(0.5, 12)).toBeCloseTo(exact, 12);
        // 문헌 sanity (10-physics-literature §3.3: b/R=0.4, m_r=12 → ≈ 3.5°)
        const deg04 = (squirtAngle(0.4, 12) * 180) / PI;
        expect(Math.abs(deg04 - 3.3)).toBeLessThan(0.3);
    });

    it("엔드매스 비가 클수록(저스쿼트 샤프트) α 가 작다; a=0 이면 0", () => {
        expect(squirtAngle(0.4, 20)).toBeLessThan(squirtAngle(0.4, 8));
        expect(squirtAngle(0, 12)).toBe(0);
        expect(squirtAngle(-0.3, 12)).toBe(-squirtAngle(0.3, 12));
    });

    it("ω 도 v 와 함께 돈다: ω_xy 와 v 의 상대각이 스쿼트 유무와 무관", () => {
        const a = 0.35, b = 0.3;
        const withSquirt = strike(cueBall(), shot({ a, b, phi: 0.2 }), P, CUE);
        const noSquirt = strike(cueBall(), shot({ a, b, phi: 0.2 }), P, { ...CUE, endmassRatio: 1e12 });
        const rel = (o: BallState) => signedAngle(o.v, [o.w[0], o.w[1], 0]);
        expect(rel(withSquirt)).toBeCloseTo(rel(noSquirt), 9);
        expect(withSquirt.w[2]).toBeCloseTo(noSquirt.w[2], 9);
    });
});

describe("strike — 큐 들림각 θ (오프셋은 큐 축에 수직한 평면에서 잰다: TP A.19 / pooltool 3D)", () => {
    it("θ=0.3, a=0.4, b=0 → 큐 방향 축 스핀 성분 ω_d = (v/I_m)·aR·sinθ ≠ 0, ω_z = (v/I_m)·aR·cosθ, L̂ 성분 0", () => {
        const theta = 0.3, a = 0.4, phi = 0.9;
        const out = strike(cueBall(), shot({ a, theta, phi }), P, CUE);
        const alpha = squirtAngle(a, CUE.endmassRatio);
        const dRot = dir(phi + alpha);                                 // 스쿼트 후 큐 방향
        const wD = dot(out.w, dRot);
        expect(Math.abs(wD)).toBeGreaterThan(1);
        // v (전체 크기) 는 |v_h|/cosθ 이고 c 항이 없으므로 TP A.30 식 7 그대로
        const vFull = length(out.v) / Math.cos(theta);
        const Im = 0.4 * R * R;
        expect(vFull).toBeCloseTo(((2 * 3) / (1 + P.m / CUE.M + 2.5 * a * a)) * CUE.tipEfficiency, 12);
        expect(wD).toBeCloseTo((vFull / Im) * a * R * Math.sin(theta), 8);
        expect(out.w[2]).toBeCloseTo((vFull / Im) * a * R * Math.cos(theta), 8);
        // b = 0 이면 L̂ 성분(밀어치기·끌어치기)은 없다 — 테이블 프레임 해석의 가짜 −c sinθ 끌어치기가 사라졌다
        expect(dot(out.w, leftOf(dRot))).toBeCloseTo(0, 9);
    });

    it("θ>0 중심 타격(a=b=0): 임펄스가 중심을 지나 ω = 0, 수평 속도만 남고(z=0) 크기는 v·cosθ", () => {
        for (const theta of [0.2, 0.5, 20 * PI / 180]) {
            const out = strike(cueBall(), shot({ theta }), P, CUE);
            const vFull = ((2 * 3) / (1 + P.m / CUE.M)) * CUE.tipEfficiency;
            expect(out.v[2]).toBe(0);
            expect(length(out.v)).toBeCloseTo(vFull * Math.cos(theta), 12);
            expect(out.w).toEqual([0, 0, 0]);
        }
    });

    it("밀어치기 b 의 L̂ 스핀은 θ 와 무관 (TP A.19 ω_x ∝ b): θ=0 과 θ=0.4 에서 (v/I_m)·bR 로 같다", () => {
        const b = 0.3;
        const flat = strike(cueBall(), shot({ b, theta: 0 }), P, CUE);
        const up = strike(cueBall(), shot({ b, theta: 0.4 }), P, CUE);
        const Im = 0.4 * R * R;
        // 두 경우 모두 v(전체)는 같고(θ 는 v 식에 안 들어감) L̂ = ŷ 성분이 (v/I_m)·bR
        const vFlat = length(flat.v), vUp = length(up.v) / Math.cos(0.4);
        expect(vUp).toBeCloseTo(vFlat, 12);
        expect(flat.w[1]).toBeCloseTo((vFlat / Im) * b * R, 9);
        expect(up.w[1]).toBeCloseTo((vFlat / Im) * b * R, 9);
        expect(up.w[0]).toBeCloseTo(0, 12);
        expect(up.w[2]).toBeCloseTo(0, 12);
    });

    it("미스큐 경계도 큐 프레임: θ=20° 에서 b=+0.4 는 허용, b=−0.6 은 미스큐 (테이블 프레임이면 반대였다)", () => {
        const theta = 20 * PI / 180;
        expect(() => strike(cueBall(), shot({ b: 0.4, theta }), P, CUE)).not.toThrow();
        expect(() => strike(cueBall(), shot({ b: -0.6, theta }), P, CUE)).toThrow("miscue");
    });
});

describe("strike — 미스큐 검증", () => {
    it("a=0.6 (maxOffset 0.5 초과) → RangeError('miscue')", () => {
        expect(() => strike(cueBall(), shot({ a: 0.6 }), P, CUE)).toThrow(RangeError);
        expect(() => strike(cueBall(), shot({ a: 0.6 }), P, CUE)).toThrow("miscue");
    });

    it("a²+b² > maxOffset² 이면 각각은 허용치 안이라도 미스큐; 경계값은 허용; NaN 도 거른다", () => {
        expect(() => strike(cueBall(), shot({ a: 0.4, b: 0.4 }), P, CUE)).toThrow("miscue");
        expect(() => strike(cueBall(), shot({ b: -0.7 }), P, CUE)).toThrow("miscue");
        expect(() => strike(cueBall(), shot({ a: 0.5 }), P, CUE)).not.toThrow();
        expect(() => strike(cueBall(), shot({ a: 0.3, b: 0.4 }), P, CUE)).not.toThrow();
        expect(() => strike(cueBall(), shot({ a: NaN }), P, CUE)).toThrow("miscue");
    });
});

describe("strike — 불변·등방성", () => {
    it("입력(cueBall, input, params, cue)을 변형하지 않는다", () => {
        const ball = cueBall();
        const input = shot({ a: 0.3, b: -0.2, theta: 0.1, phi: 2 });
        const snapBall = JSON.stringify(ball);
        const snapInput = JSON.stringify(input);
        const snapP = JSON.stringify(P);
        const snapCue = JSON.stringify(CUE);
        Object.freeze(ball); Object.freeze(ball.r); Object.freeze(input); Object.freeze(CUE);
        const out = strike(ball, input, P, CUE);
        expect(JSON.stringify(ball)).toBe(snapBall);
        expect(JSON.stringify(input)).toBe(snapInput);
        expect(JSON.stringify(P)).toBe(snapP);
        expect(JSON.stringify(CUE)).toBe(snapCue);
        expect(out.r).not.toBe(ball.r);                                // 새 튜플
        expect(out).not.toBe(ball);
    });

    it("φ 를 90° 돌리면 v·ω_xy 가 90° 돌고 ω_z 와 크기는 그대로 (등방성)", () => {
        const base = shot({ a: 0.25, b: 0.35, theta: 0.2, phi: 0.55, V0: 4 });
        const o1 = strike(cueBall(), base, P, CUE);
        const o2 = strike(cueBall(), { ...base, phi: base.phi + HALF_PI }, P, CUE);
        const rot = (v: Vec3): Vec3 => [-v[1], v[0], v[2]];
        const r1v = rot(o1.v), r1w = rot(o1.w);
        for (let i = 0; i < 3; i++) {
            expect(o2.v[i]).toBeCloseTo(r1v[i], 11);
            expect(o2.w[i]).toBeCloseTo(r1w[i], 9);
        }
        expect(length(o2.v)).toBeCloseTo(length(o1.v), 12);
        expect(length(o2.w)).toBeCloseTo(length(o1.w), 10);
    });

    it("같은 입력이면 비트 단위로 같은 결과 (결정론)", () => {
        const s = shot({ a: -0.21, b: 0.13, theta: 0.07, phi: 5.1, V0: 2.2 });
        const x = strike(cueBall(), s, P, CUE);
        const y = strike(cueBall(), s, P, CUE);
        expect(x).toEqual(y);
    });
});

describe("stickBall.ts 는 Math 초월함수·시각·난수를 참조하지 않는다", () => {
    it("주석을 걷어낸 소스에 금지 이름이 없다", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(join(here, "stickBall.ts"), "utf8");
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        const banned = /Math\.(sin|cos|tan|atan|atan2|asin|acos|asinh|acosh|atanh|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt|random|fround)\b/g;
        expect(code.match(banned) ?? []).toEqual([]);
        expect(/\b(Date|performance)\b/.test(code)).toBe(false);
        expect(/\*\*/.test(code)).toBe(false);
        expect(/from\s+["'](?!\.)/.test(code)).toBe(false);            // 상대 경로 import 만
    });
});
