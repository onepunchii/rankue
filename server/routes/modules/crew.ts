import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertHiqCrewSchema, insertHiqCrewActivitySchema, insertHiqCrewPostSchema, insertHiqSettlementSchema, insertHiqPollSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { msg } from "../../lib/i18n.js";
import { notificationService } from "../../services/notificationService.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { deleteBlobs } from "../../utils/blob.js";
import { notifyCrewChat } from "../../services/crewChatNotify.js";
// 약관 미동의 회원의 UGC 작성 거절(TERMS_REQUIRED) — 작성 라우트에만 건다(middleware/terms.ts)
import { requireTermsAccepted } from "../../middleware/terms.js";
import { screenCrewFields, screenCrewText, screenCrewProfile, screenCrewBody, changedCrewProfileFields, isCrewReportTarget, isReportReason, type CrewReportTarget } from "../../utils/crewModeration.js";

import { isSuperAdmin } from "../../lib/superAdmin.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Membership gate: returns the member's role, or sends a 403/404 and returns null.
// Non-members and pending (승인 대기) members are rejected from writing crew content.
// 슈퍼 관리자는 가입하지 않아도 통과한다 — 신고를 확인하려면 그 크루의 글·채팅을 볼 수 있어야 한다(2026-09-23 오너).
// 'leader' 를 돌려주므로 이 문을 지나는 라우트 안의 운영진 검사도 함께 통과한다.
async function requireCrewMember(req: AuthRequest, res: any): Promise<string | null> {
    const membership = await storage.getCrewMembership(req.params.id, req.userId!);
    if (!membership || membership.role === 'pending') {
        if (await isSuperAdmin(req.userId)) return 'leader';
        sendError(res, 403, "err.crew.membersOnly");
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

// 정모의 사람이 쓰는 칸 — 제목은 크루원 전원의 푸시 본문으로도 나가므로 채팅과 같은 필터를 건다(검토 policy:R3).
// cost("게임비 1만원 엔빵")는 크루 맥락이라 모임비 표현이 통과한다.
const ACTIVITY_TEXT_KEYS = ["title", "description", "locationName", "cost"] as const;

// POST /activities - Create activity
router.post("/:id/activities", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const screenedActivity = screenCrewBody(req.body, ACTIVITY_TEXT_KEYS);
    if (!screenedActivity.ok) return sendError(res, 400, screenedActivity.reason);
    const data = {
        ...req.body,
        ...screenedActivity.value.fields,
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
            const blockers = await storage.crews.getBlockerIds(req.userId!); // 만든 사람을 차단한 크루원에게는 알리지 않는다
            await settleNotifications("[ActivityCreateNotif]", activeMembers(crewData.members)
                .filter((m: any) => m.member.id !== req.userId && !blockers.has(m.member.id))
                .map(async (m: any) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                    if (!setting.activityEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: m.member.id,
                        title: msg("notif.crew.activityNew.title", { crew: crewData.crew.name }),
                        body: msg("notif.crew.activityNew.body", { name: creator?.name || "누군가", title: activity.title || "정모", time: activityTime }),
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
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "err.crew.activityNotFound");
    await storage.joinCrewActivity(req.params.activityId, req.userId!);
    // P1: 정모 참가 → 생성자에게 알림
    try {
        const act = await storage.getCrewActivity(req.params.activityId);
        if (act?.creatorId && act.creatorId !== req.userId) {
            const joiner = await storage.getMemberById(req.userId!);
            await notificationService.sendAndSaveNotification({
                memberId: act.creatorId,
                title: "notif.crew.activityJoin.title",
                body: msg("notif.crew.activityJoin.body", { name: joiner?.name || "누군가", title: act.title || "정모" }),
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
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "err.crew.activityNotFound");
    await storage.leaveCrewActivity(req.params.activityId, req.userId!);
    return sendSuccess(res, { success: true });
}));

// PATCH /activities/:activityId - Update activity (Leader/Manager only)
router.patch("/:id/activities/:activityId", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewData = await storage.getCrew(req.params.id);
    if (!crewData) return sendError(res, 404, "err.crew.notFound");

    const me = crewData.members.find((m: any) => m.member.id === req.userId);
    if ((!me || (me.role !== 'leader' && me.role !== 'manage')) && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.crew.editAdminOnly");
    }

    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "err.crew.activityNotFound");

    const updateData: any = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.activityDate !== undefined) updateData.activityDate = new Date(req.body.activityDate);
    if (req.body.locationName !== undefined) updateData.locationName = req.body.locationName;
    if (req.body.cost !== undefined) updateData.cost = req.body.cost;
    if (req.body.maxParticipants !== undefined) updateData.maxParticipants = req.body.maxParticipants;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    const screenedEdit = screenCrewBody(updateData, ACTIVITY_TEXT_KEYS);
    if (!screenedEdit.ok) return sendError(res, 400, screenedEdit.reason);
    Object.assign(updateData, screenedEdit.value.fields);

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
                        title: msg("notif.crew.activityEdit.title", { crew: crewData?.crew.name || "크루" }),
                        body: msg("notif.crew.activityEdit.body", { title: updated?.title || activity.title || "정모" }),
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
    if (!crewData) return sendError(res, 404, "err.crew.notFound");

    const me = crewData.members.find((m: any) => m.member.id === req.userId);
    if ((!me || (me.role !== 'leader' && me.role !== 'manage')) && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.crew.deleteAdminOnly");
    }

    const activity = await storage.getCrewActivity(req.params.activityId);
    if (!activity || activity.crewId !== req.params.id) return sendError(res, 404, "err.crew.activityNotFound");

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
                        title: msg("notif.crew.activityCancel.title", { crew: crewData?.crew.name || "크루" }),
                        body: msg("notif.crew.activityCancel.body", { title: activity.title || "정모" }),
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
router.post("/:id/posts", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await requireCrewMember(req, res);
    if (role === null) return;
    // 게시 전 필터 — 커뮤니티와 같은 차단(내기·욕설·거래) + 연락처 마스킹 (Apple 1.2 / Play UGC).
    // 크루 게시판도 크루원끼리 보는 UGC 라 심사 요건이 똑같이 걸린다.
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    if ((str(req.body?.content) || "").length > 4000) return sendError(res, 400, "err.crew.contentTooLong");
    const screened = screenCrewFields({ title: str(req.body?.title), content: str(req.body?.content), category: str(req.body?.category) });
    if (!screened.ok) return sendError(res, 400, screened.reason);
    // 글의 종목은 크루가 정한다 — 예전엔 안 넣어서 골프 크루 글까지 BILLIARDS 로 저장됐다(2026-09-09 검토).
    const crewForPost = await storage.getCrew(req.params.id);
    const data = {
        ...req.body,
        ...(screened.value.title != null ? { title: screened.value.title } : {}),
        ...(screened.value.content != null ? { content: screened.value.content } : {}),
        crewId: req.params.id,
        authorId: req.userId,
        sportCategory: crewForPost?.crew?.sportCategory ?? "BILLIARDS",
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
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "err.crew.postNotFound");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (post.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "err.crew.deleteForbidden");
    }

    await storage.deleteCrewPost(req.params.postId);
    await deleteBlobs((post as any).images);
    return sendSuccess(res, { success: true });
}));

// POST /posts/:postId/like - Toggle Like (members only)
router.post("/:id/posts/:postId/like", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "err.crew.postNotFound");
    const result = await storage.toggleCrewPostLike(req.params.postId, req.userId!);
    return sendSuccess(res, result);
}));

// --- Comments ---

// GET /crews/:id/posts/:postId/comments - list comments
// 크루원 전용 — 글 목록이 크루원 전용인데 댓글만 로그인 없이 열려 있었다. 조회자를 알아야
// 차단한 사람의 댓글을 뺄 수 있기도 하다(Apple 1.2 차단).
router.get("/:id/posts/:postId/comments", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "err.crew.postNotFound");
    const comments = await storage.crews.getCrewPostComments(req.params.postId, req.userId);
    return sendSuccess(res, comments);
}));

