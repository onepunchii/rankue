import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PbaTourPage, PbaTourRow, UmbEventDetail } from "../../shared/tournamentMeta.js";

// 프리렌더·사이트맵·저장소는 DB 를 끌고 온다 — 모양만 확인하려고 page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 돌려준다
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? ""),
    hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));
const repo = vi.hoisted(() => ({
    getPbaTourPage: vi.fn(), getUmbEventDetail: vi.fn(), allPbaRows: vi.fn(), getUmbEvents: vi.fn(), getUmbEventDates: vi.fn(),
    getHub: vi.fn(), getPbaSeasonPage: vi.fn(),
}));
vi.mock("../storage/tournaments.repo.js", () => ({ tournamentsRepo: repo }));

import { renderTournaments, tournamentsSitemapParts, umbEventRange, umbSportsEvent } from "./tournaments.js";

const ORIGIN = "https://www.rankue.co.kr";
type Parts = { image?: { url: string; width: number; height: number; alt: string }; jsonLd: Array<{ "@graph": Array<Record<string, any>> }>; body: string };
const parts = (html: string) => JSON.parse(html) as Parts;
const eventNode = (p: Parts) => p.jsonLd[0]["@graph"].find((n) => n["@type"] === "SportsEvent");

const tourRow = (p: Partial<PbaTourRow> = {}): PbaTourRow => ({
    tourCode: 229, season: 2025, league: "PBA", title: "우리금융캐피탈 PBA 챔피언십 2025", titleEn: null,
    startDate: "2025-06-17", endDate: "2025-06-23", place: "고양 킨텍스 PBA 스타디움", totalPrize: null, winnerPrize: null,
    winnerName: "산체스", winnerMemCode: "M0016551", participants: null, officialSeq: null, ...p,
});
const tourPage = (winner: boolean): PbaTourPage => ({
    tour: tourRow(winner ? {} : { winnerName: null, winnerMemCode: null }),
    today: "2026-09-24",
    winner: winner ? {
        memCode: "M0016551", league: "PBA", nameKo: "산체스", nameEn: "Daniel Sanchez", nationCode: "ES",
        average: null, highRun: null, bankShotRate: null, win: null, lose: null, draw: null, careerPrize: null,
    } : null,
    history: [], prev: null, next: null,
});

const rows = [
    { playerUmbId: "0364", playerName: "CHO Myung Woo", nativeName: "조명우", fed: "KR", points: 80 },
    { playerUmbId: "0101", playerName: "JASPERS Dick", nativeName: null, fed: "NL", points: 54 },
];
const umbDetail = (p: Partial<UmbEventDetail> & { label: string }): UmbEventDetail => {
    const { label, ...rest } = p;
    return {
        slug: "world-championship-antwerp-2025-10-18", kind: "worldchamp", org: "UMB", city: "Antwerp", country: "BE", date: "2025-10-18",
        categories: ["players"], players: 20,
        sections: [{ category: "players", edition: "38/2025", editionDate: "2025-10-20", label, rows }],
        others: [], ...rest,
    };
};

beforeEach(() => vi.clearAllMocks());

describe("umbEventRange — 라벨에 적힌 기간만", () => {
    it("세계선수권 'd/d Mon. yyyy' 는 시작·끝날", () => {
        expect(umbEventRange(["UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)"], "2025-10-18")).toEqual({ startDate: "2025-10-14", endDate: "2025-10-18" });
        expect(umbEventRange(["UMB World Championships 2025 - 26/28 Sep.2025 - MURCIA (ES)"], "2025-09-28")).toEqual({ startDate: "2025-09-26", endDate: "2025-09-28" });
    });
    it("달을 넘는 기간은 시작이 앞 달", () => {
        expect(umbEventRange(["UMB World Championship - 30/03 Nov. 2025 - X (BE)"], "2025-11-03")).toEqual({ startDate: "2025-10-30", endDate: "2025-11-03" });
    });
    it("월드컵 라벨(날짜 하나 = 마지막 날)은 시작일을 모른다 → null", () => {
        expect(umbEventRange(["UMB / CEB World Cup - LIER (BE) 2026-09-06"], "2026-09-06")).toBeNull();
    });
    it("끝날이 페이지 대회일과 다르면 믿지 않는다", () => {
        expect(umbEventRange(["UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)"], "2025-10-19")).toBeNull();
    });
});

