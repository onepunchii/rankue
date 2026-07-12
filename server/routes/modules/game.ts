import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { hiqService } from "../../services/hiqService.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// --- Store / Branding ---

router.get("/stores/search", asyncHandler(async (req: any, res: any) => {
    const query = req.query.q as string;
    if (!query) return sendSuccess(res, []);
    const stores = await storage.searchStores(query);
    return sendSuccess(res, stores);
}));

router.get("/branding/:slug", asyncHandler(async (req: any, res: any) => {
    const data = await hiqService.getBranding(req.params.slug);
    return sendSuccess(res, data);
}));

// --- Game Routes ---

// GET /game/:id
router.get("/game/:id", asyncHandler(async (req: any, res: any) => {
    const game = await storage.getHiqGameById(req.params.id);
    if (!game) return sendError(res, 404, "경기를 찾을 수 없습니다");

    // Self-healing: If name is missing but ID exists, fetch and update it
    let needsUpdate = false;
    const updates: any = {};

    if (game.player2Id && !game.player2Name) {
        const p2 = await storage.getMemberById(game.player2Id);
        if (p2) {
            game.player2Name = p2.name;
            updates.player2Name = p2.name;
            needsUpdate = true;
        }
    }
    // Check P1 too just in case
    if (game.player1Id && !game.player1Name) {
        const p1 = await storage.getMemberById(game.player1Id);
        if (p1) {
            game.player1Name = p1.name;
            updates.player1Name = p1.name;
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        await storage.updateHiqGameScore(game.id, updates);
    }

    return sendSuccess(res, game);
}));

// POST /game/start
router.post("/game/start", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    const { player2Id, player3Id, player4Id } = req.body;
    // Ranked if at least one other verified member is playing
    const isRanked = !!(player2Id || player3Id || player4Id);

    // Ensure names are populated for all members
    let p1Name = req.body.player1Name;
    let p2Name = req.body.player2Name;
    let p3Name = req.body.player3Name;
    let p4Name = req.body.player4Name;

    // Auto-fill names from DB if IDs are provided and names are missing
    if (req.body.player1Id && !p1Name) {
        const p1 = await storage.getMemberById(req.body.player1Id);
        if (p1) p1Name = p1.name;
    }
    if (player2Id && !p2Name) {
        const p2 = await storage.getMemberById(player2Id);
        if (p2) p2Name = p2.name;
    }
    if (player3Id && !p3Name) {
        const p3 = await storage.getMemberById(player3Id);
        if (p3) p3Name = p3.name;
    }
    if (player4Id && !p4Name) {
        const p4 = await storage.getMemberById(player4Id);
        if (p4) p4Name = p4.name;
    }

    const game = await storage.startHiqGame({
        ...req.body,
        storeId: member!.storeId,
        player1Name: p1Name,
        player2Name: p2Name,
        player3Name: p3Name,
        player4Name: p4Name,
        isRanked
    });
    return sendSuccess(res, game);
}));

// Only a participant of the game may score/finish it.
const assertParticipant = async (gameId: string, userId: string, res: any) => {
    const g = await storage.getHiqGameById(gameId);
    if (!g) { sendError(res, 404, "경기를 찾을 수 없습니다"); return null; }
    const players = [g.player1Id, g.player2Id, g.player3Id, g.player4Id].filter(Boolean);
    if (!players.includes(userId)) { sendError(res, 403, "이 경기의 참가자가 아닙니다"); return null; }
    return g;
};

// PATCH /game/:id/score
router.patch("/game/:id/score", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!(await assertParticipant(req.params.id, req.userId!, res))) return;
    await storage.updateHiqGameScore(req.params.id, req.body);
    return sendSuccess(res, { success: true });
}));

// POST /game/:id/finish
router.post("/game/:id/finish", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!(await assertParticipant(req.params.id, req.userId!, res))) return;
    const game = await storage.finishHiqGame(req.params.id, req.body);

    let handicapUpdate1: any = null;
    let handicapUpdate2: any = null;

    if (game.gameType === "golf") {
        handicapUpdate1 = await storage.updateGolfStats(game.player1Id);
        if (game.player2Id) handicapUpdate2 = await storage.updateGolfStats(game.player2Id);
    } else {
        handicapUpdate1 = await storage.checkAndUpdateHandicap(game.player1Id, game.gameType as any);
        if (game.player2Id) handicapUpdate2 = await storage.checkAndUpdateHandicap(game.player2Id, game.gameType as any);
    }

    return sendSuccess(res, { game, handicapUpdate1, handicapUpdate2 });
}));