// POST /crews/:id/posts/:postId/comments - add comment (members only)
router.post("/:id/posts/:postId/comments", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const post = await storage.getCrewPost(req.params.postId);
    if (!post || post.crewId !== req.params.id) return sendError(res, 404, "err.crew.postNotFound");
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return sendError(res, 400, "err.crew.commentRequired");
    if (content.length > 1000) return sendError(res, 400, "err.crew.commentTooLong");
    const screened = screenCrewText(content);
    if (!screened.ok) return sendError(res, 400, screened.reason);
    const comment = await storage.createCrewPostComment({
        postId: req.params.postId,
        authorId: req.userId!,
        content: screened.value,
    } as any);
    // P2: 댓글 → 게시글 작성자에게 알림. 작성자가 댓글 쓴 사람을 차단했으면 보내지 않는다 —
    // 목록에서 가려도 푸시로 이름·알림이 계속 오면 차단이 무력해진다.
    try {
        const post = await storage.getCrewPost(req.params.postId);
        if (post?.authorId && post.authorId !== req.userId && !(await storage.crews.hasBlocked(post.authorId, req.userId!))) {
            const commenter = await storage.getMemberById(req.userId!);
            const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, post.authorId);
            if (setting.postCommentEnabled) {
                await notificationService.sendAndSaveNotification({
                    memberId: post.authorId,
                    title: "notif.crew.comment.title",
                    body: msg("notif.crew.comment.body", { name: commenter?.name || "누군가", title: post.title || "게시글" }),
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
    if (!comment) return sendError(res, 404, "err.crew.commentNotFound");

    // Verify the comment's parent post belongs to crew :id (comments have no crewId column).
    const parentPost = await storage.getCrewPost(comment.postId);
    if (!parentPost || parentPost.crewId !== req.params.id) return sendError(res, 404, "err.crew.commentNotFound");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (comment.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "err.crew.deleteForbidden");
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
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "err.crew.photoNotFound");
    const result = await storage.toggleCrewPhotoLike(req.params.photoId, req.userId!);
    return sendSuccess(res, result);
}));

// GET /crews/:id/photos/:photoId/comments - list photo comments
// 크루원 전용 + 차단 필터 — 게시글 댓글과 같은 이유.
router.get("/:id/photos/:photoId/comments", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "err.crew.photoNotFound");
    const comments = await storage.crews.getCrewPhotoComments(req.params.photoId, req.userId);
    return sendSuccess(res, comments);
}));

// POST /crews/:id/photos/:photoId/comments - add photo comment (members only)
router.post("/:id/photos/:photoId/comments", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "err.crew.photoNotFound");
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return sendError(res, 400, "err.crew.commentRequired");
    if (content.length > 1000) return sendError(res, 400, "err.crew.commentTooLong");
    const screened = screenCrewText(content);
    if (!screened.ok) return sendError(res, 400, screened.reason);
    const comment = await storage.createCrewPhotoComment({
        photoId: req.params.photoId,
        authorId: req.userId!,
        content: screened.value,
    } as any);
    return sendSuccess(res, comment);
}));

// DELETE /crews/:id/photo-comments/:commentId
router.delete("/:id/photo-comments/:commentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const comment = await storage.getCrewPhotoComment(req.params.commentId);
    if (!comment) return sendError(res, 404, "err.crew.commentNotFound");

    // Verify the comment's parent photo belongs to crew :id (photo-comments have no crewId column).
    const parentPhoto = await storage.getCrewPhoto(comment.photoId);
    if (!parentPhoto || parentPhoto.crewId !== req.params.id) return sendError(res, 404, "err.crew.commentNotFound");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (comment.authorId !== req.userId && !isAdmin) {
        return sendError(res, 403, "err.crew.deleteForbidden");
    }

    await storage.deleteCrewPhotoComment(req.params.commentId);
    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/photos
router.post("/:id/photos", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) return sendError(res, 400, "err.crew.photoUrlRequired");
    // 캡션도 사진첩에 그대로 보이는 글이라 같은 필터를 건다
    const rawCaption = typeof req.body?.caption === 'string' ? req.body.caption.slice(0, 500) : null;
    const caption = rawCaption ? screenCrewText(rawCaption) : null;
    if (caption && !caption.ok) return sendError(res, 400, caption.reason);
    // 화이트리스트 — req.body를 그대로 펼치면 id/createdAt까지 통과해 PK 충돌이나
    // 목록 최상단 강제 점유가 가능하다.
    const photo = await storage.createCrewPhoto({
        crewId: req.params.id,
        uploaderId: req.userId,
        url,
        caption: caption ? caption.value : null,
    } as any);
    return sendSuccess(res, photo);
}));

// DELETE /crews/:id/photos/:photoId
router.delete("/:id/photos/:photoId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const photo = await storage.getCrewPhoto(req.params.photoId);
    if (!photo || photo.crewId !== req.params.id) return sendError(res, 404, "err.crew.photoNotFound");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (photo.uploaderId !== req.userId && !isAdmin) {
        return sendError(res, 403, "err.crew.deleteForbidden");
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
router.post("/:id/chats", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;

    if (!req.body?.message || typeof req.body.message !== 'string' || !req.body.message.trim()) {
        return sendError(res, 400, "err.crew.messageRequired");
    }
    if (req.body.message.length > 1000) return sendError(res, 400, "err.crew.messageTooLong");
    // 채팅도 필터 대상 — 내기·욕설·거래는 거부하고 전화번호·오픈채팅 링크는 가린다.
    // 가린 저장본이 알림 본문(chat.message)으로도 나가므로 푸시로 연락처가 새지 않는다.
    const screenedChat = screenCrewText(req.body.message);
    if (!screenedChat.ok) return sendError(res, 400, screenedChat.reason);

    // 화이트리스트 — req.body를 그대로 펼치면 id/createdAt까지 통과해 PK 충돌이나
    // 목록 최상단 강제 점유가 가능하다.
    // type/metadata도 받지 않는다 — 클라이언트가 지정할 수 있으면 가짜 정산·예약 카드를
    // 주입할 수 있다. 카드형 메시지(settlement 등)는 서버 내부 생성 경로에서만 만든다.
    const chat = await storage.createCrewChat({
        crewId: req.params.id,
        senderId: req.userId,
        message: screenedChat.value,
        type: "text",
        metadata: null,
    } as any);

    // 알림 — 서버가 만드는 카드(골프 부킹 공유)도 같은 함수를 쓴다.
    await notifyCrewChat({ crewId: req.params.id, senderId: req.userId!, preview: chat.message });

    return sendSuccess(res, chat);
}));

// DELETE /crews/:id/chats/:chatId
router.delete("/:id/chats/:chatId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const chat = await storage.getCrewChat(req.params.chatId);
    if (!chat || chat.crewId !== req.params.id) return sendError(res, 404, "err.crew.messageNotFound");

    // Auth Check: Author or Admin
    const crewData = await storage.getCrew(req.params.id);
    const me = crewData?.members.find((m: any) => m.member.id === req.userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (chat.senderId !== req.userId && !isAdmin) {
        return sendError(res, 403, "err.crew.deleteForbidden");
    }

    await storage.deleteCrewChat(req.params.chatId);
    return sendSuccess(res, { success: true });
}));


// --- 신고 ---

