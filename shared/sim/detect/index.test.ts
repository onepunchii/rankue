import { describe, expect, it } from "vitest";
import type { BallState, EventCandidate, Vec3 } from "../types.js";
import { cushionSegments, TABLES } from "../params.js";
import { rollTime, slideTime } from "../evolve.js";
import { ballBallTime, ballCushionTime, compareTied, nextEvent, pickEvent, TIE_EPS } from "./index.js";

const T = TABLES.DAEDAE;
const P = T.ball;
const R = P.R;
const SEGS = cushionSegments(T);

function ball(id: string, r: readonly [number, number], v: Vec3, state: BallState["state"], w?: Vec3): BallState {
    const wv: Vec3 = w ?? (state === "rolling" ? [-v[1] / R, v[0] / R, 0] : [0, 0, 0]);
    return { id, r: [r[0], r[1], R], v, w: wv, state };
}

const tr = (dt: number, id: string): EventCandidate =>
    ({ dt, event: { type: "transition", t: dt, ids: [id], from: "sliding", to: "rolling" } });
const cu = (dt: number, id: string, cushion: "left" | "right" | "bottom" | "top"): EventCandidate =>
    ({ dt, event: { type: "ball-cushion", t: dt, ids: [id], cushion } });
const bb = (dt: number, a: string, b: string): EventCandidate =>
    ({ dt, event: { type: "ball-ball", t: dt, ids: [a, b] } });
const bt = (dt: number, id: string): EventCandidate =>
    ({ dt, event: { type: "ball-table", t: dt, ids: [id] } });

describe("pickEvent — 동률 규칙 (README 절대 규칙 5)", () => {
    it("같은 dt: transition < ball-table < ball-cushion < ball-ball", () => {
        const c = [bb(0.5, "a", "b"), cu(0.5, "a", "left"), bt(0.5, "a"), tr(0.5, "a")];
        expect(pickEvent(c)!.event.type).toBe("transition");
        expect(pickEvent([bb(0.5, "a", "b"), cu(0.5, "a", "left"), bt(0.5, "a")])!.event.type).toBe("ball-table");
        expect(pickEvent([bb(0.5, "a", "b"), cu(0.5, "a", "left")])!.event.type).toBe("ball-cushion");
        expect(compareTied(bt(1, "z"), cu(1, "a", "left"))).toBeLessThan(0);
        expect(compareTied(bt(1, "b"), bt(1, "a"))).toBeGreaterThan(0);
        expect(compareTied(tr(1, "z"), bt(1, "a"))).toBeLessThan(0);
    });

    it("1e-9 이내는 동률, 그보다 크면 dt 가 작은 쪽", () => {
        // ball-ball 이 0.5e-9 먼저 — 동률로 보고 transition 이 이긴다
        expect(pickEvent([bb(0.5 - 0.5e-9, "a", "b"), tr(0.5, "a")])!.event.type).toBe("transition");
        // 2e-9 먼저 — 동률 아님, ball-ball 이 이긴다
        expect(pickEvent([bb(0.5 - 2e-9, "a", "b"), tr(0.5, "a")])!.event.type).toBe("ball-ball");
        expect(TIE_EPS).toBe(1e-9);
    });

    it("같은 type 이면 ids 사전순", () => {
        const c = [bb(0.5, "b", "c"), bb(0.5, "a", "c"), bb(0.5, "a", "b")];
        expect(pickEvent(c)!.event.ids).toEqual(["a", "b"]);
        const c2 = [cu(0.5, "yellow", "left"), cu(0.5, "red", "left"), cu(0.5, "white", "left")];
        expect(pickEvent(c2)!.event.ids).toEqual(["red"]);
        const c3 = [tr(0.5, "b"), tr(0.5, "a")];
        expect(pickEvent(c3)!.event.ids).toEqual(["a"]);
    });

    it("같은 type·같은 ids 면 cushion id 사전순 (bottom < left < right < top)", () => {
        const c = [cu(0.5, "a", "top"), cu(0.5, "a", "right"), cu(0.5, "a", "left"), cu(0.5, "a", "bottom")];
        const e = pickEvent(c)!.event;
        expect(e.type === "ball-cushion" && e.cushion).toBe("bottom");
        expect(compareTied(cu(1, "a", "left"), cu(1, "a", "right"))).toBeLessThan(0);
        expect(compareTied(cu(1, "a", "top"), cu(1, "a", "left"))).toBeGreaterThan(0);
    });

    it("입력 순서와 무관하게 같은 결과", () => {
        const c = [cu(0.5, "a", "left"), bb(0.5, "a", "b"), tr(0.5 + 0.9e-9, "b"), cu(0.5, "a", "bottom")];
        const expected = pickEvent(c)!;
        expect(expected.event.type).toBe("transition");
        const rev = [...c].reverse();
        expect(pickEvent(rev)).toBe(expected);
        expect(pickEvent([c[2], c[0], c[3], c[1]])).toBe(expected);
    });

    it("dt ≤ 0, Infinity, NaN 후보는 제외; 빈 목록은 null", () => {
        expect(pickEvent([])).toBeNull();
        expect(pickEvent([tr(0, "a"), tr(-1, "a"), bb(Infinity, "a", "b"), bb(NaN, "a", "b")])).toBeNull();
        const c = [tr(0, "a"), bb(0.7, "a", "b"), cu(Infinity, "a", "left")];
        expect(pickEvent(c)!.event.type).toBe("ball-ball");
    });

    it("입력 배열을 바꾸지 않는다", () => {
        const c = [bb(0.5, "a", "b"), cu(0.5, "a", "left"), tr(0.5, "a")];
        const snapshot = JSON.stringify(c);
        pickEvent(c);
        expect(JSON.stringify(c)).toBe(snapshot);
    });
});

