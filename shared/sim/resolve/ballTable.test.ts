/**
 * resolve/ballTable.ts 검증: 법선 반발 e_t, 정착 문턱(5 mm), 접선 slip/stick, ω_z 보존, z 스냅, 에너지 비증가, 입력 불변·결정론.
 */
import { describe, expect, it } from "vitest";
import type { BallState, Vec3 } from "../types.js";
import { TABLES } from "../params.js";
import { kineticEnergy, slipVelocity } from "../evolve.js";
import { mulberry32 } from "../rng.js";
import { bounceHeight, MIN_BOUNCE_HEIGHT, resolveBallTable } from "./ballTable.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;
const g = P.g;

function falling(vz: number, vxy: readonly [number, number] = [0, 0], w: Vec3 = [0, 0, 0], z = R): BallState {
    return { id: "cue", r: [0.5, 1.0, z], v: [vxy[0], vxy[1], vz], w, state: "airborne" };
}

/** 정점이 정확히 h 가 되게 하는 착지 속도: v_z' = e_t |v_z| = √(2 g h). */
function vzFor(h: number): number {
    return -Math.sqrt(2 * g * h) / P.eT;
}

describe("resolveBallTable — 법선·정착", () => {
    it("수직 낙하: v_z' = −e_t v_z, 정점 = v_z'²/(2g); 5 mm 이상이면 airborne, 미만이면 sliding 으로 정착(v_z = 0)", () => {
        const high = resolveBallTable(falling(-2), P);
        expect(high.state).toBe("airborne");
        expect(high.v[2]).toBeCloseTo(P.eT * 2, 12);
        expect(bounceHeight(high.v[2], g)).toBeCloseTo((P.eT * 2) ** 2 / (2 * g), 12);
        expect(high.r[2]).toBe(R);
        const low = resolveBallTable(falling(vzFor(MIN_BOUNCE_HEIGHT * 0.999)), P);
        expect(low.state).toBe("sliding");
        expect(low.v[2]).toBe(0);
        expect(low.r[2]).toBe(R);
        const edge = resolveBallTable(falling(vzFor(MIN_BOUNCE_HEIGHT * 1.001)), P);
        expect(edge.state).toBe("airborne");
        expect(MIN_BOUNCE_HEIGHT).toBe(0.005);
    });

    it("z 는 정확히 R 로 스냅한다(감지기 근의 잔차 제거), 위치 xy 는 그대로", () => {
        for (const z of [R + 1e-17, R - 1e-17, R + 1e-12]) {
            const out = resolveBallTable(falling(-1, [0.3, -0.2], [0, 0, 0], z), P);
            expect(out.r).toEqual([0.5, 1.0, R]);
        }
    });

    it("v_z ≥ 0 인 공(즉시 스윕이 넘긴 v_z ≈ +0)은 임펄스 없이 정착한다", () => {
        const out = resolveBallTable(falling(1e-12, [1, 0.5], [3, 4, 5]), P);
        expect(out).toEqual({ id: "cue", r: [0.5, 1.0, R], v: [1, 0.5, 0], w: [3, 4, 5], state: "sliding" });
        const out0 = resolveBallTable(falling(0, [1, 0.5]), P);
        expect(out0.state).toBe("sliding");
        expect(out0.v).toEqual([1, 0.5, 0]);
    });
});

