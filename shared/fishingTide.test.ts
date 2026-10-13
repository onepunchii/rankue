import { describe, it, expect } from "vitest";
import { TIDE_PHASE_TEXT, lunarDay, nextTideMark, tideAddDays, tideDays, tideName, tideOf, tideWeekday } from "./fishingTide";

describe("음력 — 한국 달력으로 센다", () => {
    it("합삭이 자정 근처인 달도 한국 날짜로(2026-10-11 이 음력 9월 1일 — 중국 달력은 10일)", () => {
        expect(lunarDay("2026-10-10")).toMatchObject({ month: 8, day: 30 });
        expect(lunarDay("2026-10-11")).toMatchObject({ month: 9, day: 1 });
        expect(lunarDay("2026-10-14")).toMatchObject({ month: 9, day: 4 });
        expect(lunarDay("어제")).toBeNull();
    });
});

describe("물때 이름", () => {
    it("서해 7물때식 — 1일 7물 · 8일 조금 · 9일 무시 · 10일 1물 · 15일 6물 · 30일 6물", () => {
        expect([1, 7, 8, 9, 10, 15, 16, 22, 23, 24, 25, 29, 30].map((d) => tideName(d, "west")))
            .toEqual(["7물", "13물", "조금", "무시", "1물", "6물", "7물", "13물", "조금", "무시", "1물", "5물", "6물"]);
    });
    it("남해 · 동해 · 제주 8물때식 — 하나씩 늦고 무시가 없다", () => {
        expect([1, 7, 8, 9, 15, 16, 22, 23, 24, 29, 30].map((d) => tideName(d, "south")))
            .toEqual(["8물", "14물", "조금", "1물", "7물", "8물", "14물", "조금", "1물", "6물", "7물"]);
    });
    it("바다타임 동해항 2025년 9월 표와 같다", () => {
        const got = (ymd: string) => tideOf(ymd, "south")!.name;
        expect(["2025-09-01", "2025-09-06", "2025-09-13", "2025-09-14", "2025-09-15", "2025-09-21", "2025-09-22", "2025-09-29", "2025-09-30"].map(got))
            .toEqual(["2물", "7물", "14물", "조금", "1물", "7물", "8물", "조금", "1물"]);
    });
    it("바다타임 서귀포 2024년 4월 표와 같다(2월이 30일까지)", () => {
        const got = (ymd: string) => tideOf(ymd, "south")!.name;
        expect(["2024-04-01", "2024-04-02", "2024-04-07", "2024-04-08", "2024-04-09", "2024-04-15", "2024-04-16", "2024-04-30"].map(got))
            .toEqual(["조금", "1물", "6물", "7물", "8물", "14물", "조금", "14물"]);
    });
    it("2026-10-14: 서해 10물 · 남해 11물", () => {
        expect([tideOf("2026-10-14", "west")!.name, tideOf("2026-10-14", "south")!.name]).toEqual(["10물", "11물"]);
    });
});

describe("사리 · 조금 · 물의 세기", () => {
    it("보름 · 그믐에 사리, 8일 · 23일에 조금 표시", () => {
        // 2026-10: 음력 9월 1일 = 10/11 → 8일 = 10/18(조금), 15일 = 10/25(사리)
        expect(tideOf("2026-10-18", "west")).toMatchObject({ mark: "조금", name: "조금", phase: "neap", flow: 0 });
        expect(tideOf("2026-10-25", "west")).toMatchObject({ mark: "사리", name: "6물", phase: "spring" });
        expect(tideOf("2026-10-10", "west")).toMatchObject({ mark: "사리", lunar: { day: 30 } });
        expect(tideOf("2026-10-14", "west")!.mark).toBeNull();
    });
    it("29일까지뿐인 달은 그믐사리를 다음 날(1일)에 건다", () => {
        // 음력 8월 29일 다음이 9월 1일인 달을 찾아서 본다 — 앞뒤 넉 달 안에 반드시 있다
        let found = "";
        for (let i = 0; i < 130 && !found; i++) { const d = tideAddDays("2026-01-01", i); if (lunarDay(d)?.day === 1 && lunarDay(tideAddDays(d, -1))?.day === 29) found = d; }
        expect(found).not.toBe("");
        expect(tideOf(found, "west")!.mark).toBe("사리");
        expect(tideOf(tideAddDays(found, -1), "west")!.mark).toBeNull();
    });
    it("세기는 조금에 0 · 사리 무렵에 가장 크다, 말은 네 가지", () => {
        const flows = tideDays("2026-10-18", "west", 15).map((t) => t.flow);
        expect(flows[0]).toBe(0);
        expect(Math.max(...flows)).toBeGreaterThan(0.98);
        expect(flows.indexOf(Math.max(...flows))).toBeGreaterThanOrEqual(7);
        expect(tideDays("2026-10-18", "west", 15).map((t) => t.phase).join(" ")).toBe("neap neap rising rising rising rising spring spring spring spring falling falling falling falling falling");
        expect(Object.keys(TIDE_PHASE_TEXT)).toHaveLength(4);
    });
    it("이레 띠 · 다음 사리와 조금 · 요일", () => {
        expect(tideDays("2026-10-14", "west").map((t) => t.name)).toEqual(["10물", "11물", "12물", "13물", "조금", "무시", "1물"]);
        expect(nextTideMark("2026-10-14", "조금")).toEqual({ ymd: "2026-10-18", inDays: 4 });
        expect(nextTideMark("2026-10-14", "사리")).toEqual({ ymd: "2026-10-25", inDays: 11 });
        expect(nextTideMark("2026-10-18", "조금")?.inDays).toBe(0);
        expect([tideWeekday("2026-10-14"), tideWeekday("2026-10-18")]).toEqual(["수", "일"]);
    });
});
