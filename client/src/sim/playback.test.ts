import { describe, it, expect } from "vitest";
import { simulateShot } from "@shared/sim/simulate";
import { DEFAULT_PARAMS, TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import type { BallState, ShotInput } from "@shared/sim/types";
import {
    makePlayback, effectiveBall, eventsForFeedback, KEYFRAME_DT,
    startClock, clockTime, withSpeed,
} from "./playback";

const params = DEFAULT_PARAMS;
const ball = effectiveBall(params);
const balls = openingLayout("3c", TABLES.DAEDAE, "white");
// 큐볼(오른쪽 스팟)에서 위쪽 빨간 공 쪽으로 반두께 정도. 쿠션 몇 개는 밟도록 세게.
const input: ShotInput = { cueBallId: "white", phi: Math.PI / 2 + 0.15, V0: 3.5, a: 0.1, b: 0.2, theta: 0 };
const result = simulateShot(balls, input, params);

function xy(bs: readonly BallState[], id: string): [number, number] {
    const b = bs.find((x) => x.id === id)!;
    return [b.r[0], b.r[1]];
}

describe("makePlayback", () => {
    const pb = makePlayback(result, ball);

    it("duration 은 결과와 같고 양수다", () => {
        expect(pb.duration).toBe(result.duration);
        expect(pb.duration).toBeGreaterThan(0.5);
    });

    it("t=0 은 타격 직후, 끝은 final 과 동일 참조", () => {
        const start = pb.at(0);
        expect(xy(start, "white")).toEqual(xy(result.history[0].balls, "white"));
        expect(pb.at(pb.duration)).toBe(result.final);
        expect(pb.at(pb.duration + 5)).toBe(result.final);
    });

    it("음수·NaN 은 0 으로 클램프", () => {
        expect(pb.at(-1)).toEqual(pb.at(0));
        expect(pb.at(Number.NaN)).toEqual(pb.at(0));
    });

    it("시각이 증가하면 큐볼이 연속으로 움직인다(한 프레임 이동 ≤ 최대 속력 × dt)", () => {
        const dt = 1 / 60;
        let prev = xy(pb.at(0), "white");
        let moved = 0;
        // 타격 직후 속력이 상한 — 재생 중 어떤 순간도 이보다 빠를 수 없다(에너지 비증가)
        const v0 = result.history[0].balls.find((b) => b.id === "white")!.v;
        const vmax = Math.hypot(v0[0], v0[1]) * 1.05 + 1e-6;
        for (let t = dt; t <= pb.duration; t += dt) {
            const cur = xy(pb.at(t), "white");
            const step = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
            expect(step).toBeLessThanOrEqual(vmax * dt);
            moved += step;
            prev = cur;
        }
        expect(moved).toBeGreaterThan(0.5);
    });

    it("공은 항상 테이블 안에 있다", () => {
        const R = ball.R, W = params.table.width, L = params.table.length;
        for (let t = 0; t <= pb.duration; t += 0.05) {
            for (const b of pb.at(t)) {
                expect(b.r[0]).toBeGreaterThanOrEqual(R - 1e-6);
                expect(b.r[0]).toBeLessThanOrEqual(W - R + 1e-6);
                expect(b.r[1]).toBeGreaterThanOrEqual(R - 1e-6);
                expect(b.r[1]).toBeLessThanOrEqual(L - R + 1e-6);
            }
        }
    });

    it("keyframes 는 1/120 s 격자, 끝 시각 포함, 한 번만 만들어 캐시", () => {
        const k1 = pb.keyframes;
        const k2 = pb.keyframes;
        expect(k2).toBe(k1);
        expect(k1.length).toBeGreaterThan(pb.duration / KEYFRAME_DT - 1);
        expect(k1[0].t).toBe(0);
        expect(k1[k1.length - 1].t).toBeCloseTo(pb.duration, 9);
        for (let i = 1; i < k1.length; i++) expect(k1[i].t).toBeGreaterThan(k1[i - 1].t);
        // 격자 프레임과 at() 이 같은 답을 낸다
        const mid = k1[Math.floor(k1.length / 2)];
        expect(xy(pb.at(mid.t), "white")[0]).toBeCloseTo(xy(mid.balls, "white")[0], 12);
    });

    it("history 가 비면 duration 0, at 은 final", () => {
        const empty = makePlayback({ history: [], final: balls, duration: 0 }, ball);
        expect(empty.duration).toBe(0);
        expect(empty.at(0)).toBe(balls);
        expect(empty.keyframes).toEqual([]);
    });

    it("입력 결과를 변형하지 않는다", () => {
        const snap = JSON.stringify(result.history[0]);
        pb.at(0.3);
        void pb.keyframes;
        expect(JSON.stringify(result.history[0])).toBe(snap);
    });
});

describe("effectiveBall", () => {
    it("condition 1 이면 테이블 공 그대로, 아니면 마찰이 스케일된다", () => {
        expect(effectiveBall(params)).toBe(params.table.ball);
        const fast = effectiveBall({ ...params, condition: 1.2 });
        expect(fast.muR).toBeLessThan(params.table.ball.muR);
    });
});

describe("eventsForFeedback", () => {
    it("큐 타격이 t=0 에 있고 이후 이벤트는 시간순, 전이는 제외", () => {
        const ev = eventsForFeedback(result);
        expect(ev[0]).toMatchObject({ t: 0, kind: "strike" });
        for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t);
        const contacts = result.events.filter((e) => e.type !== "transition").length;
        expect(ev.length).toBeLessThanOrEqual(contacts + 1);
        expect(ev.some((e) => e.kind === "cushion")).toBe(true);
    });
});

describe("PlaybackClock", () => {
    it("벽시계 → 재생 시각, 배속 반영", () => {
        const c = startClock(1000, 1);
        expect(clockTime(c, 1000)).toBe(0);
        expect(clockTime(c, 1500)).toBeCloseTo(0.5, 12);
        const c4 = startClock(1000, 4);
        expect(clockTime(c4, 1500)).toBeCloseTo(2, 12);
    });

    it("시계가 거꾸로 가도 baseT 아래로 내려가지 않는다", () => {
        const c = startClock(1000, 1);
        expect(clockTime(c, 900)).toBe(0);
    });

    it("배속 전환은 연속이다(그 순간 시각이 튀지 않고 이후 기울기만 바뀐다)", () => {
        const c1 = startClock(0, 1);
        const c4 = withSpeed(c1, 1000, 4);
        expect(clockTime(c4, 1000)).toBeCloseTo(clockTime(c1, 1000), 12);
        expect(clockTime(c4, 1250)).toBeCloseTo(1 + 1, 12);
        const back = withSpeed(c4, 1250, 1);
        expect(clockTime(back, 1250)).toBeCloseTo(2, 12);
        expect(clockTime(back, 1750)).toBeCloseTo(2.5, 12);
    });

    it("같은 배속이면 같은 객체, 0 이하 배속은 1", () => {
        const c = startClock(0, 1);
        expect(withSpeed(c, 10, 1)).toBe(c);
        expect(startClock(0, 0).speed).toBe(1);
        expect(withSpeed(c, 10, -2).speed).toBe(1);
    });

    it("단조증가", () => {
        let c = startClock(0, 1);
        let last = -1;
        for (let now = 0; now < 3000; now += 37) {
            if (now === 999) c = withSpeed(c, now, 4);
            if (now === 1998) c = withSpeed(c, now, 1);
            const t = clockTime(c, now);
            expect(t).toBeGreaterThanOrEqual(last);
            last = t;
        }
    });
});
