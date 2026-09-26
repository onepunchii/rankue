import { describe, it, expect } from "vitest";
import { swapBlockReason, isSeatSwappable, tournamentStatusRank, findMyNextMatch, checkTournamentDates } from "./crewTournamentRules.js";

const m = (id: string, round: number, status: string) => ({ id, round, status });
const A = { matchId: "m1", side: "p1" as const };
const B = { matchId: "m2", side: "p2" as const };

describe("swapBlockReason — 부전승 칸은 막는다", () => {
    it("둘 다 1라운드 ready 면 허용", () => {
        expect(swapBlockReason(m("m1", 1, "ready"), m("m2", 1, "ready"), A, B)).toBeNull();
    });
    it("부전승 칸이 끼면 거절(윗칸에 이미 올라간 자리와 어긋난다)", () => {
        expect(swapBlockReason(m("m1", 1, "bye"), m("m2", 1, "ready"), A, B)).toBe("err.crewTourney.byeSeat");
        expect(swapBlockReason(m("m1", 1, "ready"), m("m2", 1, "bye"), A, B)).toBe("err.crewTourney.byeSeat");
    });
    it("윗 라운드·시작된 경기·같은 자리 거절", () => {
        expect(swapBlockReason(m("m1", 2, "ready"), m("m2", 1, "ready"), A, B)).toBe("err.tournament.firstRoundOnly");
        expect(swapBlockReason(m("m1", 1, "playing"), m("m2", 1, "ready"), A, B)).toBe("err.tournament.seatStarted");
        expect(swapBlockReason(m("m1", 1, "ready"), m("m1", 1, "ready"), A, A)).toBe("err.tournament.sameSeat");
    });
    it("화면 판정도 같은 기준", () => {
        expect(isSeatSwappable(m("x", 1, "ready"))).toBe(true);
        expect(isSeatSwappable(m("x", 1, "bye"))).toBe(false);
        expect(isSeatSwappable(m("x", 2, "ready"))).toBe(false);
    });
});

describe("tournamentStatusRank", () => {
    it("진행중 → 접수중 → 대진 확정 → 종료 → 취소", () => {
        const order = ["ended", "drawn", "canceled", "recruiting", "ongoing"].sort((a, b) => tournamentStatusRank(a) - tournamentStatusRank(b));
        expect(order).toEqual(["ongoing", "recruiting", "drawn", "ended", "canceled"]);
    });
});

describe("findMyNextMatch", () => {
    const base = { slot: 0, p1Id: null as string | null, p2Id: null as string | null };
    it("칠 수 있는 경기가 먼저, 없으면 기다리는 칸", () => {
        const matches = [
            { ...base, id: "r2", round: 2, p1Id: "me", status: "pending" },
            { ...base, id: "r1", round: 1, p1Id: "me", p2Id: "you", status: "ready" },
        ];
        expect(findMyNextMatch(matches, "me")).toEqual({ match: matches[1], waiting: false });
        expect(findMyNextMatch([matches[0]], "me")).toEqual({ match: matches[0], waiting: true });
    });
    it("끝났거나 없으면 null", () => {
        expect(findMyNextMatch([{ ...base, id: "x", round: 1, p1Id: "me", p2Id: "you", status: "done" }], "me")).toBeNull();
        expect(findMyNextMatch([], undefined)).toBeNull();
    });
});

describe("checkTournamentDates", () => {
    const now = Date.UTC(2026, 8, 26);
    it("지난 접수 마감은 새로 정할 때만 거절", () => {
        const past = new Date(now - 3600_000);
        expect(checkTournamentDates({ recruitEnd: past, startAt: null }, now, true)).toBe("recruitEndPast");
        expect(checkTournamentDates({ recruitEnd: past, startAt: null }, now, false)).toBeNull();
    });
    it("시작이 접수 마감보다 앞이면 거절, 틀린 날짜 거절", () => {
        expect(checkTournamentDates({ recruitEnd: new Date(now + 7200_000), startAt: new Date(now + 3600_000) }, now, true)).toBe("startBeforeRecruitEnd");
        expect(checkTournamentDates({ recruitEnd: new Date("x"), startAt: null }, now, true)).toBe("invalid");
    });
});
