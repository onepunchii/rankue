/**
 * mathavan2010 검증: 에너지 비증가(시드 난수 2000개), 거울·회전 대칭, 정면 구름 반발비, 45° 반사각,
 * 순방향·역방향 잉글리시의 반사각 변화 방향, 80–90° 역방향 잉글리시 되돌아옴, 스텝 수렴, 결정론, 입력 불변, 성능.
 * 각도는 dmath.atan2 로만 잰다(테스트 파일도 초월함수 grep 대상일 수 있다).
 */
import { describe, expect, it } from "vitest";
import type { BallState, CushionSegment, Vec3 } from "../../types";
import { mulberry32 } from "../../rng";
import { TABLES, cushionSegments } from "../../params";
import { kineticEnergy } from "../../evolve";
import { PI, atan2, sin, cos } from "../../dmath";
import { resolveCushionMathavan } from "./mathavan2010";

const T = TABLES.DAEDAE;
const P = T.ball;
const R = P.R;
const H = T.cushionHeight;
const SEGS = cushionSegments(T);
const seg = (id: CushionSegment["id"]): CushionSegment => SEGS.find((s) => s.id === id)!;
/** top 쿠션(normal (0,−1)): 공이 +y 로 들어가면 쿠션 프레임이 테이블 프레임과 같다(x' = x, y' = y). */
const TOP = seg("top");

function ball(v: readonly [number, number], w: Vec3 = [0, 0, 0], id = "cue"): BallState {
    return { id, r: [0.7, T.length - R, R], v: [v[0], v[1], 0], w: [w[0], w[1], w[2]], state: "sliding" };
}

/** 자연 구름 각속도 (1/R) k̂ × v 에 topspin 비율 x 를 곱한 것. */
function rollSpin(v: readonly [number, number], x = 1): Vec3 {
    return [(-v[1] * x) / R, (v[0] * x) / R, 0];
}

function speed(v: Vec3): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

/** 입사각 α: +x(쿠션 방향)에서 잰 진행 방향의 각 (deg). */
function alphaDeg(v: Vec3): number {
    return (atan2(v[1], v[0]) * 180) / PI;
}

/** 반사각 β: 쿠션 선(+x)에서 잰 되튀는 방향의 각 (deg). 90° 넘으면 들어온 쪽으로 되돌아간 것. */
function betaDeg(v: Vec3): number {
    return (atan2(-v[1], v[0]) * 180) / PI;
}

/** 시드 난수로 top 쿠션을 향해 들어가는 상태 하나. 속도 0.05–3 m/s, 스핀은 |ω| ≤ 1.5·v/R. */
function randomIncident(rnd: () => number): BallState {
    const sp = 0.05 + 3 * rnd();
    const ang = 0.02 + (PI - 0.04) * rnd();               // α ∈ (1°, 179°)
    const v: [number, number] = [sp * cos(ang), sp * sin(ang)];
    const wm = (1.5 * sp) / R;
    return ball(v, [(2 * rnd() - 1) * wm, (2 * rnd() - 1) * wm, (2 * rnd() - 1) * wm]);
}

describe("resolveCushionMathavan — 기본 계약", () => {
    it("v_z = 0, state 'sliding', 위치·id 유지, 되튀는 방향은 법선 쪽", () => {
        const b = ball([0.3, 1.2], [5, -3, 20], "b1");
        const o = resolveCushionMathavan(b, TOP, P, H);
        expect(o.id).toBe("b1");
        expect(o.r).toEqual(b.r);
        expect(o.v[2]).toBe(0);
        expect(o.state).toBe("sliding");
        expect(o.v[1]).toBeLessThan(0);                    // top 쿠션에서 −y 로
        expect(o.v[0] * TOP.normal[0] + o.v[1] * TOP.normal[1]).toBeGreaterThan(0);
    });

    it("쿠션에서 멀어지는 공은 속도를 바꾸지 않는다(방어적 복사)", () => {
        const b = ball([0.3, -1.0], [1, 2, 3]);
        const o = resolveCushionMathavan(b, TOP, P, H);
        expect(o.v).toEqual([0.3, -1.0, 0]);
        expect(o.w).toEqual([1, 2, 3]);
        expect(o.state).toBe("sliding");
    });

    it("정면 무스핀: x 성분·ω_y·ω_z 는 정확히 0 (대칭)", () => {
        const o = resolveCushionMathavan(ball([0, 1]), TOP, P, H);
        expect(o.v[0]).toBe(0);
        expect(o.w[1]).toBe(0);
        expect(o.w[2]).toBe(0);
        expect(o.v[1]).toBeLessThan(0);
    });
});

