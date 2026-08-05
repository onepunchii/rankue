import { Router } from "express";
import { Response, NextFunction } from "express";
import { storage } from "../../storage/index.js";
import { insertHiqCommunityPostSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { notificationService } from "../../services/notificationService.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { deleteBlobs } from "../../utils/blob.js";
import { checkContent, maskContacts } from "../../utils/contentFilter.js";

const router = Router();

const BOARDS = ["brag", "ask", "store", "lesson"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 업로드 API가 hiq/community/<업로더ID>-<랜덤>.webp 로 저장하므로, 경로에 본인 ID가
// 없는 URL은 본인 업로드가 아니다 — 남의 Blob URL을 자기 글에 넣고 삭제해서
// 원본을 지우는 공격을 막는다 (deleteBlobs는 소유자를 모른다).
const isOwnUploadUrl = (url: unknown, userId: string) =>
    typeof url === "string"
    && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/hiq\/community\//.test(url)
    && url.includes(`/hiq/community/${userId}`);

// 읽기는 비로그인도 허용 (커뮤니티 글은 웹 색인 대상 — 크루와 달리 공개).
// 로그인 상태면 차단 필터·isLiked에 viewer를 반영한다.
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.userId = (req as any).signedCookies?.hiq_user_id || undefined;
    next();
};

// --- 게시글 ---

// GET /posts?board=&tag=&cursor=
// 비로그인 허용 엔드포인트라 크롤러가 임의 값을 넣는다 — 잘못된 입력은 500이 아니라 400.
router.get("/posts", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { board, tag, cursor } = req.query as Record<string, string | undefined>;
    if (board && !BOARDS.includes(board as any)) return sendError(res, 400, "잘못된 게시판입니다");
    if (cursor && isNaN(Date.parse(cursor))) return sendError(res, 400, "잘못된 커서입니다");
    const posts = await storage.community.getPosts({ board, tag, cursor, viewerId: req.userId });
    return sendSuccess(res, posts);
}));

// GET /posts/:id — 상세 + 댓글
router.get("/posts/:id", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const post = await storage.community.getPost(req.params.id, req.userId);
    if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const comments = await storage.community.getComments(req.params.id, req.userId);
    return sendSuccess(res, { ...post, comments });
}));

// POST /posts — 글 작성. 서버측 금칙어 필터 + 연락처 마스킹 + 결과카드 서버 스냅샷.
router.post("/posts", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { board, title, content, images, historyId, tags, regionName, storeId } = req.body || {};

    if (!BOARDS.includes(board)) return sendError(res, 400, "잘못된 게시판입니다");
    if (typeof content !== "string" || !content.trim()) return sendError(res, 400, "내용을 입력해주세요");
    if (content.length > 4000) return sendError(res, 400, "내용이 너무 깁니다 (4000자 이내)");
    if (images && (!Array.isArray(images) || images.length > 3)) return sendError(res, 400, "사진은 최대 3장입니다");
    // 본인이 업로드한 Blob만 첨부 가능 — 남의 이미지 URL 삽입(→삭제 시 원본 파괴) 차단
    if (images?.some((u: unknown) => !isOwnUploadUrl(u, req.userId!))) {
        return sendError(res, 400, "이미지가 올바르지 않습니다. 다시 업로드해주세요");
    }

    const safeTags = Array.isArray(tags) ? tags.slice(0, 5).map((t: any) => String(t).slice(0, 20)) : [];
    const safeRegion = regionName ? String(regionName).slice(0, 30) : null;

    // 게시 전 필터링 — 내기당구·거래·욕설은 게시 거부 (심사 차단 항목).
    // 태그·지역명도 공개 표시되므로 함께 검사한다 (마스킹 우회 통로 봉쇄).
    const filter = checkContent([title || "", content, safeRegion || "", ...safeTags].join("\n"));
    if (filter.blocked) return sendError(res, 400, filter.reason!);

    // 한 큐 자랑: 사진 또는 경기결과 카드 중 최소 1개 필수 (캡션이 곧 제목)
    if (board === "brag" && !images?.length && !historyId) {
        return sendError(res, 400, "자랑 글에는 사진 또는 경기 결과가 필요합니다");
    }

    // 결과 카드는 클라이언트가 아니라 서버가 전적 DB에서 스냅샷 — 위조 불가
    let gameCard: Awaited<ReturnType<typeof storage.community.buildGameCard>> = null;
    if (historyId) {
        if (!UUID_RE.test(historyId)) return sendError(res, 400, "잘못된 경기 기록입니다");
        gameCard = await storage.community.buildGameCard(historyId, req.userId!);
        if (!gameCard) return sendError(res, 400, "본인의 경기 기록만 첨부할 수 있습니다");
    }

    // 우리 매장·레슨: 소속 근거는 최근 30일 내 경기를 기록한 매장 (GPS 미사용)
    let storeName: string | undefined;
    if (board === "store" || board === "lesson") {
        if (storeId) {
            if (!UUID_RE.test(storeId)) return sendError(res, 400, "잘못된 매장입니다");
            const myStores = await storage.community.getMyRecentStores(req.userId!);
            const match = myStores.find(s => s.id === storeId);
            if (!match) return sendError(res, 400, "최근 30일 내 경기 기록이 있는 매장만 선택할 수 있습니다");
            storeName = match.name;
        }
    }

    const isStoreBoard = board === "store" || board === "lesson";
    const data = {
        board,
        authorId: req.userId!,
        title: title ? maskContacts(String(title).slice(0, 100)) : null,
        content: maskContacts(content.trim()),
        images: images || [],
        historyId: historyId || null,
        tags: safeTags.map(maskContacts),
        regionName: safeRegion ? maskContacts(safeRegion) : null,
        storeId: isStoreBoard ? (storeId || null) : null, // 매장 연결은 store/lesson에서만
        storeName: isStoreBoard ? (storeName || null) : null,
    };

    const validation = insertHiqCommunityPostSchema.safeParse(data);
    if (!validation.success) return sendError(res, 400, validation.error.message);

    const post = await storage.community.createPost({ ...validation.data, gameCard } as any);
    return sendSuccess(res, post);
}));

