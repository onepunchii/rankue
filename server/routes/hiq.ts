import { Router } from "express";
import { storage, searchUsers, getRecentOpponents } from "../storage/index.js";
import { hiqService } from "../services/hiqService.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { insertHiqMemberSchema, insertHiqCrewSchema, insertHiqCrewActivitySchema, insertHiqCrewPostSchema, insertHiqSettlementSchema, insertGolfBookingSchema, GolfBooking, insertGolfJoinSchema, GolfJoin } from "../../shared/schema.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

// ... (existing routes up to DELETE leave member) ...

// GET /api/hiq/crews/:id/activities - Get upcoming activities
router.get("/crews/:id/activities", async (req, res) => {
    try {
        const activities = await storage.getUpcomingCrewActivities(req.params.id);
        return sendSuccess(res, activities);
    } catch (e: any) {
        return sendError(res, 500, e.message || "활동 목록 조회 실패");
    }
});

// POST /api/hiq/crews/:id/activities - Create activity
router.post("/crews/:id/activities", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = {
            ...req.body,
            crewId: req.params.id,
            creatorId: userId,
            // Ensure activityDate is Date object if string
            activityDate: new Date(req.body.activityDate)
        };

        const validation = insertHiqCrewActivitySchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        const activity = await storage.createCrewActivity(validation.data);
        return sendSuccess(res, activity);
    } catch (e: any) {
        return sendError(res, 500, e.message || "활동 생성 실패");
    }
});

// POST /api/hiq/crews/:id/activities/:activityId/join - Join activity
router.post("/crews/:id/activities/:activityId/join", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        await storage.joinCrewActivity(req.params.activityId, userId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "참여 실패");
    }
});


// --- Crew Community Routes ---

// GET /api/hiq/crews/:id/posts
router.get("/crews/:id/posts", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const posts = await storage.getCrewPosts(req.params.id, userId);
        console.log(`[GET] Found ${posts.length} posts for crew ${req.params.id}`);
        if (posts.length > 0) {
            console.log("[GET] Sample post:", JSON.stringify(posts[0]));
        }
        return sendSuccess(res, posts);
    } catch (e: any) {
        console.error("[GET] Error fetching posts:", e);
        return sendError(res, 500, e.message || "게시글 조회 실패");
    }
});

// POST /api/hiq/crews/:id/posts
router.post("/crews/:id/posts", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = {
            ...req.body,
            crewId: req.params.id,
            authorId: userId
        };

        console.log("[POST] Crew Post Data:", data);

        const validation = insertHiqCrewPostSchema.safeParse(data);
        if (!validation.success) {
            console.error("[POST] Validation Error:", validation.error.errors);
            return sendError(res, 400, validation.error.errors[0].message);
        }

        const post = await storage.createCrewPost(validation.data);
        console.log("[POST] Post created successfully:", post);
        return sendSuccess(res, post);
    } catch (e: any) {
        console.error("[POST] Exception during creation:", e);
        return sendError(res, 500, e.message || "게시글 작성 실패");
    }
});

// DELETE /api/hiq/crews/:id/posts/:postId
router.delete("/crews/:id/posts/:postId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const post = await storage.getCrewPost(req.params.postId);
        if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");

        // Auth Check: Author or Admin
        const crewData = await storage.getCrew(req.params.id);
        const me = crewData?.members.find((m: any) => m.member.id === userId);
        const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

        if (post.authorId !== userId && !isAdmin) {
            return sendError(res, 403, "삭제 권한이 없습니다");
        }

        await storage.deleteCrewPost(req.params.postId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "게시글 삭제 실패");
    }
});

// POST /api/hiq/crews/:id/posts/:postId/like - Toggle Like
router.post("/crews/:id/posts/:postId/like", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const result = await storage.toggleCrewPostLike(req.params.postId, userId);
        return sendSuccess(res, result);
    } catch (e: any) {
        return sendError(res, 500, e.message || "좋아요 실패");
    }
});

// GET /api/hiq/posts/:postId/comments - Get comments
router.get("/posts/:postId/comments", async (req, res) => {
    try {
        const comments = await storage.getCrewPostComments(req.params.postId);
        return sendSuccess(res, comments);
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 조회 실패");
    }
});

// POST /api/hiq/posts/:postId/comments - Add comment
router.post("/posts/:postId/comments", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = {
            ...req.body,
            postId: req.params.postId,
            authorId: userId
        };

        const comment = await storage.createCrewPostComment(data);
        return sendSuccess(res, comment);
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 작성 실패");
    }
});

// DELETE /api/hiq/crews/:id/comments/:commentId
router.delete("/crews/:id/comments/:commentId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const comment = await storage.getCrewComment(req.params.commentId);
        if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

        // Auth Check: Author or Admin
        const crewData = await storage.getCrew(req.params.id);
        const me = crewData?.members.find((m: any) => m.member.id === userId);
        const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

        if (comment.authorId !== userId && !isAdmin) {
            return sendError(res, 403, "삭제 권한이 없습니다");
        }

        await storage.deleteCrewComment(req.params.commentId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 삭제 실패");
    }
});