// 신고 대상이 정말 이 크루의 것인지 확인하고 작성자를 돌려준다. 댓글·사진 댓글에는 crewId 가
// 없어서 부모 글·사진을 거쳐 확인한다(삭제 라우트와 같은 방식).
async function crewTargetAuthor(crewId: string, type: CrewReportTarget, id: string): Promise<string | null> {
    switch (type) {
        case "crew_post": {
            const p = await storage.getCrewPost(id);
            return p && p.crewId === crewId ? p.authorId : null;
        }
        case "crew_comment": {
            const c = await storage.getCrewComment(id);
            const p = c ? await storage.getCrewPost(c.postId) : null;
            return c && p && p.crewId === crewId ? c.authorId : null;
        }
        case "crew_photo": {
            const ph = await storage.getCrewPhoto(id);
            return ph && ph.crewId === crewId ? ph.uploaderId : null;
        }
        case "crew_photo_comment": {
            const c = await storage.getCrewPhotoComment(id);
            const ph = c ? await storage.getCrewPhoto(c.photoId) : null;
            return c && ph && ph.crewId === crewId ? c.authorId : null;
        }
        case "crew_chat": {
            const ch = await storage.getCrewChat(id);
            return ch && ch.crewId === crewId ? ch.senderId : null;
        }
    }
}

// POST /crews/:id/reports — 크루 콘텐츠 신고 (Apple 1.2 / Play UGC).
// 커뮤니티 신고와 같은 hiqReports 에 쌓아 관리자 신고 큐가 한곳에서 읽게 한다. 커뮤니티 /reports 를
// 쓰지 않는 이유: 대상이 이 크루 것인지 확인해야 하고(남의 크루 콘텐츠 id 로 허위 신고 방지),
// 거기서는 crew_photo_comment 를 받지 않는다. 크루 콘텐츠는 자동 블라인드 없이 운영자 검토 큐로만
// 간다(community.repo.report) — 그동안 신고자는 차단으로 즉시 가릴 수 있다.
router.post("/:id/reports", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const { targetType, targetId, reason, detail } = req.body || {};
    if (!isCrewReportTarget(targetType)) return sendError(res, 400, "err.crew.reportBadTarget");
    if (typeof targetId !== "string" || !UUID_RE.test(targetId)) return sendError(res, 400, "err.crew.reportNoTarget");
    if (!isReportReason(reason)) return sendError(res, 400, "err.crew.reportReasonRequired");

    const authorId = await crewTargetAuthor(req.params.id, targetType, targetId);
    if (!authorId) return sendError(res, 404, "err.crew.reportContentNotFound");
    if (authorId === req.userId) return sendError(res, 400, "err.crew.reportSelf");

    await storage.community.report({
        targetType, targetId,
        reporterId: req.userId!,
        reason,
        detail: detail ? String(detail).slice(0, 500) : undefined,
    });

    // 운영자 알림 — 크루 콘텐츠는 자동 블라인드가 없어서 사람이 보기 전까지 아무 조치도 없다. 24시간 안 검토
    // (약관 5조, Apple 1.2)를 지키려면 커뮤니티 신고처럼 바로 알려야 한다(검토 policy:R2). 도배 방지는 같은 규칙.
    // 알림 실패가 신고 접수를 실패시키면 안 된다. 서버리스라 await(fire-and-forget 은 유실된다).
    try {
        const { notifyAdminsOfReport } = await import("../../services/moderation.js");
        await notifyAdminsOfReport({ targetType, targetId, reason, reporterId: req.userId! });
    } catch (e) { console.error("[Notify] 크루 신고 운영자 알림:", e); }
    return sendSuccess(res, { reported: true });
}));


// --- Polls ---

// GET /polls - List crew polls — 크루원 전용
router.get("/:id/polls", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const polls = await storage.getCrewPolls(req.params.id, req.userId);
    return sendSuccess(res, polls);
}));

// POST /polls - Create poll
router.post("/:id/polls", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const { options: rawOptions, ...rest } = req.body;
    // 투표 제목·설명·선택지도 필터 — 제목은 크루원 전원의 푸시 본문으로 나간다(검토 policy:R3).
    const screenedPoll = screenCrewBody(rest, ["title", "description"] as const, Array.isArray(rawOptions) ? rawOptions : []);
    if (!screenedPoll.ok) return sendError(res, 400, screenedPoll.reason);
    Object.assign(rest, screenedPoll.value.fields);
    const options = Array.isArray(rawOptions) ? screenedPoll.value.extra : rawOptions;
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
        return sendError(res, 400, "err.crew.pollMinOptions");
    }

    const poll = await storage.createPoll(validation.data, options);
    // P2: 투표 생성 → 크루원 전원에게 알림
    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const author = await storage.getMemberById(req.userId!);
            const blockers = await storage.crews.getBlockerIds(req.userId!);
            await settleNotifications("[PollCreateNotif]", activeMembers(crewData.members)
                .filter((m: any) => m.member.id !== req.userId && !blockers.has(m.member.id))
                .map(async (m: any) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                    if (!setting.pollEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: m.member.id,
                        title: msg("notif.crew.pollNew.title", { crew: crewData.crew.name }),
                        body: msg("notif.crew.pollNew.body", { name: author?.name || "누군가", title: rest.title || "투표" }),
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
    if (!optionId) return sendError(res, 400, "err.crew.pollOptionRequired");

    // Scope check: the option must belong to :pollId, which must belong to crew :id.
    const poll = await storage.getPollByOptionId(optionId);
    if (!poll || poll.id !== req.params.pollId || poll.crewId !== req.params.id) {
        return sendError(res, 404, "err.crew.pollNotFound");
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

    if (!poll) return sendError(res, 404, "err.crew.pollNotFound");

    const crewData = await storage.getCrew(crewId);
    const me = crewData?.members.find((m: any) => m.member.id === userId);
    const isAdmin = me && (me.role === 'leader' || me.role === 'manage');

    if (!isAdmin) {
        return sendError(res, 403, "err.crew.deleteStaffOnly");
    }

    await storage.deletePoll(pollId);
    return sendSuccess(res, { success: true });
}));

// GET /polls/options/:optionId/votes - Get voters for an option
router.get("/:id/polls/options/:optionId/votes", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // Resolve the poll from the option itself — never trust the :id path param for authorization.
    const poll = await storage.getPollByOptionId(req.params.optionId);
    if (!poll) return sendError(res, 404, "err.crew.pollOptionNotFound");

    // Only members of the poll's OWN crew may inspect voters.
    const membership = await storage.getCrewMembership(poll.crewId, req.userId!);
    if ((!membership || membership.role === 'pending') && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.crew.membersOnly");
    }

    // Anonymous polls: expose the aggregate count only, never voter identities.
    if (poll.isAnonymous) {
        const votes = await storage.getPollVotes(req.params.optionId);
        return sendSuccess(res, { anonymous: true, count: votes.length });
    }

    const votes = await storage.getPollVotes(req.params.optionId);
    return sendSuccess(res, votes);
}));

// --- Tournaments ---
// 크루 토너먼트. 오너 결정(2026-08-30): 참가는 승인 없이 즉시 확정, 대진은 크루장이 조정 가능,
// 목표점수·핸디캡은 대회에서 정하지 않고 대진에서 경기를 시작할 때 매칭 화면에서 맞춘다.

// 대회 운영 권한 — 크루장·부크루장. null 이면 이미 403 을 보낸 상태다.
async function requireCrewAdmin(req: AuthRequest, res: any): Promise<boolean> {
    const crewData = await storage.getCrew(req.params.id);
    if (!crewData) { sendError(res, 404, "err.crew.notFound"); return false; }
    const me = crewData.members.find((m: any) => m.member.id === req.userId);
    if ((!me || (me.role !== 'leader' && me.role !== 'manage')) && !(await isSuperAdmin(req.userId))) {
        sendError(res, 403, "err.crew.tournamentAdminOnly");
        return false;
    }
    return true;
}

// 하위 리소스는 항상 부모 crewId 와 대조한다 — :id 경로 파라미터를 그대로 믿지 않는다.
async function loadTournament(req: AuthRequest, res: any) {
    const detail = await storage.tournaments.getDetail(req.params.tournamentId);
    if (!detail || detail.tournament.crewId !== req.params.id) {
        sendError(res, 404, "err.crew.tournamentNotFound");
        return null;
    }
    return detail;
}

