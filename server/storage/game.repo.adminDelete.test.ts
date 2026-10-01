/**
 * 어드민 경기 삭제(adminDeleteFinishedGame)의 종목 가드 — 2026-10-01 감사 4.4.
 * 예전엔 3c 가 아니면 전부 4c 로 봐서, gameType "golf" 판을 지우면 그 회원의 rating4c 를 깎고 avg4c·average 를
 * 골프 타수로 다시 썼다. 당구 판(3c·4c)만 RP·에버리지를 되돌리는지 DB 없이 확인한다(가짜 db 가 호출만 적는다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = vi.hoisted(() => ({ deleted: [] as unknown[], updated: [] as { table: unknown; set: Record<string, unknown> }[] }));
const fakeDb = vi.hoisted(() => {
    const tx = {
        delete: (table: unknown) => ({ where: async () => { calls.deleted.push(table); } }),
        select: () => ({ from: () => ({ where: async () => [{ id: "m", handi3c: 30, handi4c: 30 }] }) }),
        update: (table: unknown) => ({ set: (set: Record<string, unknown>) => ({ where: async () => { calls.updated.push({ table, set }); } }) }),
    };
    return {
        // 대진표 연결 수(count) — 0 이면 지울 수 있다
        select: () => ({ from: () => ({ where: async () => [{ n: 0 }] }) }),
        transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    };
});
vi.mock("../db.js", () => ({ db: fakeDb }));

import { GameRepository } from "./game.repo.js";
import { hiqGameHistory, hiqGames, hiqMembers } from "../../shared/schema.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const stat = (id: string) => ({ id, name: id.slice(0, 1), rating: 100, avg: 0.5, games: 3, wins: 1, highRun: 4 });

function setup(gameType: string, isRanked = true) {
    const repo = new GameRepository();
    vi.spyOn(repo, "getHiqGameById").mockResolvedValue({
        id: "g1", gameType, gameMode: "match", isRanked, winnerId: A, player1Id: A, player2Id: B, player3Id: null, player4Id: null,
        playedAt: new Date("2026-09-30T00:00:00Z"),
    } as any);
    vi.spyOn(repo as any, "_memberStatsFor").mockResolvedValue([stat(A), stat(B)]);
    const recompute = vi.spyOn(repo, "_recomputeUserAverage").mockResolvedValue(undefined);
    return { repo, recompute };
}

beforeEach(() => { calls.deleted.length = 0; calls.updated.length = 0; });

describe("adminDeleteFinishedGame — 종목 가드(감사 4.4)", () => {
    it("골프 판은 전적·경기 행만 지우고 당구 RP·에버리지를 건드리지 않는다", async () => {
        const { repo, recompute } = setup("golf");
        const r = await repo.adminDeleteFinishedGame("g1");
        expect(r.ok).toBe(true);
        expect(calls.deleted).toEqual([hiqGameHistory, hiqGames]);
        expect(calls.updated).toEqual([]); // rating4c 를 깎지 않는다
        expect(recompute).not.toHaveBeenCalled(); // avg4c·average 를 골프 타수로 다시 쓰지 않는다
        if (r.ok) expect(r.members.map((m) => m.rpRolledBack)).toEqual([0, 0]);
    });

    it("알 수 없는 옛 종목 값(예: '3구')도 4c 로 취급하지 않는다", async () => {
        const { repo, recompute } = setup("3구");
        await repo.adminDeleteFinishedGame("g1");
        expect(calls.updated).toEqual([]);
        expect(recompute).not.toHaveBeenCalled();
    });

    it("4구 랭킹전은 그대로 — RP 를 되돌리고 4c 에버리지를 다시 센다", async () => {
        const { repo, recompute } = setup("4c");
        const r = await repo.adminDeleteFinishedGame("g1");
        expect(calls.updated.map((u) => [u.table, Object.keys(u.set)])).toEqual([[hiqMembers, ["rating4c"]], [hiqMembers, ["rating4c"]]]);
        expect(recompute.mock.calls).toEqual([[A, "4c"], [B, "4c"]]);
        // 승자 +30 을 빼고, 핸디 30 패자의 -15 를 되돌린다
        if (r.ok) expect(r.members.map((m) => m.rpRolledBack)).toEqual([-30, 15]);
    });

    it("3쿠션은 rating3c·3c 에버리지", async () => {
        const { repo, recompute } = setup("3c");
        await repo.adminDeleteFinishedGame("g1");
        expect(calls.updated.map((u) => Object.keys(u.set))).toEqual([["rating3c"], ["rating3c"]]);
        expect(recompute.mock.calls).toEqual([[A, "3c"], [B, "3c"]]);
    });

    it("친선전(랭킹 아님)은 RP 는 그대로, 에버리지만 다시 센다", async () => {
        const { repo, recompute } = setup("4c", false);
        await repo.adminDeleteFinishedGame("g1");
        expect(calls.updated).toEqual([]);
        expect(recompute).toHaveBeenCalledTimes(2);
    });
});