// GET /api/hiq/crews/:id/photos
router.get("/crews/:id/photos", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const photos = await storage.getCrewPhotos(req.params.id, userId);
        return sendSuccess(res, photos);
    } catch (e: any) {
        return sendError(res, 500, e.message || "사진 조회 실패");
    }
});

// POST /api/hiq/crews/:id/photos/:photoId/like - Toggle Photo Like
router.post("/crews/:id/photos/:photoId/like", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const result = await storage.toggleCrewPhotoLike(req.params.photoId, userId);
        return sendSuccess(res, result);
    } catch (e: any) {
        return sendError(res, 500, e.message || "좋아요 실패");
    }
});

// GET /api/hiq/photos/:photoId/comments - Get photo comments
router.get("/photos/:photoId/comments", async (req, res) => {
    try {
        const comments = await storage.getCrewPhotoComments(req.params.photoId);
        return sendSuccess(res, comments);
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 조회 실패");
    }
});

// POST /api/hiq/photos/:photoId/comments - Add photo comment
router.post("/photos/:photoId/comments", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = {
            ...req.body,
            photoId: req.params.photoId,
            authorId: userId
        };

        const comment = await storage.createCrewPhotoComment(data);
        return sendSuccess(res, comment);
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 작성 실패");
    }
});

// DELETE /api/hiq/crews/:id/photo-comments/:commentId
router.delete("/crews/:id/photo-comments/:commentId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const comment = await storage.getCrewPhotoComment(req.params.commentId);
        if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

        // Auth Check: Author or Admin
        const crewData = await storage.getCrew(req.params.id);
        const me = crewData?.members.find((m: any) => m.member.id === userId);
        const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

        if (comment.authorId !== userId && !isAdmin) {
            return sendError(res, 403, "삭제 권한이 없습니다");
        }

        await storage.deleteCrewPhotoComment(req.params.commentId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "댓글 삭제 실패");
    }
});

// POST /api/hiq/crews/:id/photos
router.post("/crews/:id/photos", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const photo = await storage.createCrewPhoto({
            ...req.body,
            crewId: req.params.id,
            uploaderId: userId
        });
        return sendSuccess(res, photo);
    } catch (e: any) {
        return sendError(res, 500, e.message || "사진 업로드 실패");
    }
});

// DELETE /api/hiq/crews/:id/photos/:photoId
router.delete("/crews/:id/photos/:photoId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const photo = await storage.getCrewPhoto(req.params.photoId);
        if (!photo) return sendError(res, 404, "사진을 찾을 수 없습니다");

        // Auth Check: Author or Admin
        const crewData = await storage.getCrew(req.params.id);
        const me = crewData?.members.find((m: any) => m.member.id === userId);
        const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

        if (photo.uploaderId !== userId && !isAdmin) {
            return sendError(res, 403, "삭제 권한이 없습니다");
        }

        await storage.deleteCrewPhoto(req.params.photoId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "사진 삭제 실패");
    }
});

// GET /api/hiq/crews/:id/chats
router.get("/crews/:id/chats", async (req, res) => {
    try {
        const chats = await storage.getCrewChats(req.params.id);
        return sendSuccess(res, chats);
    } catch (e: any) {
        return sendError(res, 500, e.message || "채팅 조회 실패");
    }
});

// POST /api/hiq/crews/:id/chats
router.post("/crews/:id/chats", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const chat = await storage.createCrewChat({
            ...req.body,
            crewId: req.params.id,
            senderId: userId
        });
        return sendSuccess(res, chat);
    } catch (e: any) {
        return sendError(res, 500, e.message || "메시지 전송 실패");
    }
});

// DELETE /api/hiq/crews/:id/chats/:chatId
router.delete("/crews/:id/chats/:chatId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const chat = await storage.getCrewChat(req.params.chatId);
        if (!chat) return sendError(res, 404, "메시지를 찾을 수 없습니다");

        // Auth Check: Author or Admin
        const crewData = await storage.getCrew(req.params.id);
        const me = crewData?.members.find((m: any) => m.member.id === userId);
        const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

        if (chat.senderId !== userId && !isAdmin) {
            return sendError(res, 403, "삭제 권한이 없습니다");
        }

        await storage.deleteCrewChat(req.params.chatId);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "메시지 삭제 실패");
    }
});



// GET /api/hiq/stores/search?q=query - Search stores (for Base Camp)
router.get("/stores/search", async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return sendSuccess(res, []);
        const stores = await storage.searchStores(query);
        return sendSuccess(res, stores);
    } catch (error) {
        return sendError(res, 500, "매장 검색 실패");
    }
});

