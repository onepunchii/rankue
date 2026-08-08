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

// 알림 발송을 await 한다 — 서버리스(Vercel)는 응답을 보내면 실행이 얼어붙어서
// fire-and-forget으로 띄운 푸시가 그대로 유실된다. 개별 실패는 로그만 남기고
// 요청 자체는 성공시켜야 하므로 allSettled.
async function settleNotifications(tag: string, tasks: Promise<any>[]): Promise<void> {
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'rejected') console.error(tag, r.reason);
    }
}

// 크루 브로드캐스트 대상 — 승인 대기(pending)는 아직 크루원이 아니므로 제외한다.
// storage.getCrew()는 pending까지 그대로 담아 돌려주기 때문에(읽기 전용 리포지토리),
// 그대로 쓰면 앱에서 채팅 조회가 403으로 막힌 신청자에게 채팅 원문("보낸사람: 메시지")이
// 푸시 본문으로 새어 나갔다.
function activeMembers(members: any[] | undefined): any[] {
    return (members || []).filter((m: any) => m?.role !== 'pending');
}


// --- Activities ---

// GET /activities - Get upcoming activities
// 가입 검토 중인 로그인 사용자에게는 보여주되(가입 유도), 비로그인 크롤러성 접근은 차단
router.get("/:id/activities", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
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
            await settleNotifications("[ActivityCreateNotif]", activeMembers(crewData.members)
                .filter((m: any) => m.member.id !== req.userId)
                .map(async (m: any) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                    if (!setting.activityEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: m.member.id,
                        title: `📅 [${crewData.crew.name}] 새 정모`,
                        body: `${creator?.name || "누군가"}님이 "${activity.title || "정모"}"를 만들었어요. ${activityTime}`,
                        category: crewData.crew.sportCategory || "BILLIARDS",
                        type: "ACTIVITY",
                        params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
                    });
                }));
        }
    } catch(e) { console.error("[Notify] 정모 생성:", e); }
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
            await notificationService.sendAndSaveNotification({
                memberId: act.creatorId,
                title: "✅ 정모 참가",
                body: `${joiner?.name || "누군가"}님이 "${act.title || "정모"}"에 참가했어요!`,
                category: "BILLIARDS",
                type: "ACTIVITY",
                params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
            }).catch((err: any) => console.error("[ActivityJoinNotif]", err));
        }
    } catch(e) { console.error("[Notify] 정모 참가:", e); }
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
    // 참가자는 별도 테이블에 있다 — 정모 행에는 participants 컬럼이 없어서 예전엔 항상 스킵됐다.
    try {
        const participantIds = await storage.crews.getActivityParticipantIds(req.params.activityId);
        if (participantIds.length > 0) {
            const crewData = await storage.getCrew(req.params.id);
            await settleNotifications("[ActivityEditNotif]", participantIds
                .filter((pid) => pid !== req.userId)
                .map(async (pid) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                    if (!setting.activityEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: pid,
                        title: `⚠️ [${crewData?.crew.name || "크루"}] 정모 수정`,
                        body: `"${updated?.title || activity.title || "정모"}"이(가) 수정되었어요.`,
                        category: crewData?.crew?.sportCategory || "BILLIARDS",
                        type: "ACTIVITY",
                        params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
                    });
                }));
        }
    } catch(e) { console.error("[Notify] 정모 수정:", e); }
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

    // 삭제하면 참가자 행도 같이 사라지므로 알림 대상은 반드시 삭제 '전에' 확보한다.
    const participantIds = await storage.crews.getActivityParticipantIds(req.params.activityId)
        .catch(() => [] as string[]);

    await storage.deleteCrewActivity(req.params.activityId);
    // P1: 정모 취소 → 참여자 전원에게 알림
    try {
        if (participantIds.length > 0) {
            const crewData = await storage.getCrew(req.params.id);
            await settleNotifications("[ActivityDeleteNotif]", participantIds
                .filter((pid) => pid !== req.userId)
                .map(async (pid) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                    if (!setting.activityEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: pid,
                        title: `⚠️ [${crewData?.crew.name || "크루"}] 정모 취소`,
                        body: `"${activity.title || "정모"}"이(가) 취소되었어요.`,
                        category: crewData?.crew?.sportCategory || "BILLIARDS",
                        type: "ACTIVITY",
                        params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
                    });
                }));
        }
    } catch(e) { console.error("[Notify] 정모 취소:", e); }
    return sendSuccess(res, { success: true });
}));

