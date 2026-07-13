import { Router } from "express";
import { put } from "@vercel/blob";
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
        nickname: profile?.nickname || member.name
    });
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

export default router;
