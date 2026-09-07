import { describe, expect, it } from "vitest";
import type { BallState, CushionId, CushionSegment, Vec3 } from "../types.js";
import { cushionSegments, TABLES } from "../params.js";
import { evolveBall } from "../evolve.js";
import { ballCushionTime } from "./ballCushion.js";

const T = TABLES.DAEDAE;
const P = T.ball;
const R = P.R;
const W = T.width, L = T.length;
const SEGS = cushionSegments(T);
const seg = (id: CushionId): CushionSegment => SEGS.find((s) => s.id === id)!;

function ball(r: readonly [number, number], v: Vec3, state: BallState["state"], w?: Vec3): BallState {
    const wv: Vec3 = w ?? (state === "rolling" ? [-v[1] / R, v[0] / R, 0] : [0, 0, 0]);
    return { id: "cue", r: [r[0], r[1], R], v, w: wv, state };
}

/** [0, tmax] 를 훑어 f 가 처음 양 → 음이 되는 구간을 찾고 이분법 (감지기와 독립인 오라클). */
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

/** evolveBall 로 전진한 공 중심의 코 라인까지 부호 거리 − R (오라클). */
function gap(b: BallState, s: CushionSegment) {
    return (t: number) => {
        const e = evolveBall(b, t, P);
        return s.normal[0] * (e.r[0] - s.p1[0]) + s.normal[1] * (e.r[1] - s.p1[1]) - R;
    };
}

/** 등감속 μg 로 거리 d 를 가는 데 걸리는 시간: v t − ½ μ g t² = d 의 작은 근. */
function decelTime(v: number, d: number, mu: number): number {
    const a = mu * P.g;
    return (v - Math.sqrt(v * v - 2 * a * d)) / a;
}

const CENTER: readonly [number, number] = [W / 2, L / 2];
const CASES: { id: CushionId; dir: Vec3; dist: number }[] = [
    { id: "left", dir: [-1, 0, 0], dist: W / 2 },
    { id: "right", dir: [1, 0, 0], dist: W / 2 },
    { id: "bottom", dir: [0, -1, 0], dist: L / 2 },
    { id: "top", dir: [0, 1, 0], dist: L / 2 },
];

describe("ballCushionTime — 네 쿠션 정면", () => {
    for (const c of CASES) {
        it(`구름 공 → ${c.id}: t = 감속 보정한 (거리 − R)/v, 이분법과도 일치`, () => {
            const v = 2.0;
            const b = ball(CENTER, [c.dir[0] * v, c.dir[1] * v, 0], "rolling");
            const t = ballCushionTime(b, seg(c.id), P);
            const closed = decelTime(v, c.dist - R, P.muR);
            expect(Math.abs(t - closed)).toBeLessThan(1e-12);
            const ref = bisect(gap(b, seg(c.id)), 2);
            expect(Math.abs(t - ref)).toBeLessThan(1e-10);
            // 감속 때문에 등속 근사 (거리 − R)/v 보다 늦다
            expect(t).toBeGreaterThan((c.dist - R) / v);
        });

        it(`미끄럼 공(스핀 없음) → ${c.id}: μ_s 감속`, () => {
            // 스핀 없는 3 m/s 미끄럼은 (2/7)·3/(μ_s g) ≈ 0.44 s, 약 1.1 m 만 미끄러진다 — 쿠션에서 0.5 m 앞에서 출발
            const v = 3.0;
            const d = 0.5;
            const start: readonly [number, number] = [CENTER[0] + c.dir[0] * (c.dist - d), CENTER[1] + c.dir[1] * (c.dist - d)];
            const b = ball(start, [c.dir[0] * v, c.dir[1] * v, 0], "sliding");
            const t = ballCushionTime(b, seg(c.id), P);
            const closed = decelTime(v, d - R, P.muS);
            expect(Math.abs(t - closed)).toBeLessThan(1e-12);
            const ref = bisect(gap(b, seg(c.id)), 0.4);
            expect(Math.abs(t - ref)).toBeLessThan(1e-10);
        });

        it(`중앙에서 3 m/s 스핀 없는 미끄럼 → ${c.id}: 미끄럼 구간(≈1.1 m) 안에 닿으면 유한, 아니면 Infinity`, () => {
            const b = ball(CENTER, [c.dir[0] * 3, c.dir[1] * 3, 0], "sliding");
            const t = ballCushionTime(b, seg(c.id), P);
            const slideDist = (3 * 3 - (5 / 7) * 3 * (5 / 7) * 3) / (2 * P.muS * P.g);   // (v0² − v_s²)/(2 μ_s g)
            if (c.dist - R < slideDist) {
                expect(Number.isFinite(t)).toBe(true);
                expect(Math.abs(t - decelTime(3, c.dist - R, P.muS))).toBeLessThan(1e-12);
            } else {
                expect(t).toBe(Infinity);
            }
        });

        it(`${c.id} 로 가는 공은 나머지 세 쿠션에는 닿지 않는다`, () => {
            const b = ball(CENTER, [c.dir[0] * 2, c.dir[1] * 2, 0], "rolling");
            for (const s of SEGS) {
                if (s.id === c.id) continue;
                expect(ballCushionTime(b, s, P)).toBe(Infinity);
            }
        });
    }
});

