/** 월대회 응답 읽기 · 주소 · 남은 시간(2026-10-12). */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { CUP_PATH, createCupApi, cupUrl, parseCupReady, parseCupView, roundSize, timeLeft } from "./cupApi";

const raw = {
    now: "2026-11-01T06:00:00.000Z",
    cup: {
        id: "c1", month: "2026-10", gameType: "3c", status: "running", size: 4, rounds: 2, startsAt: "2026-10-31T15:00:00.000Z", finishedAt: null,
        entries: [{ memberId: "a", seed: 1, rating: 1120, place: null, medal: null, forfeit: false, name: "선수1", country: "KR", tier: "silver" }],
        games: [{ id: "g1", kind: "main", round: 1, slot: 0, p1Id: "a", p2Id: "b", deadlineAt: "2026-11-02T15:00:00.000Z", p1Ready: true, p2Ready: false, winnerId: null, outcome: null }],
        mine: { gameId: "g1", opponentId: "b", waiting: false, deadlineAt: "2026-11-02T15:00:00.000Z", iReady: true, opponentReady: false, matchId: "m1", matchStatus: "waiting", hosting: true },
    },
    next: {
        month: "2026-11", startsAt: "2026-11-30T15:00:00.000Z", daysLeft: 30, minRating: 1000, minMatches: 5, maxEntrants: 16, roundDays: 2, size: 0,
        entrants: [{ memberId: "a", seed: 1, rating: 1120, matches: 6, name: "선수1", country: "KR", tier: "silver" }],
        me: { qualified: true, seed: 1, rating: 1120, matches: 6 },
    },
};

describe("월대회 응답 읽기", () => {
    it("대진 · 내 판 · 다음 대회를 그대로 읽는다 — 시각은 ms 로", () => {
        const v = parseCupView(raw);
        expect(v.nowMs).toBe(Date.UTC(2026, 10, 1, 6));
        expect(v.cup).toMatchObject({ id: "c1", month: "2026-10", status: "running", size: 4, rounds: 2 });
        expect(v.cup!.games[0]).toMatchObject({ id: "g1", kind: "main", p1Id: "a", p2Id: "b", deadlineMs: Date.UTC(2026, 10, 2, 15), p1Ready: true, outcome: null });
        expect(v.cup!.mine).toMatchObject({ gameId: "g1", opponentId: "b", iReady: true, matchId: "m1", matchStatus: "waiting", hosting: true, deadlineMs: Date.UTC(2026, 10, 2, 15) });
        expect(v.next).toMatchObject({ month: "2026-11", minRating: 1000, minMatches: 5, maxEntrants: 16, roundDays: 2 });
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
        expect(odd.cup!.games).toHaveLength(1);
        expect(odd.cup!.games[0]).toMatchObject({ kind: "third", outcome: null });
        expect(odd.cup!.entries[0]).toMatchObject({ tier: null, medal: null });
    });

    it("기다리기의 답: 치는 중 · 내가 방장 · 들어갈 방 — 그 밖은 버린다", () => {
        expect(parseCupReady({ matchId: "m1", state: "hosting" })).toEqual({ matchId: "m1", state: "hosting" });
        expect(parseCupReady({ matchId: "m1", state: "join" })).toEqual({ matchId: "m1", state: "join" });
        expect(parseCupReady({ matchId: "", state: "playing" })).toBeNull();
        expect(parseCupReady({ matchId: "m1", state: "?" })).toBeNull();
        expect(parseCupReady(null)).toBeNull();
    });

    it("주소: 대진 · 기다리기 · 상대가 연 방에 들어가기(평소의 참가 주소)", async () => {
        expect(CUP_PATH).toBe("/online-game?cup=1");
        expect(cupUrl()).toBe("/api/hiq/sim/cup?gameType=3c");
        const request = vi.fn(async (url: string) => (url.endsWith("/ready") ? { matchId: "m7", state: "join" } : url.includes("/sim/cup") ? raw : { ok: true }));
        const api = createCupApi(request);
        expect((await api.get()).cup!.id).toBe("c1");
        expect(await api.ready("g 1")).toEqual({ matchId: "m7", state: "join" });
        expect(request).toHaveBeenCalledWith("/api/hiq/sim/cup/games/g%201/ready", { method: "POST", body: {} });
        await api.join("m7");
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m7/join", { method: "POST", body: {} });
        // 답이 이상하면 던진다 — 화면이 '들어갈 수 없어요'라고 말한다
        await expect(createCupApi(async () => ({})).ready("g1")).rejects.toThrow();
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
