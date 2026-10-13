import { describe, it, expect } from "vitest";
import { MARKET_FISH, MARKET_NOTE, marketDays, marketWeek } from "./fishingMarket";
import { FISH } from "./fishingFish";

describe("위판장 소식", () => {
    it("묻는 어종은 우리 바다 어종 가운데 위판 이름이 있는 것 — 볼락 · 무늬오징어 · 민물은 없다", () => {
        const ids = MARKET_FISH.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const f of MARKET_FISH) expect(FISH.find((x) => x.id === f.id)?.water, f.id).toBe("sea");
        expect(ids).not.toContain("bollak");
        expect(ids).not.toContain("munui");
        // 표준명으로 묻는다
        expect(Object.fromEntries(MARKET_FISH.filter((f) => ["ureok", "gwangeo"].includes(f.id)).map((f) => [f.id, f.ask]))).toEqual({ ureok: "조피볼락", gwangeo: "넙치" });
    });
    it("어제까지 이레 — 오래된 날부터, 오늘은 없다", () => {
        expect(marketDays("2026-10-14")).toEqual(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
        expect(marketDays("2026-03-02", 3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    });
    it("한 주의 표 — 많이 오른 순, 이레가 다 찬 어종만(덜 받은 어종은 빠진다), 이름은 우리 이름", () => {
        const days = marketDays("2026-10-14");
        const full = (v: number[]) => Object.fromEntries(days.map((d, i) => [d, v[i]]));
        const w = marketWeek(days, { gamseongdom: full([369, 294, 102, 125, 60, 127, 61]), ureok: full([0, 0, 0, 0, 0, 24, 0]), muneo: { "2026-10-12": 786, "2026-10-13": 500 }, chamdom: {}, galchi: { "2026-09-01": 999 } });
        expect(w.fish.map((f) => [f.name, f.total])).toEqual([["감성돔", 1138], ["우럭", 24]]);
        expect(w.fish[0].counts).toEqual([369, 294, 102, 125, 60, 127, 61]);
        expect(w.days).toEqual(days);
        expect(marketWeek(days, {}).fish).toEqual([]);
    });
    it("낚시로 잡힌 양이 아니라고 적는다", () => {
        expect(MARKET_NOTE).toContain("낚시로 잡힌 양이 아니");
    });
});
