import { describe, it, expect } from "vitest";
import type { BallState, SimEvent, Snapshot } from "@shared/sim/types";
import {
    impulseToGain, playbackRateFor, seededUnit, snapshotBefore, snapshotAtOrAfter, mapSoundEvents,
    IMPULSE_FULL, KIND_PEAK,
} from "./audioMapping";

const R = 0.03075;
const ball = (id: string, x: number, y: number, vx = 0, vy = 0): BallState =>
    ({ id, r: [x, y, R], v: [vx, vy, 0], w: [0, 0, 0], state: vx || vy ? "rolling" : "stationary" });
const snap = (t: number, ...balls: BallState[]): Snapshot => ({ t, balls });

describe("게인 곡선", () => {
    it("0·음수·잡음 수준은 무음, 단조 증가, 최대에서 종류별 피크로 포화", () => {
        expect(impulseToGain(0)).toBe(0);
        expect(impulseToGain(-1)).toBe(0);
        expect(impulseToGain(0.01)).toBe(0);
        expect(impulseToGain(NaN)).toBe(0);
        let prev = 0;
        for (let v = 0.1; v <= IMPULSE_FULL; v += 0.1) {
            const g = impulseToGain(v);
            expect(g).toBeGreaterThan(prev);
            prev = g;
        }
        expect(impulseToGain(IMPULSE_FULL, "ball")).toBeCloseTo(KIND_PEAK.ball, 12);
        expect(impulseToGain(100, "cushion")).toBeCloseTo(KIND_PEAK.cushion, 12);
        expect(impulseToGain(100, "strike")).toBeLessThan(1);
    });
    it("지각 곡선: 절반 세기는 절반 게인보다 크다(0.6승)", () => {
        expect(impulseToGain(IMPULSE_FULL / 2) / impulseToGain(IMPULSE_FULL)).toBeGreaterThan(0.5);
    });
});

describe("재생 속도", () => {
    it("인덱스 시드는 결정론이고 ±5% 안에 든다", () => {
        for (let i = 0; i < 200; i++) {
            expect(seededUnit(i)).toBe(seededUnit(i));
            expect(Math.abs(seededUnit(i))).toBeLessThanOrEqual(1);
            const r = playbackRateFor("strike", 3, i);
            expect(r).toBeGreaterThanOrEqual(0.95 - 1e-12);
            expect(r).toBeLessThanOrEqual(1.05 + 1e-12);
        }
        expect(seededUnit(1)).not.toBe(seededUnit(2));
    });
    it("공–공은 세게 부딪힐수록 높은 피치", () => {
        expect(playbackRateFor("ball", 6, 0)).toBeGreaterThan(playbackRateFor("ball", 0.5, 0));
    });
});

describe("스냅샷 탐색", () => {
    const h = [snap(0), snap(0.5), snap(1), snap(1.5)];
    it("직전(t < 사건) / 직후(t ≥ 사건)", () => {
        expect(snapshotBefore(h, 1)).toBe(1);
        expect(snapshotBefore(h, 1.2)).toBe(2);
        expect(snapshotBefore(h, 0)).toBe(0);
        expect(snapshotAtOrAfter(h, 1)).toBe(2);
        expect(snapshotAtOrAfter(h, 1.2)).toBe(3);
        expect(snapshotAtOrAfter(h, 9)).toBe(3);
    });
});

describe("이벤트 매핑", () => {
    it("타격은 t=0 에 큐볼 속력, 공–공은 중심선 사영, 쿠션은 법선 성분", () => {
        // 큐볼 white 가 +y 로 2 m/s, yellow 를 45° 비껴 맞히고(접촉 직후 스냅샷 위치), red 가 오른쪽 쿠션에 1.5 m/s 로.
        const history: Snapshot[] = [
            snap(0, ball("white", 0.5, 0.5, 0, 2), ball("yellow", 0.5 + 2 * R * Math.SQRT1_2, 1.5), ball("red", 1.0, 2.0, 1.5, 0.4)),
            snap(0.4, ball("white", 0.5, 1.0, 0, 2), ball("yellow", 0.5 + 2 * R * Math.SQRT1_2, 1.5), ball("red", 1.3, 2.1, 1.5, 0.4)),
            // 공–공 사건 직후: 중심 연결선이 45°
            snap(0.5, ball("white", 0.5, 1.5 - 2 * R * Math.SQRT1_2, -1, 1), ball("yellow", 0.5 + 2 * R * Math.SQRT1_2, 1.5, 1, 1), ball("red", 1.35, 2.11, 1.5, 0.4)),
            // 쿠션 사건 직후
            snap(0.6, ball("white", 0.4, 1.6, -1, 1), ball("yellow", 0.6, 1.6, 1, 1), ball("red", 1.422 - R, 2.15, -1.3, 0.4)),
        ];
        const events: SimEvent[] = [
            { type: "transition", t: 0.4, ids: ["white"], from: "sliding", to: "rolling" },
            { type: "ball-ball", t: 0.5, ids: ["white", "yellow"] },
            { type: "ball-cushion", t: 0.6, ids: ["red"], cushion: "right" },
        ];
        const out = mapSoundEvents(events, history, "white");
        expect(out.map(e => e.kind)).toEqual(["strike", "ball", "cushion"]);
        expect(out[0].t).toBe(0);
        expect(out[0].impulse).toBeCloseTo(2, 12);
        expect(out[1].t).toBe(0.5);
        expect(out[1].impulse).toBeCloseTo(2 * Math.SQRT1_2, 9);
        expect(out[2].t).toBe(0.6);
        expect(out[2].impulse).toBeCloseTo(1.5, 12);
    });
    it("빈 history → 빈 목록, 큐볼이 안 움직였으면 타격음 없음", () => {
        expect(mapSoundEvents([], [], "white")).toEqual([]);
        expect(mapSoundEvents([], [snap(0, ball("white", 0.5, 0.5))], "white")).toEqual([]);
    });
    it("모르는 공 id 의 사건은 건너뛴다", () => {
        const history = [snap(0, ball("white", 0.5, 0.5, 1, 0)), snap(0.2, ball("white", 0.7, 0.5, 1, 0))];
        const events: SimEvent[] = [{ type: "ball-cushion", t: 0.2, ids: ["ghost"], cushion: "top" }];
        expect(mapSoundEvents(events, history, "white").map(e => e.kind)).toEqual(["strike"]);
    });
});
