import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BREAK_GAUGE_RISE_MAX_MS, BREAK_GAUGE_RISE_MIN_MS, breakGaugePercent, isBreakTurn, newBreakGauge } from "./breakGauge";

/**
 * 초구 타이밍 게이지(2026-11-03 오너: "초구만 힘을 타이밍 버튼으로 게임처럼") — 족보(같은 초구 → 같은 판)를 깨는 장치.
 */
describe("게이지의 힘", () => {
    const g = { riseMs: 800, offsetMs: 0 };
    it("0 → 100 → 0 으로 오르내린다(삼각파) · 끊김 없는 값", () => {
        expect([0, 200, 400, 800, 1200, 1600, 1800].map((t) => breakGaugePercent(g, t))).toEqual([0, 25, 50, 100, 50, 0, 25]);
        expect(breakGaugePercent(g, 401)).toBeCloseTo(50.125, 6);
    });
    it("시작점만큼 밀려 있다 · 늘 0~100", () => {
        expect(breakGaugePercent({ riseMs: 800, offsetMs: 800 }, 0)).toBe(100);
        for (let t = -3000; t < 5000; t += 37) {
            const p = breakGaugePercent({ riseMs: 731, offsetMs: 1234 }, t);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(100);
        }
    });
    it("빠르기와 시작점은 칠 때마다 고른다 — 정한 사이에서", () => {
        expect(newBreakGauge(() => 0)).toEqual({ riseMs: BREAK_GAUGE_RISE_MIN_MS, offsetMs: 0 });
        const hi = newBreakGauge(() => 0.999999);
        expect(hi.riseMs).toBeCloseTo(BREAK_GAUGE_RISE_MAX_MS, 2);
        expect(hi.offsetMs).toBeLessThan(2 * hi.riseMs);
        // 같은 박자로 눌러도 판마다 힘이 다르다
        const a = newBreakGauge(() => 0.1), b = newBreakGauge(() => 0.7);
        expect(breakGaugePercent(a, 1000)).not.toBeCloseTo(breakGaugePercent(b, 1000), 1);
    });
});

describe("초구 차례", () => {
    const base = { mode: "match", matchStatus: "playing", phase: "aim", shotCount: 0 };
    it("온라인 대전 · 치는 중 · 내 차례 · 아직 아무도 안 쳤을 때만", () => {
        expect(isBreakTurn(base)).toBe(true);
        expect(isBreakTurn({ ...base, mode: "practice" })).toBe(false);
        expect(isBreakTurn({ ...base, shotCount: 1 })).toBe(false);
        expect(isBreakTurn({ ...base, phase: "waiting" })).toBe(false);
        expect(isBreakTurn({ ...base, phase: "shooting" })).toBe(false);
        expect(isBreakTurn({ ...base, matchStatus: "finished" })).toBe(false);
        expect(isBreakTurn({ ...base, shotCount: undefined })).toBe(false);
    });
});

describe("화면: 초구는 게이지로", () => {
    const src = readFileSync(resolve(process.cwd(), "client/src/sim/SimulatorPage.tsx"), "utf8");
    it("초구 차례에는 힘 슬라이더 · ± 를 잠그고, 샷 단추가 게이지를 켜고 멈춘다", () => {
        expect(src).toContain("const breakTurn = isBreakTurn(");
        expect(src).toContain("disabled={!aiming || breakTurn}");
        expect(src).toContain("breakGaugePercent(g.gauge, performance.now() - g.startedAt)");
        expect(src).toContain("actions.setPower(powerFromPercent(");
    });
});
