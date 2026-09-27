import { describe, it, expect } from "vitest";
import { pbaAge, pbaPlayerFaq, pbaPlayerLdNodes, pbaPlayerSummary, type PbaPlayerProfile } from "./pbaPlayerProfile";
import { pbaLeagueBench, pbaPlayerRecordRanks, type PbaCareerInput } from "./pbaRecordsMeta";

const base: PbaPlayerProfile = {
    memCode: "M1", league: "PBA", nameKo: "강민재", nameEn: "Kang Minjae", nationCode: "KR", birthday: "1988-03-10",
    average: 1.582, bankShotRate: 38.2, highRun: 18, win: 82, lose: 50, draw: 3, careerPrize: 423_000_000,
    umbPlayerId: null, umbCategory: null, seasons: [{ season: 2025, prizeRank: 5, pointRank: 7, prize: 82_000_000, rankingPoint: 34500 }],
};
const extra = {
    wins: [{ season: 2025, title: "PBA 4차 투어", startDate: "2025-10-12", winnerPrize: 100_000_000, path: "/tournaments/pba/2025/4" }],
    recordRanks: { average: { rank: 7, of: 208 } }, bench: { average: 1.214, bankShotRate: 29.5, winRate: 0.5, highRunTop: 25 },
    neighbors: null, followers: 3, umbRank: null, updated: "2026-09-27",
};
const NOW = Date.parse("2026-09-27T03:00:00Z");

describe("PBA 선수 페이지 — 요약·FAQ·구조화데이터", () => {
    it("한 문장 요약: 값이 있는 것만, 조사도 맞게", () => {
        expect(pbaPlayerSummary({ ...base, extra }, "ko")).toBe("강민재는 PBA 투어 선수로, 통산 상금 4억 2,300만원, 우승 1회, 통산 에버리지 1.582(PBA 7위)를 기록했습니다.");
        expect(pbaPlayerSummary({ ...base, careerPrize: null, average: null }, "ko")).toBe("강민재는 PBA 투어 프로당구 선수입니다.");
        expect(pbaPlayerSummary({ ...base, nameKo: "조재호", average: null, extra: { ...extra, wins: [] } }, "ko")).toBe("조재호는 PBA 투어 선수로, 통산 상금 4억 2,300만원을 기록했습니다.");
        expect(pbaPlayerSummary({ ...base, extra }, "en")).toContain("Kang Minjae is a PBA Tour professional billiards player with");
    });
    it("FAQ: 연봉·에버리지·우승·나이 — 우승이 없으면 그 질문을 빼고, 0회라고 말하지 않는다", () => {
        const f = pbaPlayerFaq({ ...base, extra }, "ko", NOW);
        expect(f.map((x) => x.q)).toEqual(["강민재 선수 연봉은 얼마인가요?", "강민재 선수 에버리지는 얼마인가요?", "강민재 선수는 우승을 몇 번 했나요?", "강민재 선수 나이와 국적은?"]);
        expect(f[1].a).toContain("208명 가운데 7위");
        expect(f[1].a).toContain("리그 평균은 1.214");
        expect(f[3].a).toContain("1988년생(만 38세)");
        const noWin = pbaPlayerFaq({ ...base, extra: { ...extra, wins: [] } }, "ko", NOW);
        expect(noWin.some((x) => x.q.includes("우승"))).toBe(false);
    });
    it("만 나이는 한국 날짜로 — 생일 전날까지는 한 살 적게", () => {
        expect(pbaAge("1988-09-28", NOW)).toBe(37);
        expect(pbaAge("1988-09-27", NOW)).toBe(38);
        expect(pbaAge(null, NOW)).toBeNull();
        expect(pbaAge("bad", NOW)).toBeNull();
    });
    it("구조화데이터: ProfilePage(주인공 Person·수상·갱신일) + FAQPage(화면과 같은 질문)", () => {
        const [profile, faq] = pbaPlayerLdNodes({ ...base, extra }, "ko", "https://x/card.png", NOW) as any[];
        expect(profile["@type"]).toBe("ProfilePage");
        expect(profile.dateModified).toBe("2026-09-27");
        expect(profile.mainEntity.award).toEqual(["PBA 4차 투어"]);
        expect(profile.mainEntity.interactionStatistic.userInteractionCount).toBe(3);
        expect(faq.mainEntity.map((q: any) => q.name)).toEqual(pbaPlayerFaq({ ...base, extra }, "ko", NOW).map((x) => x.q));
    });
});

describe("선수 한 명의 기록 순위·리그 평균", () => {
    const mk = (memCode: string, average: number, games: number, league: "PBA" | "LPBA" = "PBA", highRun = 10): PbaCareerInput => ({
        memCode, league, nameKo: memCode, nameEn: null, nationCode: null, average, bankShotRate: 30, highRun, win: games, lose: 0, draw: 0, careerPrize: 1,
    });
    const rows = [mk("A", 1.5, 40), mk("B", 1.6, 40), mk("C", 1.5, 50), mk("D", 1.9, 5, "PBA", 20), mk("E", 2.0, 60, "LPBA")];
    it("같은 리그, 최소 경기 수, 공동 순위", () => {
        const r = pbaPlayerRecordRanks(rows, "A");
        expect(r.average).toEqual({ rank: 2, of: 3 }); // B 1.6 → 1위, A·C 1.5 공동 2위(D 는 5경기라 빠짐, E 는 다른 리그)
        expect(pbaPlayerRecordRanks(rows, "D").average).toBeUndefined();
        expect(pbaPlayerRecordRanks(rows, "D").highRun).toEqual({ rank: 1, of: 4 }); // 하이런은 경기 수와 상관없이
        expect(pbaPlayerRecordRanks(rows, "zz")).toEqual({});
    });
    it("리그 평균은 자격 선수만, 하이런은 리그 최고", () => {
        const b = pbaLeagueBench(rows, "PBA");
        expect(b.average).toBeCloseTo((1.5 + 1.6 + 1.5) / 3, 6);
        expect(b.highRunTop).toBe(20);
    });
});