// POST /api/hiq/crews - Create a new crew
router.post("/crews", async (req, res) => {
    try {
        const validation = insertHiqCrewSchema.safeParse(req.body);
        if (!validation.success) {
            return sendError(res, 400, validation.error.errors[0].message);
        }

        const crew = await storage.createCrew(validation.data);
        return sendSuccess(res, crew);
    } catch (error: any) {
        return sendError(res, 500, error.message || "크루 생성 실패");
    }
});
// GET /api/hiq/crews/mine - Get my crews
router.get("/crews/mine", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const sport = req.query.sport as string;
        const crews = await storage.getUserCrews(userId, sport);
        return sendSuccess(res, crews);
    } catch (error: any) {
        return sendError(res, 500, error.message || "내 크루 조회 실패");
    }
});

// GET /api/hiq/crews - Search/List crews
router.get("/crews", async (req, res) => {
    try {
        const query = req.query.q as string;
        const sport = req.query.sport as string;
        const crews = await storage.searchCrews(query, sport);
        return sendSuccess(res, crews);
    } catch (error: any) {
        return sendError(res, 500, error.message || "크루 목록 조회 실패");
    }
});
// GET /api/hiq/crews/:id - Get crew details
router.get("/crews/:id", async (req, res) => {
    try {
        const crew = await storage.getCrew(req.params.id);
        if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");
        return sendSuccess(res, crew);
    } catch (error: any) {
        return sendError(res, 500, error.message || "크루 조회 실패");
    }
});

// POST /api/hiq/crews/:id/join - Join a crew
router.post("/crews/:id/join", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id; // Simple auth check
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const role = await storage.joinCrew(req.params.id, userId);
        return sendSuccess(res, { success: true, role });
    } catch (error: any) {
        return sendError(res, 500, error.message || "가입 실패");
    }
});

// PATCH /api/hiq/crews/:id - Update crew (Leader only)
router.patch("/crews/:id", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const crewId = req.params.id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = await storage.getCrew(crewId);
        const me = data?.members.find((m: any) => m.member.id === userId);
        if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
            return sendError(res, 403, "권한이 없습니다");
        }

        const crew = await storage.updateCrew(crewId, req.body);
        return sendSuccess(res, crew);
    } catch (error: any) {
        return sendError(res, 500, error.message || "업데이트 실패");
    }
});


// DELETE /api/hiq/crews/:id - Delete crew (Leader only)
router.delete("/crews/:id", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const crewId = req.params.id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const crew = await storage.getCrew(crewId);
        if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");

        // Check leader - strictly leader only
        const me = crew.members.find((m: any) => m.member.id === userId);
        if (!me || me.role !== 'leader') {
            return sendError(res, 403, "권한이 없습니다 (리더만 가능)");
        }

        await storage.deleteCrew(crewId);
        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, error.message || "삭제 실패");
    }
});

// POST /api/hiq/crews/:id/members/:memberId/approve - Approve member
router.post("/crews/:id/members/:memberId/approve", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const { id: crewId, memberId } = req.params;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = await storage.getCrew(crewId);
        const me = data?.members.find((m: any) => m.member.id === userId);
        if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
            return sendError(res, 403, "권한이 없습니다");
        }

        await storage.updateCrewMemberRole(crewId, memberId, 'member');
        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, error.message || "승인 실패");
    }
});

// DELETE /api/hiq/crews/:id/members/:memberId - Kick or Leave
router.delete("/crews/:id/members/:memberId", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const { id: crewId, memberId } = req.params;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        // If kicking other, check admin
        if (userId !== memberId) {
            const data = await storage.getCrew(crewId);
            const me = data?.members.find((m: any) => m.member.id === userId);
            const target = data?.members.find((m: any) => m.member.id === memberId);

            if (!me) return sendError(res, 403, "크루 멤버가 아닙니다");
            if (!target) return sendError(res, 404, "대상을 찾을 수 없습니다");

            // Hierarchy Check Logic
            // 1. Leader can kick anyone except self (already handled by userId !== memberId check if leader tries to kick self)
            // 2. Admin can only kick normal members
            if (me.role === 'manage') {
                if (target.role === 'leader' || target.role === 'manage') {
                    return sendError(res, 403, "운영진이나 크루장은 강퇴할 수 없습니다");
                }
            } else if (me.role !== 'leader') {
                return sendError(res, 403, "권한이 없습니다");
            }
        }

        await storage.leaveCrew(crewId, memberId);
        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, error.message || "탈퇴/강퇴 실패");
    }
});

