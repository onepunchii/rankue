import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertHiqCrewSchema, insertHiqCrewActivitySchema, insertHiqCrewPostSchema, insertHiqSettlementSchema, insertHiqPollSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { notificationService } from "../../services/notificationService.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();


// --- Activities ---

// GET /activities - Get upcoming activities
router.get("/:id/activities", asyncHandler(async (req: any, res: any) => {
    const activities = await storage.getUpcomingCrewActivities(req.params.id);
    return sendSuccess(res, activities);
}));

// POST /activities - Create activity
router.post("/:id/activities", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const data = {
        ...req.body,
        crewId: req.params.id,
        creatorId: req.userId,
        // Ensure activityDate is Date object if string
        activityDate: new Date(req.body.activityDate)
    };

    const validation = insertHiqCrewActivitySchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.message);
    }

    const activity = await storage.createCrewActivity(validation.data);
    return sendSuccess(res, activity);
}));

// POST /activities/:activityId/join - Join activity
router.post("/:id/activities/:activityId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    await storage.joinCrewActivity(req.params.activityId, req.userId!);
    return sendSuccess(res, { success: true });
}));

// DELETE /activities/:activityId/join - Leave activity
router.delete("/:id/activities/:activityId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    await storage.leaveCrewActivity(req.params.activityId, req.userId!);
    return sendSuccess(res, { success: true });
}));

// PATCH /activities/:activityId - Update activity (Leader/Manager only)
router.patch("/:id/activities/:activityId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewData = await storage.getCrew(req.params.id);
    if (!crewData) return sendError(res, 404, "크루를 찾을 수 없습니다");

    const me = crewData.members.find((m: any) => m.member.id === req.userId);
    if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
        return sendError(res, 403, "수정 권한이 없습니다 (모임장/부모임장만 가능)");
    }

    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity) return sendError(res, 404, "정모를 찾을 수 없습니다");

    const updateData: any = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.activityDate !== undefined) updateData.activityDate = new Date(req.body.activityDate);
    if (req.body.locationName !== undefined) updateData.locationName = req.body.locationName;
    if (req.body.cost !== undefined) updateData.cost = req.body.cost;
    if (req.body.maxParticipants !== undefined) updateData.maxParticipants = req.body.maxParticipants;
    if (req.body.category !== undefined) updateData.category = req.body.category;

    const updated = await storage.updateCrewActivity(req.params.activityId, updateData);
    return sendSuccess(res, updated);
}));

// DELETE /activities/:activityId - Delete activity (Leader/Manager only)
router.delete("/:id/activities/:activityId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewData = await storage.getCrew(req.params.id);
    if (!crewData) return sendError(res, 404, "크루를 찾을 수 없습니다");

    const me = crewData.members.find((m: any) => m.member.id === req.userId);
    if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
        return sendError(res, 403, "삭제 권한이 없습니다 (모임장/부모임장만 가능)");
    }

    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity) return sendError(res, 404, "정모를 찾을 수 없습니다");

    await storage.deleteCrewActivity(req.params.activityId);
    return sendSuccess(res, { success: true });
}));

// GET /activities/member/:memberId - 멤버별 활동 내역 (페르소나 분석용)
router.get("/activities/member/:memberId", asyncHandler(async (req: any, res: any) => {
    const crewId = req.query.crewId as string;
    const result = await storage.getMemberActivities(req.params.memberId, crewId);
    return sendSuccess(res, result);
}));


// --- Posts ---

// GET /posts
router.get("/:id/posts", asyncHandler(async (req: any, res: any) => {
    const userId = req.signedCookies?.hiq_user_id;
    const posts = await storage.getCrewPosts(req.params.id, userId);
    console.log(`[GET] Found ${posts.length} posts for crew ${req.params.id}`);
    return sendSuccess(res, posts);
}));

// POST /posts
router.post("/:id/posts", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const data = {
        ...req.body,
        crewId: req.params.id,
        authorId: req.userId
    };

    const validation = insertHiqCrewPostSchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }

    const post = await storage.createCrewPost(validation.data);
    return sendSuccess(res, post);
}));

// DELETE /posts/:postId
router.delete("/:id/posts/:postId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const post = await storage.getCrewPost(req.params.postId);
    if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (post.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewPost(req.params.postId);
    return sendSuccess(res, { success: true });
}));

// POST /posts/:postId/like - Toggle Like
router.post("/:id/posts/:postId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const result = await storage.toggleCrewPostLike(req.params.postId, req.userId!);
    return sendSuccess(res, result);
}));

// --- Comments ---

// DELETE /crews/:id/comments/:commentId
router.delete("/:id/comments/:commentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const comment = await storage.getCrewComment(req.params.commentId);
    if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (comment.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewComment(req.params.commentId);
    return sendSuccess(res, { success: true });
}));


// --- Photos ---

