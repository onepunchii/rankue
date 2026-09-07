/**
 * resolve/kiss.ts 검증: makeKiss 의 궤적 분리·폴백, resolveContinuallyTouching 의 발동 조건·에너지 중립·대칭.
 */
import { describe, it, expect } from "vitest";
import {
    makeKiss, resolveContinuallyTouching, kissDebug,
    DEFAULT_SPACER, CONTINUAL_TOUCH_EPS,
} from "./kiss.js";
import { TABLES } from "../params.js";
import { length, sub, dot, unit } from "../vec.js";
import type { BallState, Vec3 } from "../types.js";

const P = TABLES.DAEDAE.ball;
const R = P.R;

function ball(id: string, r: Vec3, v: Vec3, state: BallState["state"] = "sliding", w: Vec3 = [0, 0, 0]): BallState {
    return { id, r, v, w, state };
}

function deepFreeze<T>(o: T): T {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) {
        const v = (o as Record<string, unknown>)[k];
        if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
    return o;
}

const dist = (a: BallState, b: BallState) => length(sub(b.r, a.r));

describe("makeKiss", () => {
    it("정면 접근, 반올림만큼 겹친 두 공 → 정확히 2R + spacer, 궤적 방향으로만 이동", () => {
        const a = ball("a", [0.5, 1.0, R], [1, 0, 0]);
        const b = ball("b", [0.5 + 2 * R - 1e-12, 1.0, R], [-1, 0, 0]);
        kissDebug.fallbacks = 0;
        const [ka, kb] = makeKiss(a, b, P);
        expect(Math.abs(dist(ka, kb) - (2 * R + DEFAULT_SPACER))).toBeLessThan(1e-15);
        expect(kissDebug.fallbacks).toBe(0);
        // 각 공은 자기 속도 방향(직선)으로만 움직였다: y·z 불변
        expect(ka.r[1]).toBe(1.0);
        expect(kb.r[1]).toBe(1.0);
        expect(ka.r[2]).toBe(R);
        // 접근 중이었으므로 과거(t < 0)로 되돌린다 → a 는 −x, b 는 +x 로
        expect(ka.r[0]).toBeLessThan(a.r[0]);
        expect(kb.r[0]).toBeGreaterThan(b.r[0]);
        // 대칭이라 중점 불변
        expect(Math.abs((ka.r[0] + kb.r[0]) / 2 - (a.r[0] + b.r[0]) / 2)).toBeLessThan(1e-15);
        // 속도·각속도·상태·id 그대로
        expect(ka.v).toEqual(a.v);
        expect(kb.v).toEqual(b.v);
        expect(ka.state).toBe("sliding");
        expect(ka.id).toBe("a");
        expect(kb.id).toBe("b");
    });

    it("한 공만 움직여도 궤적 방향으로 분리, 정지한 공은 그대로", () => {
        const a = ball("a", [0.5, 1.0, R], [0.6, 0.8, 0]);
        const dir: Vec3 = [0.6, 0.8, 0];
        const b = ball("b", [0.5 + dir[0] * (2 * R - 3e-13), 1.0 + dir[1] * (2 * R - 3e-13), R], [0, 0, 0], "stationary");
        const [ka, kb] = makeKiss(a, b, P);
        expect(Math.abs(dist(ka, kb) - (2 * R + DEFAULT_SPACER))).toBeLessThan(1e-15);
        expect(kb.r).toEqual(b.r);
        // a 의 이동은 v 방향
        const d = sub(ka.r, a.r);
        const dn = unit(d);
        expect(Math.abs(Math.abs(dot(dn, dir)) - 1)).toBeLessThan(1e-9);
    });

    it("둘 다 정지 → 중심선 대칭 폴백", () => {
        const a = ball("a", [0.5, 1.0, R], [0, 0, 0], "stationary");
        const b = ball("b", [0.5 + 2 * R - 1e-4, 1.0 + 1e-4, R], [0, 0, 0], "spinning", [0, 0, 5]);
        kissDebug.fallbacks = 0;
        const [ka, kb] = makeKiss(a, b, P);
        expect(kissDebug.fallbacks).toBe(1);
        expect(Math.abs(dist(ka, kb) - (2 * R + DEFAULT_SPACER))).toBeLessThan(1e-15);
        // 중점 불변
        for (let i = 0; i < 3; i++) {
            expect(Math.abs((ka.r[i] + kb.r[i]) - (a.r[i] + b.r[i]))).toBeLessThan(1e-15);
        }
    });

    it("같은 속도(근 없음) → 폴백, 속도 거의 같음(중점이 5·spacer 넘게 이동) → 폴백", () => {
        const a = ball("a", [0.5, 1.0, R], [2, 0, 0]);
        const b = ball("b", [0.5 + 2 * R - 1e-6, 1.0, R], [2, 0, 0]);
        kissDebug.fallbacks = 0;
        const [ka, kb] = makeKiss(a, b, P);
        expect(kissDebug.fallbacks).toBe(1);
        expect(Math.abs(dist(ka, kb) - (2 * R + DEFAULT_SPACER))).toBeLessThan(1e-15);

        const c = ball("c", [0.5 + 2 * R - 1e-6, 1.0, R], [2 - 1e-6, 0, 0]);
        const [ka2, kc] = makeKiss(a, c, P);
        expect(kissDebug.fallbacks).toBe(2);
        expect(Math.abs(dist(ka2, kc) - (2 * R + DEFAULT_SPACER))).toBeLessThan(1e-15);
    });

    it("spacer 인자를 존중한다", () => {
        const a = ball("a", [0.5, 1.0, R], [1, 0, 0]);
        const b = ball("b", [0.5 + 2 * R, 1.0, R], [-1, 0, 0]);
        const [ka, kb] = makeKiss(a, b, P, 1e-7);
        expect(Math.abs(dist(ka, kb) - (2 * R + 1e-7))).toBeLessThan(1e-15);
    });

    it("입력 불변 (얼린 입력)", () => {
        const a = deepFreeze(ball("a", [0.5, 1.0, R], [1, 0, 0]));
        const b = deepFreeze(ball("b", [0.5 + 2 * R - 1e-12, 1.0, R], [-1, 0, 0]));
        const [ka, kb] = makeKiss(a, b, P);
        expect(ka).not.toBe(a);
        expect(kb.r).not.toBe(b.r);
        expect(a.r).toEqual([0.5, 1.0, R]);
    });
});