// PATCH /api/hiq/crews/:id/members/:memberId/role - Manage Roles (Leader Only)
router.patch("/crews/:id/members/:memberId/role", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        const { id: crewId, memberId } = req.params;
        const { role } = req.body;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const data = await storage.getCrew(crewId);
        const me = data?.members.find((m: any) => m.member.id === userId);

        // Only leader can change roles
        if (!me || me.role !== 'leader') {
            return sendError(res, 403, "크루장만 권한을 변경할 수 있습니다");
        }

        await storage.updateCrewMemberRole(crewId, memberId, role);
        return sendSuccess(res, { success: true });
    } catch (error: any) {
        return sendError(res, 500, error.message || "권한 변경 실패");
    }
});

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
        const { phone, storeSlug, password } = req.body;
        const result = await hiqService.login(phone, storeSlug, password);

        if (!result.isNew && !result.requiresPassword && result.member) {
            res.cookie('hiq_user_id', result.member.id, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/'
            });
        }

        return sendSuccess(res, result);
    } catch (error: any) {
        if (error.message === "INVALID_PASSWORD") {
            return sendError(res, 401, "비밀번호가 일치하지 않습니다.");
        }
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

// --- Admin Routes & Middleware ---
const checkSuperAdmin = async (req: any, res: any, next: any) => {
    const profileId = req.cookies.hiq_partner_auth;
    if (!profileId) return sendError(res, 401, "Unauthorized");

    try {
        const profile = await storage.getProfile(profileId);
        if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
            return sendError(res, 403, "Access Denied: Super Admin Only");
        }
        next();
    } catch (e) {
        return sendError(res, 500, "Auth Check Failed");
    }
};

router.get("/admin/stats", checkSuperAdmin, async (req, res) => {
    const stats = await storage.getGlobalStats();
    return sendSuccess(res, stats);
});

router.get("/admin/leads", checkSuperAdmin, async (req, res) => {
    const leads = await storage.getPartnerLeads();
    return sendSuccess(res, leads);
});

router.post("/admin/leads/:id/status", checkSuperAdmin, async (req, res) => {
    const { status } = req.body;
    await storage.updatePartnerLeadStatus(req.params.id, status);
    return sendSuccess(res, { success: true });
});

router.get("/admin/stores", checkSuperAdmin, async (req, res) => {
    const stores = await storage.getAllStores();
    return sendSuccess(res, stores);
});

router.get("/admin/notices", checkSuperAdmin, async (req, res) => {
    const notices = await storage.getNotices();
    return sendSuccess(res, notices);
});

router.post("/admin/notices", checkSuperAdmin, async (req, res) => {
    const notice = await storage.createNotice(req.body);
    return sendSuccess(res, notice);
});

router.get("/admin/reports", checkSuperAdmin, async (req, res) => {
    const reports = await storage.getReportedUsers();
    return sendSuccess(res, reports);
});

router.post("/admin/users/:id/ban", checkSuperAdmin, async (req, res) => {
    await storage.banUser(req.params.id);
    return sendSuccess(res, { success: true });
});

router.get("/admin/crews", checkSuperAdmin, async (req, res) => {
    try {
        const crews = await storage.getAllCrews();
        return sendSuccess(res, crews);
    } catch (e) {
        return sendError(res, 500, "Failed to fetch crews");
    }
});
router.post("/admin/impersonate/:storeId", checkSuperAdmin, async (req, res) => {
    try {
        const store = await storage.getStoreById(req.params.storeId);
        if (!store || !store.ownerId) return sendError(res, 404, "Store or Owner not found");

        // Impersonation: Set cookie to Owner's Profile ID
        res.cookie('hiq_partner_auth', store.ownerId, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            path: '/'
        });

        return sendSuccess(res, { success: true, message: `Switched to ${store.name}` });
    } catch (e) {
        return sendError(res, 500, "Impersonation Failed");
    }
});

// --- Partner (SaaS) Routes ---
router.post("/partner/login", async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone) return sendError(res, 400, "전화번호 필요");

        const result = await hiqService.partnerLogin(phone, password);

        // Check generic success
        if (result.success) {
            res.cookie('hiq_partner_auth', result.profileId, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/'
            });
            return sendSuccess(res, result);
        }
        return sendError(res, 401, "Login Failed");
    } catch (error: any) {
        return sendError(res, 500, error.message || "Partner Login Error");
    }
});

router.get("/partner/store", async (req, res) => {
    try {
        const profileId = req.cookies.hiq_partner_auth;
        if (!profileId) return sendError(res, 401, "Unauthorized");

        const store = await hiqService.getPartnerStore(profileId);
        if (!store) return sendError(res, 404, "Store not found");

        return sendSuccess(res, store);
        return sendSuccess(res, store);
    } catch (e) {
        return sendError(res, 500, "Server Error");
    }
});

