/**
 * 월대회 주소(2026-10-12 오너 "추천대로"). 규칙은 shared/simCup, 읽고 쓰는 것은 storage/simCup.repo, 굴림과 알림은 services/simCupService.
 *
 *  GET  /sim/cup?gameType=3c           대진 화면 — 가장 최근 대회(대진 · 출전자 · 내 판)와 이번 달 '지금 이대로면' 출전권. 열 때 대진을 한 번 굴린다.
 *  POST /sim/cup/games/:id/ready       기다리기 · 입장 — 들어온 것을 적고(기권 판정의 근거), 방이 없으면 내가 방장으로 연다.
 *
 * 대회 판은 **초대 방**이다: 먼저 누른 사람이 방장(비공개 · 그 칸의 상대만 초대 · cup_game_id), 상대는 평소처럼 POST /sim/matches/:id/join.
 * 코드로 들어오는 길도 그 상대만 통과한다(simMatch joinAndStart 의 가드). 조건은 평소의 레이팅 판과 같은 핸디전(CUP_MATCH) —
 * 목표 점수는 들어오는 순간 서버가 두 사람의 온라인 에버리지로 정한다.
 */
import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { PLACEMENT_MATCHES } from "../../../shared/sim/rank.js";
import { CUP_GAMES, CUP_MATCH, CUP_PLAY_GRACE_MS } from "../../../shared/simCup.js";
import { notifyWaiting, rollCups } from "../../services/simCupService.js";
import { createHostMatch } from "./simMatch.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/sim/cup", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 대회를 여는 종목만(지금은 3쿠션) — 다른 종목을 물으면 여는 종목으로 답한다
    const want = req.query.gameType === "4c" ? "4c" as const : "3c" as const;
    const gameType = CUP_GAMES.includes(want) ? want : CUP_GAMES[0];
    // 화면을 열 때 대진을 굴린다 — 끝난 판의 승자 · 기한 지난 판이 바로 반영되게. 실패해도 지금 적힌 대로 보여 준다.
    await rollCups(Date.now()).catch((e: unknown) => console.error("[cup roll]", e));
    return sendSuccess(res, await storage.simCup.view(req.userId!, gameType, Date.now(), PLACEMENT_MATCHES));
}));

router.post("/sim/cup/games/:id/ready", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(String(req.params.id))) return sendError(res, 404, "err.sim.cupGameNotFound");
    const now = Date.now();
    await rollCups(now).catch((e: unknown) => console.error("[cup roll]", e));
    const found = await storage.simCup.game(req.params.id);
    if (!found) return sendError(res, 404, "err.sim.cupGameNotFound");
    const { cup, game } = found;
    const me = req.userId!;
    const side = game.p1Id === me ? "p1" as const : game.p2Id === me ? "p2" as const : null;
    // 남의 판은 '없는 판'으로 답한다 — 대진 칸 id 로 누가 치는지 알아내는 길이 되지 않게
    if (!side) return sendError(res, 404, "err.sim.cupGameNotFound");
    if (cup.status !== "running" || game.outcome) return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");
    const opponentId = side === "p1" ? game.p2Id : game.p1Id;
    if (!opponentId) return sendError(res, 409, "err.sim.cupNoOpponent", "CUP_NO_OPPONENT");

    const info = game.matchId ? (await storage.simMatch.cupMatchInfo([game.matchId])).get(game.matchId) ?? null : null;
    // 기한이 지났는데 치는 중인 판만 조금 더 열려 있다(shared/simCup CUP_PLAY_GRACE_MS) — 그 밖에는 굴림이 곧 결과를 정한다
    if (now >= game.deadlineMs && !(info?.status === "playing" && now < game.deadlineMs + CUP_PLAY_GRACE_MS)) return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");
    await storage.simCup.markReady(game.id, side, now);

    if (info?.status === "playing") return sendSuccess(res, { matchId: game.matchId, state: "playing" });
    if (info?.status === "waiting") return sendSuccess(res, { matchId: game.matchId, state: info.hostId === me ? "hosting" : "join" });

    // 방이 없다(처음이거나, 열어 둔 방이 접혔다) — 내가 방장으로 연다. 목표는 들어올 때 서버가 다시 정하므로 자리만 채운다.
    const made = await createHostMatch(me, {
        gameType: cup.gameType, tableId: CUP_MATCH.tableId, cushionModel: "han2005", condition: 1, finishType: CUP_MATCH.finishType,
        target: cup.gameType === "4c" ? 80 : 15, inningCap: CUP_MATCH.inningCap, aimAssist: CUP_MATCH.aimAssist, fullPreview: CUP_MATCH.fullPreview,
        handicap: CUP_MATCH.handicap, isPublic: false,
    });
    if (!made) return sendError(res, 500, "err.sim.badInput");
    const roomId = made.full.id;
    const bound = await storage.simMatch.bindCup(roomId, me, game.id, opponentId);
    const mine = bound && await storage.simCup.setMatch(game.id, game.matchId, roomId);
    if (!mine) {
        // 그 사이에 상대가 먼저 방을 열었다 — 내 방은 접고 그 방으로 들어간다
        await storage.simMatch.cancel(roomId, me).catch(() => false);
        const again = await storage.simCup.game(game.id);
        if (again?.game.matchId && again.game.matchId !== roomId) return sendSuccess(res, { matchId: again.game.matchId, state: "join" });
        return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");
    }
    await notifyWaiting(opponentId, made.full.hostName ?? "");
    return sendSuccess(res, { matchId: roomId, state: "hosting" });
}));

export default router;
