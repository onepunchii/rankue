import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { phiForThickness } from "./aim";
import { V0_MAX, V0_MIN, clampSpin } from "./simReducer";
import {
    activeThickness, ELEVATION_MAX_DEG, ELEVATION_STEPS_DEG, elevationFromArc, FINE_STEP_RAD, formatPower, formatSpeed, formatSpin, nearestStep,
    padOffsetFor, powerFromSlider, powerPercent, pullbackFor, snapElevationDeg, spinFromPad, spinReadout, stepPower, THICKNESS_UI_STEPS,
    thicknessStepLabel, nextElevationRad, elevationDeg } from "./controlsMath";

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

    it("±1 % 눈금(0.09 m/s)에 맞고 범위에서 멈춘다", () => {
        expect(stepPower(2.5, 1)).toBe(2.61);      // 28 % → 29 %
        expect(stepPower(2.61, -1)).toBe(2.52);    // 29 % → 28 %
        expect(stepPower(2.5 + 1e-12, 1)).toBe(2.61);
        expect(stepPower(V0_MAX, 1)).toBe(V0_MAX);
        expect(stepPower(V0_MIN, -1)).toBe(V0_MIN);
        let v = 0.3;
        for (let i = 0; i < 10; i++) v = stepPower(v, 1);
        expect(v).toBe(1.17);                       // 3 % + 10 = 13 %
        expect(powerPercent(stepPower(4, 1))).toBe(powerPercent(4) + 1);
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

describe("controlsMath 당점 읽기·큐 각 단계(레이아웃 B 시트)", () => {
    const t = (k: string) => ({ "sim.spin.left": "좌 {n}%", "sim.spin.right": "우 {n}%", "sim.spin.top": "상 {n}%", "sim.spin.bottom": "하 {n}%", "sim.controls.spinCenter": "중앙" } as Record<string, string>)[k] ?? k;

    it("spinReadout 은 100 % = 미스큐 링(해법 시트와 같은 눈금), 중앙은 '중앙'", () => {
        expect(spinReadout(0, 0, t)).toBe("중앙");
        expect(spinReadout(0.2, 0.1, t)).toBe("우 40% · 상 20%");
        expect(spinReadout(-0.25, -0.5, t)).toBe("좌 50% · 하 100%");
        expect(spinReadout(0.003, 0, t)).toBe("중앙"); // 반올림 잡음은 중앙
    });

    it("snapElevationDeg 는 가장 가까운 단계로, 범위 밖은 양 끝", () => {
        expect(ELEVATION_STEPS_DEG).toEqual([0, 10, 20, 30, 45]);
        expect(ELEVATION_MAX_DEG).toBe(45);
        expect(snapElevationDeg(4)).toBe(0);
        expect(snapElevationDeg(6)).toBe(10);
        expect(snapElevationDeg(36)).toBe(30);
        expect(snapElevationDeg(39)).toBe(45);
        expect(snapElevationDeg(90)).toBe(45);
        expect(snapElevationDeg(-3)).toBe(0);
        expect(snapElevationDeg(NaN)).toBe(0);
    });

    it("elevationFromArc: 피벗 오른쪽 수평은 0°, 45° 위는 45°, 그 이상은 상한, 왼쪽·아래는 0", () => {
        expect(elevationFromArc(10, 0)).toBe(0);
        expect(elevationFromArc(10, -10)).toBeCloseTo(45, 6);
        expect(elevationFromArc(0, -10)).toBe(ELEVATION_MAX_DEG);
        expect(elevationFromArc(10, 10)).toBe(0);   // 아래쪽(화면 y 아래 양수)
        expect(elevationFromArc(-10, -1)).toBeCloseTo(45, 6); // 왼쪽 위는 상한으로 클램프
        expect(elevationFromArc(-10, 5)).toBe(0);
    });
});