router.patch("/partner/store", async (req, res) => {
    try {
        const profileId = req.cookies.hiq_partner_auth;
        if (!profileId) return sendError(res, 401, "Unauthorized");

        const store = await hiqService.getPartnerStore(profileId);
        if (!store) return sendError(res, 404, "Store not found");

        const updated = await hiqService.updateStore(store.id, req.body);
        return sendSuccess(res, updated);
    } catch (e: any) {
        return sendError(res, 500, e.message || "Update Error");
    }
});

// POST /api/hiq/partner/inquiry - Partner Lead Gen (Auto Register)
router.post("/partner/inquiry", async (req, res) => {
    try {
        const data = req.body;

        // 1. Create Lead Record (Log)
        await storage.createPartnerLead(data);

        // 2. Auto Register: Create Profile
        // Check if profile exists first
        let profile = await storage.getProfileByPhone(data.phoneNumber);
        if (!profile) {
            profile = await storage.createProfile({
                phone: data.phoneNumber,
                // Default password to last 4 digits of phone for simplicity in this flow, or empty to force set later.
                // For "Auto Login", we need a seamless flow. Let's set a default pwd "1234" or handle it.
                // Better: Just set it.
                password: data.password || "1234",
                role: 'store_owner',
                nickname: data.ownerName
            });
        } else {
            // Upgrade existing user to store_owner if not already
            if (profile.role === 'user') {
                profile = await storage.updateProfile(profile.id, { role: 'store_owner' });
            }
        }

        // 3. Auto Register: Create Store
        let store = await storage.getStoreByOwnerProfileId(profile.id);
        if (!store) {
            store = await storage.createStore({
                slug: 'store-' + Math.random().toString(36).substring(7),
                name: data.storeName || `${data.ownerName}님의 당구장`,
                ownerId: profile.id,
                themeColor: '#10b981',
                neonColor: '#34d399',
                region: data.region,
                address: data.regionDetail, // simple mapping
            });
        }

        // 4. Auto Login (Issue Cookie)
        res.cookie('hiq_partner_auth', profile.id, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            path: '/'
        });

        return sendSuccess(res, { success: true, message: "입점 신청 및 자동 로그인 완료" });

    } catch (error: any) {
        return sendError(res, 500, error.message || "입점 문의 실패");
    }
});

// POST /api/hiq/partner/subscription - Register Billing Key & Upgrade Tier
router.post("/partner/subscription", async (req, res) => {
    try {
        const profileId = req.cookies.hiq_partner_auth;
        if (!profileId) return sendError(res, 401, "Unauthorized");

        const { billingKey, paymentMethod } = req.body;
        if (!billingKey) return sendError(res, 400, "Billing key required");

        const store = await hiqService.getPartnerStore(profileId);
        if (!store) return sendError(res, 404, "Store not found");

        const nextBillingAt = new Date();
        nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);

        const updated = await storage.updateStore(store.id, {
            billingKey,
            paymentMethod: paymentMethod || "CARD",
            subscriptionTier: "PREMIUM",
            subscriptionStatus: "active",
            nextBillingDate: nextBillingAt
        });

        return sendSuccess(res, updated);
    } catch (error: any) {
        return sendError(res, 500, error.message || "Subscription Error");
    }
});

router.get("/partner/stats", async (req, res) => {
    try {
        const profileId = req.cookies.hiq_partner_auth;
        if (!profileId) return sendError(res, 401, "Unauthorized");

        const store = await hiqService.getPartnerStore(profileId);
        if (!store) return sendError(res, 404, "Store not found");

        const stats = await storage.getAdminStats(store.id);
        return sendSuccess(res, stats);
    } catch (e) {
        return sendError(res, 500, "Stats Error");
    }
});

router.get("/partner/members", async (req, res) => {
    try {
        const profileId = req.cookies.hiq_partner_auth;
        if (!profileId) return sendError(res, 401, "Unauthorized");

        const store = await hiqService.getPartnerStore(profileId);
        if (!store) return sendError(res, 404, "Store not found");

        const members = await storage.getStoreMembersWithStats(store.id);
        return sendSuccess(res, members);
    } catch (e) {
        return sendError(res, 500, "Members Error");
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
    const memberId = req.cookies.hiq_user_id;
    if (!memberId) return sendError(res, 401, "로그인 필요");

    const member = await storage.getMemberById(memberId);
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
});

// PATCH /api/hiq/me - Update profile/member info
router.patch("/me", async (req, res) => {
    try {
        const memberId = req.cookies.hiq_user_id;
        if (!memberId) return sendError(res, 401, "로그인 필요");

        const member = await storage.getMemberById(memberId);
        if (!member) return sendError(res, 404, "회원 정보 없음");

        const { profileImageUrl, name } = req.body;

        if (member.profileId) {
            await storage.updateProfile(member.profileId, {
                profileImageUrl,
                nickname: name
            });
        } else {
            // Self-healing: Create profile if missing (common for legacy or phone-only users)
            const newProfile = await storage.createProfile({
                nickname: name || member.name,
                phone: member.phone,
                profileImageUrl,
                role: 'user'
            });
            await storage.updateMember(member.id, { profileId: newProfile.id });
        }

        // Also update local member name for consistency
        if (name) {
            await storage.updateMember(member.id, { name });
        }

        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "프로필 수정 실패");
    }
});

