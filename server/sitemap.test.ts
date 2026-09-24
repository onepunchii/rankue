import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// 섹션 함수들이 끌고 오는 DB·프리렌더는 막는다 — 여기서는 entry() 와 골프 섹션 모양만 본다
const golfRank = vi.hoisted(() => ({ getPlayersForSitemap: vi.fn() }));
vi.mock("./storage/index.js", () => ({ storage: { golfRank } }));
vi.mock("./db.js", () => ({ db: {} }));
vi.mock("./routes/modules/golfCourses.js", () => ({ loadGolfCourseSummary: vi.fn() }));
vi.mock("./seo/rankingExtra.js", () => ({ rankingExtraSitemapParts: vi.fn() }));
vi.mock("./seo/billiardsTerms.js", () => ({ billiardsTermsSitemapParts: vi.fn() }));
vi.mock("./seo/tournaments.js", () => ({ tournamentsSitemapParts: vi.fn() }));
vi.mock("./seo/pbaRecords.js", () => ({ pbaRecordsSitemapParts: vi.fn() }));

import { entry, lastmodDay, generateSitemapSection } from "./sitemap.js";

// 한국 날짜 2026-09-24 오후(UTC 03:00 = KST 12:00)
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T03:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

describe("lastmod 는 오늘(KST)을 넘지 않는다", () => {
  it("미래 날짜(롤렉스 회차 9/28)는 오늘로 자른다", () => {
    expect(lastmodDay("2026-09-28")).toBe("2026-09-24");
    expect(lastmodDay(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-24");
    expect(entry("https://www.rankue.co.kr/golfer/rolex/1", { lastmod: "2026-09-28" })).toContain("<lastmod>2026-09-24</lastmod>");
  });
  it("지난 날짜와 오늘은 그대로", () => {
    expect(lastmodDay("2026-09-06")).toBe("2026-09-06");
    expect(lastmodDay("2026-09-24")).toBe("2026-09-24");
  });
  it("lastmod 가 없으면 태그도 없다", () => {
    expect(entry("https://www.rankue.co.kr/x", { lastmod: null })).not.toContain("<lastmod>");
  });
});

describe("골프 랭킹 hreflang — 실제로 서빙하는 en 만", () => {
  it("vi·tr·es 대체 URL 을 선언하지 않는다", async () => {
    golfRank.getPlayersForSitemap.mockResolvedValue([{ tour: "rolex", playerId: "6892", lastmod: new Date("2026-09-28T00:00:00Z") }]);
    const xml = await generateSitemapSection("golf");
    expect(xml).toContain('hreflang="en" href="https://www.rankue.co.kr/golf-ranking?lang=en"');
    for (const l of ["vi", "tr", "es"]) expect(xml).not.toContain(`lang=${l}`);
    expect(xml).not.toContain("2026-09-28");
  });
});
