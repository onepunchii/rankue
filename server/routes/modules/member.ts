import { Router } from "express";
import { put } from "@vercel/blob";
import { deleteBlobs } from "../../utils/blob.js";
import { storage, getRecentOpponents, searchUsers } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();


// --- Image Upload (Vercel Blob) ---
// Client compresses images to webp first and sends a data URL; we store the binary in
// Vercel Blob and return the public URL. DB rows keep only the URL, never base64.
router.post("/upload", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return sendError(res, 500, "이미지 저장소가 설정되지 않았습니다");
    }
    const { dataUrl, category } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        return sendError(res, 400, "이미지 데이터가 필요합니다");
    }

    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const buffer = Buffer.from(base64, "base64");
    // Guard: compressed webp should be small; reject anything unreasonably large (8MB).
    if (buffer.length === 0) return sendError(res, 400, "빈 이미지입니다");
    if (buffer.length > 8 * 1024 * 1024) return sendError(res, 413, "이미지가 너무 큽니다");

    const safeCat = String(category || "misc").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "misc";
    const { url } = await put(`hiq/${safeCat}/${req.userId}.webp`, buffer, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return sendSuccess(res, { url });
}));


// --- ME Routes ---

// GET /me
router.get("/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    if (!member) return sendError(res, 404, "회원 없음");

    let profile: any = null;
    if (member.profileId) {
        profile = await storage.getProfile(member.profileId);
    }

    return sendSuccess(res, {
        ...member,
        role: profile?.role?.trim() || 'user',
        profileImageUrl: profile?.profileImageUrl,
        nickname: profile?.nickname || member.name,
        handle: profile?.handle ?? null,
        countryCode: profile?.countryCode ?? null
    });
}));

// PATCH /me/handle — @핸들 변경 (유니크·형식 검사. 글로벌 신원의 기본 식별자)
router.patch("/me/handle", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    if (!member?.profileId) return sendError(res, 404, "프로필 없음");

    const { normalizeHandle, isHandleTaken } = await import("../../lib/handle.js");
    const handle = normalizeHandle(String(req.body?.handle ?? ""));
    if (!handle) return sendError(res, 400, "핸들은 영문 소문자·숫자·_ 3~20자여야 합니다 (숫자 시작 불가)");

    const current = await storage.getProfile(member.profileId);
    if (current?.handle === handle) return sendSuccess(res, { handle });
    if (await isHandleTaken(handle)) return sendError(res, 409, "이미 사용 중인 핸들입니다");

    await storage.updateProfile(member.profileId, { handle } as any);
    return sendSuccess(res, { handle });
}));

// GET /handle-check?h=xxx — 가입·변경 UI의 실시간 중복 확인
router.get("/handle-check", asyncHandler(async (req: any, res: any) => {
    const { normalizeHandle, isHandleTaken } = await import("../../lib/handle.js");
    const handle = normalizeHandle(String(req.query?.h ?? ""));
    if (!handle) return sendSuccess(res, { valid: false, available: false });
    return sendSuccess(res, { valid: true, available: !(await isHandleTaken(handle)), handle });
}));

// PATCH /me - Update profile/member info
router.patch("/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    if (!member) return sendError(res, 404, "회원 정보 없음");

    const { profileImageUrl, name, introduction } = req.body;

    if (member.profileId) {
        await storage.updateProfile(member.profileId, {
            profileImageUrl,
            nickname: name
        });
    } else {
        // Self-healing: Create profile if missing
        const newProfile = await storage.createProfile({
            nickname: name || member.name,
            phone: member.phone,
            profileImageUrl,
            role: 'user'
        });
        await storage.updateMember(member.id, { profileId: newProfile.id });
    }

    // Update local member data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (introduction !== undefined) updateData.introduction = introduction;

    if (Object.keys(updateData).length > 0) {
        await storage.updateMember(member.id, updateData);
    }

    return sendSuccess(res, { success: true });
}));

// POST /me/recalculate-avg - Manually recalculate averages
router.post("/me/recalculate-avg", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    await (storage as any)._updateUserAverage(req.userId!, "3c");
    await (storage as any)._updateUserAverage(req.userId!, "4c");
    // Add Golf Stats recalculation
    await storage.updateGolfStats(req.userId!);

    const updatedMember = await storage.getMemberById(req.userId!);
    return sendSuccess(res, {
        success: true,
        avg3c: updatedMember?.avg3c,
        avg4c: updatedMember?.avg4c,
        golfAvgScore: updatedMember?.golfAvgScore,
        golfHandicap: updatedMember?.golfHandicap,
        golfGrade: updatedMember?.golfGrade
    });
}));


// --- Members / Friends Routes ---

// GET /members/:memberId - Get public member info
router.get("/members/:memberId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.params.memberId);
    if (!member) return sendError(res, 404, "회원 없음");
    return sendSuccess(res, member);
}));

// GET /opponents
router.get("/opponents", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    if (!member) return sendError(res, 404, "회원 없음");

    const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
    const opponents = await storage.getAvailableOpponents(member.storeId, member.id, sport);
    return sendSuccess(res, opponents);
}));

// GET /friends
router.get("/friends", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
    const friends = await storage.getFriends(req.userId!, sport);
    return sendSuccess(res, friends);
}));

// POST /friends - Request/Accept friend
router.post("/friends", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { receiverId, targetId, sport } = req.body;
    const finalTargetId = targetId || receiverId; // Handle both for safety
    const sportCategory = sport === "GOLF" ? "GOLF" : "BILLIARDS";
    const result = await storage.requestFriend(req.userId!, finalTargetId, sportCategory);
    return sendSuccess(res, result);
}));

// GET /friends/search
router.get("/friends/search", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const query = (req.query.keyword ?? req.query.q) as string;
    if (!query) return sendSuccess(res, []);
    const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
    const users = await searchUsers(query, req.userId!, sport);
    return sendSuccess(res, users);
}));

// Recent Opponents: Get recent players who aren't friends yet
router.get("/friends/recent-opponents", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
    const opponents = await getRecentOpponents(req.userId!, sport);
    return sendSuccess(res, opponents);
}));

// GET /rankings
router.get("/rankings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const member = await storage.getMemberById(req.userId!);
    const scope = req.query.scope as string; // 'national' | 'store'
    const type = (req.query.type as '3c' | '4c') || '4c';

    // Default to store if not specified
    if (!scope || scope === 'store') {
        const storeId = member?.storeId; // User's store
        const rankings = await storage.getTopRankings(storeId, 20, type);
        return sendSuccess(res, rankings);
    } else {
        const rankings = await storage.getTopRankings(undefined, 20, type);
        return sendSuccess(res, rankings);
    }
}));

// POST /suggestions - Submit a suggestion
router.post("/suggestions", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { type, content, contact } = req.body;

    // Get member to find linked profileId
    const member = await storage.getMemberById(req.userId!);

    const suggestion = await storage.createSuggestion({
        userId: member?.profileId || null,
        type,
        content,
        contact
    });
    return sendSuccess(res, suggestion);
}));

// DELETE /me - 계정 삭제 (App Store 5.1.1(v): 인앱 계정 삭제 필수)
// 개인정보(프로필·전화·비밀번호·푸시토큰·아바타)는 즉시 삭제, 경기 기록은 "탈퇴회원"으로 익명화.
router.delete("/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { profileImageUrl } = await storage.deleteAccount(req.userId!);
    await deleteBlobs(profileImageUrl);
    res.clearCookie('hiq_user_id', { path: '/' });
    res.clearCookie('hiq_partner_auth', { path: '/' });
    return sendSuccess(res, { success: true });
}));

export default router;
