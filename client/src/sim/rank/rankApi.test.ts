import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { createRankApi, monthlyRankUrl, parseMonthlyRank, parseRankLadder, rankUrl } from "./rankApi";
import { guessCountry, isCountryCode, countryName } from "./country";

describe("rankApi", () => {
    it("URL: 종목·테이블, 나라가 있을 때만 country", () => {
        // 2026-09-12: 대대·중대를 합쳐 tableId 를 안 보낸다(오너 지시).
        expect(rankUrl({ gameType: "3c", country: null })).toBe("/api/hiq/sim/rank?gameType=3c");
        expect(rankUrl({ gameType: "4c", country: "MX" })).toBe("/api/hiq/sim/rank?gameType=4c&country=MX");
    });
    it("파서: 숫자 문자열·잘못된 국가 코드·배치 전 me", () => {
        const l = parseRankLadder({
            rows: [{ memberId: "a", name: "가", country: "KR", rating: "1200", matches: 5, wins: 4, rank: "1", countryRank: 1, dama: "18" }, { name: "no id" }],
            total: "1", countries: [{ country: "KR", players: 1 }, { country: null, players: 2 }, { country: "korea", players: 1 }],
            me: { rating: 1030, matches: 1, wins: 1, country: null, rank: null, countryRank: null },
        });
        expect(l.rows).toEqual([{ memberId: "a", name: "가", country: "KR", rating: 1200, matches: 5, wins: 4, rank: 1, countryRank: 1, dama: 18 }]);
        // 온라인 다마수(2026-10-20) — 양의 정수만, 0 · 음수 · 글자 · 없음은 null(옛 서버 응답도 깨지지 않는다)
        for (const bad of [0, -3, "x", null, undefined, 12.5]) expect(parseRankLadder({ rows: [{ memberId: "a", dama: bad }] }).rows[0].dama).toBeNull();
        expect(l.total).toBe(1);
        expect(l.countries.map((c) => c.country)).toEqual(["KR", null, null]);
        expect(l.me).toEqual({ rating: 1030, matches: 1, wins: 1, country: null, rank: null, countryRank: null });
        expect(parseRankLadder(undefined).me.rating).toBe(1000);
    });
    it("요청: getLadder · setCountry(PATCH /me)", async () => {
        const calls: unknown[] = [];
        const api = createRankApi(async (url, options) => { calls.push([url, options?.method, options?.body]); return { rows: [], total: 0, countries: [], me: {} }; });
        await api.getLadder({ gameType: "3c", country: "KR" });
        await api.setCountry("VN");
        expect(calls).toEqual([["/api/hiq/sim/rank?gameType=3c&country=KR", undefined, undefined], ["/api/hiq/me", "PATCH", { country: "VN" }]]);
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

/** 이달의 랭킹(2026-10-12) — 그 달에 올린 점수. 통산 레이팅과 따로다. */
describe("rankApi: 이달의 랭킹", () => {
    it("URL: 종목, 달은 줄 때만", () => {
        expect(monthlyRankUrl({ gameType: "3c" })).toBe("/api/hiq/sim/rank/monthly?gameType=3c");
        expect(monthlyRankUrl({ gameType: "4c", month: "2026-09" })).toBe("/api/hiq/sim/rank/monthly?gameType=4c&month=2026-09");
    });
    it("파서: 음수 점수 · 모르는 등급 · 깨진 달 · 순위 없는 나", () => {
        const m = parseMonthlyRank({
            month: "2026-10", minMatches: "5", total: 2, players: "6",
            rows: [{ memberId: "a", name: "가", country: "KR", points: "-34", matches: 20, wins: 11, rank: 3, tier: "iron", dama: 21 }, { memberId: "b", name: "나", country: "korea", points: 12, matches: 5, wins: 3, rank: 4, tier: "legend" }, { name: "no id" }],
            me: { points: 24, matches: 3, wins: 3, rank: null, tier: null },
            months: ["2026-10", "2026-09", "2026-13", 7],
        });
        expect(m.rows).toEqual([
            { memberId: "a", name: "가", country: "KR", points: -34, matches: 20, wins: 11, rank: 3, tier: "iron", dama: 21 },
            { memberId: "b", name: "나", country: null, points: 12, matches: 5, wins: 3, rank: 4, tier: null, dama: null },
        ]);
        expect([m.month, m.minMatches, m.total, m.players]).toEqual(["2026-10", 5, 2, 6]);
        expect(m.me).toEqual({ points: 24, matches: 3, wins: 3, rank: null, tier: null });
        expect(m.months).toEqual(["2026-10", "2026-09"]);
        // 깨진 답 — 달은 물어본 달로, 나머지는 빈 값
        expect(parseMonthlyRank(undefined, "2026-10")).toMatchObject({ month: "2026-10", rows: [], total: 0, me: { points: 0, rank: null } });
    });
    it("요청: getMonthly", async () => {
        const calls: string[] = [];
        const api = createRankApi(async (url) => { calls.push(url); return { month: "2026-10", rows: [], me: {} }; });
        await api.getMonthly!({ gameType: "3c", month: "2026-10" });
        expect(calls).toEqual(["/api/hiq/sim/rank/monthly?gameType=3c&month=2026-10"]);
    });
});
