import { describe, it, expect, vi } from "vitest";
import { weekIdFor } from "@shared/sim/drills";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import type { SimRatingRow, SimSessionSummary } from "./dashApi";
import { parseSimStats } from "./dashApi";
import {
    availableCombos, drillSeries, drillTotals, matchSummary, pooledAvg, recentForm, sessionSeries, shortDate, signedAvg, weekNumber,
    recordFor, type DashMatchRow } from "./dashStats";

const S = (o: Partial<SimSessionSummary> & { id: string }): SimSessionSummary => ({
    kind: "solo", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, targetScore: 15, inningCap: 0,
    score: 0, innings: 0, highRun: 0, shots: 0, status: "finished", startedAt: "2026-09-01T00:00:00Z", finishedAt: "2026-09-01T00:30:00Z", ...o,
});
const M = (o: Partial<DashMatchRow>): DashMatchRow => ({
    gameType: "3c", tableId: "DAEDAE", status: "finished", myIndex: 0, turn: 0, winnerIndex: 0, createdAt: "2026-09-01T00:00:00Z", finishedAt: "2026-09-01T01:00:00Z", ...o,
});
const R = (o: Partial<SimRatingRow>): SimRatingRow => ({
    gameType: "3c", tableId: "DAEDAE", sessions: 0, totalScore: 0, totalInnings: 0, bestAvg: 0, bestHighRun: 0, simRating: 1000, matches: 0, wins: 0, updatedAt: "2026-09-01T00:00:00Z", ...o,
});
const COMBO = { gameType: "3c", tableId: "DAEDAE" } as const;