// DELETE /posts/:id — 본인 글만. 이미지 Blob도 함께 정리(고아 방지).
router.delete("/posts/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const post = await storage.community.getPostRaw(req.params.id);
    if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    if (post.authorId !== req.userId) return sendError(res, 403, "본인 글만 삭제할 수 있습니다");
    await storage.community.deletePost(req.params.id);
    if (post.images?.length) await deleteBlobs(post.images);
    return sendSuccess(res, { success: true });
}));

// --- 댓글 ---

router.post("/posts/:id/comments", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const content = (req.body?.content || "").trim();
    if (!content) return sendError(res, 400, "내용을 입력해주세요");
    if (content.length > 1000) return sendError(res, 400, "댓글이 너무 깁니다 (1000자 이내)");

    const post = await storage.community.getPostRaw(req.params.id);
    if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    if (post.isBlinded) return sendError(res, 400, "블라인드된 글에는 댓글을 달 수 없습니다");

    const filter = checkContent(content);
    if (filter.blocked) return sendError(res, 400, filter.reason!);

    const comment = await storage.community.createComment({
        postId: req.params.id,
        authorId: req.userId!,
        content: maskContacts(content),
    });

    // 글 작성자에게 알림 (본인 댓글 제외). 서버리스라 await — fire-and-forget은 유실된다.
    // body는 반드시 마스킹된 저장본(comment.content)을 쓴다 — 원문을 쓰면 전화번호가
    // "연락받고 싶은 상대"의 푸시로 정확히 배달되는 마스킹 우회가 된다.
    if (post.authorId !== req.userId) {
        try {
            const commenter = await storage.getMemberById(req.userId!);
            await notificationService.sendAndSaveNotification({
                memberId: post.authorId,
                title: "💬 새 댓글",
                body: `${commenter?.name || "누군가"}님: ${comment.content.slice(0, 40)}`,
                category: "BILLIARDS",
                type: "COMMUNITY",
                params: { url: `/community/${post.id}` },
            });
        } catch (e) { console.error("[Notify] 커뮤니티 댓글:", e); }
    }
    return sendSuccess(res, comment);
}));

router.delete("/comments/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "댓글을 찾을 수 없습니다");
    const comment = await storage.community.getCommentRaw(req.params.id);
    if (!comment) return sendError(res, 404, "댓글을 찾을 수 없습니다");
    if (comment.authorId !== req.userId) return sendError(res, 403, "본인 댓글만 삭제할 수 있습니다");
    await storage.community.deleteComment(req.params.id);
    return sendSuccess(res, { success: true });
}));

