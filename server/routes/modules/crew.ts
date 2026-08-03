import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertHiqCrewSchema, insertHiqCrewActivitySchema, insertHiqCrewPostSchema, insertHiqSettlementSchema, insertHiqPollSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { notificationService } from "../../services/notificationService.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { deleteBlobs } from "../../utils/blob.js";

const router = Router();

// Membership gate: returns the member's role, or sends a 403/404 and returns null.
// Non-members and pending (승인 대기) members are rejected from writing crew content.
async function requireCrewMember(req: AuthRequest, res: any): Promise<string | null> {
    const membership = await storage.getCrewMembership(req.params.id, req.userId!);
    if (!membership || membership.role === 'pending') {
        sendError(res, 403, "크루 멤버만 이용할 수 있습니다");
        return null;
    }
    return membership.role;
}


// --- Activities ---

// GET /activities - Get upcoming activities
router.get("/:id/activities", asyncHandler(async (req: any, res: any) => {
    const activities = await storage.getUpcomingCrewActivities(req.params.id);
    return sendSuccess(res, activities);
}));

// POST /activities - Create activity
router.post("/:id/activities", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
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
    // P1: 정모 생성 → 크루원 전원에게 알림 (본인 제외)
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const creator = await storage.getMemberById(req.userId!);
            const activityTime = activity.activityDate ? new Date(activity.activityDate).toLocaleString("ko-KR", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "곧";
            for (const m of crewData.members) {
                if (m.member.id === req.userId) continue;
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                if (!setting.activityEnabled) continue;
                notificationService.sendAndSaveNotification({
                    memberId: m.member.id,
                    title: `📅 [${crewData.crew.name}] 새 정모`,
                    body: `${creator?.name || "누군가"}님이 "${activity.title || "정모"}"를 만들었어요. ${activityTime}`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "ACTIVITY",
                    params: { url: `/crew/${req.params.id}/activity` },
                }).catch((err: any) => console.error("[ActivityCreateNotif]", err));
            }
        }
    } catch(e) {}
    return sendSuccess(res, activity);
}));

// POST /activities/:activityId/join - Join activity
router.post("/:id/activities/:activityId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "정모를 찾을 수 없습니다");
    await storage.joinCrewActivity(req.params.activityId, req.userId!);
    // P1: 정모 참가 → 생성자에게 알림
    try {
        const act = await storage.getCrewActivity(req.params.activityId);
        if (act?.creatorId && act.creatorId !== req.userId) {
            const joiner = await storage.getMemberById(req.userId!);
            notificationService.sendAndSaveNotification({
                memberId: act.creatorId,
                title: "✅ 정모 참가",
                body: `${joiner?.name || "누군가"}님이 "${act.title || "정모"}"에 참가했어요!`,
                category: "BILLIARDS",
                type: "ACTIVITY",
                params: { url: `/crew/${req.params.id}/activity` },
            }).catch((err: any) => console.error("[ActivityJoinNotif]", err));
        }
    } catch(e) {}
    return sendSuccess(res, { success: true });
}));

