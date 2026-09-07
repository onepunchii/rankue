import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { phiForThickness } from "./aim";
import { V0_MAX, V0_MIN, clampSpin } from "./simReducer";
import {
    activeThickness, FINE_STEP_RAD, formatPower, formatSpeed, formatSpin, nearestStep, padOffsetFor, powerFromSlider,
    powerPercent, pullbackFor, spinFromPad, stepPower, THICKNESS_UI_STEPS, thicknessStepLabel,, nextElevationRad, elevationDeg } from "./controlsMath";

const table = TABLES.DAEDAE;
const R = table.ball.R;

describe("controlsMath 두께", () => {
    it("단계 라벨: 정면은 i18n, 나머지는 분수", () => {
        expect(thicknessStepLabel(1, "정면")).toBe("정면");
        expect(THICKNESS_UI_STEPS.slice(1).map((s) => thicknessStepLabel(s, "정면"))).toEqual(["½", "⅓", "¼", "⅛"]);
    });

    it("phiForThickness 로 잡은 조준은 같은 단계·방향으로 읽힌다", () => {
        const balls = openingLayout("3c", table, "white");
        const cue = balls.find((b) => b.id === "white")!;
        // 기준 적구는 objectTargetFor(가장 가까운 공 — 개시 배치에선 옆의 yellow)이므로 그것으로 phi 를 만든다
        const nearest = [...balls].filter((b) => b.id !== "white").sort((a, b) =>
            Math.hypot(a.r[0] - cue.r[0], a.r[1] - cue.r[1]) - Math.hypot(b.r[0] - cue.r[0], b.r[1] - cue.r[1]))[0];
        for (const step of THICKNESS_UI_STEPS) {
            for (const side of ["left", "right"] as const) {
                const phi = phiForThickness([cue.r[0], cue.r[1]], [nearest.r[0], nearest.r[1]], step, side, R);
                const at = activeThickness(balls, "white", "3c", phi, R)!;
                expect(at.step, `${step} ${side}`).toBe(step);
                expect(at.thickness).toBeCloseTo(step, 2);
                if (step !== 1) expect(at.side).toBe(side);
            }
        }
    });

    it("빗나간 조준은 null, nearestStep 은 허용 오차 밖이면 null", () => {
        const balls = openingLayout("3c", table, "white");
        expect(activeThickness(balls, "white", "3c", -Math.PI / 2, R)).toBeNull(); // 아래(헤드 레일) 쪽
        expect(activeThickness(balls, "nope", "3c", 0, R)).toBeNull();
        expect(nearestStep(0.52)).toBe(0.5);
        expect(nearestStep(0.6)).toBeNull();
        expect(nearestStep(0.99)).toBe(1);
        expect(FINE_STEP_RAD).toBeCloseTo(0.1 * Math.PI / 180, 12);
    });
});

describe("controlsMath 세기", () => {
    it("2.5 m/s → '2.5 m/s · 28%'", () => {
        expect(formatPower(2.5)).toBe("2.5 m/s · 28%");
        expect(formatSpeed(2.55)).toBe("2.55");
        expect(formatSpeed(9)).toBe("9");
        expect(powerPercent(V0_MAX)).toBe(100);
        expect(powerPercent(0)).toBe(powerPercent(V0_MIN));
    });

    it("±0.05 는 격자에 맞고 범위에서 멈춘다", () => {
        expect(stepPower(2.5, 1)).toBe(2.55);
        expect(stepPower(2.55, -1)).toBe(2.5);
        expect(stepPower(2.5 + 1e-12, 1)).toBe(2.55);
        expect(stepPower(V0_MAX, 1)).toBe(V0_MAX);
        expect(stepPower(V0_MIN, -1)).toBe(V0_MIN);
        let v = 0.3;
        for (let i = 0; i < 10; i++) v = stepPower(v, 1);
        expect(v).toBe(0.8);
    });

    it("슬라이더·당김 매핑", () => {
        expect(powerFromSlider(0)).toBe(V0_MIN);
        expect(powerFromSlider(1)).toBe(V0_MAX);
        expect(powerFromSlider(2)).toBe(V0_MAX);
        expect(pullbackFor(V0_MIN)).toBe(0);
        expect(pullbackFor(V0_MAX)).toBe(1);
        expect(pullbackFor(100)).toBe(1);
    });
});

describe("controlsMath 당점", () => {
    it("패드 오프셋 ↔ (a, b): 위가 b 양수, 링 밖은 클램프", () => {
        expect(spinFromPad(0, 0, 50)).toEqual({ a: 0, b: 0 });
        expect(spinFromPad(10, 0, 50)).toEqual({ a: 0.2, b: 0 });
        expect(spinFromPad(0, -10, 50).b).toBeCloseTo(0.2, 12);
        const far = spinFromPad(50, 50, 50);
        expect(Math.hypot(far.a, far.b)).toBeLessThan(0.5);
        expect(Math.hypot(far.a, far.b)).toBeCloseTo(0.5, 6);
        expect(far).toEqual(clampSpin(1, -1));
        expect(spinFromPad(10, 10, 0)).toEqual({ a: 0, b: 0 });
        const off = padOffsetFor(0.2, 0.3, 50);
        expect(off.x).toBeCloseTo(10, 12);
        expect(off.y).toBeCloseTo(-15, 12);
        const back = spinFromPad(off.x, off.y, 50);
        expect(back.a).toBeCloseTo(0.2, 12);
        expect(back.b).toBeCloseTo(0.3, 12);
    });

    it("라벨", () => {
        expect(formatSpin(0, 0)).toBe("a 0.00 · b 0.00");
        expect(formatSpin(0.2, -0.1)).toBe("a +0.20 · b −0.10");
    });
});

describe("큐 각 단계", () => {
    it("0 → 10 → 20 → 30 → 45 → 0 으로 돈다", () => {
        let th = 0;
        const seq: number[] = [];
        for (let i = 0; i < 6; i++) { th = nextElevationRad(th); seq.push(elevationDeg(th)); }
        expect(seq).toEqual([10, 20, 30, 45, 0, 10]);
    });
    it("단계 사이 값은 다음 단계로 올라간다", () => {
        expect(elevationDeg(nextElevationRad((12 * Math.PI) / 180))).toBe(20);
    });
});
