import { describe, expect, it } from "vitest";
import { buildEventHistory, eventKeyOf, eventYearOf } from "./umbEventHistory";

const L = {
    antwerp24: "UMB / CEB World Cup - ANTWERP (BE) 2024-10-13",
    antwerp25: "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12",
    hcmc25: "UMB / ACBC World Cup - HO CHI MINH CITY (VN) 2025-05-24",
    wc24: "UMB World Championship - 14/18 Oct. 2024 - BOGOTA (CO)",
    wc25: "UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)",
    conf: "Confederal Championships 2024 / 2025 / 2026",
};

describe("umbEventHistory", () => {
    it("같은 대회는 도시로 묶고 세계선수권은 도시가 바뀌어도 한 줄이다", () => {
        expect(eventKeyOf(L.antwerp24)).toBe(eventKeyOf(L.antwerp25));
        expect(eventKeyOf(L.antwerp25)).not.toBe(eventKeyOf(L.hcmc25));
        expect(eventKeyOf(L.wc24)).toBe(eventKeyOf(L.wc25));
    });

    it("연도는 대회일에서, 선수권류는 라벨의 마지막 연도에서 뽑는다", () => {
        expect(eventYearOf(L.antwerp25, "2026-01-01")).toBe("2025");
        expect(eventYearOf(L.wc24, "2026-01-01")).toBe("2024");
        expect(eventYearOf(L.conf, "2026-01-01")).toBe("2026");
    });

    it("회차를 거슬러 연도별 셀을 만들고 전년 대비와 최강·최다 상승 대회를 고른다", () => {
        // 2024 회차: Antwerp 40, 세계선수권 30 / 2025 회차: Antwerp 64, 세계선수권 20, HCMC 18
        const labels = new Map<string, Map<string, string>>([
            ["2024-11", new Map([["A", L.antwerp24], ["B", L.wc24]])],
            ["2025-11", new Map([["A", L.antwerp25], ["B", L.wc25], ["C", L.hcmc25]])],
            // 같은 (대회, 연도)가 다음 회차에 또 보여도(주간 회차) 셀은 하나
            ["2025-12", new Map([["A", L.antwerp25], ["B", L.wc25], ["C", L.hcmc25]])],
        ]);
        const h = buildEventHistory([
            { edition: "2024-11", editionDate: "2024-11-01", eventPoints: { A: 40, B: 30 } },
            { edition: "2025-11", editionDate: "2025-11-01", eventPoints: { A: 64, B: 20, C: 18 } },
            { edition: "2025-12", editionDate: "2025-12-01", eventPoints: { A: 64, B: 20, C: 18 } },
        ], labels);

        expect(h.years).toEqual(["2024", "2025"]);
        const antwerp = h.rows.find((r) => r.key === eventKeyOf(L.antwerp25))!;
        expect(antwerp.cells.map((c) => [c.year, c.points])).toEqual([["2024", 40], ["2025", 64]]);
        expect(antwerp.delta).toBe(24);
        const wc = h.rows.find((r) => r.key === "worldchamp")!;
        expect(wc.delta).toBe(-10);
        expect(wc.label).toBe(L.wc25); // 대표 라벨은 최신 연도
        const hcmc = h.rows.find((r) => r.key === eventKeyOf(L.hcmc25))!;
        expect(hcmc.delta).toBeNull();
        expect(h.rows[0].key).toBe(antwerp.key); // 최신 점수 내림차순
        expect(h.strongest).toBe(antwerp.key);
        expect(h.mostImproved).toBe(antwerp.key);
    });

    it("점수 0·라벨 없는 열은 무시하고, 아무것도 없으면 빈 표", () => {
        const h = buildEventHistory([{ edition: "e", editionDate: "2025-01-01", eventPoints: { A: 0, Z: 5 } }], new Map([["e", new Map([["A", L.antwerp25]])]]));
        expect(h.rows).toEqual([]);
        expect(h.years).toEqual([]);
        expect(h.strongest).toBeNull();
    });
});