// GET /tournaments — 크루의 대회 목록
router.get("/:id/tournaments", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    return sendSuccess(res, await storage.tournaments.listByCrew(req.params.id));
}));

// GET /tournaments/hall-of-fame — 명예의 전당 (현 챔피언 · 우승 횟수 · 역대 대회)
// ⚠️ 반드시 /:tournamentId 라우트보다 **위**에 있어야 한다. 아래에 두면 Express 가
// "hall-of-fame" 을 대회 id 로 받아 404 를 낸다.
router.get("/:id/tournaments/hall-of-fame", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    return sendSuccess(res, await storage.tournaments.getHallOfFame(req.params.id));
}));

// GET /tournaments/:tournamentId — 대회 + 참가자 + 대진 전부
router.get("/:id/tournaments/:tournamentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const detail = await loadTournament(req, res);
    if (!detail) return;
    return sendSuccess(res, detail);
}));

// POST /tournaments — 대회 개설 (크루장/부크루장)
router.post("/:id/tournaments", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireCrewAdmin(req, res)) return;

    const rawTitle = String(req.body?.title || "").trim().slice(0, 60);
    if (!rawTitle) return sendError(res, 400, "err.crew.tournamentTitleRequired");
    // 대회 이름·설명·상금도 필터 — 이름은 크루원 전원의 푸시로 나가고, 자유 입력인 상금 칸은
    // 금전 내기 모집 통로가 될 수 있다(검토 policy:R3). "트로피", "게임비 면제" 같은 문구는 통과한다.
    const screenedTournament = screenCrewBody({
        title: rawTitle,
        description: req.body?.description ? String(req.body.description).slice(0, 500) : undefined,
        prize: req.body?.prize ? String(req.body.prize).slice(0, 100) : undefined,
    }, ["title", "description", "prize"] as const);
    if (!screenedTournament.ok) return sendError(res, 400, screenedTournament.reason);
    const { title = rawTitle, description, prize } = screenedTournament.value.fields;
    const gameType = req.body?.gameType;
    if (gameType !== "3c" && gameType !== "4c") return sendError(res, 400, "err.crew.gameTypeRequired");
    // 대회는 3쿠션·4구뿐이고 대진에서 경기를 시작하면 당구 경기가 만들어진다 — 골프 크루엔 열지 않는다.
    // (열어 두면 골프 크루에서 시작한 경기가 당구 RP·에버리지를 오염시킨다, 2026-09-09 검토)
    const crewForTournament = await storage.getCrew(req.params.id);
    if (crewForTournament?.crew?.sportCategory !== "BILLIARDS") return sendError(res, 400, "err.crew.tournamentBilliardsOnly");
    const maxPlayers = Number(req.body?.maxPlayers ?? 8);
    // 2의 거듭제곱만 허용 — 대진표가 딱 떨어진다. 2인은 곧 단판(또는 N판) 승부다
    // (오너 결정 2026-09-04: 2명 대회 허용, 풀리그는 당분간 접는다).
    if (![2, 4, 8, 16].includes(maxPlayers)) return sendError(res, 400, "err.crew.tournamentMaxPlayers");
    // 풀리그 UI 를 뺐으므로 항상 토너먼트다. 컬럼은 남겨 둔다 — 나중에 되살릴 때 쓴다.
    const format = "knockout";
    const bestOf = Number(req.body?.bestOf ?? 1);
    if (![1, 3, 5].includes(bestOf)) return sendError(res, 400, "err.crew.tournamentBestOf");

    const tournament = await storage.tournaments.create({
        crewId: req.params.id,
        creatorId: req.userId,
        title,
        description: description ?? null,
        gameType,
        format,
        bestOf,
        maxPlayers,
        recruitEnd: req.body?.recruitEnd ? new Date(req.body.recruitEnd) : null,
        startAt: req.body?.startAt ? new Date(req.body.startAt) : null,
        prize: prize ?? null,
    });

    try {
        const crewData = await storage.getCrew(req.params.id);
        if (crewData) {
            const creator = await storage.getMemberById(req.userId!);
            const blockers = await storage.crews.getBlockerIds(req.userId!);
            await settleNotifications("[TournamentCreateNotif]", activeMembers(crewData.members)
                .filter((m: any) => m.member.id !== req.userId && !blockers.has(m.member.id))
                .map(async (m: any) => {
                    const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, m.member.id);
                    if (!setting.activityEnabled) return;
                    await notificationService.sendAndSaveNotification({
                        memberId: m.member.id,
                        title: msg("notif.crew.tournamentNew.title", { crew: crewData.crew.name }),
                        body: msg("notif.crew.tournamentNew.body", { name: creator?.name || "누군가", title }),
                        category: crewData.crew.sportCategory || "BILLIARDS",
                        type: "TOURNAMENT",
                        params: { url: `/crew/${req.params.id}/tournament`, crewId: req.params.id, tab: "tournament" },
                    });
                }));
        }
    } catch (e) { console.error("[Notify] 대회 개설:", e); }
    return sendSuccess(res, tournament);
}));

// POST /tournaments/:tournamentId/join — 참가 신청 (승인 없이 즉시 확정)
router.post("/:id/tournaments/:tournamentId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const detail = await loadTournament(req, res);
    if (!detail) return;

    const row = await storage.tournaments.join(req.params.tournamentId, req.userId!);

    try {
        const joiner = await storage.getMemberById(req.userId!);
        if (detail.tournament.creatorId !== req.userId) {
            await notificationService.sendAndSaveNotification({
                memberId: detail.tournament.creatorId,
                title: "notif.crew.tournamentJoin.title",
                body: msg("notif.crew.tournamentJoin.body", { name: joiner?.name || "누군가", title: detail.tournament.title }),
                category: "BILLIARDS",
                type: "TOURNAMENT",
                params: { url: `/crew/${req.params.id}/tournament`, crewId: req.params.id, tab: "tournament" },
            }).catch((err: any) => console.error("[TournamentJoinNotif]", err));
        }
    } catch (e) { console.error("[Notify] 대회 참가:", e); }
    return sendSuccess(res, row);
}));

// DELETE /tournaments/:tournamentId/join — 참가 취소 (대진 나오기 전까지)
router.delete("/:id/tournaments/:tournamentId/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    if (!await loadTournament(req, res)) return;
    await storage.tournaments.leave(req.params.tournamentId, req.userId!);
    return sendSuccess(res, { success: true });
}));

// POST /tournaments/:tournamentId/draw — 대진 짜기 / 다시 뽑기 (크루장/부크루장)
router.post("/:id/tournaments/:tournamentId/draw", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireCrewAdmin(req, res)) return;
    const detail = await loadTournament(req, res);
    if (!detail) return;

    const result = await storage.tournaments.draw(req.params.tournamentId, { shuffle: !!req.body?.shuffle });

    try {
        const crewData = await storage.getCrew(req.params.id);
        const ids = await storage.tournaments.getParticipantIds(req.params.tournamentId);
        await settleNotifications("[TournamentDrawNotif]", ids
            .filter((pid) => pid !== req.userId)
            .map(async (pid) => {
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                if (!setting.activityEnabled) return;
                await notificationService.sendAndSaveNotification({
                    memberId: pid,
                    title: "notif.crew.tournamentDraw.title",
                    body: msg("notif.crew.tournamentDraw.body", { title: detail.tournament.title }),
                    category: crewData?.crew?.sportCategory || "BILLIARDS",
                    type: "TOURNAMENT",
                    params: { url: `/crew/${req.params.id}/tournament`, crewId: req.params.id, tab: "tournament" },
                });
            }));
    } catch (e) { console.error("[Notify] 대진 생성:", e); }
    return sendSuccess(res, result);
}));