describe("dashStats", () => {
    // 2026-09-12: 이닝 0(완료 이닝 없이 한 번에 끝낸 판)도 기록이다 — 오너 제보로 고쳤다. 그 판은 1이닝으로 센다.
    it("세션 시리즈: 마친 솔로만(이닝 0 포함), 같은 종목·테이블만, 오래된 순, limit 은 최근 것", () => {
        const rows = [
            S({ id: "new", score: 10, innings: 10, finishedAt: "2026-09-05T00:00:00Z" }),
            S({ id: "old", score: 5, innings: 10, finishedAt: "2026-09-02T00:00:00Z" }),
            S({ id: "playing", status: "playing", score: 3, innings: 3 }),
            S({ id: "abandoned", status: "abandoned", score: 3, innings: 3 }),
            S({ id: "drill", kind: "drill", score: 3, innings: 3 }),
            S({ id: "zero", innings: 0, finishedAt: "2026-09-01T00:00:00Z" }),
            S({ id: "4c", gameType: "4c", score: 30, innings: 10 }),
            S({ id: "mid", score: 8, innings: 10, finishedAt: "2026-09-03T00:00:00Z" }),
        ];
        expect(sessionSeries(rows, COMBO).map((p) => p.id)).toEqual(["zero", "old", "mid", "new"]);
        expect(sessionSeries(rows, COMBO, 2).map((p) => p.id)).toEqual(["mid", "new"]);
        expect(sessionSeries(rows, COMBO)[1].avg).toBeCloseTo(0.5);
        expect(sessionSeries(rows, { gameType: "4c", tableId: "DAEDAE" }).map((p) => p.id)).toEqual(["4c"]);
        // 4구는 1캐롬 = 10점이라 에버리지를 캐롬으로 읽는다: 30점 / 10이닝 = 3캐롬 / 10이닝 = 0.3
        expect(sessionSeries(rows, { gameType: "4c", tableId: "DAEDAE" })[0].avg).toBeCloseTo(0.3, 10);
    });

    it("최근 흐름: 점수 합 / 이닝 합(세션 평균의 평균이 아니다), 이전 블록이 없으면 delta null", () => {
        const series = sessionSeries([
            S({ id: "a", score: 1, innings: 10, finishedAt: "2026-09-01T00:00:00Z" }), // 0.1
            S({ id: "b", score: 9, innings: 10, finishedAt: "2026-09-02T00:00:00Z" }), // 0.9
            S({ id: "c", score: 30, innings: 20, finishedAt: "2026-09-03T00:00:00Z" }), // 1.5
        ], COMBO);
        expect(pooledAvg(series)).toBeCloseTo(40 / 40);
        const f = recentForm(series, 2);
        expect(f.sessions).toBe(2);
        expect(f.avg).toBeCloseTo(39 / 30);
        expect(f.delta).toBeCloseTo(39 / 30 - 0.1);
        expect(recentForm(series, 10).delta).toBeNull();
        expect(recentForm([], 10)).toEqual({ avg: 0, sessions: 0, delta: null });
    });

    it("대전 요약: 승·패·연속·최근 흐름(오래된 순)·진행 중·내 차례, 승자 없음은 무효, 조합 필터", () => {
        const rows = [
            M({ winnerIndex: 0, finishedAt: "2026-09-01T00:00:00Z" }),              // W
            M({ myIndex: 1, winnerIndex: 0, finishedAt: "2026-09-02T00:00:00Z" }),  // L
            M({ winnerIndex: 0, finishedAt: "2026-09-03T00:00:00Z" }),              // W
            M({ winnerIndex: 0, finishedAt: "2026-09-04T00:00:00Z" }),              // W
            M({ winnerIndex: null }),                                               // 무효
            M({ status: "playing", turn: 0, winnerIndex: null }),                    // 내 차례
            M({ status: "playing", turn: 1, winnerIndex: null }),
            M({ status: "waiting", winnerIndex: null }),
            M({ status: "canceled", winnerIndex: null }),
            M({ gameType: "4c", myIndex: 1, winnerIndex: 0, finishedAt: "2026-09-05T00:00:00Z" }), // 다른 종목 L
        ];
        const s = matchSummary(rows, COMBO, 3);
        expect([s.wins, s.losses, s.active, s.myTurn]).toEqual([3, 1, 3, 1]);
        expect(s.results).toEqual(["L", "W", "W"]);
        expect(s.streak).toEqual({ kind: "W", n: 2 });
        const all = matchSummary(rows, null);
        expect([all.wins, all.losses]).toEqual([3, 2]);
        expect(all.streak).toEqual({ kind: "L", n: 1 });
        expect(matchSummary([], COMBO).streak).toBeNull();
    });

    it("드릴 시리즈: 이번 주로 끝나는 n 주, 빠진 주는 0, 주 번호", () => {
        const now = Date.UTC(2026, 8, 8);
        const thisWeek = weekIdFor(now);
        const lastWeek = weekIdFor(now - 7 * 86_400_000);
        const s = drillSeries([{ weekId: thisWeek, attempts: 5, successes: 3, cushions: 12 }, { weekId: "2020-W01", attempts: 1, successes: 1, cushions: 3 }], now, 4);
        expect(s).toHaveLength(4);
        expect(s[3]).toMatchObject({ weekId: thisWeek, attempts: 5, successes: 3, weekNo: weekNumber(thisWeek) });
        expect(s[2]).toMatchObject({ weekId: lastWeek, attempts: 0, successes: 0 });
        expect(weekNumber("2026-W07")).toBe(7);
        expect(weekNumber("junk")).toBe(0);
        expect(drillTotals([{ weekId: "a", attempts: 5, successes: 3, cushions: 12 }, { weekId: "b", attempts: 2, successes: 0, cushions: 1 }])).toEqual({ attempts: 7, successes: 3, cushions: 13 });
    });

    it("조합 목록: 성적 행·세션·대전을 모두 보고 최근 활동순", () => {
        const combos = availableCombos(
            [R({ gameType: "4c", sessions: 2, updatedAt: "2026-09-01T00:00:00Z" }), R({ gameType: "3c", tableId: "JUNGDAE_KR", sessions: 0, matches: 0 })],
            [S({ id: "s", gameType: "3c", score: 1, innings: 1, finishedAt: "2026-09-03T00:00:00Z" })],
            [M({ gameType: "4c", tableId: "JUNGDAE_KR", status: "playing", winnerIndex: null, createdAt: "2026-09-02T00:00:00Z", finishedAt: null })],
        );
        expect(combos).toEqual([
            { gameType: "3c", tableId: "DAEDAE" },
            { gameType: "4c", tableId: "JUNGDAE_KR" },
            { gameType: "4c", tableId: "DAEDAE" },
        ]);
        expect(availableCombos([], [], [])).toEqual([]);
    });

    it("날짜·부호", () => {
        expect(shortDate(new Date(2026, 8, 8, 12).toISOString())).toBe("9/8");
        expect(shortDate("junk")).toBe("");
        expect(signedAvg(0.051)).toBe("+0.05");
        expect(signedAvg(-0.125)).toBe("-0.13");
        expect(signedAvg(0.001)).toBe("0.00");
    });

    it("parseSimStats: 숫자 문자열·누락 필드를 견딘다", () => {
        const st = parseSimStats({ ratings: [{ gameType: "4c", sessions: "3", bestAvg: "0.5" }], sessions: [{ id: "x", status: "finished", score: "7", innings: "5" }], matchRanks: [{ rank: "2", total: "9", matches: "5" }, { gameType: "4c", rank: null, matches: 1 }], drillWeeks: null, currentWeekId: "2026-W37" });
        expect(st.ratings[0]).toMatchObject({ gameType: "4c", tableId: "DAEDAE", sessions: 3, bestAvg: 0.5, simRating: 1000 });
        expect(st.sessions[0]).toMatchObject({ id: "x", kind: "solo", score: 7, innings: 5, status: "finished" });
        expect(st.matchRanks[0]).toEqual({ gameType: "3c", rank: 2, total: 9, matches: 5 });
        expect(st.matchRanks[1]).toEqual({ gameType: "4c", rank: null, total: 0, matches: 1 });
        expect(st.drillWeeks).toEqual([]);
        expect(parseSimStats(undefined).currentWeekId).toBe("");
    });
});