// GET /activities/member/:memberId - 멤버별 활동 내역 (페르소나 분석용)
// 임의 회원 이력 열람 방지 — 최소한 로그인 사용자로 제한
router.get("/activities/member/:memberId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = req.query.crewId as string;
    const result = await storage.getMemberActivities(req.params.memberId, crewId);
    return sendSuccess(res, result);
}));


// --- Posts ---

// GET /posts — 승인제 크루의 게시판은 크루원 전용 (비로그인·승인 대기자 차단)
router.get("/:id/posts", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const posts = await storage.getCrewPosts(req.params.id, req.userId);
    return sendSuccess(res, posts);
}));

// POST /posts
router.post("/:id/posts", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await requireCrewMember(req, res);
    if (role === null) return;
    const data = {
        ...req.body,
        crewId: req.params.id,
        authorId: req.userId,
        // 공지 등록은 운영진 전용 — 일반 멤버가 isNotice:true를 실어 보내 상단 고정 공지로
        // 올리는 걸 막는다.
        isNotice: (role === 'leader' || role === 'manage') ? req.body.isNotice === true : false,
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

// POST /posts/:postId/like - Toggle Like (members only)
router.post("/:id/posts/:postId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "게시글을 찾을 수 없습니다");
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
                await notificationService.sendAndSaveNotification({
                    memberId: post.authorId,
                    title: `💬 새 댓글`,
                    body: `${commenter?.name || "누군가"}님이 "${post.title || "게시글"}"에 댓글을 달았습니다.`,
                    category: "BILLIARDS",
                    type: "POST_COMMENT",
                    params: { url: `/crew/${req.params.id}/board`, crewId: req.params.id, tab: "board" },
                }).catch((err: any) => console.error("[CommentNotif]", err));
            }
        }
    } catch(e) { console.error("[Notify] 게시글 댓글:", e); }
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

// GET /crews/:id/photos — 사진첩도 크루원 전용 (원본 URL 무단 열람 방지)
router.get("/:id/photos", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const photos = await storage.getCrewPhotos(req.params.id, req.userId);
    return sendSuccess(res, photos);
}));

// POST /crews/:id/photos/:photoId/like (members only)
router.post("/:id/photos/:photoId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "사진을 찾을 수 없습니다");
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
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) return sendError(res, 400, "사진 URL이 필요합니다");
    // 화이트리스트 — req.body를 그대로 펼치면 id/createdAt까지 통과해 PK 충돌이나
    // 목록 최상단 강제 점유가 가능하다.
    const photo = await storage.createCrewPhoto({
        crewId: req.params.id,
        uploaderId: req.userId,
        url,
        caption: typeof req.body?.caption === 'string' ? req.body.caption : null,
    } as any);
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

    // 화이트리스트 — req.body를 그대로 펼치면 id/createdAt까지 통과해 PK 충돌이나
    // 목록 최상단 강제 점유가 가능하다.
    // type/metadata도 받지 않는다 — 클라이언트가 지정할 수 있으면 가짜 정산·예약 카드를
    // 주입할 수 있다. 카드형 메시지(settlement 등)는 서버 내부 생성 경로에서만 만든다.
    const chat = await storage.createCrewChat({
        crewId: req.params.id,
        senderId: req.userId,
        message: req.body.message,
        type: "text",
        metadata: null,
    } as any);

    // Send notification to all crew members except sender
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const userId = req.userId!;
            // pending 제외 — 알림 본문에 대화 원문이 그대로 실린다(아래 body 참고).
            const membersToNotify = activeMembers(crewData.members).filter((m: any) => m.member.id !== userId);
            const sender = crewData.members.find((m: any) => m.member.id === userId);
            const senderName = sender?.member.name || "누군가";

            // 설정 조회도 멤버별로 병렬 — 예전엔 멤버 수만큼 순차 await이라 큰 크루에서 응답이 느렸다.
            await settleNotifications("[ChatNotif]", membersToNotify.map(async (m: any) => {
                const chatSetting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                if (!chatSetting.chatEnabled) return;
                await notificationService.sendAndSaveNotification({
                    memberId: m.member.id,
                    title: `💬 [${crewData.crew.name}] 새 메시지`,
                    body: `${senderName}: ${chat.message}`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "CHAT",
                    params: { url: `/crew/${req.params.id}/chat`, crewId: req.params.id, tab: "chat" }
                });
            }));
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

