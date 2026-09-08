import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { createRankApi, parseRankLadder, rankUrl } from "./rankApi";
import { guessCountry, isCountryCode, countryName } from "./country";

describe("rankApi", () => {
    it("URL: 종목·테이블, 나라가 있을 때만 country", () => {
        expect(rankUrl({ gameType: "3c", tableId: "DAEDAE", country: null })).toBe("/api/hiq/sim/rank?gameType=3c&tableId=DAEDAE");
        expect(rankUrl({ gameType: "4c", tableId: "JUNGDAE_KR", country: "MX" })).toBe("/api/hiq/sim/rank?gameType=4c&tableId=JUNGDAE_KR&country=MX");
    });
    it("파서: 숫자 문자열·잘못된 국가 코드·배치 전 me", () => {
        const l = parseRankLadder({
            rows: [{ memberId: "a", name: "가", country: "KR", rating: "1200", matches: 5, wins: 4, rank: "1", countryRank: 1 }, { name: "no id" }],
            total: "1", countries: [{ country: "KR", players: 1 }, { country: null, players: 2 }, { country: "korea", players: 1 }],
            me: { rating: 1030, matches: 1, wins: 1, country: null, rank: null, countryRank: null },
        });
        expect(l.rows).toEqual([{ memberId: "a", name: "가", country: "KR", rating: 1200, matches: 5, wins: 4, rank: 1, countryRank: 1 }]);
        expect(l.total).toBe(1);
        expect(l.countries.map((c) => c.country)).toEqual(["KR", null, null]);
        expect(l.me).toEqual({ rating: 1030, matches: 1, wins: 1, country: null, rank: null, countryRank: null });
        expect(parseRankLadder(undefined).me.rating).toBe(1000);
    });
    it("요청: getLadder · setCountry(PATCH /me)", async () => {
        const calls: unknown[] = [];
        const api = createRankApi(async (url, options) => { calls.push([url, options?.method, options?.body]); return { rows: [], total: 0, countries: [], me: {} }; });
        await api.getLadder({ gameType: "3c", tableId: "DAEDAE", country: "KR" });
        await api.setCountry("VN");
        expect(calls).toEqual([["/api/hiq/sim/rank?gameType=3c&tableId=DAEDAE&country=KR", undefined, undefined], ["/api/hiq/me", "PATCH", { country: "VN" }]]);
    });
    it("국가: 언어 태그에서 지역, 코드 검사, 이름", () => {
        expect(guessCountry("es-MX")).toBe("MX");
        expect(guessCountry("ko-KR")).toBe("KR");
        expect(guessCountry("zh-Hant-TW")).toBe("TW");
        expect(guessCountry("en")).toBeNull();
        expect(guessCountry("")).toBeNull();
        expect(isCountryCode("KR")).toBe(true);
        expect(isCountryCode("kr")).toBe(false);
        expect(countryName("KR", "ko")).toBe("대한민국");
        expect(countryName(null, "ko")).toBe("");
    });
});
