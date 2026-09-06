import { describe, it, expect } from "vitest";
import { impactFor, planHaptics, SimHaptics, HAPTIC_MIN_GAP_MS } from "./haptics";
import type { SoundEvent } from "./audioMapping";

describe("햅틱 세기", () => {
    it("잡음·0·NaN 은 null, 세기에 따라 light→medium→heavy", () => {
        expect(impactFor(0)).toBeNull();
        expect(impactFor(NaN)).toBeNull();
        expect(impactFor(0.5)).toBe("light");
        expect(impactFor(2)).toBe("medium");
        expect(impactFor(5)).toBe("heavy");
    });
    it("큐 타격은 같은 속도라도 한 단계 세고, 쿠션은 약하다", () => {
        expect(impactFor(1, "strike")).toBe("medium");
        expect(impactFor(1, "ball")).toBe("light");
        expect(impactFor(1.4, "cushion")).toBe("light");
    });
});

describe("스로틀 계획", () => {
    const ev = (t: number, impulse: number, kind: SoundEvent["kind"] = "ball"): SoundEvent => ({ t, kind, impulse });
    it("50 ms 안의 진동은 버리고 세기는 큰 쪽으로 올린다", () => {
        const plan = planHaptics([ev(0, 2, "strike"), ev(0.02, 5), ev(0.3, 0.5), ev(0.33, 0.6), ev(0.5, 1, "cushion")]);
        expect(plan).toEqual([
            { atMs: 0, style: "heavy" },
            { atMs: 300, style: "light" },
            { atMs: 500, style: "light" },
        ]);
    });
    it("정렬되지 않은 입력도 시각 순", () => {
        const plan = planHaptics([ev(0.4, 2), ev(0.1, 2)]);
        expect(plan.map(p => p.atMs)).toEqual([100, 400]);
    });
    it("정확히 minGap 간격은 살아남는다", () => {
        const plan = planHaptics([ev(0, 2), ev(HAPTIC_MIN_GAP_MS / 1000, 2)]);
        expect(plan).toHaveLength(2);
    });
});

describe("SimHaptics (node = 웹, vibrate 없음)", () => {
    it("사용 불가 환경에서 어떤 호출도 throw 하지 않는다", () => {
        const h = new SimHaptics();
        expect(h.isAvailable()).toBe(false);
        expect(() => {
            h.impact("heavy");
            h.schedule([{ t: 0, kind: "strike", impulse: 3 }], 0);
            h.cancel();
        }).not.toThrow();
    });
});