describe("nextEvent — 물리 시나리오", () => {
    it("모두 정지면 null", () => {
        const balls = [
            ball("white", [0.5, 0.5], [0, 0, 0], "stationary"),
            ball("red", [0.7, 1.5], [0, 0, 0], "stationary"),
        ];
        expect(nextEvent(balls, SEGS, P)).toBeNull();
    });

    it("코너 대각 입사: left·bottom 동률 → 사전순으로 bottom", () => {
        const s = 1 / Math.sqrt(2);
        const cue = ball("white", [0.3, 0.3], [-1.6 * s, -1.6 * s, 0], "rolling");
        const far = ball("red", [1.0, 2.5], [0, 0, 0], "stationary");
        const ev = nextEvent([cue, far], SEGS, P)!;
        expect(ev.event.type).toBe("ball-cushion");
        expect(ev.event.type === "ball-cushion" && ev.event.cushion).toBe("bottom");
        expect(ev.event.ids).toEqual(["white"]);
        expect(ev.dt).toBe(ballCushionTime(cue, SEGS.find((x) => x.id === "bottom")!, P));
        expect(ev.event.t).toBe(ev.dt);
    });

    it("구름 공이 쿠션 앞에서 멈추면 transition(rolling → stationary) 이 유일한 이벤트", () => {
        const cue = ball("white", [0.7, 1.4], [0.3, 0, 0], "rolling");
        const ev = nextEvent([cue], SEGS, P)!;
        expect(ev.event.type).toBe("transition");
        expect(ev.dt).toBe(rollTime(cue, P));
        expect(ev.event.type === "transition" && ev.event.to).toBe("stationary");
    });

    it("미끄럼 공: 쿠션에 닿기 전에 오는 자기 전이(sliding → rolling)가 뒤의 충돌을 이긴다", () => {
        // 미끄럼 시간 (2/7)·3/(0.2·9.81) ≈ 0.437 s 동안 최대 ≈ 1.1 m — 쿠션까지는 1.4 m 남았다
        const cue = ball("white", [0.05 + R, 1.4], [3, 0, 0], "sliding");
        const ts = slideTime(cue, P);
        const right = SEGS.find((x) => x.id === "right")!;
        // 미끄럼 다항식을 외삽하면 쿠션에 닿기는 하지만 전이 이후라 감지기가 버린다(유효 구간 밖)
        expect(ballCushionTime(cue, right, P)).toBe(Infinity);
        const ev = nextEvent([cue], SEGS, P)!;
        expect(ev.event.type).toBe("transition");
        expect(ev.dt).toBe(ts);
    });

    it("쿠션 충돌이 전이보다 0.5 ns 먼저여도 동률(1e-9) 안이면 transition", () => {
        // 스핀 없는 미끄럼: u0 = v0, t_s = (2/7)v0/(μ_s g). t_s − 0.5 ns 에 정확히 쿠션에 닿도록 거리를 맞춘다.
        const v0 = 2.5;
        const a = P.muS * P.g;
        const ts = (2 / 7) * v0 / a;
        const tc = ts - 0.5e-9;
        const d = v0 * tc - 0.5 * a * tc * tc;      // 미끄럼 다항식으로 t_c 동안 가는 거리
        const cue = ball("white", [T.width - R - d, 1.2], [v0, 0, 0], "sliding");
        const right = SEGS.find((x) => x.id === "right")!;
        const got = ballCushionTime(cue, right, P);
        expect(Number.isFinite(got)).toBe(true);
        expect(Math.abs(got - tc)).toBeLessThan(1e-13);
        expect(got).toBeLessThan(slideTime(cue, P));
        const ev = nextEvent([cue], SEGS, P)!;
        expect(ev.event.type).toBe("transition");
    });

    it("쿠션 충돌이 전이보다 2 ns 먼저면 동률이 아니라 ball-cushion", () => {
        const v0 = 2.5;
        const a = P.muS * P.g;
        const ts = (2 / 7) * v0 / a;
        const tc = ts - 2e-9;
        const d = v0 * tc - 0.5 * a * tc * tc;
        const cue = ball("white", [T.width - R - d, 1.2], [v0, 0, 0], "sliding");
        const ev = nextEvent([cue], SEGS, P)!;
        expect(ev.event.type).toBe("ball-cushion");
        expect(ev.event.type === "ball-cushion" && ev.event.cushion).toBe("right");
    });

    it("볼–볼이 먼저면 ball-ball, ids 는 사전순, balls 순서와 무관", () => {
        const cue = ball("white", [0.7, 0.8], [0, 2, 0], "rolling");
        const obj = ball("red", [0.7, 1.4], [0, 0, 0], "stationary");
        const ev1 = nextEvent([cue, obj], SEGS, P)!;
        const ev2 = nextEvent([obj, cue], SEGS, P)!;
        expect(ev1.event.type).toBe("ball-ball");
        expect(ev1.event.ids).toEqual(["red", "white"]);
        expect(ev1.dt).toBe(ballBallTime(cue, obj, P));
        expect(ev2).toEqual(ev1);
    });

    it("두 공이 서로 다른 쿠션에 같은 순간 닿으면 ids 사전순", () => {
        const s = 1 / Math.sqrt(2);
        // 완전 대칭: (0.3,0.3)→(0,0) 코너, (W−0.3, L−0.3)→(W,L) 코너. 같은 속도·상태라 dt 가 비트 단위로 같다.
        const a = ball("white", [0.3, 0.3], [-1.6 * s, -1.6 * s, 0], "rolling");
        const b = ball("red", [T.width - 0.3, T.length - 0.3], [1.6 * s, 1.6 * s, 0], "rolling");
        const ev = nextEvent([a, b], SEGS, P)!;
        expect(ev.event.type).toBe("ball-cushion");
        expect(ev.event.ids).toEqual(["red"]);
        expect(ev.event.type === "ball-cushion" && ev.event.cushion).toBe("right");
    });

    it("v2.2 공중 공: 다른 공 위를 넘어가면 볼–볼이 아니라 착지(ball-table)가 다음 이벤트, 위에 떨어지면 볼–볼", () => {
        // 정점 높이 2R 를 넘는 포물선으로 red 위를 지난다: v_z = 2.2 → 정점 0.247 m
        const flyer: BallState = { id: "white", r: [0.7, 0.8, R], v: [0, 2, 2.2], w: [0, 0, 0], state: "airborne" };
        const red = ball("red", [0.7, 0.8 + 2 * 2.2 / P.g], [0, 0, 0], "stationary");   // 정점 xy 자리
        const ev = nextEvent([flyer, red], SEGS, P)!;
        expect(ev.event.type).toBe("ball-table");
        expect(ev.event.ids).toEqual(["white"]);
        expect(ev.dt).toBeCloseTo((2 * 2.2) / P.g, 12);
        // 같은 자리에 수직으로 떨어지는 공은 red 위에 볼–볼로 닿는다(3D 거리 2R)
        const dropper: BallState = { id: "white", r: [0.7, red.r[1], R + 0.2], v: [0, 0, 0], w: [0, 0, 0], state: "airborne" };
        const ev2 = nextEvent([dropper, red], SEGS, P)!;
        expect(ev2.event.type).toBe("ball-ball");
        expect(ev2.event.ids).toEqual(["red", "white"]);
        expect(ev2.dt).toBeCloseTo(Math.sqrt((2 * (0.2 - 2 * R + R - R)) / P.g), 9);
        // 천 위의 공(state sliding 등)은 착지 후보를 내지 않는다
        expect(nextEvent([ball("white", [0.7, 0.8], [0, 2, 0], "rolling")], SEGS, P)!.event.type).not.toBe("ball-table");
    });

    it("입력을 바꾸지 않는다", () => {
        const balls = [
            ball("white", [0.7, 0.8], [0, 2, 0], "rolling"),
            ball("red", [0.7, 1.4], [0, 0, 0], "stationary"),
        ];
        for (const b of balls) { Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w); Object.freeze(b); }
        Object.freeze(balls);
        const snap = JSON.stringify(balls);
        expect(() => nextEvent(balls, SEGS, P)).not.toThrow();
        expect(JSON.stringify(balls)).toBe(snap);
    });
});