// POST /tournaments/:tournamentId/swap — 첫 라운드 두 자리 맞바꾸기 (크루장/부크루장)
router.post("/:id/tournaments/:tournamentId/swap", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireCrewAdmin(req, res)) return;
    const detail = await loadTournament(req, res);
    if (!detail) return;

    const { a, b } = req.body ?? {};
    const valid = (x: any) => x && typeof x.matchId === "string" && (x.side === "p1" || x.side === "p2");
    if (!valid(a) || !valid(b)) return sendError(res, 400, "err.crew.swapPickTwo");
    // 남의 대회 대진 id 를 끼워 넣지 못하도록, 이 대회의 대진인지 확인한다.
    const ids = new Set(detail.matches.map((m) => m.id));
    if (!ids.has(a.matchId) || !ids.has(b.matchId)) return sendError(res, 404, "err.crew.matchNotFound");

    await storage.tournaments.swapSlots(req.params.tournamentId, a, b);
    return sendSuccess(res, { success: true });
}));

// POST /tournaments/:tournamentId/matches/:matchId/reset — 진행 중인 경기를 되돌린다 (크루장/부크루장)
// 당구대가 안 나서 점수판을 그냥 닫는 이탈이 흔한데, 그러면 그 칸이 영구히 "경기중"으로
// 굳고 재추첨도 막혀서 대회를 통째로 지우는 것 말고는 복구 수단이 없었다.
router.post("/:id/tournaments/:tournamentId/matches/:matchId/reset", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireCrewAdmin(req, res)) return;
    const detail = await loadTournament(req, res);
    if (!detail) return;
    if (!detail.matches.some((m) => m.id === req.params.matchId)) {
        return sendError(res, 404, "err.crew.matchNotFound");
    }
    await storage.tournaments.resetMatch(req.params.tournamentId, req.params.matchId);
    return sendSuccess(res, { success: true });
}));

// DELETE /tournaments/:tournamentId — 대회 삭제 (크루장/부크루장)
router.delete("/:id/tournaments/:tournamentId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireCrewAdmin(req, res)) return;
    if (!await loadTournament(req, res)) return;
    await storage.tournaments.remove(req.params.tournamentId);
    return sendSuccess(res, { success: true });
}));

// --- General Crew Management ---

// 베이스 매장(디렉토리 코드) 검증 — 형식·실존 확인. 통과 시 null, 실패 시 에러 메시지.
async function validateBaseListing(data: { baseListingCode?: string | null }): Promise<string | null> {
    const code = String(data.baseListingCode || "").trim();
    if (!code) { data.baseListingCode = null; return null; }
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) return "err.crew.badStoreCode";
    const { db } = await import("../../db.js");
    const { storeListings } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select({ code: storeListings.code }).from(storeListings).where(eq(storeListings.code, code));
    if (!row) return "err.crew.storeNotFound";
    data.baseListingCode = code;
    return null;
}

// 베이스 매장(파트너) 검증 — 실존하고 고를 수 있는 매장만. 예전 PATCH 는 아무 uuid 나 받아서, 없는 매장이나
// 시스템 매장(hiq·global — 소속 그릇이지 갈 수 있는 매장이 아님)이 베이스캠프로 저장될 수 있었다.
async function validateBaseStore(data: { baseStoreId?: string | null }): Promise<string | null> {
    const id = String(data.baseStoreId || "").trim();
    if (!id) { data.baseStoreId = null; return null; }
    if (!UUID_RE.test(id)) return "err.crew.storeNotFound";
    const store = await storage.getStoreById(id);
    const { isSystemStore } = await import("../../../shared/systemStores.js");
    if (!store || isSystemStore((store as any).slug)) return "err.crew.storeNotFound";
    data.baseStoreId = id;
    return null;
}

// 좌표 검증 — 없으면(undefined) 건드리지 않고, null 은 지우기. 숫자가 아니거나 범위를 벗어나면 거절한다
// (깨진 값이 저장되면 거리순 정렬이 그 크루를 엉뚱한 자리에 둔다).
function validateCoords(data: { latitude?: unknown; longitude?: unknown }): string | null {
    for (const [key, limit] of [["latitude", 90], ["longitude", 180]] as const) {
        const v = data[key];
        if (v === undefined || v === null) continue;
        const n = Number(v);
        if (typeof v === "boolean" || !Number.isFinite(n) || Math.abs(n) > limit) return "err.crew.badLocation";
        data[key] = n;
    }
    return null;
}

// 정원 — 정수 0~1000(0·null = 무제한). 만들기·수정이 같은 규칙을 쓴다(예전엔 수정만 검사했다).
function badMaxMembers(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    const n = Number(v);
    return !Number.isInteger(n) || n < 0 || n > 1000;
}

// 태그 — 최대 3개, 각 20자 이하 문자열. 만들기·수정 공통.
function badTags(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    return !Array.isArray(v) || v.length > 3 || v.some((t: any) => typeof t !== "string" || t.length > 20);
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
    // 파트너 매장 중 (a) 시스템 매장(hiq·global — 소속 그릇이지 갈 수 있는 매장이 아님)과
    // (b) 디렉토리에 연결된 매장은 제외한다. (b)를 남기면 같은 매장이 두 줄로 뜨고,
    // 파트너 줄에는 code 가 없어 베이스캠프로 고르면 null 이 저장됐다(2026-08-28 실사고:
    // 하이큐 당구장 — 설정 화면엔 선택된 듯 보이는데 크루 홈엔 "정보 없음").
    const { isSystemStore } = await import("../../../shared/systemStores.js");
    const { inArray } = await import("drizzle-orm");
    const partnerIds = (partners as any[]).map((s) => s.id);
    const linked = partnerIds.length
        ? await db.select({ id: storeListings.claimedStoreId }).from(storeListings)
            .where(inArray(storeListings.claimedStoreId, partnerIds))
        : [];
    const linkedSet = new Set(linked.map((l) => l.id));
    return sendSuccess(res, [
        ...(partners as any[])
            .filter((s) => !isSystemStore(s.slug) && !linkedSet.has(s.id))
            .slice(0, 5)
            .map((s) => ({ type: "partner", id: s.id, name: s.name, address: s.address ?? s.region ?? "" })),
        ...listings.map((s) => ({ type: "listing", code: s.code, name: s.name, address: s.address, region: s.region })),
    ]);
}));

// POST /crews - Create a new crew
router.post("/", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const validation = insertHiqCrewSchema.safeParse(req.body);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }
    // 크루명 — zod 스키마에 min/max가 없어 빈 문자열·초장문이 통과한다 (클라 trim 검사는 우회 가능)
    validation.data.name = String(validation.data.name || "").trim();
    if (!validation.data.name || validation.data.name.length > 30) {
        return sendError(res, 400, "err.crew.nameLength");
    }
    // 크루 이름·소개·태그·가입 질문도 공개 탐색에 뜨는 글이라 게시글과 같은 필터를 건다
    // ("#내기환영" 같은 내기 권유 태그 차단, 소개의 연락처 마스킹).
    // 정원·태그·좌표·파트너 매장 — 수정(PATCH)과 같은 검사. 예전엔 만들기만 비어 있어 정원 -5, 태그 객체,
    // 없는 매장 id 가 그대로 저장될 수 있었다.
    if (badMaxMembers(validation.data.maxMembers)) return sendError(res, 400, "err.crew.badMaxMembers");
    if (validation.data.maxMembers != null) validation.data.maxMembers = Number(validation.data.maxMembers);
    if (badTags(validation.data.tags)) return sendError(res, 400, "err.crew.badTags");
    const coordErr = validateCoords(validation.data as any);
    if (coordErr) return sendError(res, 400, coordErr);
    if (validation.data.baseStoreId != null) {
        const err = await validateBaseStore(validation.data as any);
        if (err) return sendError(res, 400, err);
    }
    const profile = screenCrewProfile(validation.data as any);
    if (!profile.ok) return sendError(res, 400, profile.reason);
    Object.assign(validation.data, profile.value);
    if (await storage.crews.findCrewByName(validation.data.name)) {
        return sendError(res, 409, "err.crew.nameTaken");
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

// GET /crews/name-check?name= — 크루 이름을 쓸 수 있는가(만들기 1단계에서 바로 알려 준다).
// 예전엔 3단계 '만들기'를 눌러야 409 로 알게 돼서, 이름 칸이 있는 1단계로 스스로 돌아가야 했다.
// 판정은 만들기와 같은 findCrewByName(대소문자·앞뒤 공백 무시). /:id 보다 먼저 등록해야 한다.
router.get("/name-check", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const name = String(req.query.name || "").trim();
    if (!name || name.length > 30) return sendSuccess(res, { available: false, reason: "length" });
    const hit = await storage.crews.findCrewByName(name);
    return sendSuccess(res, { available: !hit, reason: hit ? "taken" : null });
}));

