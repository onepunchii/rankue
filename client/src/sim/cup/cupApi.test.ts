/** 월대회 응답 읽기 · 주소 · 남은 시간(2026-10-12 · 2026-11-03 운영자가 여는 대회 — 경기 시각 · 입장 · 대기실). */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { CUP_PATH, createCupApi, cupErrorCode, cupUrl, parseCupReady, parseCupView, roundSize, timeLeft } from "./cupApi";

const raw = {
    now: "2026-11-01T06:00:00.000Z",
    cup: {
        id: "c1", month: "2026-10", gameType: "3c", status: "running", size: 4, rounds: 2, startsAt: "2026-10-31T15:00:00.000Z", finishedAt: null,
        entries: [{ memberId: "a", seed: 1, rating: 1120, place: null, medal: null, forfeit: false, name: "선수1", country: "KR", tier: "silver" }],
        games: [
            { id: "g1", kind: "main", round: 1, slot: 0, p1Id: "a", p2Id: "b", scheduledAt: "2026-11-02T12:00:00.000Z", p1Ready: true, p2Ready: false, winnerId: null, outcome: null, matchId: null, matchStatus: null },
            { id: "g2", kind: "main", round: 1, slot: 1, p1Id: "c", p2Id: "d", scheduledAt: null, p1Ready: true, p2Ready: true, winnerId: null, outcome: null, matchId: "m9", matchStatus: "playing" },
        ],
        mine: { gameId: "g1", opponentId: "b", waiting: false, scheduledAt: "2026-11-02T12:00:00.000Z", window: "open", iReady: true, opponentReady: false, opponentPresent: true, matchId: null, matchStatus: null },
    },
    next: {
        month: "2026-11", daysLeft: 30, minRating: 1000, minMatches: 5, maxEntrants: 16, enterEarlyMin: 10, noShowMin: 15, size: 0,
        entrants: [{ memberId: "a", seed: 1, rating: 1120, matches: 6, name: "선수1", country: "KR", tier: "silver" }],
        me: { qualified: true, seed: 1, rating: 1120, matches: 6 },
    },
};