describe("resolveCushionMathavan — 파라미터", () => {
    it("에너지 반발 계수는 eE 를 읽는다: eC 만 바꾸면 결과가 같고 eE 를 바꾸면 달라진다", () => {
        const b = ball([0.3, 1.2], [5, -3, 20]);
        const base = resolveCushionMathavan(b, TOP, P, H);
        expect(resolveCushionMathavan(b, TOP, { ...P, eC: 0.5 }, H)).toEqual(base);
        const hi = resolveCushionMathavan(b, TOP, { ...P, eE: 0.98 }, H);
        expect(hi.v).not.toEqual(base.v);
        expect(-hi.v[1]).toBeGreaterThan(-base.v[1]);                 // 더 탄력 → 더 빠르게 되튄다
    });

    it("수직 입사 구름 공의 반발 속도비 ≈ eE (eE=0.88 → 0.88; 0.98 이면 실측 대역 0.82–0.91 밖 — params.ts 주석)", () => {
        const roll = (vy: number): BallState => ({ id: "c", r: [0.7, 1, R], v: [0, vy, 0], w: [-vy / R, 0, 0], state: "rolling" });
        const o88 = resolveCushionMathavan(roll(2), TOP, P, H);
        expect(-o88.v[1] / 2).toBeCloseTo(0.88, 2);
        const o98 = resolveCushionMathavan(roll(2), TOP, { ...P, eE: 0.98 }, H);
        expect(-o98.v[1] / 2).toBeCloseTo(0.98, 2);
    });

    it("steps 가 NaN·비유한이면 기본값(2000)으로 계산한다 (NaN 전파 없음)", () => {
        const b = ball([0.3, 1.2], [5, -3, 20]);
        const base = resolveCushionMathavan(b, TOP, P, H);
        expect(resolveCushionMathavan(b, TOP, P, H, NaN)).toEqual(base);
        expect(resolveCushionMathavan(b, TOP, P, H, Infinity)).toEqual(base);
        expect(resolveCushionMathavan(b, TOP, P, H, 2000)).toEqual(base);
    });
});

describe("resolveCushionMathavan — 에너지", () => {
    it("시드 난수 2000개 입사 상태에서 운동에너지가 절대 늘지 않고 항상 법선 쪽으로 되튄다", () => {
        const rnd = mulberry32(20260907);
        let maxRatio = -Infinity;
        for (let i = 0; i < 2000; i++) {
            const b = randomIncident(rnd);
            const o = resolveCushionMathavan(b, TOP, P, H);
            const k0 = kineticEnergy(b, P);
            const k1 = kineticEnergy(o, P);
            expect(k1).toBeLessThanOrEqual(k0 * (1 + 1e-9));
            expect(o.v[1]).toBeLessThanOrEqual(0);
            expect(Number.isFinite(o.v[0]) && Number.isFinite(o.w[2])).toBe(true);
            maxRatio = Math.max(maxRatio, k1 / k0);
        }
        // e_e = 0.88 이면 법선 일의 (1 − e²) ≈ 23 % 는 반드시 잃는다 — 전부 스치는 입사만 뽑힌 게 아닌지 확인
        expect(maxRatio).toBeLessThan(1);
    });
});