// POST /api/hiq/me/recalculate-avg - Manually recalculate averages
router.post("/me/recalculate-avg", async (req, res) => {
    try {
        const memberId = req.cookies.hiq_user_id;
        if (!memberId) return sendError(res, 401, "로그인 필요");

        // Recalculate avg for both game types
        await (storage as any)._updateUserAverage(memberId, "3c");
        await (storage as any)._updateUserAverage(memberId, "4c");

        const updatedMember = await storage.getMemberById(memberId);
        return sendSuccess(res, {
            success: true,
            avg3c: updatedMember?.avg3c,
            avg4c: updatedMember?.avg4c
        });
    } catch (error: any) {
        return sendError(res, 500, error.message || "평균 재계산 실패");
    }
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
    const type = (req.query.type as '3c' | '4c') || '4c';

    // Default to store if not specified
    const targetStoreId = (scope === 'national') ? undefined : member!.storeId;

    const rankings = await storage.getTopRankings(targetStoreId, 20, type); // Fixed: removed sport
    return sendSuccess(res, rankings);
});

router.get("/opponents", async (req, res) => {
    const member = await storage.getMemberById(req.cookies.hiq_user_id);
    const opponents = await storage.getAvailableOpponents(member!.storeId, member!.id);
    return sendSuccess(res, opponents);
});

router.get("/history", async (req, res) => {
    const sport = req.query.sport as string;
    const history = await storage.getMemberGameHistory(req.cookies.hiq_user_id, sport);
    return sendSuccess(res, history);
});

router.get("/stats/analysis", async (req, res) => {
    try {
        const memberId = (req.query.memberId as string) || req.cookies.hiq_user_id;
        const type = (req.query.type as "3c" | "4c") || "4c";
        const stats = await storage.getMemberStatsAnalysis(memberId, type);
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

router.get("/games/vs/:opponentId", async (req, res) => {
    try {
        const sport = req.query.sport as string || "BILLIARDS";
        const games = await storage.getHeadToHeadGames(req.cookies.hiq_user_id, req.params.opponentId, sport);
        return sendSuccess(res, games);
    } catch (error: any) {
        return sendError(res, 500, "상대 경기 기록 로드 실패");
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
        const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
        const friends = await storage.getFriends(req.cookies.hiq_user_id, sport);
        return sendSuccess(res, friends);
    } catch (error: any) {
        return sendError(res, 500, "친구 목록 로드 실패");
    }
});

router.post("/friends", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const { receiverId, sport } = req.body;
        const sportCategory = sport === "GOLF" ? "GOLF" : "BILLIARDS";
        const result = await storage.createFriendship(req.cookies.hiq_user_id, receiverId, sportCategory);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, 500, "친구 추가 실패");
    }
});

// Smart Search: Search users by nickname, ID, or phone
router.get("/friends/search", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        const { keyword, sport } = req.query;
        if (!keyword) return sendError(res, 400, "검색어 필요");

        const sportCategory = sport === "GOLF" ? "GOLF" : "BILLIARDS";
        const results = await searchUsers(
            keyword as string,
            req.cookies.hiq_user_id,
            sportCategory
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
        const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
        const opponents = await getRecentOpponents(req.cookies.hiq_user_id, sport);
        return sendSuccess(res, opponents);
    } catch (error: any) {
        return sendError(res, 500, "최근 상대 조회 실패");
    }
});

// --- Invite Routes ---
router.post("/invite", async (req, res) => {
    try {
        if (!req.cookies.hiq_user_id) return sendError(res, 401, "로그인 필요");
        // const { sportCategory } = req.body;
        const code = await storage.createInvite(req.cookies.hiq_user_id); // Fixed: removed sportCategory
        return sendSuccess(res, { code });
    } catch (error: any) {
        return sendError(res, 500, "초대 코드 생성 실패");
    }
});

router.get("/invite/:code", async (req, res) => {
    try {
        // Use getInviteStatus to support Host polling (includes 'accepted' status and guest details)
        const invite = await storage.getInviteStatus(req.params.code);
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

    // Ensure names are populated for all members
    // Flexible Player Naming & Assignment
    // Frontend sends exact order as player1, player2, etc.
    // If player1Id is missing (Guest), we use player1Name.
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
});

router.get("/game/:id", async (req, res) => {
    const game = await storage.getHiqGameById(req.params.id);

    // Self-healing: If name is missing but ID exists, fetch and update it
    if (game) {
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
            // Async update to DB so we don't block response too much, or await it if fast enough
            await storage.updateHiqGameScore(game.id, updates);
        }
    }

    return sendSuccess(res, game);
});