// DELETE /activities/:activityId/join - Leave activity
router.delete("/:id/activities/:activityId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "정모를 찾을 수 없습니다");
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
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "정모를 찾을 수 없습니다");

    const updateData: any = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.activityDate !== undefined) updateData.activityDate = new Date(req.body.activityDate);
    if (req.body.locationName !== undefined) updateData.locationName = req.body.locationName;
    if (req.body.cost !== undefined) updateData.cost = req.body.cost;
    if (req.body.maxParticipants !== undefined) updateData.maxParticipants = req.body.maxParticipants;
    if (req.body.category !== undefined) updateData.category = req.body.category;

    const updated = await storage.updateCrewActivity(req.params.activityId, updateData);
    // P1: 정모 수정 → 참여자 전원에게 알림
    try {
        const act = await storage.getCrewActivity(req.params.activityId);
        if (act?.participants && Array.isArray(act.participants)) {
            const crewData = await storage.getCrew(req.params.id);
            for (const pid of act.participants) {
                if (pid === req.userId) continue;
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                if (!setting.activityEnabled) continue;
                notificationService.sendAndSaveNotification({
                    memberId: pid,
                    title: `⚠️ [${crewData?.crew.name || "크루"}] 정모 수정`,
                    body: `"${act.title || "정모"}"이(가) 수정되었어요.`,
                    category: crewData?.crew?.sportCategory || "BILLIARDS",
                    type: "ACTIVITY",
                    params: { url: `/crew/${req.params.id}/activity` },
                }).catch((err: any) => console.error("[ActivityEditNotif]", err));
            }
        }
    } catch(e) {}
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
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "정모를 찾을 수 없습니다");

    await storage.deleteCrewActivity(req.params.activityId);
    // P1: 정모 취소 → 참여자 전원에게 알림
    try {
        const act = await storage.getCrewActivity(req.params.activityId);
        if (act?.participants && Array.isArray(act.participants)) {
            const crewData = await storage.getCrew(req.params.id);
            for (const pid of act.participants) {
                if (pid === req.userId) continue;
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                if (!setting.activityEnabled) continue;
                notificationService.sendAndSaveNotification({
                    memberId: pid,
                    title: `⚠️ [${crewData?.crew.name || "크루"}] 정모 취소`,
                    body: `"${act.title || "정모"}"이(가) 취소되었어요.`,
                    category: crewData?.crew?.sportCategory || "BILLIARDS",
                    type: "ACTIVITY",
                    params: { url: `/crew/${req.params.id}/activity` },
                }).catch((err: any) => console.error("[ActivityDeleteNotif]", err));
            }
        }
    } catch(e) {}
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
    if (await requireCrewMember(req, res) === null) return;
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
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "게시글을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (post.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewPost(req.params.postId);
    await deleteBlobs((post as any).images);
    return sendSuccess(res, { success: true });
}));

// POST /posts/:postId/like - Toggle Like
router.post("/:id/posts/:postId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const result = await storage.toggleCrewPostLike(req.params.postId, req.userId!);
    return sendSuccess(res, result);
}));

// --- Comments ---

// GET /crews/:id/posts/:postId/comments - list comments
router.get("/:id/posts/:postId/comments", asyncHandler(async (req: any, res: any) => {
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const comments = await storage.getCrewPostComments(req.params.postId);
    return sendSuccess(res, comments);
}));

// POST /crews/:id/posts/:postId/comments - add comment (members only)
router.post("/:id/posts/:postId/comments", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return sendError(res, 400, "댓글 내용을 입력해주세요");
    const comment = await storage.createCrewPostComment({
        postId: req.params.postId,
        authorId: req.userId!,
        content,
    } as any);
    // P2: 댓글 → 게시글 작성자에게 알림
    try {
        const post = await storage.getCrewPost(req.params.postId);
        if (post?.authorId && post.authorId !== req.userId) {
            const commenter = await storage.getMemberById(req.userId!);
            const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, post.authorId);
            if (setting.postCommentEnabled) {
                notificationService.sendAndSaveNotification({
                    memberId: post.authorId,
                    title: `💬 새 댓글`,
                    body: `${commenter?.name || "누군가"}님이 "${post.title || "게시글"}"에 댓글을 달았습니다.`,
                    category: "BILLIARDS",
                    type: "POST_COMMENT",
                    params: { url: `/crew/${req.params.id}` },
                }).catch((err: any) => console.error("[CommentNotif]", err));
            }
        }
    } catch(e) {}
    return sendSuccess(res, comment);
}));

// DELETE /crews/:id/comments/:commentId
router.delete("/:id/comments/:commentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const comment = await storage.getCrewComment(req.params.commentId);
    if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

    // Verify the comment's parent post belongs to crew :id (comments have no crewId column).
    const parentPost = await storage.getCrewPost(comment.postId);
    if (!parentPost || parentPost.crewId !== req.params.id) return sendError(res, 404, "댓글을 찾을 수 없습니다");

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

// GET /crews/:id/photos/:photoId/comments - list photo comments
router.get("/:id/photos/:photoId/comments", asyncHandler(async (req: any, res: any) => {
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "사진을 찾을 수 없습니다");
    const comments = await storage.getCrewPhotoComments(req.params.photoId);
    return sendSuccess(res, comments);
}));