// GET /polls - List crew polls — 크루원 전용
router.get("/:id/polls", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const polls = await storage.getCrewPolls(req.params.id, req.userId);
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
            await settleNotifications("[PollCreateNotif]", activeMembers(crewData.members)
                .filter((m: any) => m.member.id !== req.userId)
                .map(async (m: any) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                    if (!setting.pollEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: m.member.id,
                        title: `📊 [${crewData.crew.name}] 새 투표`,
                        body: `${author?.name || "누군가"}님이 "${rest.title || "투표"}"를 만들었어요. 지금 참여해보세요!`,
                        category: crewData.crew.sportCategory || "BILLIARDS",
                        type: "POLL",
                        params: { url: `/crew/${req.params.id}/poll`, crewId: req.params.id, tab: "poll" },
                    });
                }));
        }
    } catch(e) { console.error("[Notify] 투표 생성:", e); }
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

// 베이스 매장(디렉토리 코드) 검증 — 형식·실존 확인. 통과 시 null, 실패 시 에러 메시지.
async function validateBaseListing(data: { baseListingCode?: string | null }): Promise<string | null> {
    const code = String(data.baseListingCode || "").trim();
    if (!code) { data.baseListingCode = null; return null; }
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) return "잘못된 매장 코드입니다";
    const { db } = await import("../../db.js");
    const { storeListings } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select({ code: storeListings.code }).from(storeListings).where(eq(storeListings.code, code));
    if (!row) return "존재하지 않는 매장입니다";
    data.baseListingCode = code;
    return null;
}

// GET /crews/store-search — 크루 베이스 매장 선택용 통합 검색 (파트너 + 디렉토리 1,195곳)
router.get("/store-search", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const q = String(req.query.q || "").trim().slice(0, 40);
    if (q.length < 2) return sendSuccess(res, []);
    const { db } = await import("../../db.js");
    const { storeListings } = await import("../../../shared/schema.js");
    const { ilike, or, asc } = await import("drizzle-orm");
    const [partners, listings] = await Promise.all([
        storage.searchStores(q),
        db.select({
            code: storeListings.code, name: storeListings.name,
            region: storeListings.region, address: storeListings.address,
        }).from(storeListings)
            .where(or(ilike(storeListings.name, `%${q}%`), ilike(storeListings.address, `%${q}%`)))
            .orderBy(asc(storeListings.name)).limit(15),
    ]);
    // 파트너 매장 우선 노출, 같은 이름의 디렉토리 항목과 중복돼도 그대로 둔다(주소로 구분 가능)
    return sendSuccess(res, [
        ...(partners as any[]).slice(0, 5).map((s) => ({ type: "partner", id: s.id, name: s.name, address: s.address ?? s.region ?? "" })),
        ...listings.map((s) => ({ type: "listing", code: s.code, name: s.name, address: s.address, region: s.region })),
    ]);
}));