// --- 좋아요 ---

router.post("/posts/:id/like", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const post = await storage.community.getPostRaw(req.params.id);
    if (!post) return sendError(res, 404, "게시글을 찾을 수 없습니다");
    const result = await storage.community.toggleLike(req.params.id, req.userId!);
    return sendSuccess(res, result);
}));

// --- 신고 (커뮤니티 + 크루 콘텐츠 소급) ---

const REPORT_TARGETS = ["community_post", "community_comment", "crew_post", "crew_comment", "crew_photo", "crew_chat", "member"];
const REPORT_REASONS = ["abuse", "gambling", "trade", "privacy", "spam", "other"];

router.post("/reports", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetType, targetId, reason, detail } = req.body || {};
    if (!REPORT_TARGETS.includes(targetType)) return sendError(res, 400, "잘못된 신고 대상입니다");
    if (typeof targetId !== "string" || !UUID_RE.test(targetId)) return sendError(res, 400, "신고 대상이 없습니다");
    if (!REPORT_REASONS.includes(reason)) return sendError(res, 400, "신고 사유를 선택해주세요");

    const result = await storage.community.report({
        targetType, targetId,
        reporterId: req.userId!,
        reason,
        detail: detail ? String(detail).slice(0, 500) : undefined,
    });

    // 자동 블라인드 시 작성자에게 즉시 알림 + 이의제기 안내 — 담합·보복 신고 방어 세트
    if (result.autoBlinded && result.authorId) {
        try {
            await notificationService.sendAndSaveNotification({
                memberId: result.authorId,
                title: "⚠️ 게시물 블라인드 안내",
                body: "신고 누적으로 게시물이 블라인드되었습니다. 부당하다면 앱에서 바로 이의제기할 수 있습니다.",
                category: "BILLIARDS",
                type: "COMMUNITY",
                params: { url: targetType === "community_post" ? `/community/${targetId}` : "/community" },
            });
        } catch (e) { console.error("[Notify] 블라인드:", e); }
    }
    return sendSuccess(res, { reported: true });
}));

// 이의제기 — 블라인드된 본인 글/댓글에 원탭
router.post("/appeals", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetType, targetId, text } = req.body || {};
    if (!["community_post", "community_comment"].includes(targetType)) return sendError(res, 400, "잘못된 대상입니다");
    if (typeof targetId !== "string" || !UUID_RE.test(targetId)) return sendError(res, 400, "잘못된 대상입니다");
    const ok = await storage.community.appeal({
        targetType, targetId,
        authorId: req.userId!,
        text: String(text || "").slice(0, 500) || "이의제기합니다",
    });
    if (!ok) return sendError(res, 400, "이의제기할 수 없는 게시물입니다");
    return sendSuccess(res, { appealed: true });
}));

// --- 차단 ---

router.post("/blocks", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { memberId } = req.body || {};
    if (typeof memberId !== "string" || !UUID_RE.test(memberId)) return sendError(res, 400, "차단할 사용자가 없습니다");
    if (memberId === req.userId) return sendError(res, 400, "자신을 차단할 수 없습니다");
    const target = await storage.getMemberById(memberId);
    if (!target) return sendError(res, 404, "사용자를 찾을 수 없습니다");
    await storage.community.block(req.userId!, memberId);
    return sendSuccess(res, { blocked: true });
}));

router.delete("/blocks/:memberId", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.memberId)) return sendError(res, 400, "잘못된 사용자입니다");
    await storage.community.unblock(req.userId!, req.params.memberId);
    return sendSuccess(res, { blocked: false });
}));

router.get("/blocks", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const blocked = await storage.community.getBlockedMembers(req.userId!);
    return sendSuccess(res, blocked);
}));

// --- 글쓰기 보조 ---

// 내 최근 30일 매장 (우리 매장/레슨 글의 소속 근거)
router.get("/my-stores", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const stores = await storage.community.getMyRecentStores(req.userId!);
    return sendSuccess(res, stores);
}));

// 내 최근 전적 (자랑 글 결과 카드 선택용)
router.get("/my-history", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const history = await storage.community.getMyRecentHistory(req.userId!);
    return sendSuccess(res, history);
}));

export default router;
