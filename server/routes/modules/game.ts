import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { insertHiqSuccessfulShotSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { hiqService } from "../../services/hiqService.js";
import { notificationService } from "../../services/notificationService.js";
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

// 공개 매장 디렉토리 (매장찾기) — 인증 불필요, 표시용 필드만 반환
router.get("/public-stores", asyncHandler(async (_req: any, res: any) => {
    const stores = await storage.getPublicStores();
    return sendSuccess(res, stores);
}));

router.get("/public-stores/:slug", asyncHandler(async (req: any, res: any) => {
    const store = await storage.getPublicStoreBySlug(req.params.slug);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다");
    return sendSuccess(res, store);
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
    if (!member) return sendError(res, 404, "회원 정보를 찾을 수 없습니다");

    // The creator ALWAYS occupies player slot 1, forced from the session — never trust a
    // body-supplied player1Id (which would let an attacker fabricate ranked games "for"
    // another member and manipulate their rating/history).
    const player1Id = req.userId!;

    // Consent gate: bind a member to slots 2-4 ONLY if they accepted an invite from this
    // host (the real join flow, see joinInvite / getConsentedGuestIds). Any player{N}Id
    // that is not a consented guest is demoted to a name-only guest slot, so finishHiqGame
    // never applies RP / handicap / history rows to a non-consenting member.
    const consented = await storage.games.getConsentedGuestIds(player1Id);

    // A member id the client supplied that has NOT consented is a hard error, not something to
    // silently drop: nulling it out produced a game with no opponent at all (empty slot, solo
    // unranked scoreboard) and the host had no idea why. Fail loudly so they can re-issue a PIN.
    for (const raw of [req.body.player2Id, req.body.player3Id, req.body.player4Id]) {
        if (raw && !consented.has(raw)) {
            return sendError(res, 400, "상대의 참가 확인이 만료되었습니다. 새 핀으로 다시 참가해주세요.");
        }
    }

    const gateId = (id: any): string | null => (id && consented.has(id)) ? id : null;
    const player2Id = gateId(req.body.player2Id);
    const player3Id = gateId(req.body.player3Id);
    const player4Id = gateId(req.body.player4Id);

    // Ranked only if at least one CONSENTED verified member is playing.
    const isRanked = !!(player2Id || player3Id || player4Id);

    // Resolve display names. For a bound member, prefer the DB name; for a demoted or
    // guest slot, keep the client-supplied name.
    const resolveName = async (id: string | null, provided: any): Promise<any> => {
        if (id) {
            if (provided) return provided;
            const m = await storage.getMemberById(id);
            return m?.name;
        }
        return provided;
    };

    const p1Name = req.body.player1Name || member.name;
    const p2Name = await resolveName(player2Id, req.body.player2Name);
    const p3Name = await resolveName(player3Id, req.body.player3Name);
    const p4Name = await resolveName(player4Id, req.body.player4Name);

    // Whitelist the start body. `status`, `isRanked`, `storeId` and every player{N}Id are
    // server-owned; spreading the raw body let a client declare its own isRanked/status and
    // inject arbitrary hiq_games columns.
    const START_EDITABLE = [
        "gameMode", "gameType", "sportCategory",
        "player1Target", "player2Target", "player3Target", "player4Target",
        "ruleFinishType", "finishTargetCount", "usePbaRule", "targetScore",
    ] as const;
    const startData: any = {};
    for (const key of START_EDITABLE) {
        if (req.body?.[key] !== undefined) startData[key] = req.body[key];
    }

    // Sanity-bound the handicap targets so a malformed/hostile body can't produce a game that
    // is instantly won (target 0 — see the client's `target > 0` win guard) or unwinnable.
    for (const k of ["player1Target", "player2Target", "player3Target", "player4Target", "targetScore"]) {
        if (startData[k] !== undefined) {
            const n = Number(startData[k]);
            startData[k] = Number.isFinite(n) ? Math.min(999, Math.max(0, Math.round(n))) : 0;
        }
    }

    const game = await storage.startHiqGame({
        ...startData,
        status: "playing_base",
        storeId: member.storeId,
        player1Id,
        player2Id,
        player3Id,
        player4Id,
        player1Name: p1Name,
        player2Name: p2Name,
        player3Name: p3Name,
        player4Name: p4Name,
        isRanked
    });

    // NOTE: the invite is deliberately NOT consumed here. Consuming it at start meant a retry
    // after a dropped response (or an app backgrounding) hit an already-expired invite, and the
    // opponent silently vanished from the retried game. Consumption happens at FINISH instead —
    // one PIN still yields at most one completed ranked game, but starts stay retry-safe.
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

    // Whitelist only score/inning/high-run columns. Never let a participant set winnerId,
    // isRanked, playerNId (slot reassignment), playerNTarget, storeId, or status:'finished'
    // through this direct-write path — finishHiqGame owns the history/rating flow.
    const ALLOWED_KEYS = [
        "player1Score", "player2Score", "player3Score", "player4Score",
        "player1Innings", "player2Innings", "player3Innings", "player4Innings",
        "player1HighRun", "player2HighRun", "player3HighRun", "player4HighRun",
        "totalInnings",
    ];
    const updateData: any = {};
    for (const key of ALLOWED_KEYS) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }
    // status may only move within the in-progress states; 'finished' must go via /finish.
    if (req.body.status === "playing_base" || req.body.status === "playing_finish") {
        updateData.status = req.body.status;
    }

    await storage.updateHiqGameScore(req.params.id, updateData);
    return sendSuccess(res, { success: true });
}));