describe("resolveContinuallyTouching", () => {
    // 뒤 공 a 가 앞 공 b 를 +x 방향으로 밀고 가는 상태(충돌 직후: 분리 속도 5e-4 < 1e-3)
    const chaser = ball("a", [0.5, 1.0, R], [1.0, 0.02, 0]);
    const chased = ball("b", [0.5 + 2 * R + DEFAULT_SPACER, 1.0, R], [1.0005, 0.02, 0]);

    it("조건 충족 → 앞 공이 뒤 공 반경 속도의 10 % 를 받고 분리 속도가 커진다, 반경 방향 운동에너지 불변", () => {
        const [a2, b2] = resolveContinuallyTouching(chaser, chased, P);
        expect(a2).not.toBe(chaser);
        expect(b2.v[0]).toBeCloseTo(1.0005 + 0.1 * 1.0, 15);
        expect(b2.v[0] - a2.v[0]).toBeGreaterThan(CONTINUAL_TOUCH_EPS);
        // 접선(y) 성분 불변
        expect(a2.v[1]).toBe(0.02);
        expect(b2.v[1]).toBe(0.02);
        // 반경 방향 운동에너지 합 불변
        const before = chaser.v[0] ** 2 + chased.v[0] ** 2;
        const after = a2.v[0] ** 2 + b2.v[0] ** 2;
        expect(Math.abs(after - before)).toBeLessThan(1e-12);
        // 뒤 공은 10 % 보다 조금 더 내놓는다(운동량 싱크 ≈ 1 %)
        expect(chaser.v[0] - a2.v[0]).toBeGreaterThan(0.1);
        expect(chaser.v[0] - a2.v[0]).toBeLessThan(0.13);
        expect(a2.state).toBe("sliding");
        expect(a2.r).toEqual(chaser.r);
    });

    it("인자 순서를 바꿔도 같은 결과(라벨 비대칭 없음)", () => {
        const [a2, b2] = resolveContinuallyTouching(chaser, chased, P);
        const [b3, a3] = resolveContinuallyTouching(chased, chaser, P);
        expect(a3.v).toEqual(a2.v);
        expect(b3.v).toEqual(b2.v);
    });

    it("−x 방향으로 함께 움직이는 거울상도 분리시킨다", () => {
        const mA = ball("a", [0.5, 1.0, R], [-1.0005, 0.02, 0]);           // 앞 공(−x 쪽이 앞)
        const mB = ball("b", [0.5 + 2 * R + DEFAULT_SPACER, 1.0, R], [-1.0, 0.02, 0]); // 뒤 공
        const [a2, b2] = resolveContinuallyTouching(mA, mB, P);
        expect(a2.v[0]).toBeCloseTo(-1.0005 - 0.1, 15);
        expect(Math.abs(a2.v[0]) - Math.abs(b2.v[0])).toBeGreaterThan(CONTINUAL_TOUCH_EPS);
    });

    it("분리 속도 ≥ 1e-3 → 무시(입력 객체 그대로)", () => {
        const far = ball("b", chased.r, [1.002, 0.02, 0]);
        const out = resolveContinuallyTouching(chaser, far, P);
        expect(out[0]).toBe(chaser);
        expect(out[1]).toBe(far);
    });

    it("한 공이 정지 → 무시, 방향이 다르면(코사인 ≤ 0.9) 무시, 뒤 공이 앞으로 가지 않으면 무시", () => {
        const stillB = ball("b", chased.r, [0, 0, 0], "stationary");
        expect(resolveContinuallyTouching(chaser, stillB, P)[1]).toBe(stillB);
        const sideways = ball("b", chased.r, [1.0005, 1.5, 0]);
        expect(resolveContinuallyTouching(chaser, sideways, P)[0]).toBe(chaser);
        // 서로 멀어지는 정면(합 0): 쫓는 공이 없다
        const away1 = ball("a", chaser.r, [-4e-4, 0, 0]);
        const away2 = ball("b", chased.r, [4e-4, 0, 0]);
        expect(resolveContinuallyTouching(away1, away2, P)[0]).toBe(away1);
    });

    it("중심이 겹친 퇴화 입력에도 NaN 없이 그대로 돌려준다", () => {
        const a = ball("a", [0.5, 1.0, R], [1, 0, 0]);
        const b = ball("b", [0.5, 1.0, R], [1, 0, 0]);
        const out = resolveContinuallyTouching(a, b, P);
        expect(out[0]).toBe(a);
        expect(Number.isFinite(out[1].v[0])).toBe(true);
    });

    it("입력 불변 (얼린 입력)", () => {
        const a = deepFreeze(ball("a", chaser.r, chaser.v));
        const b = deepFreeze(ball("b", chased.r, chased.v));
        const [a2] = resolveContinuallyTouching(a, b, P);
        expect(a2).not.toBe(a);
        expect(a.v).toEqual([1.0, 0.02, 0]);
    });
});