describe("PBA 대회 페이지 이미지", () => {
    it("우승자가 선수와 맞으면 우승자 카드가 og:image·본문·SportsEvent.image", async () => {
        repo.getPbaTourPage.mockResolvedValue(tourPage(true));
        const r = await renderTournaments("/tournaments/pba/2025/229", {});
        const p = parts(r!.html);
        const card = `${ORIGIN}/og/pba-player/M0016551.png`;
        expect(p.image).toMatchObject({ url: card, width: 1200, height: 1200 });
        expect(p.image!.alt).toContain("산체스");
        expect(p.body).toContain(`<img src="${card}" width="1200" height="1200"`);
        const ev = eventNode(p)!;
        expect(ev.image).toEqual([card]);
        // 공식 장소 표기는 그대로(지어낸 주소 없음)
        expect(ev.location).toEqual({ "@type": "Place", name: "고양 킨텍스 PBA 스타디움", address: "고양 킨텍스 PBA 스타디움" });
    });
    it("우승자가 없으면 이미지 없음(브랜드 og.png 로 떨어진다)", async () => {
        repo.getPbaTourPage.mockResolvedValue(tourPage(false));
        const p = parts((await renderTournaments("/tournaments/pba/2025/229", {}))!.html);
        expect(p.image).toBeUndefined();
        expect(p.body).not.toContain("<img");
        expect(eventNode(p)!.image).toBeUndefined();
    });
});

describe("UMB 대회 페이지 이미지·SportsEvent", () => {
    it("세계선수권 — 최다 포인트 선수 카드 + 라벨 기간·도시·국가로 만든 SportsEvent", async () => {
        repo.getUmbEventDetail.mockResolvedValue(umbDetail({ label: "UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)" }));
        const p = parts((await renderTournaments("/tournaments/umb/world-championship-antwerp-2025-10-18", {}))!.html);
        const card = `${ORIGIN}/og/player/players/0364.png`;
        expect(p.image).toMatchObject({ url: card, width: 1200, height: 1200 });
        expect(p.image!.alt).toContain("조명우");
        expect(p.body).toContain(`<img src="${card}"`);
        const ev = eventNode(p)!;
        expect(ev).toMatchObject({
            startDate: "2025-10-14", endDate: "2025-10-18", image: [card],
            location: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Antwerp", addressCountry: "BE" } },
            organizer: { "@type": "Organization", name: "UMB" },
        });
    });
    it("월드컵 — 카드는 걸지만 시작일을 몰라 SportsEvent 는 싣지 않는다", async () => {
        repo.getUmbEventDetail.mockResolvedValue(umbDetail({
            label: "UMB / CEB World Cup - LIER (BE) 2026-09-06",
            slug: "world-cup-lier-2026-09-06", kind: "worldcup", org: "CEB", city: "Lier", date: "2026-09-06",
        }));
        const p = parts((await renderTournaments("/tournaments/umb/world-cup-lier-2026-09-06", {}))!.html);
        expect(p.image!.url).toBe(`${ORIGIN}/og/player/players/0364.png`);
        expect(eventNode(p)).toBeUndefined();
    });
    it("umbSportsEvent 는 이미지가 없으면 image 를 빼고, 월드컵이면 null", () => {
        const wc = umbDetail({ label: "UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)" });
        expect(umbSportsEvent(wc, null)).not.toHaveProperty("image");
        expect(umbSportsEvent(umbDetail({ label: "UMB / CEB World Cup - LIER (BE) 2026-09-06", kind: "worldcup", date: "2026-09-06" }), null)).toBeNull();
    });
});

describe("사이트맵 image", () => {
    it("PBA 대회는 우승자 카드, UMB 대회는 페이지와 같은 대표 선수 카드", async () => {
        repo.allPbaRows.mockResolvedValue([tourRow(), tourRow({ tourCode: 230, winnerName: "누구", winnerMemCode: null })]);
        repo.getUmbEvents.mockResolvedValue([{ slug: "world-cup-lier-2026-09-06", kind: "worldcup", org: "CEB", city: "Lier", country: "BE", date: "2026-09-06", categories: ["players"], players: 20 }]);
        repo.getUmbEventDates.mockResolvedValue(new Map([["world-cup-lier-2026-09-06", "2026-09-07"]]));
        repo.getUmbEventDetail.mockResolvedValue(umbDetail({ label: "UMB / CEB World Cup - LIER (BE) 2026-09-06", slug: "world-cup-lier-2026-09-06", kind: "worldcup", date: "2026-09-06" }));
        const out = (await tournamentsSitemapParts()).map((s) => JSON.parse(s) as { loc: string; image?: string });
        const at = (path: string) => out.find((e) => e.loc === `${ORIGIN}${path}`);
        expect(at("/tournaments/pba/2025/229")?.image).toBe(`${ORIGIN}/og/pba-player/M0016551.png`);
        expect(at("/tournaments/pba/2025/230")).toBeDefined();
        expect(at("/tournaments/pba/2025/230")!.image).toBeUndefined();
        expect(at("/tournaments/umb/world-cup-lier-2026-09-06")?.image).toBe(`${ORIGIN}/og/player/players/0364.png`);
    });
});