// GET /crews/:id/photos
router.get("/:id/photos", asyncHandler(async (req: any, res: any) => {
    const userId = req.signedCookies?.hiq_user_id;
    const photos = await storage.getCrewPhotos(req.params.id, userId);
    return sendSuccess(res, photos);
}));

// POST /crews/:id/photos/:photoId/like
router.post("/:id/photos/:photoId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const result = await storage.toggleCrewPhotoLike(req.params.photoId, req.userId!);
    return sendSuccess(res, result);
}));

// DELETE /crews/:id/photo-comments/:commentId
router.delete("/:id/photo-comments/:commentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const comment = await storage.getCrewPhotoComment(req.params.commentId);
    if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (comment.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewPhotoComment(req.params.commentId);
    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/photos
router.post("/:id/photos", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const photo = await storage.createCrewPhoto({
        ...req.body,
        crewId: req.params.id,
        uploaderId: req.userId
    });
    return sendSuccess(res, photo);
}));

// DELETE /crews/:id/photos/:photoId
router.delete("/:id/photos/:photoId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo) return sendError(res, 404, "사진을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (photo.uploaderId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewPhoto(req.params.photoId);
    return sendSuccess(res, { success: true });
}));


// --- Chats ---

// GET /crews/:id/chats
router.get("/:id/chats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const chats = await storage.getCrewChats(req.params.id, req.userId);
    return sendSuccess(res, chats);
}));

// POST /crews/:id/chats
router.post("/:id/chats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const chat = await storage.createCrewChat({
        ...req.body,
        crewId: req.params.id,
        senderId: req.userId
    });

    // Background: Send notification to all crew members except sender
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const userId = req.userId!;
            const membersToNotify = crewData.members.filter((m: any) => m.member.id !== userId);
            const sender = crewData.members.find((m: any) => m.member.id === userId);
            const senderName = sender?.member.name || "누군가";

            for (const m of membersToNotify) {
                notificationService.sendAndSaveNotification({
                    memberId: m.member.id,
                    title: `💬 [${crewData.crew.name}] 새 메시지`,
                    body: `${senderName}: ${chat.message}`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "CHAT",
                    params: { crewId: req.params.id, tab: "Chat" }
                }).catch(err => console.error(`[ChatNotif] Failed for ${m.member.id}:`, err));
            }
        }
    } catch (notifErr) {
        console.error("[ChatNotif] Error getting crew members:", notifErr);
    }

    return sendSuccess(res, chat);
}));

// DELETE /crews/:id/chats/:chatId
router.delete("/:id/chats/:chatId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const chat = await storage.getCrewChat(req.params.chatId);
    if (!chat) return sendError(res, 404, "메시지를 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (chat.senderId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewChat(req.params.chatId);
    return sendSuccess(res, { success: true });
}));


// --- Polls ---

// GET /polls - List crew polls
router.get("/:id/polls", asyncHandler(async (req: any, res: any) => {
    const userId = req.signedCookies?.hiq_user_id;
    const polls = await storage.getCrewPolls(req.params.id, userId);
    return sendSuccess(res, polls);
}));

// POST /polls - Create poll
router.post("/:id/polls", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { options, ...rest } = req.body;
    const data = {
        ...rest,
        endTime: rest.endTime ? new Date(rest.endTime) : undefined,
        crewId: req.params.id,
        authorId: req.userId
    };

    const validation = insertHiqPollSchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.message);
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
        return sendError(res, 400, "최소 2개 이상의 선택지가 필요합니다");
    }

    const poll = await storage.createPoll(validation.data, options);
    return sendSuccess(res, poll);
}));

// POST /polls/:pollId/vote - Vote/Toggle vote
router.post("/:id/polls/:pollId/vote", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { optionId } = req.body;
    if (!optionId) return sendError(res, 400, "선택지 ID가 필요합니다");

    const result = await storage.votePoll(req.params.pollId, optionId, req.userId!);
    return sendSuccess(res, result);
}));

// DELETE /polls/:pollId - Delete poll
router.delete("/:id/polls/:pollId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const pollId = req.params.pollId;
    const crewId = req.params.id;

    // Check permission
    const userId = req.userId;
    const polls = await storage.getCrewPolls(crewId, userId);
    const poll = polls.find((p: any) => p.id === pollId);

    if (!poll) return sendError(res, 404, "투표를 찾을 수 없습니다");

    const crewData = await storage.getCrew(crewId);
    const me = crewData?.members.find((m: any) => m.member.id === userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (!isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다 (운영진만 가능)");
    }

    await storage.deletePoll(pollId);
    return sendSuccess(res, { success: true });
}));

// GET /polls/options/:optionId/votes - Get voters for an option
router.get("/:id/polls/options/:optionId/votes", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // Note: In a real app, we should check if isAnonymous is true before showing voters
    // For now, storage method will be called, but we can add check here if needed.
    const votes = await storage.getPollVotes(req.params.optionId);
    return sendSuccess(res, votes);
}));

// --- General Crew Management ---