describe("recordFor — 전적은 서버 집계로(2026-09-16 테스터 제보)", () => {
    const combo = { gameType: "3c", tableId: "DAEDAE" } as const;
    const records = [
        { gameType: "3c", tableId: "DAEDAE", wins: 17, losses: 2, draws: 1, total: 20 },
        { gameType: "4c", tableId: "JUNGDAE_KR", wins: 3, losses: 9, draws: 0, total: 12 },
    ];

    it("조합이 맞는 행을 쓴다 — 목록에서 센 값(흔들리는 값)이 아니라", () => {
        const r = recordFor(records, combo, { wins: 5, losses: 1 });
        expect(r.total).toBe(20);
        expect(r.losses).toBe(2);
    });

    it("무승부는 승에 더한다 — 오너 규칙(둘 다 승)", () => {
        expect(recordFor(records, combo, { wins: 0, losses: 0 }).wins).toBe(18);   // 17 + 무승부 1
    });

    it("종목만 같고 테이블이 다르면 내 행이 아니다", () => {
        const r = recordFor(records, { gameType: "3c", tableId: "JUNGDAE_KR" }, { wins: 4, losses: 6 });
        expect(r).toEqual({ wins: 4, losses: 6, total: 10 });   // 폴백
    });

    it("옛 서버(집계 없음)나 칩 없음이면 목록에서 센 값으로 떨어진다", () => {
        expect(recordFor(undefined, combo, { wins: 2, losses: 3 })).toEqual({ wins: 2, losses: 3, total: 5 });
        expect(recordFor(records, null, { wins: 1, losses: 1 })).toEqual({ wins: 1, losses: 1, total: 2 });
    });
});
