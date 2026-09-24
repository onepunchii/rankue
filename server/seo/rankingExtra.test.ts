import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UmbCountryReport, UmbCountrySection, UmbMoveRow, UmbMoversReport, UmbMoversSection } from "../../shared/umbCountryMeta.js";

// 프리렌더·사이트맵·저장소는 DB 를 끌고 온다 — page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 돌려준다
vi.mock("../prerender.js", () => ({
  page: (p: unknown) => JSON.stringify(p),
  esc: (s: unknown) => String(s ?? ""),
  hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));
const umb = vi.hoisted(() => ({
  getCountryReport: vi.fn(), getMoversReport: vi.fn(), getNations: vi.fn(), getLatestEditions: vi.fn(),
}));
vi.mock("../storage/index.js", () => ({ storage: { umb } }));
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db.js", () => ({ db }));

import { renderRankingExtra, rankingExtraSitemapParts } from "./rankingExtra.js";

const ORIGIN = "https://www.rankue.co.kr";
type Parts = { image?: { url: string; width: number; height: number; alt: string }; body: string; title: string; desc: string };
const parts = (html: string) => JSON.parse(html) as Parts;

const mv = (p: Partial<UmbMoveRow>): UmbMoveRow => ({
  playerUmbId: "0000", playerName: "X", nativeName: null, fed: "KR", rank: 1, prevRank: 1, move: 0, points: 100, prevPoints: 100, ...p,
});

const countrySection = (rows: UmbMoveRow[]): UmbCountrySection => ({
  category: "players", edition: "36/2026", date: "2026-09-06", prevEdition: "35/2026", prevDate: "2026-08-30",
  worldTotal: 1353, nationRank: 2, nationCount: 50, top5Points: 1000, total: 12, top100: 3, top300: 8,
  rows, risers: [], fallers: [], newCount: 0,
});

const moversSection = (risers: UmbMoveRow[]): UmbMoversSection => ({
  category: "players", edition: "36/2026", date: "2026-09-06", prevEdition: "35/2026", prevDate: "2026-08-30",
  total: 1353, changed: 400, up: 200, down: 200, same: 900, newCount: 3, outCount: 2,
  risers, fallers: [], entries: [], dropouts: [], kr: { total: 90, up: 33, down: 52, same: 5, newCount: 0, outCount: 0, rows: [] },
});

beforeEach(() => vi.clearAllMocks());

describe("국가 페이지 이미지", () => {
  it("그 나라 최고 순위 선수 카드 — 동순위면 id 가 작은 선수(사이트맵 SQL 과 같은 순서)", async () => {
    const report: UmbCountryReport = {
      fed: "KR",
      sections: [countrySection([mv({ playerUmbId: "2085", rank: 1 }), mv({ playerUmbId: "0364", nativeName: "조명우", playerName: "CHO Myung Woo", rank: 1 }), mv({ playerUmbId: "0101", rank: 7 })])],
      nations: [],
    };
    umb.getCountryReport.mockResolvedValue(report);
    const p = parts((await renderRankingExtra("/world-ranking/country/KR", {}))!.html);
    const card = `${ORIGIN}/og/player/players/0364.png`;
    expect(p.image).toMatchObject({ url: card, width: 1200, height: 1200 });
    expect(p.image!.alt).toContain("조명우");
    expect(p.body).toContain(`<img src="${card}" width="1200" height="1200"`);
  });
});

describe("순위 변동 페이지 이미지", () => {
  it("남자 부문에서 가장 많이 오른 선수 카드", async () => {
    const report: UmbMoversReport = { sections: [moversSection([mv({ playerUmbId: "1666", playerName: "CHRISTOFORIDIS", rank: 294, prevRank: 790, move: 496 })])] };
    umb.getMoversReport.mockResolvedValue(report);
    umb.getNations.mockResolvedValue({ nations: [] });
    const p = parts((await renderRankingExtra("/world-ranking/movers", {}))!.html);
    expect(p.image!.url).toBe(`${ORIGIN}/og/player/players/1666.png`);
    expect(p.image!.alt).toContain("▲496");
    // 상승 목록은 300위 안에서만 뽑으므로 '전체 최대 상승'으로 읽히지 않게 컷을 적는다
    expect(p.image!.alt).toContain("300위 안 최대 상승");
  });
  it("오른 선수가 없으면 이미지 없음(브랜드 og.png)", async () => {
    umb.getMoversReport.mockResolvedValue({ sections: [moversSection([])] });
    umb.getNations.mockResolvedValue({ nations: [] });
    const p = parts((await renderRankingExtra("/world-ranking/movers", {}))!.html);
    expect(p.image).toBeUndefined();
    expect(p.body).not.toContain("<img");
  });
});

describe("사이트맵 image", () => {
  it("순위 변동은 가장 많이 오른 선수, 나라는 남자 최고 순위 선수 카드", async () => {
    umb.getMoversReport.mockResolvedValue({ sections: [moversSection([mv({ playerUmbId: "1666", rank: 294, prevRank: 790, move: 496 })])] });
    umb.getLatestEditions.mockResolvedValue([{ edition: "36/2026", editionDate: new Date("2026-09-06T00:00:00Z") }]);
    umb.getNations.mockResolvedValue({ nations: [{ fed: "KR", players: 90 }, { fed: "JP", players: 20 }, { fed: "XX", players: 3 }] });
    db.execute.mockResolvedValue({ rows: [{ fed: "KR", player_umb_id: "0364" }, { fed: "JP", player_umb_id: "0500" }, { fed: "XX", player_umb_id: "9999" }] });
    const out = (await rankingExtraSitemapParts()).map((s) => JSON.parse(s) as { loc: string; image?: string });
    const at = (path: string) => out.find((e) => e.loc === `${ORIGIN}${path}`);
    expect(at("/world-ranking/movers")?.image).toBe(`${ORIGIN}/og/player/players/1666.png`);
    expect(at("/world-ranking/country/KR")?.image).toBe(`${ORIGIN}/og/player/players/0364.png`);
    expect(at("/world-ranking/country/JP")?.image).toBe(`${ORIGIN}/og/player/players/0500.png`);
    expect(at("/world-ranking/country/XX")).toBeUndefined();
  });
});