// POST /crews - Create a new crew
router.post("/", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const validation = insertHiqCrewSchema.safeParse(req.body);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }

    const crew = await storage.createCrew(validation.data);
    return sendSuccess(res, crew);
}));

// GET /crews/mine - Get my crews
router.get("/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = req.query.sport as string;
    const crews = await storage.getUserCrews(req.userId!, sport);
    return sendSuccess(res, crews);
}));

// GET /crews - Search/List crews
router.get("/", asyncHandler(async (req: any, res: any) => {
    const query = req.query.q as string;
    const sport = req.query.sport as string;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const crews = await storage.searchCrews(query, sport, lat, lng);
    return sendSuccess(res, crews);
}));

// GET /crews/:id - Get crew details
router.get("/:id", asyncHandler(async (req: any, res: any) => {
    const crew = await storage.getCrew(req.params.id);
    if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");
    return sendSuccess(res, crew);
}));

// GET /crews/:id/members - Get all members of a crew
router.get("/:id/members", asyncHandler(async (req: any, res: any) => {
    const crew = await storage.getCrew(req.params.id);
    if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");
    return sendSuccess(res, crew.members);
}));

// POST /crews/:id/join - Join a crew
router.post("/:id/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await storage.joinCrew(req.params.id, req.userId!);
    return sendSuccess(res, { success: true, role });
}));

// PATCH /crews/:id - Update crew (Leader only)
router.patch("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = req.params.id;
    const data = await storage.getCrew(crewId);
    const me = data?.members.find((m: any) => m.member.id === req.userId);
    if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
        return sendError(res, 403, "권한이 없습니다");
    }

    const crew = await storage.updateCrew(crewId, req.body);
    return sendSuccess(res, crew);
}));


// DELETE /crews/:id - Delete crew (Leader only)
router.delete("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = req.params.id;
    const crew = await storage.getCrew(crewId);
    if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");

    // Check leader - strictly leader only
    const me = crew.members.find((m: any) => m.member.id === req.userId);
    if (!me || me.role !== 'leader') {
        return sendError(res, 403, "권한이 없습니다 (리더만 가능)");
    }

    await storage.deleteCrew(crewId);
    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/members/:memberId/approve - Approve member
router.post("/:id/members/:memberId/approve", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { id: crewId, memberId } = req.params;
    const data = await storage.getCrew(crewId);
    if (!data) return sendError(res, 404, "크루를 찾을 수 없습니다");

    // Auth Check: Leader or Manager
    const me = data.members.find((m: any) => m.member.id === req.userId);
    if (!me || (me.role !== 'leader' && me.role !== 'manage')) {
        return sendError(res, 403, "권한이 없습니다");
    }

    // Target Check
    const target = data.members.find((m: any) => m.member.id === memberId);
    if (!target) return sendError(res, 404, "대상을 찾을 수 없습니다");
    if (target.role !== 'pending') return sendError(res, 400, "이미 승인된 멤버입니다");

    await storage.updateCrewMemberRole(crewId, memberId, 'member');

    // Send Notification to Approved Member
    try {
        await notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: `🎉 [${data.crew.name}] 가입 승인`,
            body: "크루 가입이 승인되었습니다! 지금 활동을 시작해보세요.",
            category: data.crew.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { crewId: crewId }
        });
    } catch (err) {
        console.error(`[ApproveNotif] Failed for ${memberId}:`, err);
    }

    return sendSuccess(res, { success: true });
}));

// DELETE /crews/:id/members/:memberId - Kick or Leave
router.delete("/:id/members/:memberId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { id: crewId, memberId } = req.params;

    // If kicking other, check admin
    if (req.userId !== memberId) {
        const data = await storage.getCrew(crewId);
        const me = data?.members.find((m: any) => m.member.id === req.userId);
        const target = data?.members.find((m: any) => m.member.id === memberId);

        if (!me) return sendError(res, 403, "크루 멤버가 아닙니다");
        if (!target) return sendError(res, 404, "대상을 찾을 수 없습니다");

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
}));

// PATCH /crews/:id/members/:memberId/role - Manage Roles (Leader Only)
router.patch("/:id/members/:memberId/role", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { id: crewId, memberId } = req.params;
    const { role } = req.body;
    const data = await storage.getCrew(crewId);
    const me = data?.members.find((m: any) => m.member.id === req.userId);

    // Only leader can change roles
    if (!me || me.role !== 'leader') {
        return sendError(res, 403, "크루장만 권한을 변경할 수 있습니다");
    }

    await storage.updateCrewMemberRole(crewId, memberId, role);
    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/settlements
router.post("/:id/settlements", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const data = {
        ...req.body, // title, date, totalAmount, etc.
        crewId: req.params.id,
        creatorId: req.userId
    };

    const { items, participants } = req.body; // Complex structure

    const validation = insertHiqSettlementSchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.message);
    }

    const settlement = await storage.createSettlement(validation.data, items, participants);
    return sendSuccess(res, settlement);
}));

export default router;