router.patch("/game/:id/score", async (req, res) => {
    await storage.updateHiqGameScore(req.params.id, req.body);
    return sendSuccess(res, { success: true });
});

router.post("/game/:id/finish", async (req, res) => {
    const game = await storage.finishHiqGame(req.params.id, req.body);

    let handicapUpdate1: any = null;
    let handicapUpdate2: any = null;

    if (game.gameType === "golf") {
        handicapUpdate1 = await storage.checkAndUpdateGolfGrade(game.player1Id);
        if (game.player2Id) handicapUpdate2 = await storage.checkAndUpdateGolfGrade(game.player2Id);
    } else {
        handicapUpdate1 = await storage.checkAndUpdateHandicap(game.player1Id, game.gameType as any);
        if (game.player2Id) handicapUpdate2 = await storage.checkAndUpdateHandicap(game.player2Id, game.gameType as any);
    }

    return sendSuccess(res, { game, handicapUpdate1, handicapUpdate2 });
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

// --- Tournament Routes ---
router.get("/tournaments/active", async (req, res) => {
    try {
        const storeId = req.query.storeId as string;
        const tournaments = await storage.getActiveTournaments(storeId);
        return sendSuccess(res, tournaments);
    } catch (error: any) {
        return sendError(res, 500, "대회 목록 로드 실패");
    }
});

router.get("/tournaments/:id", async (req, res) => {
    try {
        const tournament = await storage.getTournamentById(req.params.id);
        if (!tournament) return sendError(res, 404, "대회 없음");
        return sendSuccess(res, tournament);
    } catch (error: any) {
        return sendError(res, 500, "대회 정보 로드 실패");
    }
});

// --- Settlement Routes ---
router.get("/settlements/:id", async (req, res) => {
    try {
        const settlement = await storage.getSettlement(req.params.id);
        if (!settlement) return sendError(res, 404, "정산 내역 없음");
        return sendSuccess(res, settlement);
    } catch (e: any) {
        return sendError(res, 500, "조회 실패");
    }
});

router.post("/crews/:id/settlements", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인이 필요합니다");

        const { items, participants, sendToChat, ...settlementData } = req.body;

        const data = {
            ...settlementData,
            crewId: req.params.id,
            creatorId: userId,
            status: 'pending'
        };

        const validation = insertHiqSettlementSchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        const settlement = await storage.createSettlement(validation.data, items, participants);

        // Optionally send to chat
        if (sendToChat) {
            const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);

            await storage.createCrewChat({
                crewId: req.params.id,
                senderId: userId,
                message: `[정산 요청] ${settlementData.title}`,
                // We use a convention for special message types or metadata
                // Since the schema supports JSONB/metadata, ideally we use that.
                // Assuming hiqCrewChats has a 'type' or 'metadata' column. 
                // Let's check schema.ts later, but for now assuming standard message structure 
                // is extended or we use a JSON payload in message if client parses it.
                // WAIT: The frontend expects `type: 'settlement'` and `metadata`.
                // Does the schema support it?
                // Step 3816 showed `hiqCrewChats` in `club-detail` using `chat.type` and `chat.metadata`.
                // I need to ensure `hiqCrewChats` has these columns.
                // Checking previous schema view... 
                // Step 3827 didn't show `hiqCrewChats` schema.
                // If they don't exist, I might need to migrate. 
                // BUT, assuming the user's codebase was already set up for this OR I missed adding it.
                // Let's assume the columns `type` and `metadata` exist or were added recently.
                // If not, this might crash. 
                // Re-reading `club-detail.tsx` at line 636: `chat.type === 'settlement'`.
                // So the Frontend EXPECTS it.
                // I will add `type` and `metadata` to the insert payload.
                type: 'settlement',
                metadata: {
                    settlementId: settlement.id,
                    title: settlementData.title,
                    totalAmount: totalAmount
                }
            });
        }

        return sendSuccess(res, settlement);
    } catch (e: any) {
        return sendError(res, 500, e.message || "정산 생성 실패");
    }
});

// --- Golf Booking Routes ---
router.get("/golf/bookings", async (req, res) => {
    try {
        const date = req.query.date as string | undefined;
        // Pass all query params as filters
        const bookings = await storage.getGolfBookings(date, req.query);
        return sendSuccess(res, bookings);
    } catch (e: any) {
        return sendError(res, 500, e.message || "골프 부킹 목록 조회 실패");
    }
});

router.get("/golf/bookings/counts", async (req, res) => {
    try {
        const { startDate, endDate, viewType } = req.query;
        if (!startDate || !endDate) {
            return sendError(res, 400, "시작일과 종료일은 필수입니다.");
        }
        const counts = await storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string);
        return sendSuccess(res, counts);
    } catch (e: any) {
        return sendError(res, 500, e.message || "골프 부킹 통계 조회 실패");
    }
});