describe("ballCushionTime — 충돌 없음", () => {
    it("쿠션과 평행하게 움직이면 Infinity", () => {
        const alongY = ball([0.3, 1.0], [0, 1.5, 0], "rolling");
        expect(ballCushionTime(alongY, seg("left"), P)).toBe(Infinity);
        expect(ballCushionTime(alongY, seg("right"), P)).toBe(Infinity);
        const alongX = ball([0.3, 1.0], [1.5, 0, 0], "sliding");
        expect(ballCushionTime(alongX, seg("top"), P)).toBe(Infinity);
        expect(ballCushionTime(alongX, seg("bottom"), P)).toBe(Infinity);
    });

    it("쿠션에 닿아 있고 멀어지는 중이면 Infinity (방금 튕긴 쿠션을 다시 잡지 않는다)", () => {
        const b = ball([R, 1.0], [1.2, 0.3, 0], "sliding", [0, 0, 30]);
        expect(ballCushionTime(b, seg("left"), P)).toBe(Infinity);
    });

    it("정지·스핀 공은 Infinity", () => {
        const st = ball([R + 1e-6, 1.0], [0, 0, 0], "stationary");
        const sp = ball([R + 1e-6, 1.0], [0, 0, 0], "spinning", [0, 0, 15]);
        for (const s of SEGS) {
            expect(ballCushionTime(st, s, P)).toBe(Infinity);
            expect(ballCushionTime(sp, s, P)).toBe(Infinity);
        }
    });

    it("쿠션 앞에서 멈추는 공은 Infinity (돌아오는 외삽 근을 잡지 않는다)", () => {
        // 정지 거리 0.2²/(2·0.0981) ≈ 0.204 m < 0.711 − R
        const b = ball(CENTER, [-0.2, 0, 0], "rolling");
        expect(ballCushionTime(b, seg("left"), P)).toBe(Infinity);
    });
});

describe("ballCushionTime — 세그먼트 범위", () => {
    // 짧은 세그먼트: x = 0.5, y ∈ [1.0, 1.4], 안쪽 법선 +x (오른쪽에서 오는 공을 막는다)
    const short: CushionSegment = { id: "left", p1: [0.5, 1.0], p2: [0.5, 1.4], normal: [1, 0] };

    // 2 m/s 미끄럼 공의 정지 거리 2²/(2·0.2·9.81) ≈ 1.02 m > 0.4 m — 세그먼트까지 충분히 간다
    it("세그먼트 안을 향하면 잡힌다", () => {
        const b = ball([0.9, 1.2], [-2, 0, 0], "sliding");
        expect(ballCushionTime(b, short, P)).toBeCloseTo(decelTime(2, 0.4 - R, P.muS), 12);
    });

    it("끝에서 R 이내로 벗어난 접점은 허용, R 보다 더 벗어나면 Infinity", () => {
        const inside = ball([0.9, 1.4 + R * 0.9], [-2, 0, 0], "sliding");
        expect(Number.isFinite(ballCushionTime(inside, short, P))).toBe(true);
        const outside = ball([0.9, 1.4 + R * 1.1], [-2, 0, 0], "sliding");
        expect(ballCushionTime(outside, short, P)).toBe(Infinity);
        const below = ball([0.9, 1.0 - R * 1.1], [-2, 0, 0], "sliding");
        expect(ballCushionTime(below, short, P)).toBe(Infinity);
    });
});

describe("ballCushionTime — 코너 정확 입사", () => {
    it("대각선으로 (0,0) 코너를 향하면 left 와 bottom 이 같은 t (1e-12 이내), top·right 는 Infinity", () => {
        const s = 1 / Math.sqrt(2);
        const b = ball([0.3, 0.3], [-1.6 * s, -1.6 * s, 0], "rolling");
        const tl = ballCushionTime(b, seg("left"), P);
        const tb = ballCushionTime(b, seg("bottom"), P);
        expect(Number.isFinite(tl)).toBe(true);
        expect(Math.abs(tl - tb)).toBeLessThan(1e-12);
        expect(ballCushionTime(b, seg("top"), P)).toBe(Infinity);
        expect(ballCushionTime(b, seg("right"), P)).toBe(Infinity);
        // 그 순간 공 중심은 (R, R)
        const e = evolveBall(b, tl, P);
        expect(e.r[0]).toBeCloseTo(R, 10);
        expect(e.r[1]).toBeCloseTo(R, 10);
    });

    it("(W, L) 코너도 마찬가지 — right 와 top", () => {
        const s = 1 / Math.sqrt(2);
        // 2 m/s 스핀 없는 미끄럼은 약 0.5 m 만 미끄러진다 — 코너에서 0.3 m (대각 0.42 m − R) 앞에서 출발
        const b = ball([W - 0.3, L - 0.3], [2 * s, 2 * s, 0], "sliding");
        const tr = ballCushionTime(b, seg("right"), P);
        const tt = ballCushionTime(b, seg("top"), P);
        expect(Number.isFinite(tr)).toBe(true);
        expect(Math.abs(tr - tt)).toBeLessThan(1e-12);
    });
});

describe("ballCushionTime — 입력 불변", () => {
    it("동결된 입력으로도 동작하고 값이 변하지 않는다", () => {
        const b = ball(CENTER, [-1, 0.2, 0], "rolling");
        Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w); Object.freeze(b);
        const s = seg("left");
        Object.freeze(s.p1); Object.freeze(s.p2); Object.freeze(s.normal); Object.freeze(s);
        const sb = JSON.stringify(b), ss = JSON.stringify(s);
        expect(() => ballCushionTime(b, s, P)).not.toThrow();
        expect(JSON.stringify(b)).toBe(sb);
        expect(JSON.stringify(s)).toBe(ss);
    });
});