// GET /crews/mine - Get my crews
router.get("/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 종목을 안 주면 당구로 본다. 예전엔 undefined 가 "필터 없음"이라 두 종목 크루가 섞여 나갔고,
    // 골프 부킹 공유 시트가 당구 크루까지 나열해 그 채팅방에 골프 글이 올라갔다(2026-09-09 검토).
    const sport = req.query.sport === "GOLF" ? "GOLF" : "BILLIARDS";
    const crews = await storage.getUserCrews(req.userId!, sport);
    return sendSuccess(res, crews);
}));

// GET /crews - Search/List crews
router.get("/", asyncHandler(async (req: any, res: any) => {
    const query = req.query.q as string;
    const sport = req.query.sport as string;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    // 같은 나라 크루 우선 — 크루는 장소 공동체라 언어가 아니라 나라·위치로 갈린다
    // (오너 결정 2026-08-31). 국가는 가입 로직과 같은 소스(Vercel IP 헤더)로 읽어
    // 비로그인 방문자에게도 동작한다.
    const viewerCountry = typeof req.headers["x-vercel-ip-country"] === "string"
        ? (req.headers["x-vercel-ip-country"] as string).toUpperCase().slice(0, 2)
        : undefined;
    const crews = await storage.searchCrews(query, sport, lat, lng, viewerCountry);
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
    if (!crew) return sendError(res, 404, "err.crew.notFound");
    return sendSuccess(res, await stripMemberPrivacy(req, crew));
}));

// GET /crews/:id/members - Get all members of a crew
router.get("/:id/members", asyncHandler(async (req: any, res: any) => {
    const crew = await storage.getCrew(req.params.id);
    if (!crew) return sendError(res, 404, "err.crew.notFound");
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
                        ? msg("notif.crew.joinRequest.title", { crew: crewData.crew.name })
                        : msg("notif.crew.joinAuto.title", { crew: crewData.crew.name }),
                    body: isPending
                        ? msg("notif.crew.joinRequest.body", { name: applicantName })
                        : msg("notif.crew.joinAuto.body", { name: applicantName }),
                    category: crewData.crew.sportCategory || "BILLIARDS",
                    type: "SYSTEM",
                    // 승인 대기 알림은 누르면 곧장 멤버 관리(가입 대기 목록)가 열리게 한다(club-detail 의 ?manage=members).
                    params: { url: isPending ? `/crew/${req.params.id}/home?manage=members` : `/crew/${req.params.id}/home`, crewId: req.params.id, tab: "home" },
                })));
        }
    } catch(e) { console.error("[Notify] 크루 가입:", e); }
    return sendSuccess(res, { success: true, role });
}));

// PATCH /crews/:id - Update crew (Leader only)
// 크루 이름·소개·표지는 로그인 없이 보이는 공개 문구라 약관 동의·정지 문지기를 건다(검토 policy:R8) — 약관 도입 전에
// 크루를 만든 모임장도 첫 수정 때 동의 시트가 뜬다(TermsConsent 의 TERMS_REQUIRED 안전망).
router.patch("/:id", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = req.params.id;
    const data = await storage.getCrew(crewId);
    const me = data?.members.find((m: any) => m.member.id === req.userId);
    if ((!me || (me.role !== 'leader' && me.role !== 'manage')) && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.common.forbidden");
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
        return sendError(res, 400, "err.crew.badJoinType");
    }
    if (updateData.baseListingCode !== undefined && updateData.baseListingCode !== null) {
        const err = await validateBaseListing(updateData);
        if (err) return sendError(res, 400, err);
    }
    if (updateData.baseStoreId !== undefined && updateData.baseStoreId !== null) {
        const err = await validateBaseStore(updateData);
        if (err) return sendError(res, 400, err);
    }
    const coordErr = validateCoords(updateData);
    if (coordErr) return sendError(res, 400, coordErr);
    // 지역을 바꾸면 좌표도 새 지역으로 — 좌표를 같이 보내지 않았을 때만 만들기와 같은 도시 수준 지오코딩을 한다.
    // 그대로 두면 '내 주변' 거리순이 옛 지역 좌표로 계산된다. 지오코딩이 실패하면 좌표를 비운다
    // (옛 지역 좌표보다 베이스캠프 좌표로 넘어가는 편이 맞다 — searchCrews 가 크루 좌표 → 매장 좌표 순으로 본다).
    if (updateData.region !== undefined) {
        updateData.region = updateData.region === null ? null : (String(updateData.region).trim() || null);
        const regionChanged = (updateData.region ?? "") !== String(data?.crew?.region ?? "").trim();
        if (regionChanged && updateData.region && updateData.latitude === undefined && updateData.longitude === undefined) {
            try {
                const { geocodeCity } = await import("../../lib/geocode.js");
                const geo = await geocodeCity(updateData.region, (data?.crew as any)?.countryCode);
                updateData.latitude = geo?.lat ?? null;
                updateData.longitude = geo?.lng ?? null;
            } catch (e) { console.error("[CrewRegionGeocode]", e); }
        }
    }
    if (updateData.gameType !== undefined && updateData.gameType !== null
        && !['3c', '4c', 'pocket', 'any', 'field', 'screen', 'range'].includes(updateData.gameType)) {
        return sendError(res, 400, "err.crew.badGameType");
    }
    if (updateData.name !== undefined) {
        updateData.name = String(updateData.name).trim();
        if (!updateData.name || updateData.name.length > 30) return sendError(res, 400, "err.crew.nameLength");
        // 클라이언트는 이름을 안 바꿔도 전체 폼을 보낸다 — 자기 현재 이름 그대로면 중복
        // 검사를 건너뛴다 (레거시 변형 중복이 있어도 이름 외 설정 저장이 막히지 않게).
        if (updateData.name !== data?.crew?.name && await storage.crews.findCrewByName(updateData.name, crewId)) {
            return sendError(res, 409, "err.crew.nameTaken");
        }
    }
    if (updateData.maxMembers !== undefined && updateData.maxMembers !== null) {
        if (badMaxMembers(updateData.maxMembers)) return sendError(res, 400, "err.crew.badMaxMembers");
        const n = Number(updateData.maxMembers);
        updateData.maxMembers = n;
        // 현재 인원보다 작게 줄이면 신규 가입만 막히고 아무 안내가 없다 — 명시적으로 거부
        const activeCount = (data?.members || []).filter((m: any) => m.role !== 'pending').length;
        if (n > 0 && n < activeCount) return sendError(res, 400, msg("err.crew.maxBelowCurrent", { n: activeCount }));
    }
    if (updateData.tags !== undefined && (updateData.tags === null || badTags(updateData.tags))) {
        return sendError(res, 400, "err.crew.badTags");
    }
    // 이름·소개·태그·가입 질문 필터 — 생성과 같은 규칙(연락처는 가려서 저장, 내기 권유 태그는 거부).
    // 저장된 값과 달라진 칸만 검사한다(검토 code:R7): 화면이 폼 전체를 다시 보내서, 예전 문구가 나중에 새로 막히는
    // 규칙에 걸리면 가입 방식처럼 전혀 다른 설정까지 저장이 막히고 어느 칸 탓인지도 알 수 없었다.
    const profile = screenCrewProfile(changedCrewProfileFields(updateData, data?.crew as Record<string, unknown> | undefined));
    if (!profile.ok) return sendError(res, 400, profile.reason);
    Object.assign(updateData, profile.value);
    if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, "err.crew.nothingToUpdate"); // 빈 UPDATE는 드리즐이 500을 던진다
    }

    const oldCrew = data?.crew;
    let crew;
    try {
        crew = await storage.updateCrew(crewId, updateData);
    } catch (e: any) {
        // check-then-write 사이의 경합으로 DB unique(name)에 걸리면 500이 아니라 409로
        if (e?.code === "23505") return sendError(res, 409, "err.crew.nameTaken");
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
                    title: msg("notif.crew.approved.title", { crew: crew?.name || oldCrew?.name }),
                    body: "notif.crew.joinTypePromote.body",
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
    if (!crew) return sendError(res, 404, "err.crew.notFound");

    // Check leader - strictly leader only
    const me = crew.members.find((m: any) => m.member.id === req.userId);
    if ((!me || me.role !== 'leader') && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.crew.leaderOnly");
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
    if (!data) return sendError(res, 404, "err.crew.notFound");

    // Auth Check: Leader or Manager
    const me = data.members.find((m: any) => m.member.id === req.userId);
    if ((!me || (me.role !== 'leader' && me.role !== 'manage')) && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.common.forbidden");
    }

    // 대상 확인·정원 확인·승격을 리포지토리 트랜잭션(FOR UPDATE)에서 원자적으로 처리 —
    // 여기서 조회-후-갱신하면 동시 승인 두 건이 같은 잔여 정원을 보고 초과 승인된다.
    await storage.crews.approveCrewMember(crewId, memberId);

    // Send Notification to Approved Member
    try {
        await notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: msg("notif.crew.approved.title", { crew: data.crew.name }),
            body: "notif.crew.approved.body",
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
            return sendError(res, 400, "err.crew.leaderCannotLeave");
        }
    } else {
        // Kicking another member — check admin permissions.
        const data = await storage.getCrew(crewId);
        const me = data?.members.find((m: any) => m.member.id === req.userId);
        const target = data?.members.find((m: any) => m.member.id === memberId);

        if (!me) return sendError(res, 403, "err.crew.notMember");
        if (!target) return sendError(res, 404, "err.crew.targetNotFound");

        if (me.role === 'manage') {
            if (target.role === 'leader' || target.role === 'manage') {
                return sendError(res, 403, "err.crew.cannotKickStaff");
            }
        } else if (me.role !== 'leader') {
            return sendError(res, 403, "err.common.forbidden");
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
                    ? msg("notif.crew.rejected.title", { crew: crewName })
                    : msg("notif.crew.kicked.title", { crew: crewName }),
                body: isPendingTarget
                    ? "notif.crew.rejected.body"
                    : "notif.crew.kicked.body",
                category: data?.crew?.sportCategory || "BILLIARDS",
                type: "SYSTEM",
                params: { url: "/club" },
            }).catch((err: any) => console.error("[KickNotif]", err));
        } catch(e) { console.error("[Notify] 강퇴/가입 반려:", e); }
    }

    await storage.leaveCrew(crewId, memberId);
    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/transfer { memberId } — 크루장 넘기기 (크루장만)