// Columns a participant may submit when finishing a game. Everything else — most importantly
// player{N}Id, isRanked, gameMode, status, targets — is server-owned. Spreading the raw body
// here previously let a participant rewrite player2Id/winnerId at finish time and bypass the
// start-time consent gate entirely.
const FINISH_EDITABLE = [
    "player1Score", "player2Score", "player3Score", "player4Score",
    "player1HighRun", "player2HighRun", "player3HighRun", "player4HighRun",
    "player1Innings", "player2Innings", "player3Innings", "player4Innings",
    "totalInnings", "winnerId",
] as const;

// POST /game/:id/finish
router.post("/game/:id/finish", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!(await assertParticipant(req.params.id, req.userId!, res))) return;

    const finalData: any = {};
    for (const key of FINISH_EDITABLE) {
        if (req.body?.[key] !== undefined) finalData[key] = req.body[key];
    }

    const game = await storage.finishHiqGame(req.params.id, finalData);

    // Anti-farm: a COMPLETED ranked game consumes the invites it was built from, so one PIN
    // yields at most one ranked result. (Doing this at start instead made retries lose the
    // opponent.) finishHiqGame is idempotent, so a repeat finish won't double-consume anything.
    if (game.isRanked) {
        const boundGuests = [game.player2Id, game.player3Id, game.player4Id]
            .filter((x): x is string => !!x);
        await storage.games.consumeInvites(game.player1Id, boundGuests);
    }

    // Recheck handicaps for EVERY bound member slot — slots 3 and 4 were previously skipped,
    // so members in those slots never had their handicap updated after a match.
    const boundIds = [game.player1Id, game.player2Id, game.player3Id, game.player4Id]
        .filter((pid): pid is string => !!pid);

    const handicapUpdates = await Promise.all(boundIds.map(pid =>
        game.gameType === "golf"
            ? storage.updateGolfStats(pid)
            : storage.checkAndUpdateHandicap(pid, game.gameType as any)
    ));

    // Keep the existing response shape (the client reads handicapUpdate1 / handicapUpdate2).
    // P0: 경기 종료 → 상대 플레이어들에게 결과 알림
    try {
        const opponentIds = boundIds.filter((id: string) => id !== req.userId);
        for (const oid of opponentIds) {
            notificationService.sendAndSaveNotification({
                memberId: oid,
                title: "🏁 경기 종료",
                body: "경기가 종료되었습니다. 결과를 확인해보세요.",
                category: game?.gameType === "golf" ? "GOLF" : "BILLIARDS",
                type: "MATCH",
                params: { url: `/history/${req.params.id}` },
            }).catch((err: any) => console.error("[GameFinishNotif]", err));
        }
    } catch(e) {}
    return sendSuccess(res, {
        game,
        handicapUpdate1: handicapUpdates[0] ?? null,
        handicapUpdate2: handicapUpdates[1] ?? null,
        handicapUpdates,
    });
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