describe("월대회 응답 읽기", () => {
    it("대진 · 내 판 · 다음 대회를 그대로 읽는다 — 시각은 ms 로", () => {
        const v = parseCupView(raw);
        expect(v.nowMs).toBe(Date.UTC(2026, 10, 1, 6));
        expect(v.cup).toMatchObject({ id: "c1", month: "2026-10", status: "running", size: 4, rounds: 2 });
        expect(v.cup!.games[0]).toMatchObject({ id: "g1", kind: "main", p1Id: "a", p2Id: "b", scheduledMs: Date.UTC(2026, 10, 2, 12), p1Ready: true, outcome: null, matchId: null });
        // 시각이 없는 판은 null(일정 미정) · 시작된 판은 관전할 대전 id 가 있다
        expect(v.cup!.games[1]).toMatchObject({ scheduledMs: null, matchId: "m9", matchStatus: "playing" });
        expect(v.cup!.mine).toEqual({ gameId: "g1", opponentId: "b", waiting: false, scheduledMs: Date.UTC(2026, 10, 2, 12), window: "open", iReady: true, opponentReady: false, opponentPresent: true, matchId: null, matchStatus: null });
        expect(v.next).toMatchObject({ month: "2026-11", minRating: 1000, minMatches: 5, maxEntrants: 16, enterEarlyMin: 10, noShowMin: 15 });
        expect(v.next.me).toEqual({ qualified: true, seed: 1, rating: 1120, matches: 6 });
        expect(v.next.entrants[0]).toMatchObject({ memberId: "a", seed: 1, rating: 1120, matches: 6, tier: "silver" });
    });

    it("대회가 없거나 답이 깨져도 화면이 그릴 모양을 준다 — 모르는 결과 · 등급은 버린다", () => {
        for (const bad of [null, {}, { cup: null }, { cup: { status: "skipped", id: "x" } }, { cup: { status: "running" } }]) {
            const v = parseCupView(bad);
            expect(v.cup).toBeNull();
            expect(v.next.entrants).toEqual([]);
            expect(v.next.me).toEqual({ qualified: false, seed: null, rating: null, matches: 0 });
        }
        const odd = parseCupView({ ...raw, cup: { ...raw.cup, mine: null, games: [{ ...raw.cup.games[0], outcome: "magic", kind: "third" }, { id: "" }], entries: [{ ...raw.cup.entries[0], tier: "legend", medal: 9 }] } });
        expect(odd.cup!.mine).toBeNull();
        // 모르는 입장 시간은 '일정 미정'으로 읽는다(입장 단추가 열리지 않는다)
        expect(parseCupView({ ...raw, cup: { ...raw.cup, mine: { ...raw.cup.mine, window: "soon" } } }).cup!.mine!.window).toBe("unscheduled");
        expect(odd.cup!.games).toHaveLength(1);
        expect(odd.cup!.games[0]).toMatchObject({ kind: "third", outcome: null });
        expect(odd.cup!.entries[0]).toMatchObject({ tier: null, medal: null });
    });

    it("입장의 답: 판이 열렸다(그 판 id) · 대기실에서 기다린다 — 그 밖은 버린다", () => {
        expect(parseCupReady({ matchId: "m1", state: "playing" })).toEqual({ state: "playing", matchId: "m1" });
        expect(parseCupReady({ matchId: null, state: "waiting", opponentReady: true })).toEqual({ state: "waiting", opponentReady: true });
        expect(parseCupReady({ matchId: "", state: "playing" })).toBeNull();
        // 옛 답(방을 열어 두고 기다리던 때)은 버린다
        expect(parseCupReady({ matchId: "m1", state: "hosting" })).toBeNull();
        expect(parseCupReady({ matchId: "m1", state: "join" })).toBeNull();
        expect(parseCupReady(null)).toBeNull();
    });

    it("주소: 대진 · 입장(진행 중인 판을 기권하고 들어가기는 forfeitPlaying)", async () => {
        expect(CUP_PATH).toBe("/online-game?cup=1");
        expect(cupUrl()).toBe("/api/hiq/sim/cup?gameType=3c");
        const request = vi.fn(async (url: string) => (url.endsWith("/ready") ? { matchId: "m7", state: "playing" } : url.includes("/sim/cup") ? raw : { ok: true }));
        const api = createCupApi(request);
        expect((await api.get()).cup!.id).toBe("c1");
        expect(await api.ready("g 1")).toEqual({ state: "playing", matchId: "m7" });
        expect(request).toHaveBeenCalledWith("/api/hiq/sim/cup/games/g%201/ready", { method: "POST", body: {} });
        await api.ready("g1", { forfeitPlaying: true });
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/cup/games/g1/ready", { method: "POST", body: { forfeitPlaying: true } });
        // 답이 이상하면 던진다 — 화면이 '들어갈 수 없어요'라고 말한다
        await expect(createCupApi(async () => ({})).ready("g1")).rejects.toThrow();
    });

    it("409 의 까닭을 읽는다(err.data.code) — 진행 중인 판 · 아직 입장 시간 전 · 시각 미정 · 지났다", () => {
        expect(cupErrorCode({ data: { code: "HAS_PLAYING" } })).toBe("HAS_PLAYING");
        expect(cupErrorCode({ data: { code: "CUP_EARLY" } })).toBe("CUP_EARLY");
        expect(cupErrorCode(new Error("x"))).toBeNull();
        expect(cupErrorCode(null)).toBeNull();
    });
});

describe("남은 시간 · 라운드", () => {
    it("하루 넘으면 일 · 시간, 아니면 시간 · 분 — 지났으면 없다", () => {
        const H = 3_600_000;
        expect(timeLeft(47 * H, 0)).toEqual({ days: 1, hours: 23, minutes: 0 });
        expect(timeLeft(5 * H + 30 * 60_000, 0)).toEqual({ days: 0, hours: 5, minutes: 30 });
        expect(timeLeft(59_999, 0)).toEqual({ days: 0, hours: 0, minutes: 0 });
        expect(timeLeft(1000, 1000)).toBeNull();
        expect(timeLeft(0, 5)).toBeNull();
    });

    it("그 라운드를 시작할 때 남은 인원 — 16강이면 16 · 8 · 4 · 2", () => {
        expect([1, 2, 3, 4].map((r) => roundSize(r, 4))).toEqual([16, 8, 4, 2]);
        expect([1, 2].map((r) => roundSize(r, 2))).toEqual([4, 2]);
    });
});
