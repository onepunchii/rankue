import { describe, it, expect } from "vitest";
import {
    dateRangeKo, isJuniorEvent, parseSeasonSeg, parseTourCodeSeg, pbaEventKey, pbaLeagueOf, seasonLabelFull, tourIndexable,
    tourNameWithSeason, tourStatus, tourTitle, tourJsonLd, umbEventName, umbEventSlug, UMB_SLUG_RE, type PbaTourRow,
} from "./tournamentMeta.js";

const row = (p: Partial<PbaTourRow>): PbaTourRow => ({
    tourCode: 240, season: 2025, league: "PBA", title: "휴온스 PBA 챔피언십", titleEn: null, startDate: "2025-10-22", endDate: "2025-10-28",
    place: null, totalPrize: null, winnerPrize: null, winnerName: null, winnerMemCode: null, participants: null, officialSeq: null, ...p,
});

describe("pbaEventKey — 같은 대회 묶기(실측 제목)", () => {
    it("연도·시즌 표기와 별칭을 걷어 해마다 같은 열쇠", () => {
        expect(pbaEventKey("하나카드 PBA 챔피언십 2025-26", "PBA")).toBe(pbaEventKey("하나카드 PBA 챔피언십 2024-25", "PBA"));
        expect(pbaEventKey("크라운해태 PBA 챔피언십 2025 한가위", "PBA")).toBe(pbaEventKey("크라운해태 PBA 챔피언십 21-22", "PBA"));
        expect(pbaEventKey("국민의 행복쉼터 하이원리조트 PBA 챔피언십 2025", "PBA")).toBe("하이원리조트챔피언십");
        expect(pbaEventKey("에버콜라겐 LPBA 챔피언십 @태백", "LPBA")).toBe("에버콜라겐챔피언십");
    });
    it("월드챔피언십은 스폰서가 바뀌어도 같은 대회", () => {
        expect(pbaEventKey("SK렌터카 PBA 월드 챔피언십 2022", "PBA")).toBe("월드챔피언십");
        expect(pbaEventKey("하나카드 하나캐피탈 제주특별자치도 PBA 월드챔피언십 2026", "PBA")).toBe("월드챔피언십");
    });
    it("스폰서가 다르면 다른 대회 — 같은 스폰서의 정규 투어와 월드챔피언십도 갈린다", () => {
        expect(pbaEventKey("휴온스 PBA 챔피언십", "PBA")).not.toBe(pbaEventKey("하림 PBA 챔피언십 2025", "PBA"));
        expect(pbaEventKey("하나카드 PBA 챔피언십 2025-26", "PBA")).not.toBe(pbaEventKey("하나카드 하나캐피탈 제주특별자치도 PBA 월드챔피언십 2026", "PBA"));
        expect(pbaEventKey("웰컴저축은행 웰뱅 PBA 챔피언십", "PBA")).not.toBe(pbaEventKey("웰컴저축은행 PBA 챔피언십", "PBA"));
    });
    it("확신 없는 것은 묶지 않는다 — 드림·팀리그·미정 이름·큐스쿨", () => {
        expect(pbaEventKey("2025-2026 PBA 드림투어 3차전", "DREAM")).toBeNull();
        expect(pbaEventKey("웰컴저축은행 PBA 팀리그 2025-2026 - 1라운드", "TEAM")).toBeNull();
        expect(pbaEventKey("PBA 제4차 투어", "PBA")).toBeNull();
        expect(pbaEventKey("2021년 PBA Q-School", "PBA")).toBeNull();
    });
});

describe("umbEventSlug", () => {
    it("월드컵·세계선수권은 종류-도시-날짜", () => {
        expect(umbEventSlug("UMB / CEB World Cup - ANTWERP (BE) 2025-10-12")).toBe("world-cup-antwerp-2025-10-12");
        expect(umbEventSlug("UMB / ACBC World Cup - HO CHI MINH CITY (VN) 2026-05-24")).toBe("world-cup-ho-chi-minh-city-2026-05-24");
        expect(umbEventSlug("UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)")).toBe("world-championship-antwerp-2025-10-18");
        expect(umbEventSlug("UMB World Championships 2025 - 26/28 Sep.2025 - MURCIA (ES)")).toBe("world-championship-murcia-2025-09-28");
        expect(UMB_SLUG_RE.test("world-cup-antwerp-2025-10-12")).toBe(true);
    });
    it("대륙·국가선수권, 날짜 없는 라벨은 페이지가 없다", () => {
        expect(umbEventSlug("Confederal Championships 2024 / 2025 / 2026")).toBeNull();
        expect(umbEventSlug("National Championships 2025 / 2026")).toBeNull();
        expect(umbEventSlug("UMB World Championships 2022 - HEERHUGOWAARD (NL)")).toBeNull();
    });
    it("주니어 대회 이름은 세계선수권에만 — 주니어 표만 남은 월드컵은 그냥 월드컵", () => {
        const wc = { kind: "worldcup" as const, city: "Seoul", date: "2023-11-12", categories: ["juniors" as const] };
        const wch = { kind: "worldchamp" as const, city: "Murcia", date: "2025-09-28", categories: ["juniors" as const] };
        expect(isJuniorEvent(wc)).toBe(false);
        expect(umbEventName(wc)).toBe("2023 서울 3쿠션 월드컵");
        expect(umbEventName(wch)).toBe("2025 무르시아 주니어 3쿠션 세계선수권");
    });
});

