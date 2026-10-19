import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { repairCourseElevation } from "./hikingElevation";
import type { LinePoint } from "./hikingGeo";

/** 코스 높이의 '0 m 튐'(2026-10-19 — 학산 '해발 0~391m', 5.8km 코스 오르막 2,095m) */
const P = (ele: number, km: number): LinePoint => [35.8, 127.1, ele, km];

describe("코스 높이 0 m 튐 고치기", () => {
    it("가운데의 0 은 앞뒤를 이어 채우고 오르막 · 가장 낮은 곳을 다시 센다", () => {
        const c = { line: [P(120, 0), P(160, 1), P(0, 2), P(200, 3), P(240, 4)], gainM: 520, lossM: 160, minM: 0, maxM: 240 };
        const r = repairCourseElevation(c);
        expect(r.line[2][2]).toBe(180);
        expect(r.minM).toBe(120);
        expect(r.gainM).toBe(120);
        expect(r.lossM).toBe(0);
    });
    it("양끝의 0 은 이웃 값으로", () => {
        const r = repairCourseElevation({ line: [P(0, 0), P(150, 1), P(300, 2)], gainM: 300, lossM: 0, minM: 0, maxM: 300 });
        expect(r.line[0][2]).toBe(150);
        expect(r.minM).toBe(150);
    });
    it("바닷가에서 진짜로 0 m 에서 떠나는 길은 그대로 · 0 이 없으면 손대지 않는다", () => {
        const sea = { line: [P(0, 0), P(8, 0.1), P(15, 0.2), P(60, 0.5)], gainM: 60, lossM: 0, minM: 0, maxM: 60 };
        expect(repairCourseElevation(sea)).toBe(sea);
        const clean = { line: [P(100, 0), P(200, 1)], gainM: 105, lossM: 0, minM: 100, maxM: 200 };
        expect(repairCourseElevation(clean)).toBe(clean);
    });
    it("산 페이지 · 검색용 화면이 같은 코스를 쓴다(읽을 때 고친다)", () => {
        const s = readFileSync(resolve(__dirname, "..", "server/storage/hiking.ts"), "utf8");
        expect(s).toContain("repairCourseElevation(");
    });
});
