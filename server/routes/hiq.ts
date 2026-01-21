import { Router } from "express";
import { storage, searchUsers, getRecentOpponents } from "../storage/index.js";
import { hiqService } from "../services/hiqService.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { insertHiqMemberSchema } from "../../shared/schema.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

// GET /api/hiq/branding/:slug - Get store branding info
router.get("/branding/:slug", async (req, res) => {
    try {
        const data = await hiqService.getBranding(req.params.slug);
        return sendSuccess(res, data);
    } catch (error: any) {
        return sendError(res, 500, error.message || "브랜딩 실패");
    }
});

// POST /api/hiq/login - Login with phone number
router.post("/login", async (req, res) => {
    try {
        const { phone, storeSlug } = req.body;
        const result = await hiqService.login(phone, storeSlug);

        if (!result.isNew && result.member) {
            res.cookie('hiq_user_id', result.member.id, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/'
            });
        }

        return sendSuccess(res, result);
    } catch (error: any) {
        const status = error.message === "STORE_NOT_FOUND" ? 404 : 500;
        return sendError(res, status, "로그인 중 오류가 발생했습니다.");
    }
});

// POST /api/hiq/register
router.post("/register", async (req, res) => {
    try {
        const validation = insertHiqMemberSchema.safeParse(req.body);
        if (!validation.success) {
            return sendError(res, 400, validation.error.errors[0].message);
        }

        const result = await hiqService.register(validation.data);
        res.cookie('hiq_user_id', result.member.id, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            path: '/'
        });

        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, 500, "회원가입 실패");
    }
});

// 아래 경로들은 로그인이 필요한 영역
router.use(async (req, res, next) => {
    const userId = req.cookies?.hiq_user_id;
    if (!userId) return sendError(res, 401, "로그인이 필요합니다.");
    next();
});

// GET /api/hiq/me
router.get("/me", async (req, res) => {
    const member = await storage.getMemberById(req.cookies.hiq_user_id);
    if (!member) return sendError(res, 404, "회원 없음");
    return sendSuccess(res, member);
});

// GET /api/hiq/members/:memberId - Get public member info
router.get("/members/:memberId", async (req, res) => {
    try {
        const member = await storage.getMemberById(req.params.memberId);
        if (!member) return sendError(res, 404, "회원 없음");
        // Return only public info if needed, but for now full object is fine as it doesn't have sensitive auth data (hashed password is not in type usually, or should be careful)
        // HiqMember usually doesn't have password.
        return sendSuccess(res, member);
    } catch (e) {
        return sendError(res, 500, "회원 조회 실패");
    }
});

// 추가적인 API들은 기존 storage 직접 호출 유지 (점진적 이전)
router.get("/rankings", async (req, res) => {
    const member = await storage.getMemberById(req.cookies.hiq_user_id);
    const scope = req.query.scope as string; // 'national' | 'store'

    // Default to store if not specified
    const targetStoreId = (scope === 'national') ? undefined : member!.storeId;

    const rankings = await storage.getTopRankings(targetStoreId, 20);
    return sendSuccess(res, rankings);
});

router.get("/opponents", async (req, res) => {
    const member = await storage.getMemberById(req.cookies.hiq_user_id);
    const opponents = await storage.getAvailableOpponents(member!.storeId, member!.id);
    return sendSuccess(res, opponents);
});

router.get("/history", async (req, res) => {
    const history = await storage.getMemberGameHistory(req.cookies.hiq_user_id);
    return sendSuccess(res, history);
});

router.get("/stats/analysis", async (req, res) => {
    try {
        const memberId = (req.query.memberId as string) || req.cookies.hiq_user_id;
        const stats = await storage.getMemberStatsAnalysis(memberId);
        return sendSuccess(res, stats);
    } catch (error: any) {
        return sendError(res, 500, "분석 데이터 로드 실패");
    }
});

router.get("/stats/h2h/:id", async (req, res) => {
    try {
        const stats = await storage.getHeadToHeadStats(req.cookies.hiq_user_id, req.params.id);
        return sendSuccess(res, stats);
    } catch (error: any) {
        return sendError(res, 500, "상대 전적 로드 실패");
    }
});

router.get("/game/:id", async (req, res) => {
    try {
        const game = await storage.getHiqGameById(req.params.id);
        if (!game) return sendError(res, 404, "경기를 찾을 수 없습니다");
        return sendSuccess(res, game);
    } catch (error: any) {
        return sendError(res, 500, "경기 정보 로드 실패");
    }
});

