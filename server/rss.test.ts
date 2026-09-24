import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const umb = vi.hoisted(() => ({ getBriefing: vi.fn() }));
const community = vi.hoisted(() => ({ getPostsForRss: vi.fn() }));
vi.mock("./storage/index.js", () => ({ storage: { umb, community } }));

import { generateRss } from "./rss.js";

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T03:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

describe("RSS — noindex 페이지를 싣지 않는다", () => {
  it("브리핑은 오늘 것 한 건, 링크는 색인되는 /briefing(날짜별 /briefing/:date 는 noindex)", async () => {
    umb.getBriefing.mockResolvedValue({ type: "gap", name: "CHO Myung Woo", nativeName: "조명우", playerUmbId: "0364", rivalName: "CAUDRON Frederic", rivalNativeName: "프레데리크 쿠드롱", gap: 127 });
    community.getPostsForRss.mockResolvedValue([{ id: 7, board: "ask", title: "질문", content: "본문", createdAt: "2026-09-23T10:00:00Z" }]);
    const xml = await generateRss();
    expect(xml).toContain("<link>https://www.rankue.co.kr/briefing</link>");
    expect(xml).not.toMatch(/\/briefing\/\d{4}-\d{2}-\d{2}/);
    expect(xml.match(/<guid[^>]*>briefing-/g)).toHaveLength(1);
    expect(xml).toContain("<guid isPermaLink=\"false\">briefing-2026-09-24</guid>");
    expect(umb.getBriefing).toHaveBeenCalledTimes(1);
    expect(umb.getBriefing).toHaveBeenCalledWith("2026-09-24");
    expect(xml).toContain("<link>https://www.rankue.co.kr/community/7</link>");
  });
  it("오늘 브리핑이 없으면 브리핑 항목 없음(/briefing 이 '없습니다' 페이지라)", async () => {
    umb.getBriefing.mockResolvedValue(null);
    community.getPostsForRss.mockResolvedValue([]);
    const xml = await generateRss();
    expect(xml).not.toContain("/briefing");
  });
});