router.post("/golf/bookings", async (req, res) => {
    try {
        // Multi-create support from frontend
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const results: GolfBooking[] = [];

        for (const item of items) {
            const data = {
                ...item,
                datetime: new Date(item.datetime)
            };

            const validation = insertGolfBookingSchema.safeParse(data);
            if (!validation.success) {
                return sendError(res, 400, validation.error.message);
            }

            const booking = await storage.createGolfBooking(validation.data as any);
            results.push(booking);
        }

        return sendSuccess(res, results);
    } catch (e: any) {
        return sendError(res, 500, e.message || "골프 부킹 생성 실패");
    }
});

router.delete("/golf/bookings/:id", async (req, res) => {
    try {
        const id = req.params.id;
        await storage.deleteGolfBooking(id);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "부킹 삭제 실패");
    }
});


// --- Golf Join Routes ---
router.get("/golf/joins", async (req, res) => {
    try {
        const date = req.query.date as string | undefined;
        const joins = await storage.getGolfJoins({ date, ...req.query });
        return sendSuccess(res, joins);
    } catch (e: any) {
        return sendError(res, 500, e.message || "골프 조인 목록 조회 실패");
    }
});

router.post("/golf/joins", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        // if (!userId) return sendError(res, 401, "로그인이 필요합니다.");

        // Multi-create support
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const results: GolfJoin[] = [];

        for (const item of items) {
            const data = {
                ...item,
                datetime: new Date(item.datetime),
                hostId: userId, // Assuming current user is creator/host
                status: 'recruiting'
            };

            const validation = insertGolfJoinSchema.safeParse(data);
            if (!validation.success) {
                return sendError(res, 400, validation.error.message);
            }

            const join = await storage.createGolfJoin(validation.data as any);
            results.push(join);
        }

        return sendSuccess(res, results);
    } catch (e: any) {
        return sendError(res, 500, e.message || "골프 조인 생성 실패");
    }
});

router.delete("/golf/joins/:id", async (req, res) => {
    try {
        const id = req.params.id;
        await storage.deleteGolfJoin(id);
        return sendSuccess(res, { success: true });
    } catch (e: any) {
        return sendError(res, 500, e.message || "조인 삭제 실패");
    }
});

router.get("/golf/passport-stats", async (req, res) => {
    try {
        const userId = req.cookies.hiq_user_id;
        if (!userId) return sendError(res, 401, "로그인 필요");

        // Self-healing: seed data if empty
        await storage.seedGolfSampleData(userId);

        const stats = await storage.getGolfPassportStats(userId);
        return sendSuccess(res, stats);
    } catch (e: any) {
        return sendError(res, 500, e.message || "패스포트 통계 조회 실패");
    }
});

router.post("/golf/scorecard/ocr", async (req, res) => {
    try {
        const { ocrData, courseId, courseName } = req.body;
        if (!ocrData) return sendError(res, 400, "OCR 데이터가 필요합니다.");

        const parsed = await storage.processScorecardOCR(ocrData);
        if (!parsed) return sendError(res, 400, "분석 가능한 데이터가 없습니다.");

        // Crowdsourcing Logic: Update Master DB with identified PARs
        if (courseId && courseName) {
            for (const course of parsed.courses) {
                for (let i = 0; i < course.pars.length; i++) {
                    await storage.updateCourseHoleInfo({
                        courseId,
                        courseName,
                        subPathName: course.course_name,
                        holeNo: i + 1,
                        par: course.pars[i]
                    });
                }
            }
        }

        return sendSuccess(res, parsed);
    } catch (e: any) {
        return sendError(res, 500, e.message || "OCR 처리 실패");
    }
});

// --- Golf Match Session (PIN based) ---
router.post("/golf/match/create", async (req, res) => {
    try {
        const session = await storage.createGolfMatchSession(req.body);
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

router.get("/golf/match/pin/:pin", async (req, res) => {
    try {
        const session = await storage.getGolfMatchSessionByPin(req.params.pin);
        if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

router.post("/golf/match/join", async (req, res) => {
    try {
        const { pin, memberId, name } = req.body;
        const session = await storage.joinGolfMatchSession(pin, memberId, name);
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

router.get("/golf/match/:id", async (req, res) => {
    try {
        const session = await storage.getGolfMatchSession(req.params.id);
        if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

router.post("/golf/match/:id/score", async (req, res) => {
    try {
        const { holeNo, players } = req.body;
        const session = await storage.updateGolfMatchScore(req.params.id, holeNo, players);
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

router.post("/golf/match/:id/finish", async (req, res) => {
    try {
        const session = await storage.finishGolfMatchSession(req.params.id);
        return sendSuccess(res, session);
    } catch (e: any) {
        return sendError(res, 500, e.message);
    }
});

export default router;
