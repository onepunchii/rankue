/**
 * 골프 관리 · 라운드 라우트(2026-10-01) — 되돌릴 수 없는 조치의 문지기만 확인한다(DB 는 가짜).
 *  - 대기방 정리는 dryRun:false 를 똑똑히 보낸 때만 접는다
 *  - 접기는 대기·진행 중만, 무효화는 끝난 라운드만
 *  - 무효화 뒤 공식 라운드가 안 남은 회원(updateGolfStats → null)은 기본값으로 되돌린다
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M1 = "11111111-1111-1111-1111-111111111111";
const M2 = "22222222-2222-2222-2222-222222222222";

const golf = vi.hoisted(() => ({
    getGolfMatchSession: vi.fn(),
    abandonGolfMatchSession: vi.fn(),
    updateGolfStats: vi.fn(),
}));
const rounds = vi.hoisted(() => ({
    listRounds: vi.fn(), roundCounts: vi.fn(), roundDetail: vi.fn(),
    staleWaitingRounds: vi.fn(), abandonStaleWaiting: vi.fn(),
    deleteRoundHistory: vi.fn(), readGolfStats: vi.fn(), resetGolfStatsIfNoOfficial: vi.fn(),
}));
const adminLog = vi.hoisted(() => vi.fn());

vi.mock("../../../db.js", () => ({ db: {} }));
vi.mock("../../../storage/index.js", () => ({ storage: { golf } }));
vi.mock("../../../middleware/adminAuth.js", () => ({ adminLog }));
vi.mock("../../../storage/adminGolfRounds.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...rounds }));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./rounds.js");
    const app = express();
    app.use(express.json());
    app.use("/", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => { vi.clearAllMocks(); });

const post = (path: string, body: unknown = {}) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /cleanup-stale", () => {
    it("dryRun 이 없거나 true 면 미리 보기만 — 아무것도 접지 않는다", async () => {
        rounds.staleWaitingRounds.mockResolvedValue([{ id: ID }]);
        for (const body of [{}, { dryRun: true }, { dryRun: "false" }]) {
            const r = await post("/cleanup-stale", body);
            expect(r.status).toBe(200);
            expect((await r.json()).data).toMatchObject({ dryRun: true, count: 1 });
        }
        expect(rounds.abandonStaleWaiting).not.toHaveBeenCalled();
        expect(adminLog).not.toHaveBeenCalled();
    });
    it("dryRun:false 면 미리 본 방(ids)만 접고 감사 로그를 남긴다", async () => {
        rounds.abandonStaleWaiting.mockResolvedValue([ID]);
        const r = await post("/cleanup-stale", { dryRun: false, ids: [ID] });
        expect((await r.json()).data).toMatchObject({ dryRun: false, count: 1, ids: [ID] });
        expect(rounds.abandonStaleWaiting).toHaveBeenCalledWith([ID]);
        expect(adminLog).toHaveBeenCalledWith(expect.anything(), "golf.round.cleanup-stale", expect.objectContaining({ abandoned: 1 }));
    });
    it("ids 모양이 틀리면 400", async () => {
        expect((await post("/cleanup-stale", { dryRun: false, ids: ["nope"] })).status).toBe(400);
        expect((await post("/cleanup-stale", { dryRun: false, ids: "x" })).status).toBe(400);
        expect(rounds.abandonStaleWaiting).not.toHaveBeenCalled();
    });
});

describe("POST /:id/abandon", () => {
    it("끝난·접은 방은 409 — 저장소를 부르지 않는다", async () => {
        for (const status of ["finished", "abandoned"]) {
            golf.getGolfMatchSession.mockResolvedValue({ id: ID, status, players: [] });
            expect((await post(`/${ID}/abandon`)).status).toBe(409);
        }
        expect(golf.abandonGolfMatchSession).not.toHaveBeenCalled();
    });
    it("진행 중 방은 사용자 '방 접기'와 같은 함수로 접는다", async () => {
        golf.getGolfMatchSession.mockResolvedValue({ id: ID, status: "playing", players: [{ memberId: M1, scores: [4, ...new Array(17).fill(0)] }] });
        golf.abandonGolfMatchSession.mockResolvedValue({ id: ID, status: "abandoned" });
        const r = await post(`/${ID}/abandon`);
        expect((await r.json()).data).toEqual({ id: ID, status: "abandoned", previous: "playing" });
        expect(golf.abandonGolfMatchSession).toHaveBeenCalledWith(ID);
        expect(adminLog).toHaveBeenCalledWith(expect.anything(), "golf.round.abandon", expect.objectContaining({ from: "playing", holesEntered: 1 }));
    });
    it("모양이 틀린 번호·없는 방은 404", async () => {
        expect((await post(`/not-a-uuid/abandon`)).status).toBe(404);
        golf.getGolfMatchSession.mockResolvedValue(null);
        expect((await post(`/${ID}/abandon`)).status).toBe(404);
    });
});

describe("POST /:id/void", () => {
    it("끝나지 않은 라운드는 409", async () => {
        rounds.deleteRoundHistory.mockResolvedValue({ ok: false, reason: "not-finished", status: "playing" });
        expect((await post(`/${ID}/void`)).status).toBe(409);
        expect(golf.updateGolfStats).not.toHaveBeenCalled();
    });
    it("지운 회원마다 평균을 다시 세고, 공식 라운드가 안 남은 회원은 기본값으로 — 전후 값을 돌려준다", async () => {
        const snap = (avg: number | null, rounds: number) => ({ name: "n", avg, best: avg, grade: null, rounds });
        rounds.deleteRoundHistory.mockResolvedValue({
            ok: true, removed: [M1, M2], targets: [M1, M2], deletedRows: 2, detachedPosts: 1,
            before: new Map([[M1, snap(90, 1)], [M2, snap(85, 4)]]),
        });
        golf.updateGolfStats.mockImplementation(async (id: string) => (id === M1 ? null : { avgScore: "84.0" }));
        rounds.resetGolfStatsIfNoOfficial.mockResolvedValue(true);
        rounds.readGolfStats.mockResolvedValue(new Map([[M1, snap(0, 0)], [M2, snap(84, 3)]]));

        const body = (await (await post(`/${ID}/void`)).json()).data;
        expect(rounds.resetGolfStatsIfNoOfficial.mock.calls).toEqual([[M1]]);
        expect(body).toMatchObject({ deletedRows: 2, detachedPosts: 1 });
        expect(body.members).toEqual([
            { id: M1, name: "n", removedRound: true, before: { avg: 90, best: 90, grade: null, rounds: 1 }, after: { avg: 0, best: 0, grade: null, rounds: 0 }, reset: true, error: null },
            { id: M2, name: "n", removedRound: true, before: { avg: 85, best: 85, grade: null, rounds: 4 }, after: { avg: 84, best: 84, grade: null, rounds: 3 }, reset: false, error: null },
        ]);
        expect(adminLog).toHaveBeenCalledWith(expect.anything(), "golf.round.void", expect.objectContaining({ deletedRows: 2, detachedPosts: 1 }));
    });
});
