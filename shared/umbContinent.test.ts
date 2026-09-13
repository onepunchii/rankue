import { describe, it, expect } from "vitest";
import { continentOf, pointsByContinent } from "./umbContinent.js";

describe("continentOf", () => {
    it("연맹 약자로 가른다", () => {
        expect(continentOf("UMB / CEB World Cup - PORTO (PT) 2026-07-18")).toBe("europe");
        expect(continentOf("UMB / ACBC World Cup - GWANGJU (KR) 2025-11-09")).toBe("asia");
        expect(continentOf("UMB / CPB World Cup - BOGOTA (CO) 2026-04-12")).toBe("americas");
        expect(continentOf("UMB / AMECC World Cup - SHARM EL SHEIKH (EG)")).toBe("africaMe");
    });
    it("선수권은 대륙으로 뭉개지 않는다", () => {
        expect(continentOf("UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)")).toBe("world");
        expect(continentOf("Confederal Championships")).toBe("confederal");
        expect(continentOf("National Championships 2024 / 2025")).toBe("national");
        expect(continentOf("")).toBe("other");
    });
});

describe("pointsByContinent", () => {
    const labels = new Map([
        ["A", "UMB / CEB World Cup - PORTO (PT)"], ["B", "UMB / CEB World Cup - ANTWERP (BE)"],
        ["C", "UMB / ACBC World Cup - GWANGJU (KR)"], ["D", "UMB World Championship - ANTWERP (BE)"],
    ]);
    it("대륙별로 합치고 많은 순으로 준다", () => {
        expect(pointsByContinent({ A: 26, B: 26, C: 18, D: 12 }, labels)).toEqual([
            { continent: "europe", points: 52, events: 2 },
            { continent: "asia", points: 18, events: 1 },
            { continent: "world", points: 12, events: 1 },
        ]);
    });
    it("0·음수(패널티)·없는 것은 뺀다", () => {
        expect(pointsByContinent({ A: 0, C: -5 }, labels)).toEqual([]);
        expect(pointsByContinent(null, labels)).toEqual([]);
    });
});