// POST /crews/:id/photos/:photoId/comments - add photo comment (members only)
router.post("/:id/photos/:photoId/comments", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "사진을 찾을 수 없습니다");
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return sendError(res, 400, "댓글 내용을 입력해주세요");
    const comment = await storage.createCrewPhotoComment({
        photoId: req.params.photoId,
        authorId: req.userId!,
        content,
    } as any);
    return sendSuccess(res, comment);
}));

// DELETE /crews/:id/photo-comments/:commentId
router.delete("/:id/photo-comments/:commentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const comment = await storage.getCrewPhotoComment(req.params.commentId);
    if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");

    // Verify the comment's parent photo belongs to crew :id (photo-comments have no crewId column).
    const parentPhoto = await storage.getCrewPhoto(comment.photoId);
    if (!parentPhoto || parentPhoto.crewId !== req.params.id) return sendError(res, 404, "댓글을 찾을 수 없습니다");

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
    if (await requireCrewMember(req, res) === null) return;
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
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "사진을 찾을 수 없습니다");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (photo.uploaderId !== req.userId && !isAdmin) {
        return sendError(res, 403, "삭제 권한이 없습니다");
    }

    await storage.deleteCrewPhoto(req.params.photoId);
    await deleteBlobs((photo as any).url);
    return sendSuccess(res, { success: true });
}));


// --- Chats ---

// GET /crews/:id/chats
router.get("/:id/chats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // Members only — a pending (승인 대기) applicant must not read the crew's private chat.
    if (await requireCrewMember(req, res) === null) return;
    const chats = await storage.getCrewChats(req.params.id, req.userId);
    return sendSuccess(res, chats);
}));

// POST /crews/:id/chats
router.post("/:id/chats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;

    if (!req.body?.message || typeof req.body.message !== 'string' || !req.body.message.trim()) {
        return sendError(res, 400, "메시지를 입력해주세요");
    }

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
                const chatSetting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                if (!chatSetting.chatEnabled) continue;
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
    if (!chat || chat.crewId !== req.params.id) return sendError(res, 404, "메시지를 찾을 수 없습니다");

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
    if (await requireCrewMember(req, res) === null) return;
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
    // P2: 투표 생성 → 크루원 전원에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const author = await storage.getMemberById(req.userId!);
            for (const m of crewData.members) {
                if (m.member.id === req.userId) continue;
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                if (!setting.pollEnabled) continue;
                notificationService.sendAndSaveNotification({
                    memberId: m.member.id,
                    title: `📊 [${crewData.crew.name}] 새 투표`,
                    body: `${author?.name || "누군가"}님이 "${rest.title || "투표"}"를 만들었어요. 지금 참여해보세요!`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "POLL",
                    params: { url: `/crew/${req.params.id}` },
                }).catch((err: any) => console.error("[PollCreateNotif]", err));
            }
        }
    } catch(e) {}
    return sendSuccess(res, poll);
}));