// 예전엔 넘길 방법이 없어 크루장은 탈퇴도 못 하고(leaderCannotLeave) 크루를 지우는 수밖에 없었다.
// 대상은 활동 멤버(일반·운영진)만. 넘긴 뒤 이전 크루장은 운영진으로 남는다 — 바로 멤버로 내리면
// 실수로 넘겼을 때 되돌릴 사람이 없다. 역할 셋(대상·본인·hiq_crews.leader_id)은 리포지토리 트랜잭션이 한 번에 바꾼다.
router.post("/:id/transfer", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = req.params.id;
    const toMemberId = String(req.body?.memberId || "");
    if (!UUID_RE.test(toMemberId)) return sendError(res, 400, "err.crew.transferTarget");
    if (toMemberId === req.userId) return sendError(res, 400, "err.crew.transferSelf");

    const membership = await storage.getCrewMembership(crewId, req.userId!);
    if (!membership || membership.role !== 'leader') return sendError(res, 403, "err.crew.transferLeaderOnly");

    await storage.crews.transferCrewLeadership(crewId, req.userId!, toMemberId);

    try {
        const data = await storage.getCrew(crewId);
        await notificationService.sendAndSaveNotification({
            memberId: toMemberId,
            title: msg("notif.crew.transfer.title", { crew: data?.crew?.name || "크루" }),
            body: "notif.crew.transfer.body",
            category: data?.crew?.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { url: `/crew/${crewId}/home`, crewId, tab: "home" },
        });
    } catch (e) { console.error("[Notify] 크루장 넘기기:", e); }

    return sendSuccess(res, { success: true });
}));

// PATCH /crews/:id/members/:memberId/role - Manage Roles (Leader Only)
router.patch("/:id/members/:memberId/role", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { id: crewId, memberId } = req.params;
    const { role } = req.body;
    const data = await storage.getCrew(crewId);
    const me = data?.members.find((m: any) => m.member.id === req.userId);

    // Only leader can change roles
    if ((!me || me.role !== 'leader') && !(await isSuperAdmin(req.userId))) {
        return sendError(res, 403, "err.crew.roleLeaderOnly");
    }

    // 검증 없이 저장하면 'leader'나 'pending' 같은 값이 그대로 들어가 권한 체계가 뒤틀린다.
    if (role !== 'manage' && role !== 'member') {
        return sendError(res, 400, "err.crew.roleInvalid");
    }
    // 리더가 스스로를 강등하면 크루에 리더가 없어져 삭제·위임 모두 막힌다(위임은 별도 기능).
    if (memberId === req.userId) {
        return sendError(res, 400, "err.crew.roleSelf");
    }

    const target = data?.members.find((m: any) => m.member.id === memberId);
    if (!target) return sendError(res, 404, "err.crew.targetNotFound");
    if (target.role === 'pending') return sendError(res, 400, "err.crew.rolePending");

    await storage.updateCrewMemberRole(crewId, memberId, role);

    // P1: 역할 변경 → 대상자에게 알림
    try {
        // 역할 이름도 받는 사람 언어로 나가야 하므로 역할별 본문 키를 따로 둔다.
        await notificationService.sendAndSaveNotification({
            memberId: memberId,
            title: msg("notif.crew.roleChange.title", { crew: data?.crew?.name || "크루" }),
            body: role === "manage" ? "notif.crew.roleChange.bodyManager" : "notif.crew.roleChange.bodyMember",
            category: data?.crew?.sportCategory || "BILLIARDS",
            type: "SYSTEM",
            params: { url: `/crew/${crewId}/home`, crewId, tab: "home" },
        }).catch((err: any) => console.error("[RoleChangeNotif]", err));
    } catch(e) { console.error("[Notify] 권한 변경:", e); }

    return sendSuccess(res, { success: true });
}));

