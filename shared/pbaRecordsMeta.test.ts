import { describe, expect, it } from "vitest";
import {
    PBA_RECORDS_MIN_GAMES, PBA_RECORDS_TOP, buildPbaRecords, cutKo, pbaRecordsDescription, pbaRecordsEmpty, pbaRecordsIndexable,
    recordLeague, recordSection, recordValue, type PbaCareerInput,
} from "./pbaRecordsMeta.js";

const p = (memCode: string, o: Partial<PbaCareerInput>): PbaCareerInput => ({
    memCode, league: "PBA", nameKo: memCode, nameEn: null, nationCode: "KR",
    average: 1, bankShotRate: 20, highRun: 10, win: 20, lose: 20, draw: 0, careerPrize: 1_000_000, ...o,
});

describe("buildPbaRecords", () => {
    it("비율 기록은 최소 경기 수 미만 선수를 빼고, 하이런·상금은 모두 센다", () => {
        const r = buildPbaRecords([
            p("SMALL", { average: 1.9, highRun: 25, win: 5, lose: 5 }), // 10경기 — 에버리지 1위가 되면 안 된다
            p("BIG", { average: 1.7, highRun: 15, win: 40, lose: 20 }),
        ], { PBA: "2026-09-24" });
        const pba = recordLeague(r, "PBA")!;
        expect(recordSection(pba, "average")!.rows.map((x) => x.memCode)).toEqual(["BIG"]);
        expect(recordSection(pba, "highRun")!.rows.map((x) => x.memCode)).toEqual(["SMALL", "BIG"]);
        expect(pba.qualified).toBe(1);
        expect(pba.updated).toBe("2026-09-24");
    });

    it("같은 값은 공동 순위(1, 1, 3), 경기 수 많은 선수를 먼저", () => {
        const g = PBA_RECORDS_MIN_GAMES;
        const r = buildPbaRecords([
            p("A", { highRun: 20, win: g, lose: 0 }),
            p("B", { highRun: 20, win: g + 10, lose: 0 }),
            p("C", { highRun: 18 }),
        ], {});
        const rows = recordSection(recordLeague(r, "PBA")!, "highRun")!.rows;
        expect(rows.map((x) => [x.memCode, x.rank])).toEqual([["B", 1], ["A", 1], ["C", 3]]);
    });

    it("승률 = 승 ÷ (승+패+무), 같은 분수는 공동 순위", () => {
        const r = buildPbaRecords([
            p("A", { win: 20, lose: 20, draw: 0 }),
            p("B", { win: 30, lose: 20, draw: 10 }),
        ], {});
        const rows = recordSection(recordLeague(r, "PBA")!, "winRate")!.rows;
        expect(rows[0].value).toBe(0.5);
        expect(rows.map((x) => x.rank)).toEqual([1, 1]);
        expect(recordValue("winRate", rows[0].value)).toBe("50.0%");
    });

    it("승률은 보이는 자릿수(소수 첫째 %)로 공동 순위를 매긴다 — 62/85 와 70/96 은 둘 다 72.9%", () => {
        const r = buildPbaRecords([
            p("A85", { win: 62, lose: 23 }),
            p("B96", { win: 70, lose: 26 }),
        ], {});
        const rows = recordSection(recordLeague(r, "PBA")!, "winRate")!.rows;
        expect(rows.map((x) => [x.memCode, x.rank, recordValue("winRate", x.value)])).toEqual([["B96", 1, "72.9%"], ["A85", 1, "72.9%"]]);
    });

    it("상세가 없는 선수(average null)·0원 상금은 뺀다, 톱 20 까지만", () => {
        const many = Array.from({ length: 30 }, (_, i) => p(`M${String(i).padStart(2, "0")}`, { careerPrize: (i + 1) * 1e6 }));
        const r = buildPbaRecords([...many, p("NODETAIL", { average: null }), p("ZERO", { careerPrize: 0 })], {});
        const pba = recordLeague(r, "PBA")!;
        const prize = recordSection(pba, "careerPrize")!;
        expect(pba.players).toBe(31);
        expect(prize.rows).toHaveLength(PBA_RECORDS_TOP);
        expect(prize.rows.some((x) => x.memCode === "ZERO" || x.memCode === "NODETAIL")).toBe(false);
        expect(prize.eligible).toBe(30);
    });

    it("톱 20 경계에서 잘린 공동 순위는 cut 으로 알린다(잘리지 않으면 null)", () => {
        // 하이런 30 짜리 15명 + 하이런 11 짜리 10명 → 공동 16위 10명 중 5명만 들어간다
        const top = Array.from({ length: 15 }, (_, i) => p(`T${String(i).padStart(2, "0")}`, { highRun: 30 }));
        const tied = Array.from({ length: 10 }, (_, i) => p(`E${String(i).padStart(2, "0")}`, { highRun: 11, win: 20 + i }));
        const hr = recordSection(recordLeague(buildPbaRecords([...top, ...tied], {}), "PBA")!, "highRun")!;
        expect(hr.rows).toHaveLength(PBA_RECORDS_TOP);
        expect(hr.cut).toEqual({ rank: 16, tied: 10, shown: 5 });
        expect(cutKo(hr.cut!)).toBe("공동 16위는 10명이고, 경기 수가 많은 5명만 적었습니다.");
        // 경기 수 많은 순 — E09(29승)부터 E05 까지
        expect(hr.rows.slice(15).map((x) => x.memCode)).toEqual(["E09", "E08", "E07", "E06", "E05"]);
        const exact = recordSection(recordLeague(buildPbaRecords([...top, ...tied.slice(0, 5)], {}), "PBA")!, "highRun")!;
        expect(exact.cut).toBeNull();
    });

    it("색인 기준: 두 리그 모두 자격 선수가 톱 20 을 채워야", () => {
        const pbaRows = Array.from({ length: 20 }, (_, i) => p(`P${i}`, {}));
        const lpbaRows = Array.from({ length: 19 }, (_, i) => p(`L${i}`, { league: "LPBA" }));
        expect(pbaRecordsIndexable(buildPbaRecords([...pbaRows, ...lpbaRows], {}))).toBe(false);
        expect(pbaRecordsIndexable(buildPbaRecords([...pbaRows, ...lpbaRows, p("L19", { league: "LPBA" })], {}))).toBe(true);
        expect(pbaRecordsEmpty(buildPbaRecords([], {}))).toBe(true);
    });

    it("설명문은 1위와 기준일을 담는다", () => {
        const r = buildPbaRecords([p("KIM", { nameKo: "김가영", league: "LPBA", average: 1.055, careerPrize: 972_300_000 })], { LPBA: "2026-09-24" });
        const d = pbaRecordsDescription(r);
        expect(d).toContain("LPBA 김가영 1.055");
        expect(d).toContain("9억 7,230만원");
        expect(d).toContain("2026년 9월 24일 갱신");
    });
});
