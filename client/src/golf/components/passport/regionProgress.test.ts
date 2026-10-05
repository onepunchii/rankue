import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLF_REGIONS } from "@shared/golfCourse";
import { MASTER_RATIO, regionChipColor, regionPaint, regionProgress } from "./regionProgress";

const TOTALS = { 경기: 154, 강원: 60, 충청: 71, 경상: 96, 전라: 68, 제주: 41 };

describe("지역 정복 — 숫자", () => {
    it("여섯 지역을 지역 순서대로, 모르는 숫자는 0 으로", () => {
        const list = regionProgress({}, {});
        expect(list.map((r) => r.region)).toEqual([...GOLF_REGIONS]);
        expect(list.every((r) => r.total === 0 && r.visited === 0 && r.ratio === 0 && !r.mastered)).toBe(true);
    });

    it("금색 문턱 = 그 지역 골프장의 20% 올림(적어도 1곳)", () => {
        const by = Object.fromEntries(regionProgress(TOTALS, {}).map((r) => [r.region, r]));
        expect(MASTER_RATIO).toBe(0.2);
        expect(by.경기.goal).toBe(31); // 154 × 0.2 = 30.8
        expect(by.강원.goal).toBe(12);
        expect(by.제주.goal).toBe(9); // 41 × 0.2 = 8.2
        expect(regionProgress({ 제주: 2 }, {}).find((r) => r.region === "제주")!.goal).toBe(1);
    });

    it("문턱에 닿으면 금색, 그 전에는 가 본 만큼", () => {
        const by = Object.fromEntries(regionProgress(TOTALS, { 경기: 3, 강원: 12, 제주: 30 }).map((r) => [r.region, r]));
        expect(by.경기.mastered).toBe(false);
        expect(by.경기.ratio).toBeCloseTo(3 / 31, 5);
        expect(by.강원.mastered).toBe(true);
        expect(by.강원.ratio).toBe(1);
        expect(by.제주.ratio).toBe(1); // 넘쳐도 1
        expect(by.충청.visited).toBe(0);
    });

    it("골프장 수를 모르는 지역은 가 본 수가 있어도 금색이 아니다", () => {
        const r = regionProgress({}, { 경기: 5 }).find((x) => x.region === "경기")!;
        expect(r.mastered).toBe(false);
        expect(r.ratio).toBe(0);
    });
});

describe("지역 정복 — 지도에 칠하기", () => {
    const paint = regionPaint(regionProgress(TOTALS, { 경기: 3, 강원: 12, 전라: 10 }));

    it("가 본 지역만 칠한다", () => {
        expect(Object.keys(paint.fills).sort()).toEqual(["강원", "경기", "전라"].sort());
        expect(paint.fills.충청).toBeUndefined();
        expect(paint.strokes.제주).toBeUndefined();
    });

    it("금색 지역은 금색, 나머지는 라임 — 가 본 만큼 짙어진다", () => {
        expect(paint.fills.강원.startsWith("#FFD700")).toBe(true);
        expect(paint.strokes.강원.startsWith("#FFD700")).toBe(true);
        expect(paint.fills.경기.startsWith("#64DD17")).toBe(true);
        const alpha = (hex: string) => parseInt(hex.slice(7, 9), 16) / 255;
        expect(alpha(paint.fills.전라)).toBeGreaterThan(alpha(paint.fills.경기)); // 전라 10/14 > 경기 3/31
        // 점·발자국이 그 위에 올라간다 — 면은 옅게(30% 아래), 색 값은 #RRGGBBAA
        for (const v of [...Object.values(paint.fills), ...Object.values(paint.strokes)]) expect(v).toMatch(/^#[0-9A-F]{8}$/);
        for (const v of Object.values(paint.fills)) expect(alpha(v)).toBeLessThan(0.3);
    });

    it("칸의 글자색이 지도의 칠과 같은 뜻", () => {
        const [gg, gw, , , , jj] = regionProgress(TOTALS, { 경기: 3, 강원: 12 });
        expect(regionChipColor(gw)).toBe("#FFD700");
        expect(regionChipColor(gg)).toBe("#8BE84A");
        expect(regionChipColor(jj)).toBe("#FFFFFF8C");
    });
});

describe("지역 지도는 발자국 지도 한 장으로", () => {
    const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

    it("탭은 발자국 · 앨범 둘 — 예전에 '지역 정복'을 골라 둔 기기는 발자국으로 연다", () => {
        const tabs = src("./PassportMapTabs.tsx");
        expect(tabs).toContain('export type PassportMapMode = "footprints" | "album"');
        expect(tabs).toContain('v === "album" ? v : "footprints"');
        expect(tabs).not.toContain('id: "region"');
    });

    it("발자국 지도가 윤곽선을 점 밑에 깔고, 서버가 그리는 공유 카드에는 윤곽선 자료가 없다", () => {
        expect(src("./FootprintMap.tsx")).toMatch(/<g ref=\{worldRef\}[^>]*>\s*\{under\}/);
        expect(src("./FootprintsPanel.tsx")).toContain("under={outline}");
        const card = readFileSync(resolve(__dirname, "../../../../../server/services/golfFootprintsCard.ts"), "utf8");
        expect(card).not.toMatch(/koreaMapData|koreaOutline|KOREA_MAP_PATHS/);
    });
});