// POST /crews/:id/settlements
router.post("/:id/settlements", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (await requireCrewMember(req, res) === null) return;
    const { items: rawItems, participants } = req.body; // Complex structure

    // 정산 제목·항목 이름도 필터 — 제목은 "정산 요청: {제목}" 채팅 카드와 푸시로 나가서, 거르지 않으면 채팅 필터를
    // 건너뛰는 통로가 된다("5만원 내기 정산", 검토 policy:R4). 크루 맥락이라 "정모 정산", "게임비 1만원씩"은 통과한다.
    // 계좌 칸(accountNumber 등)은 넣지 않는다 — 가리면 입금할 계좌가 망가진다.
    const screenedSettlement = screenCrewBody(req.body, ["title"] as const,
        Array.isArray(rawItems) ? rawItems.map((it: any) => it?.title) : []);
    if (!screenedSettlement.ok) return sendError(res, 400, screenedSettlement.reason);
    const items = Array.isArray(rawItems)
        ? rawItems.map((it: any, i: number) => (it && typeof it === "object" ? { ...it, title: screenedSettlement.value.extra[i] } : it))
        : rawItems;
    const data = {
        ...req.body, // title, date, totalAmount, etc.
        ...screenedSettlement.value.fields,
        crewId: req.params.id,
        creatorId: req.userId
    };

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
            const blockers = await storage.crews.getBlockerIds(req.userId!); // 요청한 사람을 차단한 사람에게는 푸시를 보내지 않는다
            const targetIds = new Set<string>();
            for (const p of participants) {
                const pid = typeof p === "string" ? p : p?.memberId;
                if (pid && pid !== req.userId && crewMemberIds.has(pid) && !blockers.has(pid)) targetIds.add(pid);
            }

            await settleNotifications("[SettlementNotif]", [...targetIds].map(async (pid) => {
                const setting = await storage.notifs.getCrewNotificationSetting(req.params.id, pid);
                if (!setting.settlementEnabled) return;
                await notificationService.sendAndSaveNotification({
                    memberId: pid,
                    title: msg("notif.crew.settlement.title", { crew: crewData.crew.name }),
                    body: msg("notif.crew.settlement.body", { name: creatorName, title: settlement.title, amount: totalAmount.toLocaleString() }),
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


// ── 대결 신청 ─────────────────────────────────────────────────────────
// 크루 멤버끼리 "한 판 치자"를 보내는 신호. 실제 경기를 만들지는 않는다 —
// 대부분 같은 매장에서 만나 치므로 경기 개설은 기존 PIN 흐름 그대로 두고,
// 여기서는 의사만 오간다(오너 결정 2026-08-22).

// POST /crews/:id/challenge — 같은 크루 멤버에게 대결 신청
router.post("/:id/challenge", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await requireCrewMember(req, res);
    if (!role) return;

    const toMemberId = String(req.body?.toMemberId || "");
    if (!/^[0-9a-f-]{36}$/i.test(toMemberId)) return sendError(res, 400, "err.crew.opponentNotFound");
    if (toMemberId === req.userId) return sendError(res, 400, "err.crew.challengeSelf");

    // 상대도 이 크루의 정식 멤버여야 한다 — 크루 밖으로 알림이 새지 않게 하는 경계.
    const targetMembership = await storage.getCrewMembership(req.params.id, toMemberId);
    if (!targetMembership || targetMembership.role === "pending") {
        return sendError(res, 404, "err.crew.notMember");
    }

    const { db } = await import("../../db.js");
    const { hiqChallenges } = await import("../../../shared/schema.js");
    const { and, eq, gt, desc } = await import("drizzle-orm");

    // 24시간 안에 같은 상대에게 보낸 대기 중 신청이 있으면 막는다 — 알림 도배 방지.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [dup] = await db.select({ id: hiqChallenges.id }).from(hiqChallenges)
        .where(and(
            eq(hiqChallenges.fromMemberId, req.userId!),
            eq(hiqChallenges.toMemberId, toMemberId),
            eq(hiqChallenges.status, "pending"),
            gt(hiqChallenges.createdAt, since),
        )).limit(1);
    if (dup) return sendError(res, 409, "err.crew.challengeDup");

    const [created] = await db.insert(hiqChallenges).values({
        crewId: req.params.id, fromMemberId: req.userId!, toMemberId,
    }).returning();

    const [meMember, crew] = await Promise.all([
        storage.getMemberById(req.userId!),
        storage.getCrew(req.params.id),
    ]);
    const myName = (meMember as any)?.name || "크루 멤버";
    const crewName = (crew as any)?.crew?.name || "크루";
    // 상대가 나를 차단했으면 푸시를 보내지 않는다 — 차단한 사람의 이름이 잠금 화면에 뜨지 않게(검토 policy:R7).
    // 신청 자체를 거절하면 차단당한 사실이 드러나므로 응답은 그대로 둔다.
    const blockedByTarget = await storage.crews.hasBlocked(toMemberId, req.userId!);

    await settleNotifications("[Challenge]", blockedByTarget ? [] : [
        notificationService.sendAndSaveNotification({
            memberId: toMemberId,
            title: msg("notif.crew.challenge.title", { name: myName }),
            body: msg("notif.crew.challenge.body", { crew: crewName, name: myName }),
            category: (crew as any)?.crew?.sportCategory || "BILLIARDS",
            type: "CHALLENGE",
            params: { url: `/crew/${req.params.id}/home`, crewId: req.params.id, challengeId: created.id },
        }),
    ]);

    return sendSuccess(res, { id: created.id, status: created.status });
}));

// POST /crews/:id/challenge/:challengeId/respond — 수락/거절
// 수락은 신청자에게 알림이 돌아가고, 거절은 조용히 닫는다(거절 통보는 관계를 상하게 한다).
router.post("/:id/challenge/:challengeId/respond", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const accept = req.body?.accept === true;

    const { db } = await import("../../db.js");
    const { hiqChallenges } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");

    const [ch] = await db.select().from(hiqChallenges).where(eq(hiqChallenges.id, req.params.challengeId));
    if (!ch) return sendError(res, 404, "err.crew.challengeNotFound");
    if (ch.toMemberId !== req.userId) return sendError(res, 403, "err.crew.challengeReceiverOnly");
    if (ch.status !== "pending") return sendError(res, 409, "err.crew.challengeAnswered");

    await db.update(hiqChallenges)
        .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
        .where(eq(hiqChallenges.id, ch.id));

    if (accept) {
        const me = await storage.getMemberById(req.userId!);
        const crew = await storage.getCrew(ch.crewId);
        await settleNotifications("[ChallengeAccept]", [
            notificationService.sendAndSaveNotification({
                memberId: ch.fromMemberId,
                title: "notif.crew.challengeAccept.title",
                body: msg("notif.crew.challengeAccept.body", { name: (me as any)?.name || "상대" }),
                category: (crew as any)?.crew?.sportCategory || "BILLIARDS",
                type: "CHALLENGE",
                params: { url: `/crew/${ch.crewId}/home`, crewId: ch.crewId },
            }),
        ]);
    }
    return sendSuccess(res, { status: accept ? "accepted" : "declined" });
}));

// GET /crews/:id/challenges — 이 크루에서 내가 보낸/받은 대기 중 신청
// 프로필 시트가 "신청함"을 표시하고, 받은 신청에 수락 버튼을 띄우는 데 쓴다.
router.get("/:id/challenges", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const role = await requireCrewMember(req, res);
    if (!role) return;

    const { db } = await import("../../db.js");
    const { hiqChallenges } = await import("../../../shared/schema.js");
    const { and, eq, or, gt } = await import("drizzle-orm");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await db.select({
        id: hiqChallenges.id,
        fromMemberId: hiqChallenges.fromMemberId,
        toMemberId: hiqChallenges.toMemberId,
        status: hiqChallenges.status,
        createdAt: hiqChallenges.createdAt,
    }).from(hiqChallenges).where(and(
        eq(hiqChallenges.crewId, req.params.id),
        eq(hiqChallenges.status, "pending"),
        gt(hiqChallenges.createdAt, since),
        or(eq(hiqChallenges.fromMemberId, req.userId!), eq(hiqChallenges.toMemberId, req.userId!)),
    ));
    return sendSuccess(res, { challenges: rows, myId: req.userId });
}));

export default router;
