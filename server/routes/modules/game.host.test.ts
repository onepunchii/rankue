import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// 점수판은 호스트만(2026-09-27 오너) — 참가자가 점수 저장·종료·버리기를 하면 403. 골프 라운드는 대상 아님.
const HOST = "11111111-1111-1111-1111-111111111111";
const GUEST = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const games: Record<string, any> = {};
const updateHiqGameScore = vi.fn(async () => {});
const finishHiqGame = vi.fn(async (id: string) => ({ ...games[id], status: "finished", winnerId: HOST }));
const discardGame = vi.fn(async () => true);
vi.mock("../../storage/index.js", () => ({
    storage: {
        getHiqGameById: async (id: string) => games[id] ?? null,
        updateHiqGameScore,
        finishHiqGame,
        checkAndUpdateHandicap: async () => null,
        updateGolfStats: async () => null,
        games: { discardGame, consumeInvites: async () => {} },
        tournaments: { detachGame: async () => {}, findMatchByGameId: async () => null, reportResult: async () => {} },
    },
}));
vi.mock("../../services/notificationService.js", () => ({ notificationService: { sendAndSaveNotification: async () => {} } }));
vi.mock("../../services/hiqService.js", () => ({ hiqService: {} }));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./game.js");
    const app = express();
    app.use(express.json());
    // 서명 쿠키 대신 시험용 머리글로 로그인 흉내
    app.use((req: any, _res, next) => { const u = req.headers["x-user"]; req.signedCookies = u ? { hiq_user_id: u } : {}; next(); });
    app.use("/", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => {
    games.g1 = { id: "g1", gameType: "3c", status: "playing_base", player1Id: HOST, player2Id: GUEST, isRanked: true };
    games.golf = { id: "golf", gameType: "golf", status: "playing_base", player1Id: HOST, player2Id: GUEST };
    vi.clearAllMocks();
});

const call = (method: string, path: string, user: string, body?: any) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-user": user }, body: body ? JSON.stringify(body) : undefined });

describe("점수판 호스트 전용", () => {
    it("참가자의 점수 저장·종료·버리기는 403 HOST_ONLY, 아무것도 바뀌지 않는다", async () => {
        for (const [m, p] of [["PATCH", "/game/g1/score"], ["POST", "/game/g1/finish"], ["DELETE", "/game/g1"]] as const) {
            const r = await call(m, p, GUEST, { player1Score: 5, totalInnings: 3 });
            expect(r.status, `${m} ${p}`).toBe(403);
            expect((await r.json()).code).toBe("HOST_ONLY");
        }
        expect(updateHiqGameScore).not.toHaveBeenCalled();
        expect(finishHiqGame).not.toHaveBeenCalled();
        expect(discardGame).not.toHaveBeenCalled();
    });
    it("호스트는 그대로 된다", async () => {
        expect((await call("PATCH", "/game/g1/score", HOST, { player1Score: 5 })).status).toBe(200);
        expect((await call("POST", "/game/g1/finish", HOST, { player1Score: 10, totalInnings: 5, winnerId: HOST })).status).toBe(200);
        expect((await call("DELETE", "/game/g1", HOST)).status).toBe(200);
    });
    it("참가자가 아니면 여전히 notParticipant(403), 로그인 없으면 401", async () => {
        const r = await call("PATCH", "/game/g1/score", OUTSIDER, { player1Score: 1 });
        expect(r.status).toBe(403);
        expect((await r.json()).code).not.toBe("HOST_ONLY");
        expect((await fetch(`${base}/game/g1/score`, { method: "PATCH" })).status).toBe(401);
    });
    it("골프 라운드는 대상이 아니다 — 참가자도 저장 가능(기존 그대로)", async () => {
        expect((await call("PATCH", "/game/golf/score", GUEST, { player1Score: 4 })).status).toBe(200);
    });
});