// --- Friend Routes ---
router.get("/friends", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const friends = await storage.getFriends(req.cookies.hiq_user_id);
        return sendSuccess(res, friends);
    } catch (error: any) {
        return sendError(res, 500, "친구 목록 로드 실패");
    }
});

router.post("/friends", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const { receiverId } = req.body;
        const result = await storage.createFriendship(req.cookies.hiq_user_id, receiverId);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, 500, "친구 추가 실패");
    }
});

// Smart Search: Search users by nickname, ID, or phone
router.get("/friends/search", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const { keyword } = req.query;
        if (!keyword) return sendError(res, 400, "검색어 필요");

        const results = await searchUsers(
            keyword as string,
            req.cookies.hiq_user_id
        );
        return sendSuccess(res, results);
    } catch (error: any) {
        return sendError(res, 500, "사용자 검색 실패");
    }
});

// Recent Opponents: Get recent players who aren't friends yet
router.get("/friends/recent-opponents", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const opponents = await getRecentOpponents(req.cookies.hiq_user_id);
        return sendSuccess(res, opponents);
    } catch (error: any) {
        return sendError(res, 500, "최근 상대 조회 실패");
    }
});

// --- Invite Routes ---
router.post("/invite", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const code = await storage.createInvite(req.cookies.hiq_user_id);
        return sendSuccess(res, { code });
    } catch (error: any) {
        return sendError(res, 500, "초대 코드 생성 실패");
    }
});

router.get("/invite/:code", async (req, res) => {
    try {
        const invite = await storage.getInviteByCode(req.params.code);
        if (!invite) return sendError(res, 404, "존재하지 않는 코드");
        return sendSuccess(res, invite);
    } catch (error: any) {
        return sendError(res, 500, "초대 조회 실패");
    }
});

router.post("/invite/:code/join", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const success = await storage.joinInvite(req.params.code, req.cookies.hiq_user_id);
        if (!success) return sendError(res, 400, "만료되었거나 유효하지 않은 코드");
        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, "초대 수락 실패");
    }
});

// --- Game Logic: Claim Record ---
router.post("/game/:id/claim", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const { targetSlot } = req.body;

        const success = await storage.claimGameRecord(req.params.id, req.cookies.hiq_user_id, targetSlot);
        if (!success) return sendError(res, 400, "기록 연동 실패 (게임 없음 또는 이미 연동됨)");

        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, "기록 연동 서버 오류");
    }
});

// --- Game Routes ---
router.post("/game/start", async (req, res) => {
    const member = await storage.getMemberById(req.cookies.hiq_user_id);
    const { player2Id, player3Id, player4Id } = req.body;
    // Ranked if at least one other verified member is playing
    const isRanked = !!(player2Id || player3Id || player4Id);

    const game = await storage.startHiqGame({
        ...req.body,
        storeId: member!.storeId,
        isRanked
    });
    return sendSuccess(res, game);
});

router.get("/game/:id", async (req, res) => {
    const game = await storage.getHiqGameById(req.params.id);
    return sendSuccess(res, game);
});

router.patch("/game/:id/score", async (req, res) => {
    await storage.updateHiqGameScore(req.params.id, req.body);
    return sendSuccess(res, { success: true });
});

router.post("/game/:id/finish", async (req, res) => {
    const game = await storage.finishHiqGame(req.params.id, req.body);
    const h1 = await storage.checkAndUpdateHandicap(game.player1Id, game.gameType as any);
    let h2: any = null;
    if (game.player2Id) h2 = await storage.checkAndUpdateHandicap(game.player2Id, game.gameType as any);
    return sendSuccess(res, { game, handicapUpdate1: h1, handicapUpdate2: h2 });
});

// --- AI Simulation Routes (Database-driven) ---
router.post("/successful-shot", async (req, res) => {
    try {
        const shot = await storage.recordSuccessfulShot(req.body);
        return sendSuccess(res, shot);
    } catch (e) {
        return sendError(res, 500, "성공 데이터 기록 실패");
    }
});

router.post("/ai-solutions", async (req, res) => {
    try {
        const { gameType, ballPositions } = req.body;
        const solutions = await storage.searchSuccessfulShots(gameType, ballPositions);
        return sendSuccess(res, solutions);
    } catch (e) {
        return sendError(res, 500, "AI 해법 검색 실패");
    }
});

export default router;
