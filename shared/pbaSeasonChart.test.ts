import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { boxOf, labelDir, pickXLabels, placeLabels, prizeShort, rankAxis, seasonSlots, textW } from "./pbaSeasonChart";

/**
 * PBA 선수 '시즌별 기록' 그래프(2026-10-18) — 순위 글씨가 점 · 선에 겹치고, 쉰 시즌을 건너뛰어 붙여 그리던 것을 고쳤다.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("PBA 시즌 그래프", () => {
    it("시즌 칸은 첫 시즌부터 마지막까지 빠짐없이 — 쉰 시즌은 빈 칸", () => {
        const s = seasonSlots([{ season: 2019 }, { season: 2023 }, { season: 2026 }]);
        expect(s.map((x) => x.season)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
        expect(s.filter((x) => x.row).length).toBe(3);
        expect(seasonSlots([])).toEqual([]);
    });
    it("순위 눈금 — 1위가 맨 위, 끝은 보기 좋은 수", () => {
        expect(rankAxis(115)).toEqual({ max: 150, ticks: [1, 50, 100, 150] });
        expect(rankAxis(58)).toEqual({ max: 60, ticks: [1, 20, 40, 60] });
        expect(rankAxis(6).ticks[0]).toBe(1);
    });
    it("글씨 방향 — 봉우리는 위, 골짜기는 아래, 곧게 지나가면 선 위쪽", () => {
        expect(labelDir([50, 10], [0, 50], [100, 50])[1]).toBeLessThan(-0.9); // 봉우리(화면 위가 작은 y)
        expect(labelDir([50, 90], [0, 50], [100, 50])[1]).toBeGreaterThan(0.9); // 골짜기
        const straight = labelDir([50, 50], [0, 100], [100, 0]);
        expect(straight[1]).toBeLessThan(0); // 위쪽
        expect(straight[0]).toBeLessThan(0); // 오르는 선의 왼쪽 위
        expect(labelDir([50, 50], null, null)).toEqual([0, -1]);
    });
    it("글씨 자리 — 장애물 · 앞선 글씨를 피해 다음 후보로, 들어갈 데가 없으면 뺀다(must 는 판 안으로)", () => {
        const bounds = { x0: 0, x1: 200, y0: 0, y1: 100 };
        const ob = [boxOf({ x: 50, y: 30, anchor: "middle" }, 20)];
        const got = placeLabels([
            { key: 1, width: 20, cands: [{ x: 50, y: 30, anchor: "middle" }, { x: 50, y: 60, anchor: "middle" }] },
            { key: 2, width: 20, cands: [{ x: 50, y: 60, anchor: "middle" }] },
            { key: 3, width: 20, must: true, cands: [{ x: 198, y: 50, anchor: "middle" }] },
        ], ob, bounds);
        expect(got.get(1)).toEqual({ x: 50, y: 60, anchor: "middle" });
        expect(got.has(2)).toBe(false); // 1 이 차지했다
        expect(got.get(3)!.x).toBe(190); // 판 안으로 밀었다
    });
    it("시즌 글씨 — 좁으면 겹치는 것을 빼되 마지막 · 기록 있는 첫 시즌은 남는다", () => {
        const xs = [10, 40, 70, 100, 130, 160, 190, 220];
        const shown = pickXLabels(xs, xs.map(() => 36), [true, false, false, false, true, false, true, true]);
        expect(shown.has(7)).toBe(true);
        expect(shown.has(0)).toBe(true);
        expect(shown.has(6)).toBe(false); // 마지막과 붙어 있다
        expect(textW("19-20")).toBeCloseTo(36, 0);
    });
    it("막대 위 상금은 짧게", () => {
        expect(prizeShort(120_000_000, "ko")).toBe("1.2억");
        expect(prizeShort(7_500_000, "ko")).toBe("750만");
        expect(prizeShort(42_050_000, "ko")).toBe("4,205만");
        expect(prizeShort(12_000_000, "en")).toBe("₩12M");
        expect(prizeShort(750_000, "en")).toBe("₩750K");
    });
    it("화면은 recharts 없이 이 셈을 쓰고, 선수 페이지가 lazy 로 받는다", () => {
        const chart = read("client/src/components/hiq/charts/SeasonChart.tsx");
        expect(chart).not.toContain('from "recharts"');
        expect(chart).toContain("placeLabels(");
        expect(read("client/src/pages/hiq/pba-player.tsx")).toContain("<SeasonChart seasons={p.seasons}");
    });
});