// POST /crews - Create a new crew
router.post("/", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const validation = insertHiqCrewSchema.safeParse(req.body);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }
    // 크루명 — zod 스키마에 min/max가 없어 빈 문자열·초장문이 통과한다 (클라 trim 검사는 우회 가능)
    validation.data.name = String(validation.data.name || "").trim();
    if (!validation.data.name || validation.data.name.length > 30) {
        return sendError(res, 400, "크루 이름은 1~30자여야 합니다");
    }
    if (await storage.crews.findCrewByName(validation.data.name)) {
        return sendError(res, 409, "이미 사용 중인 크루 이름입니다");
    }
    // 베이스 매장(디렉토리) — 존재하는 코드만 허용. 깨진 코드가 저장되면
    // 매장 상세의 "활동 크루" 집계가 유령 매장을 가리킨다.
    if (validation.data.baseListingCode != null) {
        const err = await validateBaseListing(validation.data as any);
        if (err) return sendError(res, 400, err);
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
// 나이·성별은 크루 안에서 쓰는 멤버 카드 기능 — 크루원이 아닌 조회자(비로그인 포함)에게는
// 내려주지 않는다. 크루 홈은 SEO 공개 페이지라 엔드포인트 자체는 열어둔다.
async function stripMemberPrivacy(req: any, crew: any): Promise<any> {
    const userId = (req as any).signedCookies?.hiq_user_id;
    if (userId) {
        const membership = await storage.getCrewMembership(crew.crew.id, userId);
        if (membership && membership.role !== "pending") return crew;
    }
    return {
        ...crew,
        members: (crew.members || []).map((m: any) => ({
            ...m,
            member: { ...m.member, birthYear: null, gender: null },
        })),
    };
}

router.get("/:id", asyncHandler(async (req: any, res: any) => {
    const crew = await storage.getCrew(req.params.id);
    if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");
    return sendSuccess(res, await stripMemberPrivacy(req, crew));
}));

// GET /crews/:id/members - Get all members of a crew
router.get("/:id/members", asyncHandler(async (req: any, res: any) => {
    const crew = await storage.getCrew(req.params.id);
    if (!crew) return sendError(res, 404, "크루를 찾을 수 없습니다");
    return sendSuccess(res, (await stripMemberPrivacy(req, crew)).members);
}));

// POST /crews/:id/join - Join a crew
router.post("/:id/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await storage.joinCrew(req.params.id, req.userId!);
    // P0: 가입 → 리더/매니저에게 알림
    // joinType이 'auto'(기본값)면 joinCrew가 곧바로 'member'로 확정한다 — 그때도 "승인해주세요"를
    // 보내면 운영진이 들어가 봐야 승인할 대기자가 없다. 실제 role로 문구를 나눈다.
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const applicant = await storage.getMemberById(req.userId!);
            const applicantName = applicant?.name || "누군가";
            const isPending = role === 'pending';
            const admins = crewData.members.filter((m: any) => m.role === "leader" || m.role === "manage");
            await settleNotifications("[JoinReqNotif]", admins.map((admin: any) =>
                notificationService.sendAndSaveNotification({
                    memberId: admin.member.id,
                    title: isPending
                        ? `📩 [${crewData.crew.name}] 가입 신청`
                        : `🙌 [${crewData.crew.name}] 새 멤버 합류`,
                    body: isPending
                        ? `${applicantName}님이 크루 가입을 신청했어요. 확인 후 승인해주세요.`
                        : `${applicantName}님이 크루에 합류했어요. 반갑게 맞아주세요!`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "SYSTEM",
                    params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
                })));
        }
    } catch(e) { console.error("[Notify] 크루 가입:", e); }
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
        'latitude', 'longitude', 'baseStoreId', 'baseListingCode'] as const;
    const updateData: any = {};
    for (const key of EDITABLE) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    // 값 검증 — 화이트리스트만으로는 부족하다. 드리즐 text enum은 DB CHECK가 아니라서
    // joinType에 깨진 값이 들어가면 joinCrew의 'approval' 비교가 실패해 승인제 크루가
    // 사실상 자동가입으로 변질된다.
    if (updateData.joinType !== undefined && !['auto', 'approval'].includes(updateData.joinType)) {
        return sendError(res, 400, "잘못된 가입 방식입니다");
    }
    if (updateData.baseListingCode !== undefined && updateData.baseListingCode !== null) {
        const err = await validateBaseListing(updateData);
        if (err) return sendError(res, 400, err);
    }
    if (updateData.gameType !== undefined && updateData.gameType !== null
        && !['3c', '4c', 'pocket', 'any', 'field', 'screen', 'range'].includes(updateData.gameType)) {
        return sendError(res, 400, "잘못된 활동 종목입니다");
    }
    if (updateData.name !== undefined) {
        updateData.name = String(updateData.name).trim();
        if (!updateData.name || updateData.name.length > 30) return sendError(res, 400, "크루 이름은 1~30자여야 합니다");
        // 클라이언트는 이름을 안 바꿔도 전체 폼을 보낸다 — 자기 현재 이름 그대로면 중복
        // 검사를 건너뛴다 (레거시 변형 중복이 있어도 이름 외 설정 저장이 막히지 않게).
        if (updateData.name !== data?.crew?.name && await storage.crews.findCrewByName(updateData.name, crewId)) {
            return sendError(res, 409, "이미 사용 중인 크루 이름입니다");
        }
    }
    if (updateData.maxMembers !== undefined && updateData.maxMembers !== null) {
        const n = Number(updateData.maxMembers);
        if (!Number.isInteger(n) || n < 0 || n > 1000) return sendError(res, 400, "정원이 올바르지 않습니다");
        updateData.maxMembers = n;
        // 현재 인원보다 작게 줄이면 신규 가입만 막히고 아무 안내가 없다 — 명시적으로 거부
        const activeCount = (data?.members || []).filter((m: any) => m.role !== 'pending').length;
        if (n > 0 && n < activeCount) return sendError(res, 400, `현재 크루원(${activeCount}명)보다 정원을 작게 설정할 수 없습니다`);
    }
    if (updateData.tags !== undefined && (!Array.isArray(updateData.tags) || updateData.tags.length > 3 || updateData.tags.some((t: any) => typeof t !== "string" || t.length > 20))) {
        return sendError(res, 400, "태그가 올바르지 않습니다");
    }
    if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, "수정할 내용이 없습니다"); // 빈 UPDATE는 드리즐이 500을 던진다
    }

    const oldCrew = data?.crew;
    let crew;
    try {
        crew = await storage.updateCrew(crewId, updateData);
    } catch (e: any) {
        // check-then-write 사이의 경합으로 DB unique(name)에 걸리면 500이 아니라 409로
        if (e?.code === "23505") return sendError(res, 409, "이미 사용 중인 크루 이름입니다");
        throw e;
    }

    // 승인제 → 자동 전환: 기존 대기자를 신청 순서대로 정원 내에서 자동 승격.
    // 방치하면 먼저 신청한 사람이 무기한 pending으로 남고 새 신청자만 즉시 가입되는 역전이 생긴다.
    let promotedIds: string[] = [];
    if (oldCrew?.joinType === 'approval' && updateData.joinType === 'auto') {
        try {
            promotedIds = await storage.crews.promotePendingMembers(crewId);
            await settleNotifications("[JoinTypePromote]", promotedIds.map(memberId =>
                notificationService.sendAndSaveNotification({
                    memberId,
                    title: `🎉 [${crew?.name || oldCrew?.name}] 가입 승인`,
                    body: "크루가 바로 가입 방식으로 바뀌면서 가입이 승인되었어요!",
                    category: oldCrew?.sportCategory || "BILLIARDS",
                    type: "CREW",
                    params: { url: `/crew/${crewId}/home`, crewId },
                })));
        } catch (e) { console.error("[JoinTypePromote]", e); }
    }

    // A replaced cover/emblem leaves the old Blob orphaned — delete it. emblem may be an
    // emoji (ignored by deleteBlobs). Only when the field was actually changed to a new value.
    if ('coverImage' in updateData && updateData.coverImage !== oldCrew?.coverImage) {
        await deleteBlobs(oldCrew?.coverImage);
    }
    if ('emblem' in updateData && updateData.emblem !== oldCrew?.emblem) {
        await deleteBlobs(oldCrew?.emblem);
    }
    return sendSuccess(res, { ...crew, promotedCount: promotedIds.length });
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

    // 대상 확인·정원 확인·승격을 리포지토리 트랜잭션(FOR UPDATE)에서 원자적으로 처리 —
    // 여기서 조회-후-갱신하면 동시 승인 두 건이 같은 잔여 정원을 보고 초과 승인된다.
    await storage.crews.approveCrewMember(crewId, memberId);

    // Send Notification to Approved Member
    try {
        await notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: `🎉 [${data.crew.name}] 가입 승인`,
            body: "크루 가입이 승인되었습니다! 지금 활동을 시작해보세요.",
            category: data.crew.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { url: `/crew/${crewId}/home`, crewId: crewId, tab: "home" }
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

        // P1: 강퇴/가입 반려 → 당사자에게 알림
        // 클라의 승인 대기 목록 X 버튼도 이 라우트를 쓴다 — 대상이 pending이면 가입한 적이 없으므로
        // "탈퇴 처리" 문구는 사실과 다르다. 현재 role로 문구를 나눈다.
        try {
            const crewName = data?.crew?.name || "크루";
            const isPendingTarget = target.role === 'pending';
            await notificationService.sendAndSaveNotification({
                memberId: memberId,
                title: isPendingTarget
                    ? `📪 [${crewName}] 가입 신청 결과`
                    : `⚠️ [${crewName}] 강퇴 안내`,
                body: isPendingTarget
                    ? "가입 신청이 반려되었습니다."
                    : "크루에서 탈퇴 처리되었습니다.",
                category: data?.crew?.sportCategory || "BILLIARDS",
                type: "SYSTEM",
                params: { url: "/club" },
            }).catch((err: any) => console.error("[KickNotif]", err));
        } catch(e) { console.error("[Notify] 강퇴/가입 반려:", e); }
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

    // 검증 없이 저장하면 'leader'나 'pending' 같은 값이 그대로 들어가 권한 체계가 뒤틀린다.
    if (role !== 'manage' && role !== 'member') {
        return sendError(res, 400, "변경할 수 있는 권한은 부관리자/일반 멤버뿐입니다");
    }
    // 리더가 스스로를 강등하면 크루에 리더가 없어져 삭제·위임 모두 막힌다(위임은 별도 기능).
    if (memberId === req.userId) {
        return sendError(res, 400, "크루장은 자신의 권한을 변경할 수 없습니다");
    }

    const target = data?.members.find((m: any) => m.member.id === memberId);
    if (!target) return sendError(res, 404, "대상을 찾을 수 없습니다");
    if (target.role === 'pending') return sendError(res, 400, "가입 승인 후에 권한을 변경할 수 있습니다");

    await storage.updateCrewMemberRole(crewId, memberId, role);

    // P1: 역할 변경 → 대상자에게 알림
    try {
        const roleLabel = role === "manage" ? "부관리자" : "일반 멤버";
        await notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: `👤 [${data?.crew?.name || "크루"}] 권한 변경`,
            body: `크루장님이 회원을 "${roleLabel}"(으)로 변경했어요.`,
            category: data?.crew?.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { url: `/crew/${crewId}/home`, crewId, tab: "home" },
        }).catch((err: any) => console.error("[RoleChangeNotif]", err));
    } catch(e) { console.error("[Notify] 권한 변경:", e); }

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

    // hiqSettlements에는 totalAmount 컬럼이 없다 — 항목 금액을 합산해서 쓴다(채팅 카드·알림 공용).
    const totalAmount = Array.isArray(items)
        ? items.reduce((sum: number, it: any) => sum + (Number(it?.amount) || 0), 0)
        : 0;

    // Broadcast a settlement card into the crew chat so members can see and open it.
    // (The client sends sendToChat: true; without this the settlement dead-ends after creation.)
    if (req.body.sendToChat) {
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

    const settlementTab = req.body.sendToChat ? "chat" : "home";

    // P0: 정산 요청 → 참여 대상자들 모두에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData && Array.isArray(participants)) {
            const creator = await storage.getMemberById(req.userId!);
            const creatorName = creator?.name || "크루원";

            // participants는 클라 body에서 그대로 온다 — 크루원 집합과 교집합만 남긴다.
            // (검증이 없으면 임의의 memberId를 실어 아무에게나 푸시를 보낼 수 있었다.)
            // 같은 사람이 여러 차수에 들어 있어도 알림은 1번이면 되므로 Set으로 중복 제거.
            // 승인 대기자는 정산 대상이 될 수 없다 — 교집합을 정식 멤버로 한정한다.
            const crewMemberIds = new Set(activeMembers(crewData.members).map((m: any) => m.member.id));
            const targetIds = new Set<string>();
            for (const p of participants) {
                const pid = typeof p === "string" ? p : p?.memberId;
                if (pid && pid !== req.userId && crewMemberIds.has(pid)) targetIds.add(pid);
            }

            await settleNotifications("[SettlementNotif]", [...targetIds].map(async (pid) => {
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                if (!setting.settlementEnabled) return;
                await notificationService.sendAndSaveNotification({
                    memberId: pid,
                    title: `💰 [${crewData.crew.name}] 정산 요청`,
                    body: `${creatorName}님이 정산 "${settlement.title}"을(를) 요청했어요. 총 ${totalAmount.toLocaleString()}원`,
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "SETTLEMENT",
                    // 정산은 채팅 카드로만 열 수 있다 — 카드를 안 보냈으면 홈으로.
                    params: { url: `/crew/${req.params.id}/${settlementTab}`, crewId: req.params.id, tab: settlementTab },
                });
            }));
        }
    } catch(e) { console.error("[Notify] 정산 요청:", e); }

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