// POST /polls/:pollId/vote - Vote/Toggle vote
router.post("/:id/polls/:pollId/vote", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const { optionId } = req.body;
    if (!optionId) return sendError(res, 400, "선택지 ID가 필요합니다");

    // Scope check: the option must belong to :pollId, which must belong to crew :id.
    const poll = await storage.getPollByOptionId(optionId);
    if (!poll || poll.id !== req.params.pollId || poll.crewId !== req.params.id) {
        return sendError(res, 404, "투표를 찾을 수 없습니다");
    }

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
    // Resolve the poll from the option itself — never trust the :id path param for authorization.
    const poll = await storage.getPollByOptionId(req.params.optionId);
    if (!poll) return sendError(res, 404, "선택지를 찾을 수 없습니다");

    // Only members of the poll's OWN crew may inspect voters.
    const membership = await storage.getCrewMembership(poll.crewId, req.userId!);
    if (!membership || membership.role === 'pending') {
        return sendError(res, 403, "크루 멤버만 이용할 수 있습니다");
    }

    // Anonymous polls: expose the aggregate count only, never voter identities.
    if (poll.isAnonymous) {
        const votes = await storage.getPollVotes(req.params.optionId);
        return sendSuccess(res, { anonymous: true, count: votes.length });
    }

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

    // Ownership is set from the authenticated session — never trust a client-supplied leaderId.
    // countryCode도 서버가 결정: 생성자 프로필 국가(자동 수집분) → 없으면 IP 헤더 → 그래도 없으면 null.
    const leader = await storage.getMemberById(req.userId!);
    let countryCode: string | undefined;
    if (leader?.profileId) {
        const profile = await storage.getProfile(leader.profileId);
        countryCode = (profile as any)?.countryCode || undefined;
    }
    if (!countryCode && typeof req.headers["x-vercel-ip-country"] === "string") {
        countryCode = (req.headers["x-vercel-ip-country"] as string).toUpperCase().slice(0, 2);
    }

    // 좌표 폴백 — 클라가 좌표를 안 보냈으면 지역 텍스트를 도시 수준으로 지오코딩.
    // (거리순 크루 발견의 데이터 파이프. 실패해도 좌표 없이 저장 — 무해)
    let { latitude, longitude } = validation.data as any;
    if ((latitude == null || longitude == null) && validation.data.region) {
        const { geocodeCity } = await import("../../lib/geocode.js");
        const geo = await geocodeCity(validation.data.region, countryCode);
        if (geo) { latitude = geo.lat; longitude = geo.lng; }
    }

    const crew = await storage.createCrew({ ...validation.data, leaderId: req.userId!, countryCode, latitude, longitude });
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
    // P0: 가입 신청 → 리더/매니저에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const applicant = await storage.getMemberById(req.userId!);
            const applicantName = applicant?.name || "누군가";
            const admins = crewData.members.filter((m: any) => m.role === "leader" || m.role === "manage");
            for (const admin of admins) {
                notificationService.sendAndSaveNotification({
                    memberId: admin.member.id,
                    title: `📩 [${crewData.crew.name}] 가입 신청`,
                    body: `${applicantName}님이 크루 가입을 신청했어요. 확인 후 승인해주세요.`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "SYSTEM",
                    params: { url: `/crew/${req.params.id}` },
                }).catch((err: any) => console.error("[JoinReqNotif]", err));
            }
        }
    } catch(e) {}
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

    // Whitelist editable fields only. Ownership/immutable fields (leaderId, id, createdAt,
    // sportCategory) are deliberately excluded to prevent mass-assignment / ownership hijack.
    const EDITABLE = ['name', 'description', 'emblem', 'gameType', 'region', 'tags', 'joinType',
        'maxMembers', 'coverImage', 'shortIntro', 'meetingDay', 'meetingTime', 'introQuestions',
        'latitude', 'longitude', 'baseStoreId'] as const;
    const updateData: any = {};
    for (const key of EDITABLE) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    const oldCrew = data?.crew;
    const crew = await storage.updateCrew(crewId, updateData);

    // A replaced cover/emblem leaves the old Blob orphaned — delete it. emblem may be an
    // emoji (ignored by deleteBlobs). Only when the field was actually changed to a new value.
    if ('coverImage' in updateData && updateData.coverImage !== oldCrew?.coverImage) {
        await deleteBlobs(oldCrew?.coverImage);
    }
    if ('emblem' in updateData && updateData.emblem !== oldCrew?.emblem) {
        await deleteBlobs(oldCrew?.emblem);
    }
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

    // Collect every Blob this crew owns BEFORE the cascade delete wipes the rows.
    const [photos, posts] = await Promise.all([
        storage.getCrewPhotos(crewId).catch(() => [] as any[]),
        storage.getCrewPosts(crewId).catch(() => [] as any[]),
    ]);
    await storage.deleteCrew(crewId);
    await deleteBlobs([
        crew.crew?.coverImage,
        crew.crew?.emblem,
        ...photos.map((p: any) => p?.url),
        ...posts.flatMap((p: any) => p?.images ?? []),
    ]);
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

    if (req.userId === memberId) {
        // Self leave / cancel pending request. The leader cannot abandon the crew —
        // they must transfer leadership or delete the crew first (else it becomes ownerless).
        const membership = await storage.getCrewMembership(crewId, memberId);
        if (membership?.role === 'leader') {
            return sendError(res, 400, "크루장은 탈퇴할 수 없습니다. 크루를 삭제하거나 리더를 위임해주세요.");
        }
    } else {
        // Kicking another member — check admin permissions.
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

        // P1: 강퇴 → 당사자에게 알림
        try {
            const crewData = await storage.getCrew(req.params.id);
            notificationService.sendAndSaveNotification({
                memberId: memberId,
                title: `⚠️ [${crewData?.crew.name || "크루"}] 강퇴 안내`,
                body: "크루에서 탈퇴 처리되었습니다.",
                category: crewData?.crew?.sportCategory || "BILLIARDS",
                type: "SYSTEM",
                params: { url: "/club" },
            }).catch((err: any) => console.error("[KickNotif]", err));
        } catch(e) {}
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

    // P1: 역할 변경 → 대상자에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        const roleLabel = role === "manage" ? "부관리자" : role === "member" ? "일반 멤버" : role;
        notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: `👤 [${crewData?.crew.name || "크루"}] 권한 변경`,
            body: `크루장님이 회원을 "${roleLabel}"(으)로 변경했어요.`,
            category: crewData?.crew?.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { url: `/crew/${req.params.id}` },
        }).catch((err: any) => console.error("[RoleChangeNotif]", err));
    } catch(e) {}

    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/settlements
