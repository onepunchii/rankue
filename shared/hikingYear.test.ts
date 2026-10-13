import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasYearReport, heightSumNote, hikingYearReport } from "./hikingYear";

const kst = (y: number, m: number, d: number, h = 10) => Date.UTC(y, m - 1, d, h - 9);
const H: Record<string, number> = { halla: 1947, jiri: 1915, bukhan: 836, gwanak: 632 };
const heightOf = (id: string) => H[id] ?? null;

describe("올해의 산행", () => {
    const summits = [
        { mountainId: "bukhan", at: kst(2025, 11, 2), verified: true },      // 작년에 처음
        { mountainId: "bukhan", at: kst(2026, 3, 7), verified: true },       // 올해 또
        { mountainId: "halla", at: kst(2026, 1, 18), verified: true },
        { mountainId: "jiri", at: kst(2026, 6, 20), verified: true },
        { mountainId: "jiri", at: kst(2026, 6, 21), verified: true },        // 같은 산 이틀
        { mountainId: "gwanak", at: kst(2026, 8, 15), verified: false },     // 적어 두기만 — 세지 않는다
        { mountainId: "none", at: kst(2026, 9, 1), verified: true },         // 높이를 모르는 산
    ];
    const trips = [
        { startedAt: kst(2026, 3, 7, 9), endedAt: kst(2026, 3, 7, 13), km: 7.24, gainM: 612 },
        { startedAt: kst(2026, 6, 20, 5), endedAt: kst(2026, 6, 20, 15), km: 18.5, gainM: 1420 },
        { startedAt: kst(2025, 11, 2, 9), endedAt: kst(2025, 11, 2, 12), km: 6, gainM: 500 },   // 작년
        { startedAt: kst(2026, 7, 1, 9), endedAt: kst(2026, 7, 1, 9), km: 3, gainM: 10 },       // 끝이 시작과 같다 — 뺀다
    ];
    it("인증한 횟수 · 산의 수 · 올해 처음 오른 산 · 높이의 합 · 가장 높았던 산 · 달", () => {
        const r = hikingYearReport(2026, summits, trips, heightOf);
        expect(r.climbs).toBe(5);
        expect(r.mountains).toBe(4);                       // 북한산 · 한라산 · 지리산 · 높이 모르는 산
        expect(r.firsts).toBe(3);                          // 북한산은 작년에 처음
        expect(r.heightSum).toBe(1947 + 1915 + 836);       // 같은 산은 한 번, 모르는 높이는 뺀다
        expect(r.highest).toEqual({ mountainId: "halla", heightM: 1947 });
        expect(r.byMonth).toEqual([1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0]);
        expect(r.activeMonths).toBe(4);
        expect(r.trips).toBe(2); expect(r.km).toBe(25.7); expect(r.gainM).toBe(2032); expect(r.minutes).toBe(4 * 60 + 10 * 60);
        expect(hasYearReport(r)).toBe(true);
    });
    it("해의 경계는 한국 시계 — 12월 31일 밤 11시는 그 해, 1월 1일 0시 5분은 다음 해", () => {
        const s = [{ mountainId: "halla", at: Date.UTC(2026, 11, 31, 14, 0), verified: true }, { mountainId: "jiri", at: Date.UTC(2026, 11, 31, 15, 5), verified: true }];
        expect(hikingYearReport(2026, s, [], heightOf).mountains).toBe(1);
        expect(hikingYearReport(2027, s, [], heightOf).mountains).toBe(1);
    });
    it("올해 아무것도 없으면 구역을 그리지 않는다", () => {
        const r = hikingYearReport(2024, summits, trips, heightOf);
        expect(r.climbs).toBe(0); expect(r.trips).toBe(0); expect(r.highest).toBeNull();
        expect(hasYearReport(r)).toBe(false);
    });
    it("높이의 합을 견주는 말 — 한라산 한 번이 안 되면 말하지 않는다", () => {
        expect(heightSumNote(1900)).toBe("");
        expect(heightSumNote(1947)).toBe("한라산을 1번 오른 높이예요");
        expect(heightSumNote(4698)).toBe("한라산을 2.4번 오른 높이예요");
    });
    it("고정: 배낭 화면에 걸려 있고, 겨루는 말(순위 · 빠르기)이 없다", () => {
        const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
        expect(read("client/src/hiking/pages/PackPage.tsx")).toContain("<YearReport");
        const ui = read("client/src/hiking/components/YearReport.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(ui).not.toMatch(/순위|랭킹|가장 빨리|최단 시간|기록 경신/);
    });
});
