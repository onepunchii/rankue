import { describe, expect, it } from "vitest";
import type { BallState, Vec3 } from "../types.js";
import { TABLES } from "../params.js";
import { evolveBall } from "../evolve.js";
import { ballBallTime } from "./ballBall.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;

function ball(id: string, r: readonly [number, number], v: Vec3, state: BallState["state"], w?: Vec3): BallState {
    const wv: Vec3 = w ?? (state === "rolling" ? [-v[1] / R, v[0] / R, 0] : [0, 0, 0]);
    return { id, r: [r[0], r[1], R], v, w: wv, state };
}

function dist(a: BallState, b: BallState): number {
    const dx = a.r[0] - b.r[0], dy = a.r[1] - b.r[1], dz = a.r[2] - b.r[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * [0, tmax] 를 잘게 훑어 f 가 처음 양 → 음으로 바뀌는 구간을 찾고 그 안에서 이분법.
 * (공이 서로를 "통과"한 뒤 다시 멀어지므로 끝점만 보면 부호가 되돌아와 있을 수 있다.)
 * 200회면 double 한계까지 좁혀진다.
 */
function bisect(f: (t: number) => number, tmax: number, steps = 4000): number {
    let lo = 0, hi = NaN;
    expect(f(0)).toBeGreaterThan(0);
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

/** evolveBall 로 전진한 두 공의 중심 거리 − 2R. 오라클(감지기와 독립). */
function gap(a: BallState, b: BallState) {
    return (t: number) => dist(evolveBall(a, t, P), evolveBall(b, t, P)) - 2 * R;
}

function deepFreeze(b: BallState): BallState {
    Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w);
    return Object.freeze(b);
}

describe("ballBallTime — 정면 접근", () => {
    it("두 구름 공의 정면 충돌 시각이 evolveBall 이분법과 1e-10 안에서 일치", () => {
        const a = ball("a", [0.5, 1.0], [0, 2, 0], "rolling");
        const b = ball("b", [0.5, 1.8], [0, -1, 0], "rolling");
        const t = ballBallTime(a, b, P);
        const ref = bisect(gap(a, b), 0.3);
        expect(Number.isFinite(t)).toBe(true);
        expect(Math.abs(t - ref)).toBeLessThan(1e-10);
        // 그 순간 중심 거리는 정확히 2R
        expect(Math.abs(gap(a, b)(t))).toBeLessThan(1e-12);
    });

    it("미끄럼 공 → 정지 공 (비스듬한 방향, 스핀 있음)도 이분법과 일치", () => {
        // |u0| ≈ 2.43 m/s → 미끄럼 시간 ≈ 0.354 s. 목적구는 0.25 s 지점 근처(유효 구간 안)에 둔다.
        const a = ball("a", [0.4, 0.6], [1.5, 0.9, 0], "sliding", [10, -20, 0]);
        const at025 = evolveBall(a, 0.25, P);
        const b = ball("b", [at025.r[0], at025.r[1] + 0.01], [0, 0, 0], "stationary");
        const t = ballBallTime(a, b, P);
        expect(t).toBeLessThan(0.25);
        const ref = bisect(gap(a, b), 0.3);
        expect(Math.abs(t - ref)).toBeLessThan(1e-10);
    });

    it("유효 구간(다음 전이) 뒤의 근은 버린다 — 전이 이후에야 닿을 위치의 공은 Infinity", () => {
        const a = ball("a", [0.4, 0.6], [1.5, 0.9, 0], "sliding", [10, -20, 0]);
        const b = ball("b", [0.4 + 0.6 * 1.5, 0.6 + 0.6 * 0.9 + 0.01], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });

    it("구름 공이 구름 공을 뒤에서 쫓아가 잡는 경우(가속도 차 0 → 2차식 강등)", () => {
        // 같은 방향·같은 상태면 r2 가 비트 단위로 같아 p2 = 0. 빠른 공이 느린 공을 따라잡는다.
        const a = ball("a", [0.5, 0.5], [0, 2, 0], "rolling");
        const b = ball("b", [0.5, 1.0], [0, 0.5, 0], "rolling");
        const t = ballBallTime(a, b, P);
        const ref = bisect(gap(a, b), 0.5);
        expect(Math.abs(t - ref)).toBeLessThan(1e-10);
        // 등속 상대운동이므로 닫힌 식과도 같다: (0.5 − 2R)/1.5
        expect(t).toBeCloseTo((0.5 - 2 * R) / 1.5, 12);
    });

    it("ballBallTime(a, b) === ballBallTime(b, a) (비트 단위 대칭)", () => {
        const a = ball("a", [0.3, 0.4], [1.1, 0.7, 0], "sliding", [3, 5, 2]);
        const b = ball("b", [0.9, 0.9], [-0.4, 0.2, 0], "rolling");
        expect(ballBallTime(a, b, P)).toBe(ballBallTime(b, a, P));
    });
});

describe("ballBallTime — 충돌 없음", () => {
    it("둘 다 정지 → Infinity", () => {
        const a = ball("a", [0.5, 1.0], [0, 0, 0], "stationary");
        const b = ball("b", [0.5, 1.2], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });

    it("정지 + 스핀(이동 없음) → Infinity", () => {
        const a = ball("a", [0.5, 1.0], [0, 0, 0], "spinning", [0, 0, 20]);
        const b = ball("b", [0.5, 1.0 + 2 * R + 1e-6], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });

    it("접촉 중이고 멀어지는 중 → Infinity", () => {
        const a = ball("a", [0.5, 1.0], [0, -1, 0], "sliding");
        const b = ball("b", [0.5, 1.0 + 2 * R], [0, 1, 0], "sliding");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
        // 한쪽만 움직여도, 접선 방향으로 움직여도 마찬가지
        const c = ball("b", [0.5, 1.0 + 2 * R], [0, 0, 0], "stationary");
        expect(ballBallTime(a, c, P)).toBe(Infinity);
        const d = ball("b", [0.5, 1.0 + 2 * R], [1, 0, 0], "rolling");
        expect(ballBallTime(a, d, P)).toBe(Infinity);
    });

    it("떨어져 있고 서로 멀어지는 중 → Infinity (멈춘 뒤 되돌아오는 외삽 근은 유효 구간 밖)", () => {
        const a = ball("a", [0.5, 1.0], [0, -1, 0], "rolling");
        const b = ball("b", [0.5, 1.5], [0, 1, 0], "rolling");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
        const c = ball("a", [0.5, 1.0], [0.2, -1, 0], "sliding", [5, 0, 0]);
        const d = ball("b", [0.5, 1.5], [-0.3, 1, 0], "sliding");
        expect(ballBallTime(c, d, P)).toBe(Infinity);
    });

    it("겹친 상태에서 접근 중이어도 (미래에 접근하며 2R 을 지나는 근이 없으므로) Infinity", () => {
        const a = ball("a", [0.5, 1.0], [0, 1, 0], "rolling");
        const b = ball("b", [0.5, 1.0 + 2 * R - 0.001], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });

    it("빗나가는 경로 → Infinity", () => {
        const a = ball("a", [0.3, 0.3], [1, 0, 0], "rolling");
        const b = ball("b", [0.8, 0.3 + 2 * R + 0.05], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });

    it("멈춘 뒤에야 닿는 위치의 공 → Infinity (외삽 근을 잡지 않는다)", () => {
        // 정지 거리 v²/(2 μ_r g) = 0.1²/(2·0.0981) ≈ 0.051 m < 0.3 m
        const a = ball("a", [0.5, 0.5], [0, 0.1, 0], "rolling");
        const b = ball("b", [0.5, 0.8 + 2 * R], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
    });
});

describe("ballBallTime — 접촉 대역(2R + 1e-9) 안에서 멀어지다 곡률로 되돌아오는 쌍 (40-physics-review Finding 1)", () => {
    // 접촉한 채 v = (−0.01, 0.05) 로 살짝 멀어지지만 ω_y = 40 rad/s 의 미끄럼 마찰이 상대 공 쪽(+x)으로 가속한다.
    const curving = (dx: number) => {
        const a = ball("a", [0.5 + dx, 1.0], [-0.01, 0.05, 0], "sliding", [0, 40, 0]);
        const b = ball("b", [0.5 + 2 * R + 1e-9, 1.0], [0, 0, 0], "stationary");
        return { a, b };
    };

    it("대역 안(정확히 2R + 1e-9)에서도 되돌아오는 시각(≈ 1.04e-2 s)을 잡고 이분법과 1e-10 안에서 일치", () => {
        const { a, b } = curving(0);
        const t = ballBallTime(a, b, P);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThan(1e-9);
        expect(t).toBeLessThan(0.02);
        // 오라클: 처음엔 벌어지므로 gap 이 양수였다가 음수로 바뀌는 첫 구간을 찾는다
        const ref = bisect(gap(a, b), 0.05, 50000);
        expect(Math.abs(t - ref)).toBeLessThan(1e-10);
    });

    it("대역 밖 1e-8 m 에서 시작해도 같은 시각(1e-6 안)", () => {
        const inside = ballBallTime(curving(0).a, curving(0).b, P);
        const outside = ballBallTime(curving(-1e-8).a, curving(-1e-8).b, P);
        expect(Math.abs(inside - outside)).toBeLessThan(1e-6);
    });

    it("방금 해결한 접촉(멀어지는 중, 곡률이 되돌리지 않음)은 여전히 Infinity — 이벤트 폭풍 없음", () => {
        // 스핀 없이 곧장 멀어지는 미끄럼 공: 가속도는 −v̂ 라 감속만 하고 유효 구간 안에서 되돌아오지 않는다
        const a = ball("a", [0.5, 1.0], [-0.3, 0.02, 0], "sliding");
        const b = ball("b", [0.5 + 2 * R + 1e-9, 1.0], [0, 0, 0], "stationary");
        expect(ballBallTime(a, b, P)).toBe(Infinity);
        // 상대 가속도 0(정지 + 스핀) 이면 조기 종료
        const c = ball("a", [0.5, 1.0], [0, 0, 0], "spinning", [0, 0, 30]);
        expect(ballBallTime(c, b, P)).toBe(Infinity);
    });
});

describe("ballBallTime — 스침(grazing) 여유 1e-9", () => {
    const grazeTime = (delta: number) => {
        const a = ball("a", [0.7, 1.5], [0, 0, 0], "stationary");
        const b = ball("b", [0.7 + 2 * R + delta, 0.5], [0, 1.5, 0], "rolling");
        return { a, b, t: ballBallTime(a, b, P) };
    };

    it("2R + 1e-8 옆으로 지나가면 충돌 없음", () => {
        expect(grazeTime(1e-8).t).toBe(Infinity);
    });

    it("2R − 1e-8 이면 충돌이 잡히고 그 순간 거리는 2R", () => {
        const { a, b, t } = grazeTime(-1e-8);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThan(0);
        expect(Math.abs(gap(a, b)(t))).toBeLessThan(1e-9);
    });

    it("정확히 2R 이면 Infinity 이거나, 잡혔다면 거리 2R 이내 1e-9 의 양의 시각이다", () => {
        const { a, b, t } = grazeTime(0);
        if (Number.isFinite(t)) {
            expect(t).toBeGreaterThan(1e-9);
            expect(Math.abs(gap(a, b)(t))).toBeLessThan(1e-9);
        } else {
            expect(t).toBe(Infinity);
        }
    });
});

describe("ballBallTime — 입력 불변", () => {
    it("동결된 입력으로도 동작하고 값이 변하지 않는다", () => {
        const a = deepFreeze(ball("a", [0.5, 1.0], [0, 2, 0], "rolling"));
        const b = deepFreeze(ball("b", [0.5, 1.8], [0, -1, 0], "rolling"));
        const sa = JSON.stringify(a), sb = JSON.stringify(b);
        expect(() => ballBallTime(a, b, P)).not.toThrow();
        expect(JSON.stringify(a)).toBe(sa);
        expect(JSON.stringify(b)).toBe(sb);
    });
});

describe("ballBallTime — v2.2 공중 공 (3차원 |Δr| = 2R)", () => {
    it("정점이 2R 를 넘는 포물선으로 정지한 공 위를 지나면 Infinity, 낮게 날면 유한하고 그 순간 3D 거리 2R", () => {
        const y = 0.8 + (2 * 2.2) / P.g;   // 정점 자리
        const red = ball("red", [0.7, y], [0, 0, 0], "stationary");
        const high: BallState = { id: "white", r: [0.7, 0.8, R], v: [0, 2, 2.2], w: [0, 0, 0], state: "airborne" };
        expect(ballBallTime(high, red, P)).toBe(Infinity);
        const low: BallState = { id: "white", r: [0.7, 0.8, R], v: [0, 2, 0.5], w: [0, 0, 0], state: "airborne" };   // 정점 12.7 mm
        const redLow = ball("red", [0.7, 0.8 + 2 * (0.5 / P.g)], [0, 0, 0], "stationary");                    // 낮은 포물선의 정점 자리
        const t = ballBallTime(low, redLow, P);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeLessThan((2 * 0.5) / P.g);      // 착지 전에 닿는다
        expect(Math.abs(dist(evolveBall(low, t, P), evolveBall(redLow, t, P)) - 2 * R)).toBeLessThan(1e-12);
        const ref = bisect(gap(low, redLow), (2 * 0.5) / P.g);
        expect(Math.abs(t - ref)).toBeLessThan(1e-10);
        // 같은 자리라도 높이 나는 공은 지나간다
        expect(ballBallTime(high, redLow, P)).toBe(Infinity);
    });

    it("착지 시각 뒤의 근은 버린다(유효 구간 = landingTime)", () => {
        // 착지 뒤에 포물선을 외삽하면 슬레이트 아래에서 red 와 만나지만 그 근은 유효 구간 밖이다
        const flyer: BallState = { id: "white", r: [0.7, 0.8, R], v: [0, 1, 1], w: [0, 0, 0], state: "airborne" };
        const tLand = (2 * 1) / P.g;
        const red = ball("red", [0.7, 0.8 + 1 * tLand + 0.02], [0, 0, 0], "stationary");   // 착지 자리 바로 앞
        const t = ballBallTime(flyer, red, P);
        expect(t === Infinity || t <= tLand).toBe(true);
    });

    it("두 공 모두 공중에서 서로 다가가면 상대 가속도가 0 이라 2차식으로 강등되고 정확히 잡는다", () => {
        const a: BallState = { id: "a", r: [0.5, 1.0, R + 0.1], v: [1, 0, 0.3], w: [0, 0, 0], state: "airborne" };
        const b: BallState = { id: "b", r: [0.9, 1.0, R + 0.1], v: [-1, 0, 0.3], w: [0, 0, 0], state: "airborne" };
        const t = ballBallTime(a, b, P);
        expect(t).toBeCloseTo((0.4 - 2 * R) / 2, 12);
    });
});