describe("resolveCushionMathavan — 대칭", () => {
    it("거울 대칭: x → −x 이면 v_x·ω_y·ω_z 부호가 뒤집히고 나머지는 같다", () => {
        const rnd = mulberry32(7);
        for (let i = 0; i < 50; i++) {
            const b = randomIncident(rnd);
            const m: BallState = { ...b, v: [-b.v[0], b.v[1], 0], w: [b.w[0], -b.w[1], -b.w[2]] };
            const o = resolveCushionMathavan(b, TOP, P, H);
            const om = resolveCushionMathavan(m, TOP, P, H);
            expect(om.v[0]).toBeCloseTo(-o.v[0], 12);
            expect(om.v[1]).toBeCloseTo(o.v[1], 12);
            expect(om.w[0]).toBeCloseTo(o.w[0], 12);
            expect(om.w[1]).toBeCloseTo(-o.w[1], 12);
            expect(om.w[2]).toBeCloseTo(-o.w[2], 12);
        }
    });

    it("회전 대칭: 네 쿠션 모두 쿠션 프레임 기준으로 같은 답을 낸다", () => {
        // top 프레임 (x' = x, y' = y) 의 상태 (vx, vy, wx, wy, wz) 를 각 쿠션 프레임으로 돌려 넣고 결과를 되돌려 비교
        const frames: Record<CushionSegment["id"], { x: [number, number]; y: [number, number] }> = {
            top: { x: [1, 0], y: [0, 1] },
            bottom: { x: [-1, 0], y: [0, -1] },
            left: { x: [0, 1], y: [-1, 0] },
            right: { x: [0, -1], y: [1, 0] },
        };
        const rnd = mulberry32(99);
        for (let i = 0; i < 30; i++) {
            const ref = randomIncident(rnd);
            const oRef = resolveCushionMathavan(ref, TOP, P, H);
            for (const id of ["bottom", "left", "right"] as const) {
                const f = frames[id];
                const toTable = (x: number, y: number): [number, number] => [x * f.x[0] + y * f.y[0], x * f.x[1] + y * f.y[1]];
                const v = toTable(ref.v[0], ref.v[1]);
                const w = toTable(ref.w[0], ref.w[1]);
                const b: BallState = { ...ref, r: [0.7, 1.0, R], v: [v[0], v[1], 0], w: [w[0], w[1], ref.w[2]] };
                const o = resolveCushionMathavan(b, seg(id), P, H);
                const vExp = toTable(oRef.v[0], oRef.v[1]);
                const wExp = toTable(oRef.w[0], oRef.w[1]);
                expect(o.v[0]).toBeCloseTo(vExp[0], 12);
                expect(o.v[1]).toBeCloseTo(vExp[1], 12);
                expect(o.w[0]).toBeCloseTo(wExp[0], 12);
                expect(o.w[1]).toBeCloseTo(wExp[1], 12);
                expect(o.w[2]).toBeCloseTo(oRef.w[2], 12);
            }
        }
    });
});

describe("resolveCushionMathavan — 물리", () => {
    it("정면 구름 공 1 m/s: 반발 속도비 0.6–0.98", () => {
        const b = ball([0, 1], rollSpin([0, 1]));
        const o = resolveCushionMathavan(b, TOP, P, H);
        const frac = speed(o.v) / speed(b.v);
        expect(frac).toBeGreaterThan(0.6);
        expect(frac).toBeLessThan(0.98);
        expect(betaDeg(o.v)).toBeCloseTo(90, 9);
    });

    it("정면 구름 공: 반발 속도비가 입사 속도 0.5→3 m/s 에서 단조 비증가", () => {
        // 강체 쿠션·상수 e_e 모델은 속도에 대해 동차라 속도비가 사실상 상수다(논문의 속도 의존은 2.5 m/s 이상의
        // 쿠션 변형에서 오며 이 모델 밖). 그래서 '비증가'는 부동소수점 허용 안에서 등식으로 성립한다.
        const speeds = [0.5, 0.75, 1, 1.5, 2, 2.5, 3];
        const fracs = speeds.map((s) => {
            const b = ball([0, s], rollSpin([0, s]));
            return speed(resolveCushionMathavan(b, TOP, P, H).v) / s;
        });
        for (let i = 1; i < fracs.length; i++) {
            expect(fracs[i]).toBeLessThanOrEqual(fracs[i - 1] + 1e-9);
        }
        expect(Math.max(...fracs) - Math.min(...fracs)).toBeLessThan(1e-6);
    });

    it("정면: 자연 구름(탑스핀)이 무스핀보다 더 빠르게 되튄다 (논문 Fig. 9 의 방향)", () => {
        const roll = resolveCushionMathavan(ball([0, 1], rollSpin([0, 1])), TOP, P, H);
        const slide = resolveCushionMathavan(ball([0, 1]), TOP, P, H);
        expect(speed(roll.v)).toBeGreaterThan(speed(slide.v));
    });

    it("45° 구름 공: 반사각 35°–55°", () => {
        const c = Math.sqrt(0.5);
        const b = ball([c, c], rollSpin([c, c]));
        expect(alphaDeg(b.v)).toBeCloseTo(45, 9);
        const o = resolveCushionMathavan(b, TOP, P, H);
        const beta = betaDeg(o.v);
        expect(beta).toBeGreaterThan(35);
        expect(beta).toBeLessThan(55);
    });

    it("순방향 잉글리시는 반사각을 줄이고(길게), 역방향은 키운다(짧게) — 서로 반대 방향", () => {
        const c = Math.sqrt(0.5);
        const base = rollSpin([c, c]);
        // vx > 0 으로 쿠션을 따라 진행할 때 ω_z > 0(위에서 반시계)이면 쿠션 접점이 뒤로 움직인다 = 순방향
        const none = resolveCushionMathavan(ball([c, c], base), TOP, P, H);
        const running = resolveCushionMathavan(ball([c, c], [base[0], base[1], 30]), TOP, P, H);
        const reverse = resolveCushionMathavan(ball([c, c], [base[0], base[1], -30]), TOP, P, H);
        const b0 = betaDeg(none.v), bR = betaDeg(running.v), bV = betaDeg(reverse.v);
        expect(bR).toBeLessThan(b0 - 1);
        expect(bV).toBeGreaterThan(b0 + 1);
        // 순방향은 쿠션 마찰이 진행 방향으로 밀어 주므로 되튀는 속도도 더 크다
        expect(speed(running.v)).toBeGreaterThan(speed(none.v));
        expect(speed(reverse.v)).toBeLessThan(speed(none.v));
    });

    it("85° 입사 + 강한 역방향 잉글리시: 들어온 쪽으로 되돌아온다 (논문 Fig. 11)", () => {
        const a = (85 * PI) / 180;
        const v: [number, number] = [cos(a), sin(a)];
        const base = rollSpin(v);
        const o = resolveCushionMathavan(ball(v, [base[0], base[1], -40]), TOP, P, H);
        expect(o.v[0]).toBeLessThan(0);                    // 입사 v_x > 0 이었는데 반대로
        expect(betaDeg(o.v)).toBeGreaterThan(90);
        // 같은 세기의 순방향은 당연히 앞으로 계속 간다
        const f = resolveCushionMathavan(ball(v, [base[0], base[1], 40]), TOP, P, H);
        expect(f.v[0]).toBeGreaterThan(v[0]);
    });
});