router.post("/:id/settlements", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
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

    // Broadcast a settlement card into the crew chat so members can see and open it.
    // (The client sends sendToChat: true; without this the settlement dead-ends after creation.)
    if (req.body.sendToChat) {
        const totalAmount = Array.isArray(items)
            ? items.reduce((sum: number, it: any) => sum + (Number(it?.amount) || 0), 0)
            : 0;
        try {
            await storage.createCrewChat({
                crewId: req.params.id,
                senderId: req.userId,
                message: `정산 요청: ${settlement.title}`,
                type: 'settlement',
                metadata: { settlementId: settlement.id, title: settlement.title, totalAmount },
            } as any);
        } catch (chatErr) {
            // Settlement already committed; a failed chat card must not fail the request.
            console.error("[Settlement] chat card creation failed:", chatErr);
        }
    }

    // P0: 정산 요청 → 참여 대상자들 모두에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData && participants && Array.isArray(participants)) {
            const creator = await storage.getMemberById(req.userId!);
            const creatorName = creator?.name || "크루원";
            for (const p of participants) {
                const pid = typeof p === "string" ? p : p?.memberId;
                if (pid && pid !== req.userId) {
                    notificationService.sendAndSaveNotification({
                        memberId: pid,
                        title: `💰 [${crewData.crew.name}] 정산 요청`,
                        body: `${creatorName}님이 정산 "${settlement.title}"을(를) 요청했어요. 총 ${settlement.totalAmount?.toLocaleString()}원`,
                        category: crewData.crew.sportCategory || "BILLIARDS",
                        type: "SETTLEMENT",
                        params: { url: `/crew/${req.params.id}` },
                    }).catch((err: any) => console.error("[SettlementNotif]", err));
                }
            }
        }
    } catch(e) {}

    return sendSuccess(res, settlement);
}));

// GET /crews/:id/notifications/settings
router.get("/:id/notifications/settings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, req.userId!);
    return sendSuccess(res, setting);
}));

// PATCH /crews/:id/notifications/settings
router.patch("/:id/notifications/settings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { chatEnabled, activityEnabled, settlementEnabled, postCommentEnabled, pollEnabled } = req.body;
    await storage.notifs.upsertCrewNotificationSetting({
        crewId: req.params.id,
        memberId: req.userId!,
        chatEnabled: chatEnabled ?? true,
        activityEnabled: activityEnabled ?? true,
        settlementEnabled: settlementEnabled ?? true,
        postCommentEnabled: postCommentEnabled ?? true,
        pollEnabled: pollEnabled ?? true,
    });
    return sendSuccess(res, { success: true });
}));

export default router;