// POST /game/:id/claim
router.post("/game/:id/claim", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { targetSlot } = req.body;
    const success = await storage.claimGameRecord(req.params.id, req.userId!, targetSlot);
    if (!success) return sendError(res, 400, "기록 연동 실패 (게임 없음 또는 이미 연동됨)");
    return sendSuccess(res, { success: true });
}));

// GET /games/vs/:opponentId
router.get("/games/vs/:opponentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = req.query.sport as string || "BILLIARDS";
    const games = await storage.getHeadToHeadGames(req.userId!, req.params.opponentId, sport);
    return sendSuccess(res, games);
}));


// --- History & Stats ---

router.get("/history", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = req.query.sport as string;
    const history = await storage.getMemberGameHistory(req.userId!, sport);
    return sendSuccess(res, history);
}));

router.get("/history/:id/detail", asyncHandler(async (req: any, res: any) => {
    const historyId = req.params.id;
    const history = await storage.getGameHistoryById(historyId);

    if (!history) return sendError(res, 404, "기록을 찾을 수 없습니다.");

    let gameData: any = null;

    if (history.gameId) {
        gameData = await storage.getHiqGameById(history.gameId);
    } else if (history.sportCategory === 'GOLF') {
        gameData = await storage.findGolfSessionForHistory(history);
    }

    if (gameData) return sendSuccess(res, gameData);

    return sendError(res, 404, "상세 게임 정보를 찾을 수 없습니다.");
}));

router.get("/stats/analysis", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const memberId = (req.query.memberId as string) || req.userId!;
    const type = (req.query.type as "3c" | "4c") || "4c";
    const stats = await storage.getMemberStatsAnalysis(memberId, type);
    return sendSuccess(res, stats);
}));

router.get("/stats/h2h/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const stats = await storage.getHeadToHeadStats(req.userId!, req.params.id);
    return sendSuccess(res, stats);
}));


// --- AI / Simulation ---

router.post("/successful-shot", asyncHandler(async (req: any, res: any) => {
    const shot = await storage.recordSuccessfulShot(req.body);
    return sendSuccess(res, shot);
}));

router.post("/ai-solutions", asyncHandler(async (req: any, res: any) => {
    const { gameType, ballPositions } = req.body;
    const solutions = await storage.searchSuccessfulShots(gameType, ballPositions);
    return sendSuccess(res, solutions);
}));


// --- Tournaments ---

router.get("/tournaments/active", asyncHandler(async (req: any, res: any) => {
    const storeId = req.query.storeId as string;
    const tournaments = await storage.getActiveTournaments(storeId);
    return sendSuccess(res, tournaments);
}));

router.get("/tournaments/:id", asyncHandler(async (req: any, res: any) => {
    const tournament = await storage.getTournamentById(req.params.id);
    if (!tournament) return sendError(res, 404, "대회 없음");
    return sendSuccess(res, tournament);
}));


// --- Misc / Settlements ---
router.get("/settlements/:id", asyncHandler(async (req: any, res: any) => {
    const settlement = await storage.getSettlement(req.params.id);
    if (!settlement) return sendError(res, 404, "정산 내역 없음");
    return sendSuccess(res, settlement);
}));

// --- Invites ---
router.post("/invite", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const code = await storage.createInvite(req.userId!);
    return sendSuccess(res, { code });
}));

router.get("/invite/:code", asyncHandler(async (req: any, res: any) => {
    const invite = await storage.getInviteStatus(req.params.code);
    if (!invite) return sendError(res, 404, "존재하지 않는 코드");
    return sendSuccess(res, invite);
}));

router.post("/invite/:code/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const success = await storage.joinInvite(req.params.code, req.userId!);
    if (!success) return sendError(res, 400, "만료되었거나 유효하지 않은 코드");
    return sendSuccess(res, { success: true });
}));

export default router;