describe("resolveCushionMathavan — 수치", () => {
    const cases: BallState[] = [
        ball([Math.sqrt(0.5), Math.sqrt(0.5)], [-10, 5, 30]),
        ball([0, 1], rollSpin([0, 1])),
        ball([0.3, 2.5], [40, -20, -50]),
        ball([1.5, 0.2], [3, -40, 12]),
    ];

    it("스텝 수렴: steps 2000 과 4000 의 속도 차가 1e-4 m/s 미만", () => {
        for (const b of cases) {
            const a = resolveCushionMathavan(b, TOP, P, H, 2000);
            const c = resolveCushionMathavan(b, TOP, P, H, 4000);
            const dv = Math.sqrt((a.v[0] - c.v[0]) ** 2 + (a.v[1] - c.v[1]) ** 2);
            expect(dv).toBeLessThan(1e-4);
        }
    });

    it("결정론: 같은 입력이면 비트 단위로 같은 출력", () => {
        for (const b of cases) {
            const a = resolveCushionMathavan(b, TOP, P, H);
            const c = resolveCushionMathavan({ ...b, v: [b.v[0], b.v[1], b.v[2]], w: [b.w[0], b.w[1], b.w[2]] }, TOP, P, H);
            expect(Object.is(a.v[0], c.v[0]) && Object.is(a.v[1], c.v[1])).toBe(true);
            expect(Object.is(a.w[0], c.w[0]) && Object.is(a.w[1], c.w[1]) && Object.is(a.w[2], c.w[2])).toBe(true);
        }
    });

    it("입력 불변: 동결한 공·세그먼트·파라미터를 건드리지 않고 새 배열을 돌려준다", () => {
        const b = cases[0];
        const frozen: BallState = Object.freeze({
            ...b,
            r: Object.freeze([...b.r]) as unknown as Vec3,
            v: Object.freeze([...b.v]) as unknown as Vec3,
            w: Object.freeze([...b.w]) as unknown as Vec3,
        });
        const fseg: CushionSegment = Object.freeze({ ...TOP, normal: Object.freeze([...TOP.normal]) as unknown as readonly [number, number] });
        const snapshot = JSON.stringify({ frozen, fseg, P });
        const o = resolveCushionMathavan(frozen, fseg, Object.freeze({ ...P }), H);
        expect(JSON.stringify({ frozen, fseg, P })).toBe(snapshot);
        expect(o).not.toBe(frozen);
        expect(o.r).not.toBe(frozen.r);
        expect(o.v).not.toBe(frozen.v);
        expect(o.w).not.toBe(frozen.w);
    });

    it("성능: 기본 steps 로 한 번 해결에 0.5 ms 이하 (평균)", () => {
        const b = cases[0];
        for (let i = 0; i < 50; i++) resolveCushionMathavan(b, TOP, P, H);
        const N = 200;
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < N; i++) resolveCushionMathavan(cases[i % cases.length], TOP, P, H);
        const t1 = process.hrtime.bigint();
        const usPer = Number(t1 - t0) / 1e3 / N;
        expect(usPer).toBeLessThan(500);
    });
});