describe("표기·상태·주소", () => {
    it("리그 코드", () => {
        expect(pbaLeagueOf("PBA1")).toBe("PBA");
        expect(pbaLeagueOf("LPBA")).toBe("LPBA");
        expect(pbaLeagueOf("PBA2")).toBe("DREAM");
        expect(pbaLeagueOf("PBA3")).toBe("CHALLENGE");
        expect(pbaLeagueOf("TLG")).toBe("TEAM");
        expect(pbaLeagueOf("XYZ")).toBeNull();
    });
    it("날짜 범위", () => {
        expect(dateRangeKo("2025-10-22", "2025-10-28")).toBe("2025년 10월 22일 ~ 28일");
        expect(dateRangeKo("2025-12-29", "2026-01-05")).toBe("2025년 12월 29일 ~ 2026년 1월 5일");
        expect(dateRangeKo("2025-09-30", "2025-10-06")).toBe("2025년 9월 30일 ~ 10월 6일");
        expect(seasonLabelFull(2025)).toBe("2025-26");
    });
    it("상태·색인 — 끝났고 우승자가 있어야 색인", () => {
        const r = row({ winnerName: "김영원" });
        expect(tourStatus(r, "2025-10-21")).toBe("upcoming");
        expect(tourStatus(r, "2025-10-28")).toBe("live");
        expect(tourStatus(r, "2025-10-29")).toBe("finished");
        expect(tourIndexable(r, "2025-10-29")).toBe(true);
        expect(tourIndexable(r, "2025-10-28")).toBe(false);
        expect(tourIndexable(row({}), "2026-01-01")).toBe(false);
    });
    it("제목은 페이지에 있는 것만 — 상금을 모르면 '상금'을 달지 않는다", () => {
        expect(tourTitle(row({ winnerName: "김영원", totalPrize: 250_000_000 }))).toBe("휴온스 PBA 챔피언십 2025-26 우승자·상금·일정 | 랭큐");
        expect(tourTitle(row({ winnerName: "김영원" }))).toBe("휴온스 PBA 챔피언십 2025-26 우승자·일정 | 랭큐");
        expect(tourTitle(row({ winnerPrize: 100_000_000 }))).toBe("휴온스 PBA 챔피언십 2025-26 일정·상금 | 랭큐");
        expect(tourTitle(row({}))).toBe("휴온스 PBA 챔피언십 2025-26 일정 | 랭큐");
    });
    it("대회 JSON-LD — 경로는 홈부터, 장소가 있으면 주소 글도", () => {
        const ld: any = tourJsonLd({ tour: row({ place: "고양 킨텍스" }), today: "2025-11-01", winner: null, history: [], prev: null, next: null });
        const [crumbs, ev] = ld["@graph"];
        expect(crumbs.itemListElement.map((c: any) => c.name)).toEqual(["랭큐", "당구 대회", "2025-26 PBA 투어", "휴온스 PBA 챔피언십"]);
        expect(ev.location).toEqual({ "@type": "Place", name: "고양 킨텍스", address: "고양 킨텍스" });
        const noPlace: any = tourJsonLd({ tour: row({}), today: "2025-11-01", winner: null, history: [], prev: null, next: null });
        expect(noPlace["@graph"][1].location).toBeUndefined();
    });
    it("연도 없는 대회명에만 시즌을 붙인다", () => {
        expect(tourNameWithSeason(row({}))).toBe("휴온스 PBA 챔피언십 2025-26");
        expect(tourNameWithSeason(row({ title: "하림 PBA 챔피언십 2025" }))).toBe("하림 PBA 챔피언십 2025");
    });
    it("주소 조각", () => {
        expect(parseSeasonSeg("2025")).toBe(2025);
        expect(parseSeasonSeg("2018")).toBeNull();
        expect(parseSeasonSeg("25")).toBeNull();
        expect(parseTourCodeSeg("229")).toBe(229);
        expect(parseTourCodeSeg("0")).toBeNull();
        expect(parseTourCodeSeg("22a")).toBeNull();
    });
});