router.get("/history/:id/detail", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const historyId = req.params.id;
    const history = await storage.getGameHistoryById(historyId);

    if (!history) return sendError(res, 404, "기록을 찾을 수 없습니다.");

    // Ownership: hiqGameHistory has one row per participant (memberId). Only the owner of
    // the history row may read its detail. Return 404 to avoid an id-existence oracle.
    if (history.memberId !== req.userId) return sendError(res, 404, "기록을 찾을 수 없습니다.");

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

// Strict shot payload validation. createInsertSchema types jsonb columns as unknown, so
// insertHiqSuccessfulShotSchema.parse alone accepts garbage jsonb — extend with concrete
// shapes so the AI-solution dataset cannot be poisoned.
const shotCoord = z.object({ x: z.number().finite(), y: z.number().finite() });
const successfulShotSchema = insertHiqSuccessfulShotSchema.extend({
    ballPositions: z.record(z.string(), shotCoord).refine(p => "white" in p, "white ball required"),
    shotParams: z.object({
        angle: z.number().finite(),
        power: z.number().finite(),
        spinX: z.number().finite(),
        spinY: z.number().finite(),
    }),
    cushionCount: z.number().int().min(0).optional(),
});

router.post("/successful-shot", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = successfulShotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "유효하지 않은 샷 데이터입니다");
    const shot = await storage.recordSuccessfulShot(parsed.data as any);
    return sendSuccess(res, shot);
}));

router.post("/ai-solutions", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
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
router.get("/settlements/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const settlement = await storage.getSettlement(req.params.id);
    if (!settlement) return sendError(res, 404, "정산 내역 없음");
    // Only members of the settlement's crew may view it (it leaks bank account + member
    // phone numbers). Mirror the hardened crew-membership gate.
    const membership = await storage.getCrewMembership(settlement.crewId, req.userId!);
    if (!membership || membership.role === "pending") {
        return sendError(res, 403, "크루 멤버만 이용할 수 있습니다");
    }
    return sendSuccess(res, settlement);
}));

// --- Invites ---
router.post("/invite", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const code = await storage.createInvite(req.userId!);
    return sendSuccess(res, { code });
}));

router.get("/invite/:code", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const invite = await storage.getInviteStatus(req.params.code);
    if (!invite) return sendError(res, 404, "존재하지 않는 코드");
    return sendSuccess(res, invite);
}));

router.post("/invite/:code/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const success = await storage.joinInvite(req.params.code, req.userId!);
    if (!success) return sendError(res, 400, "만료되었거나 유효하지 않은 코드");
    // P0: 게스트 참가 수락 → 호스트에게 알림
    try {
        const invite = await storage.getInviteStatus(req.params.code);
        if (invite?.hostId) {
            const guest = await storage.getMemberById(req.userId!);
            notificationService.sendAndSaveNotification({
                memberId: invite.hostId,
                title: "🎯 초대 참가 수락",
                body: guest?.name ? `${guest.name}님이 초대에 응했어요!` : "상대방이 초대에 응했어요!",
                category: "BILLIARDS",
                type: "MATCH",
                params: { url: `/history` },
            }).catch(err => console.error("[InviteAcceptNotif]", err));
        }
    } catch(e) {}
    return sendSuccess(res, { success: true });
}));

export default router;