describe("resolveBallTable — 접선 마찰 (sphereHalfSpace 와 같은 모델, μ = μ_s)", () => {
    it("무스핀 비스듬한 착지: slip 이면 수평 속도가 정확히 μ_s (1+e_t)|v_z| 만큼 줄고 Δω = (2.5/R) ẑ × Δv, ω_z 보존", () => {
        // |u| = 5 → 무슬립 (2/7)·5 = 1.43 > Coulomb 0.2·1.5·3 = 0.9 → slip
        const out = resolveBallTable(falling(-3, [5, 0], [0, 0, 40]), P);
        const dv = P.muS * (1 + P.eT) * 3;
        expect(out.v[0]).toBeCloseTo(5 - dv, 12);
        expect(out.v[1]).toBeCloseTo(0, 12);
        expect(out.w[2]).toBe(40);
        // 접점 −R ẑ 의 마찰 −x 방향 → 토크 (−Rẑ) × (−F x̂) = −R F (ẑ × x̂) = −R F ŷ → ω_y 감소... 부호: Δω = −(2.5/R)(ẑ × Δv), Δv = (−dv, 0, 0)
        // ẑ × (−dv x̂) = −dv ŷ → Δω = +(2.5/R) dv ŷ
        expect(out.w[1]).toBeCloseTo((2.5 / R) * dv, 9);
        expect(out.w[0]).toBeCloseTo(0, 12);
    });

    it("느린 미끄럼 착지: stick 이면 착지 뒤 접점 미끄럼이 0(구름 조건)", () => {
        // |u| 가 작아 (2/7)|u| < μ(1+e)|v_z| 인 경우
        const b = falling(-3, [0.2, 0.1], [0, 0, 5]);
        const out = resolveBallTable(b, P);
        const u = slipVelocity({ ...out, state: "sliding" }, P);
        expect(Math.abs(u[0]) + Math.abs(u[1])).toBeLessThan(1e-12);
        expect(out.w[2]).toBe(5);
    });

    it("마세이 스핀(진행축 둘레 ω)의 착지: 접점 미끄럼이 옆으로 나므로 마찰이 옆으로 밀고 스핀도 그만큼 준다", () => {
        // 진행 +y, 스핀 축 +y(오른쪽 사이드를 큐를 들고 친 성분): 접점 미끄럼 u = (v_x − R ω_y, v_y + R ω_x) = (−R ω_y, v_y)
        const wy = 60;
        const out = resolveBallTable(falling(-1.5, [0, 2], [0, wy, 0]), P);
        expect(out.v[0]).toBeGreaterThan(0);              // −û 의 x 성분은 +
        expect(out.v[1]).toBeLessThan(2);
        expect(out.w[1]).toBeLessThan(wy);
    });
});

describe("resolveBallTable — 불변량", () => {
    it("5000개 시드 무작위 착지 상태에서 역학적 에너지가 늘지 않고, 결과는 z = R 에서 airborne(v_z > 0, 정점 ≥ 5 mm) 또는 sliding(v_z = 0)", () => {
        const rng = mulberry32(2026);
        const u = (lo: number, hi: number) => lo + (hi - lo) * rng();
        for (let i = 0; i < 5000; i++) {
            const b = falling(-u(0.01, 6), [u(-6, 6), u(-6, 6)], [u(-300, 300), u(-300, 300), u(-300, 300)]);
            const out = resolveBallTable(b, P);
            expect(kineticEnergy(out, P)).toBeLessThanOrEqual(kineticEnergy(b, P) * (1 + 1e-9));
            expect(out.r[2]).toBe(R);
            if (out.state === "airborne") {
                expect(out.v[2]).toBeGreaterThan(0);
                expect(bounceHeight(out.v[2], g)).toBeGreaterThanOrEqual(MIN_BOUNCE_HEIGHT);
            } else {
                expect(out.state).toBe("sliding");
                expect(out.v[2]).toBe(0);
            }
            expect(out.w[2]).toBe(b.w[2]);
        }
    });

    it("입력을 변형하지 않고 결정론적이며 반환 튜플은 새 배열", () => {
        const b = falling(-2, [1, -1], [10, 20, 30]);
        Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w); Object.freeze(b);
        const snap = JSON.stringify(b);
        const a = resolveBallTable(b, P);
        const c = resolveBallTable(b, P);
        expect(JSON.stringify(b)).toBe(snap);
        expect(a).toEqual(c);
        expect(a.r).not.toBe(b.r);
        expect(a.v).not.toBe(b.v);
        expect(a.w).not.toBe(b.w);
    });
});
