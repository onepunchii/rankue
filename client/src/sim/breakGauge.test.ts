import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BREAK_GAUGE_EASE, BREAK_GAUGE_RISE_MAX_MS, BREAK_GAUGE_RISE_MIN_MS, breakGaugePercent, breakZone, isBreakTurn, newBreakGauge } from "./breakGauge";

/**
 * 초구 타이밍 게이지(2026-11-03 오너: "초구만 힘을 타이밍 버튼으로 게임처럼") — 족보(같은 초구 → 같은 판)를 깨는 장치.
 */
describe("게이지의 힘", () => {
    const g = { riseMs: 800, offsetMs: 0 };
    const p = (t: number) => breakGaugePercent(g, t);
    it("0 → 100 → 0 으로 오르내린다 · 끊김 없는 값", () => {
        expect([0, 800, 1600].map(p)).toEqual([0, 100, 0]);
        expect(p(400)).toBeCloseTo(Math.pow(0.5, BREAK_GAUGE_EASE) * 100, 6);
        // 내려올 때는 오를 때의 거울
        expect(p(1200)).toBeCloseTo(p(400), 6);
        expect(p(401)).not.toBe(p(400));
    });
    it("최대로 갈수록 빨라진다(오너: '맥스파워에서 빨라지듯') — 마지막 10%의 시간에 오르는 힘이 처음 10%보다 훨씬 크다", () => {
        const first = p(80) - p(0), last = p(800) - p(720);
        expect(last).toBeGreaterThan(first * 10);
        // 최대 바로 옆(내려가기 시작)도 빠르다 — 센 힘은 휙 지나간다
        expect(p(800) - p(880)).toBeCloseTo(last, 6);
    });
    it("시작점만큼 밀려 있다 · 늘 0~100", () => {
        expect(breakGaugePercent({ riseMs: 800, offsetMs: 800 }, 0)).toBe(100);
        for (let t = -3000; t < 5000; t += 37) {
            const v = breakGaugePercent({ riseMs: 931, offsetMs: 1234 }, t);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
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
    it("색 구간 — 셀수록 붉다", () => {
        expect([0, 34.9, 35, 64.9, 65, 84.9, 85, 100].map(breakZone)).toEqual(["soft", "soft", "mid", "mid", "hard", "hard", "max", "max"]);
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
    it("초구 차례에는 힘 막대 자리가 게이지가 되고(± 는 숨김), 샷 단추 · 게이지가 켜고 멈춘다 — 안내 멘트는 없다(오너 11/3)", () => {
        expect(src).toContain("const breakTurn = isBreakTurn(");
        expect(src).toContain("breakTurn ? (\n                            <BreakGauge run={breakRun} onPress={onShoot}");
        expect(src).toContain('(pathView || breakTurn) && "hidden"');
        expect(src).not.toContain("sim.break.hint");
        expect(src).toContain("breakGaugePercent(g.gauge, performance.now() - g.startedAt)");
        expect(src).toContain("actions.setPower(powerFromPercent(");
    });
});
