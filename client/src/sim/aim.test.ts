import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import type { BallState } from "@shared/sim/types";
import {
    phiFromPointer, phiFromDrag, rayBallDistance, rayCushionDistance, firstContact,
    thicknessFor, phiForThickness, nearestObjectBall, diamondMarks, normalizeAngle, nearerThicknessPhi, TWO_PI,
} from "./aim";

const T = TABLES.DAEDAE;
const R = T.ball.R;
const ball = (id: string, x: number, y: number): BallState => ({ id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });

describe("조준 각", () => {
    it("포인터 방향", () => {
        expect(phiFromPointer([0.5, 0.5], [1.5, 0.5])).toBeCloseTo(0, 12);
        expect(phiFromPointer([0.5, 0.5], [0.5, 1.5])).toBeCloseTo(Math.PI / 2, 12);
    });
    it("드래그 회전은 각 변화량을 더하고 ±π 경계를 넘지 않는다", () => {
        const phi = phiFromDrag([0, 0], [1, 0.001], [1, -0.001], 0);
        expect(phi).toBeCloseTo(normalizeAngle(-0.002), 6);
        const wrap = phiFromDrag([0, 0], [-1, 0.001], [-1, -0.001], Math.PI);
        expect(wrap).toBeCloseTo(Math.PI + 0.002, 6);
    });
});

describe("광선 접촉", () => {
    it("정면 접촉 거리 = 중심 거리 − 2R", () => {
        expect(rayBallDistance([0.5, 0.5], Math.PI / 2, [0.5, 1.5], R)).toBeCloseTo(1 - 2 * R, 12);
    });
    it("빗나가면 null, 뒤에 있으면 null", () => {
        expect(rayBallDistance([0.5, 0.5], Math.PI / 2, [0.7, 1.5], R)).toBeNull();
        expect(rayBallDistance([0.5, 0.5], -Math.PI / 2, [0.5, 1.5], R)).toBeNull();
    });
    it("쿠션 거리와 면", () => {
        const c = rayCushionDistance([0.5, 0.5], Math.PI / 2, T)!;
        expect(c.cushion).toBe("top"); expect(c.s).toBeCloseTo(T.length - R - 0.5, 12);
        expect(rayCushionDistance([0.5, 0.5], Math.PI, T)!.cushion).toBe("left");
    });
    it("첫 접촉: 더 가까운 공, 없으면 쿠션", () => {
        const cue = ball("white", 0.5, 0.5);
        const near = ball("red", 0.5, 1.2), far = ball("yellow", 0.5, 2.0);
        const fc = firstContact(cue, [cue, near, far], Math.PI / 2, T)!;
        expect(fc.kind).toBe("ball"); if (fc.kind === "ball") { expect(fc.id).toBe("red"); expect(fc.thickness).toBeCloseTo(1, 12); }
        const fc2 = firstContact(cue, [cue, far], 0, T)!;
        expect(fc2.kind).toBe("cushion");
    });
});

describe("두께", () => {
    it("정면 1, 반두께 0.5, 스침 0", () => {
        expect(thicknessFor([0, 0], Math.PI / 2, [0, 1], R).thickness).toBeCloseTo(1, 12);
        expect(thicknessFor([0, 0], Math.PI / 2, [R, 1], R).thickness).toBeCloseTo(0.5, 12);
        expect(thicknessFor([0, 0], Math.PI / 2, [2 * R, 1], R).thickness).toBeCloseTo(0, 12);
        expect(thicknessFor([0, 0], Math.PI / 2, [R, 1], R).side).toBe("right");
        expect(thicknessFor([0, 0], Math.PI / 2, [-R, 1], R).side).toBe("left");
    });
    it("반두께 컷 각 30°", () => {
        expect(thicknessFor([0, 0], Math.PI / 2, [R, 1], R).cutAngle).toBeCloseTo(Math.PI / 6, 12);
    });
    it("두께 → phi → 두께 왕복", () => {
        const cue: [number, number] = [0.3, 0.4], target: [number, number] = [0.9, 1.7];
        for (const th of [1, 0.75, 0.5, 0.25, 0.1]) {
            for (const side of ["left", "right"] as const) {
                const phi = phiForThickness(cue, target, th, side, R);
                const back = thicknessFor(cue, phi, target, R);
                expect(back.thickness).toBeCloseTo(th, 9);
                if (th < 1) expect(back.side).toBe(side);
            }
        }
    });
    it("요구 오프셋이 거리 이상이면 중심선", () => {
        // 붙어 있는 공(거리 2R)에 두께 0 → p = 2R ≥ dist → 중심선
        expect(phiForThickness([0, 0], [0, 2 * R], 0, "left", R)).toBeCloseTo(Math.PI / 2, 12);
    });
});

describe("기타", () => {
    it("가장 가까운 적구, 제외 목록", () => {
        const cue = ball("white", 0.5, 0.5);
        const balls = [cue, ball("yellow", 0.5, 0.8), ball("red", 0.5, 1.5)];
        expect(nearestObjectBall(cue, balls)!.id).toBe("yellow");
        expect(nearestObjectBall(cue, balls, ["yellow"])!.id).toBe("red");
    });
    it("다이아몬드 7+7+3+3", () => {
        const d = diamondMarks(T);
        expect(d.length).toBe(20);
        expect(d.filter((m) => m.rail === "left").length).toBe(7);
    });
});

describe("nearerThicknessPhi — 좌/우 버튼 없이 두께를 맞춘다", () => {
    it("지금 겨누는 쪽에 가까운 각을 고른다", () => {
        expect(nearerThicknessPhi(0.2, 1.4, 0.3)).toBe(0.2);
        expect(nearerThicknessPhi(0.2, 1.4, 1.3)).toBe(1.4);
    });

    it("각 차이는 짧은 쪽으로 잰다 — 0 과 2π 는 이웃이다", () => {
        // 조준이 0.05 면 6.25(≈ -0.03)가 3.0 보다 가깝다. 그냥 빼면 한 바퀴를 돌아 3.0 을 고른다.
        expect(nearerThicknessPhi(TWO_PI - 0.03, 3.0, 0.05)).toBeCloseTo(TWO_PI - 0.03, 12);
    });

    it("한쪽만 구해지면 그쪽, 둘 다 없으면 null", () => {
        expect(nearerThicknessPhi(null, 1.4, 0)).toBe(1.4);
        expect(nearerThicknessPhi(0.2, null, 3)).toBe(0.2);
        expect(nearerThicknessPhi(null, null, 0)).toBeNull();
    });

    it("정확히 같은 거리면 왼쪽 — 뒤집히지 않고 늘 같은 답이 나온다", () => {
        expect(nearerThicknessPhi(0.9, 1.1, 1.0)).toBe(0.9);
    });
});
