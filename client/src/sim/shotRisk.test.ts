import { describe, it, expect } from "vitest";
import { TABLES, DEFAULT_CUE } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { simulateShot } from "@shared/sim/simulate";
import { cueBallHop, offsetRatio, shotRisk, JUMP_HOP_M, RISK_KEYS } from "./shotRisk";

const T = TABLES.DAEDAE;
const R = T.ball.R;
const max = DEFAULT_CUE.maxOffset;
const DEG = Math.PI / 180;
const params = { table: T, cue: DEFAULT_CUE, cushionModel: "han2005" as const, condition: 1 };
const balls = openingLayout("3c", T, "white");

describe("shotRisk", () => {
    it("당점 비율·문턱", () => {
        expect(offsetRatio(0, 0, max)).toBe(0);
        expect(offsetRatio(max, 0, max)).toBeCloseTo(1, 12);
        expect(offsetRatio(0.3, 0.4, 0)).toBe(0);
        expect(shotRisk({ a: 0, b: 0, theta: 0, V0: 2.5 }, max, null)).toBeNull();
        // 미스큐 경고는 2026-09-17 에 뺐다 — 엔진이 당점을 클램프해 게임에서 일어나지 않는 일이라서다.
        expect(shotRisk({ a: max * 0.9, b: 0, theta: 0, V0: 2.5 }, max, null)).toBeNull();
        expect(shotRisk({ a: 0, b: -max * 0.7, theta: 35 * DEG, V0: 2.5 }, max, null)).toEqual({ kind: "masse", level: "warn" });
        expect(shotRisk({ a: 0, b: -max * 0.5, theta: 35 * DEG, V0: 2.5 }, max, null)).toBeNull();
        // 미리보기가 없으면 점프는 판단하지 않는다(어림 없음)
        expect(shotRisk({ a: 0, b: 0, theta: 45 * DEG, V0: 9 }, max, null)).toBeNull();
        // 당점이 링에 바짝 붙어도 그것만으로는 아무 말도 하지 않는다(큐 각이 서야 마세)
        expect(shotRisk({ a: max * 0.9, b: 0, theta: 50 * DEG, V0: 5 }, max, null)!.kind).toBe("masse");
    });
    it("미리보기: 수평 샷은 안 뜨고, 45° 세게 치면 큐볼이 1 cm 이상 뜬다 → 점프 안내", () => {
        const flat = simulateShot(balls, { cueBallId: "white", phi: Math.PI / 2, V0: 3, a: 0, b: 0, theta: 0 }, params);
        expect(cueBallHop(flat, "white", R)).toBeLessThan(1e-9);
        expect(shotRisk({ a: 0, b: 0, theta: 0, V0: 3 }, max, { result: flat, cueBallId: "white", R })).toBeNull();
        const jump = simulateShot(balls, { cueBallId: "white", phi: Math.PI / 2, V0: 6, a: 0, b: 0, theta: 50 * DEG }, params);
        expect(cueBallHop(jump, "white", R)).toBeGreaterThanOrEqual(JUMP_HOP_M);   // 실측 28.5 mm
        expect(shotRisk({ a: 0, b: 0, theta: 50 * DEG, V0: 6 }, max, { result: jump, cueBallId: "white", R })).toEqual({ kind: "jump", level: "info" });
        // 같은 각이라도 세기가 약하면(4 m/s, 정점 5 mm 미만 → 엔진이 천에 붙임) 안내하지 않는다
        const soft = simulateShot(balls, { cueBallId: "white", phi: Math.PI / 2, V0: 4, a: 0, b: 0, theta: 50 * DEG }, params);
        expect(shotRisk({ a: 0, b: 0, theta: 50 * DEG, V0: 4 }, max, { result: soft, cueBallId: "white", R })).toBeNull();
        // 미리보기가 있으면 어림(45°·3 m/s)이 아니라 궤적으로 판단한다: 살짝 든 큐(10°)의 몇 mm 홉은 안내하지 않는다
        const slight = simulateShot(balls, { cueBallId: "white", phi: Math.PI / 2, V0: 2.5, a: 0, b: 0, theta: 10 * DEG }, params);
        expect(shotRisk({ a: 0, b: 0, theta: 10 * DEG, V0: 2.5 }, max, { result: slight, cueBallId: "white", R })).toBeNull();
    });
    it("문구 키는 세 종류 모두 sim.risk.*", () => {
        expect(Object.values(RISK_KEYS).every((k) => k.startsWith("sim.risk."))).toBe(true);
    });
});
