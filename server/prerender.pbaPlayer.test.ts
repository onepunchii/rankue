import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// 봇이 받는 PBA 선수 페이지(2026-09-27 개편) — 한 문장 요약·우승·기록 순위·FAQ·ProfilePage 가 화면과 같은 함수로 나가는지
const profile = {
    memCode: "M1", league: "PBA", nameKo: "강민재", nameEn: "Kang Minjae", nationCode: "KR", birthday: "1988-03-10",
    average: 1.582, bankShotRate: 38.2, highRun: 18, win: 82, lose: 50, draw: 3, careerPrize: 423_000_000, umbPlayerId: "1234", umbCategory: "players",
    seasons: [{ season: 2025, league: "PBA", prizeRank: 5, pointRank: 6, prize: 82_000_000, rankingPoint: 34500 }],
    extra: {
        wins: [{ season: 2025, title: "하나카드 PBA 챔피언십 2025-26", startDate: "2025-10-12", winnerPrize: 100_000_000, path: "/tournaments/pba/2025/4" }],
        recordRanks: { average: { rank: 7, of: 208 } }, bench: { average: 1.214, bankShotRate: 29.5, winRate: 0.49, highRunTop: 25 },
        neighbors: { season: 2025, league: "PBA", rows: [{ memCode: "N1", nameKo: "조성우", nameEn: null, nationCode: "KR", prizeRank: 4 }] },
        followers: 12, umbRank: 23, updated: "2026-09-27",
    },
};
vi.mock("./storage/index.js", () => ({
    storage: { pba: { getPlayerProfile: vi.fn(async (code: string) => (code === "M1" ? profile : null)) } },
}));

let base = "";
let server: any;
beforeAll(async () => {
    // 순환 import(prerender ↔ seo/tournaments) — 실제 서버처럼 seo 쪽을 먼저 불러 esc 가 준비된 뒤에 prerender 를 연다
    await import("./seo/tournaments.js");
    const { registerPrerender } = await import("./prerender.js");
    const app = express();
    registerPrerender(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

describe("프리렌더 /pba-player/:memCode", () => {
    it("요약·우승·기록 순위·비슷한 순위·FAQ·ProfilePage", async () => {
        const r = await fetch(`${base}/pba-player/M1`, { headers: { "user-agent": "Googlebot" } });
        expect(r.status).toBe(200);
        const html = await r.text();
        expect(html).toContain("<p>강민재는 PBA 투어 선수로, 통산 상금 4억 2,300만원, 우승 1회, 통산 에버리지 1.582(PBA 7위)를 기록했습니다.</p>");
        expect(html).toContain('<a href="/tournaments/pba/2025/4">하나카드 PBA 챔피언십 2025-26</a>');
        expect(html).toContain("1.582 (PBA 7위, 리그 평균 1.214)");
        expect(html).toContain('<a href="/pba-player/N1">조성우</a>');
        expect(html).toContain("<h3>강민재 선수 에버리지는 얼마인가요?</h3>");
        expect(html).toContain('"@type":"ProfilePage"');
        expect(html).toContain('"dateModified":"2026-09-27"');
        expect(html).toContain("현재 23위");
        expect(html).toContain("우승 1회"); // 설명문에도
    });
    it("없는 선수는 410/404 계열", async () => {
        const r = await fetch(`${base}/pba-player/NOPE`, { headers: { "user-agent": "Googlebot" } });
        expect(r.status).toBeGreaterThanOrEqual(400);
    });
});
