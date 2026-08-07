import { db } from "../db.js";
import {
    hiqCommunityPosts,
    hiqCommunityComments,
    hiqCommunityLikes,
    hiqReports,
    hiqBlocks,
    hiqMembers,
    hiqStores,
    hiqGameHistory,
    profiles,
    type InsertHiqCommunityPost,
    type InsertHiqCommunityComment,
} from "../../shared/schema.js";
import { eq, and, desc, sql, lt, gte, inArray } from "drizzle-orm";

// 커뮤니티 리포지토리.
// 원칙 1 — DTO에 phone 등 식별자를 절대 싣지 않는다: SELECT 컬럼을 항상 명시한다.
// 원칙 2 — 차단은 목록·상세·댓글·카운트 모든 쿼리에 횡단 적용한다 (Play UGC 필수).
// 원칙 3 — 블라인드 글은 서버에서 본문·이미지를 비워서 내보낸다 (내용 유출 방지).

// 차단 필터: viewer가 차단한 작성자의 콘텐츠를 숨긴다
const notBlockedBy = (viewerId: string | undefined, authorCol: any) =>
    viewerId
        ? sql`NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${authorCol})`
        : sql`true`;

// 실력 뱃지 — hideSkillBadge면 null. 다마수(핸디)와 저장된 에버리지를 쓴다.
function buildBadge(r: { hideSkillBadge: boolean | null; handi3c: number | null; handi4c: number | null; avg3c: number | null; avg4c: number | null }) {
    if (r.hideSkillBadge) return null;
    return { handi3c: r.handi3c, handi4c: r.handi4c, avg3c: r.avg3c, avg4c: r.avg4c };
}

// 블라인드 글은 서버에서 내용을 통째로 비운다 — 클라이언트가 안 그리는 것에 의존하면
// API 응답에 상대 실명(gameCard.opponentName)·매장·지역이 그대로 남는다.
function maskBlinded<T extends { isBlinded: boolean; content: string; images: string[] | null; title?: string | null }>(row: T): T {
    if (!row.isBlinded) return row;
    return {
        ...row,
        content: "", images: [], title: null,
        gameCard: null, storeName: null, regionName: null, tags: [],
    };
}

export class CommunityRepository {

    async getPosts(opts: {
        board?: string;
        tag?: string;
        cursor?: string; // ISO createdAt
        limit?: number;
        viewerId?: string;
    }) {
        const { board, tag, cursor, viewerId } = opts;
        const limit = Math.min(opts.limit ?? 20, 50);

        const conds: any[] = [notBlockedBy(viewerId, hiqCommunityPosts.authorId)];
        if (board) conds.push(eq(hiqCommunityPosts.board, board as any));
        if (tag) conds.push(sql`${hiqCommunityPosts.tags} @> ${JSON.stringify([tag])}::jsonb`);
        if (cursor) conds.push(lt(hiqCommunityPosts.createdAt, new Date(cursor)));

        const rows = await db.select({
            id: hiqCommunityPosts.id,
            board: hiqCommunityPosts.board,
            authorId: hiqCommunityPosts.authorId,
            title: hiqCommunityPosts.title,
            content: hiqCommunityPosts.content,
            images: hiqCommunityPosts.images,
            gameCard: hiqCommunityPosts.gameCard,
            tags: hiqCommunityPosts.tags,
            regionName: hiqCommunityPosts.regionName,
            storeName: hiqCommunityPosts.storeName,
            isBlinded: hiqCommunityPosts.isBlinded,
            createdAt: hiqCommunityPosts.createdAt,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl,
            hideSkillBadge: hiqMembers.hideSkillBadge,
            handi3c: hiqMembers.handi3c,
            handi4c: hiqMembers.handi4c,
            avg3c: hiqMembers.avg3c,
            avg4c: hiqMembers.avg4c,
            likeCount: sql<number>`(SELECT count(*)::int FROM ${hiqCommunityLikes} WHERE ${hiqCommunityLikes.postId} = ${hiqCommunityPosts.id})`,
            commentCount: sql<number>`(SELECT count(*)::int FROM ${hiqCommunityComments} c WHERE c.post_id = ${hiqCommunityPosts.id} AND c.is_blinded = false${viewerId ? sql` AND NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = c.author_id)` : sql``})`,
            isLiked: viewerId
                ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCommunityLikes} WHERE ${hiqCommunityLikes.postId} = ${hiqCommunityPosts.id} AND ${hiqCommunityLikes.memberId} = ${viewerId})`
                : sql<boolean>`false`,
        })
            .from(hiqCommunityPosts)
            .innerJoin(hiqMembers, eq(hiqCommunityPosts.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(...conds))
            .orderBy(desc(hiqCommunityPosts.createdAt))
            .limit(limit);

        return rows.map(r => {
            const { authorName, authorProfileImage, hideSkillBadge, handi3c, handi4c, avg3c, avg4c, ...post } = r;
            return maskBlinded({
                ...post,
                author: { id: post.authorId, name: authorName, profileImageUrl: authorProfileImage, badge: buildBadge(r) },
            });
        });
    }

    async getPost(postId: string, viewerId?: string) {
        const rows = await this.getPostsByIds([postId], viewerId);
        return rows[0];
    }

    // 소유 검증 등 내부용 — 마스킹 없이 원본 행
    async getPostRaw(postId: string) {
        const [row] = await db.select().from(hiqCommunityPosts).where(eq(hiqCommunityPosts.id, postId));
        return row;
    }

    private async getPostsByIds(ids: string[], viewerId?: string) {
        if (!ids.length) return [];
        const rows = await db.select({
            id: hiqCommunityPosts.id,
            board: hiqCommunityPosts.board,
            authorId: hiqCommunityPosts.authorId,
            title: hiqCommunityPosts.title,
            content: hiqCommunityPosts.content,
            images: hiqCommunityPosts.images,
            gameCard: hiqCommunityPosts.gameCard,
            tags: hiqCommunityPosts.tags,
            regionName: hiqCommunityPosts.regionName,
            storeName: hiqCommunityPosts.storeName,
            isBlinded: hiqCommunityPosts.isBlinded,
            blindReason: hiqCommunityPosts.blindReason,
            appealAt: hiqCommunityPosts.appealAt,
            createdAt: hiqCommunityPosts.createdAt,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl,
            hideSkillBadge: hiqMembers.hideSkillBadge,
            handi3c: hiqMembers.handi3c,
            handi4c: hiqMembers.handi4c,
            avg3c: hiqMembers.avg3c,
            avg4c: hiqMembers.avg4c,
            likeCount: sql<number>`(SELECT count(*)::int FROM ${hiqCommunityLikes} WHERE ${hiqCommunityLikes.postId} = ${hiqCommunityPosts.id})`,
            isLiked: viewerId
                ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCommunityLikes} WHERE ${hiqCommunityLikes.postId} = ${hiqCommunityPosts.id} AND ${hiqCommunityLikes.memberId} = ${viewerId})`
                : sql<boolean>`false`,
        })
            .from(hiqCommunityPosts)
            .innerJoin(hiqMembers, eq(hiqCommunityPosts.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(inArray(hiqCommunityPosts.id, ids), notBlockedBy(viewerId, hiqCommunityPosts.authorId)));

        return rows.map(r => {
            const { authorName, authorProfileImage, hideSkillBadge, handi3c, handi4c, avg3c, avg4c, ...post } = r;
            return maskBlinded({
                ...post,
                author: { id: post.authorId, name: authorName, profileImageUrl: authorProfileImage, badge: buildBadge(r) },
            });
        });
    }

    async createPost(data: InsertHiqCommunityPost) {
        const [post] = await db.insert(hiqCommunityPosts).values(data).returning();
        return post;
    }

    async deletePost(postId: string) {
        await db.delete(hiqCommunityLikes).where(eq(hiqCommunityLikes.postId, postId));
        await db.delete(hiqCommunityComments).where(eq(hiqCommunityComments.postId, postId));
        await db.delete(hiqCommunityPosts).where(eq(hiqCommunityPosts.id, postId));
    }

    // --- 댓글 ---

    async getComments(postId: string, viewerId?: string) {
        const rows = await db.select({
            id: hiqCommunityComments.id,
            postId: hiqCommunityComments.postId,
            authorId: hiqCommunityComments.authorId,
            content: hiqCommunityComments.content,
            isBlinded: hiqCommunityComments.isBlinded,
            createdAt: hiqCommunityComments.createdAt,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl,
            hideSkillBadge: hiqMembers.hideSkillBadge,
            handi3c: hiqMembers.handi3c,
            handi4c: hiqMembers.handi4c,
            avg3c: hiqMembers.avg3c,
            avg4c: hiqMembers.avg4c,
        })
            .from(hiqCommunityComments)
            .innerJoin(hiqMembers, eq(hiqCommunityComments.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(
                eq(hiqCommunityComments.postId, postId),
                notBlockedBy(viewerId, hiqCommunityComments.authorId),
            ))
            .orderBy(hiqCommunityComments.createdAt);

        return rows.map(r => {
            const { authorName, authorProfileImage, hideSkillBadge, handi3c, handi4c, avg3c, avg4c, ...c } = r;
            const masked = c.isBlinded ? { ...c, content: "" } : c;
            return {
                ...masked,
                author: { id: c.authorId, name: authorName, profileImageUrl: authorProfileImage, badge: buildBadge(r) },
            };
        });
    }

    async createComment(data: InsertHiqCommunityComment) {
        const [comment] = await db.insert(hiqCommunityComments).values(data).returning();
        return comment;
    }

    async getCommentRaw(commentId: string) {
        const [row] = await db.select().from(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
        return row;
    }

    async deleteComment(commentId: string) {
        await db.delete(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
    }

    // upsert 기반 토글 — select-then-insert는 빠른 더블탭에서 unique 위반 500이 난다
    async toggleLike(postId: string, memberId: string) {
        const inserted = await db.insert(hiqCommunityLikes)
            .values({ postId, memberId })
            .onConflictDoNothing()
            .returning();
        if (inserted.length) return { liked: true };
        await db.delete(hiqCommunityLikes)
            .where(and(eq(hiqCommunityLikes.postId, postId), eq(hiqCommunityLikes.memberId, memberId)));
        return { liked: false };
    }

    // --- 신고 / 자동 블라인드 ---

    // 서로 다른 3인 신고 시 자동 블라인드 — 1인 운영이라 24시간 내 조치를 사람 기억으로
    // 못 지키니 시스템이 보장한다. 반환값의 autoBlinded로 라우트가 작성자에게
    // 즉시 알림 + 이의제기 안내를 보낸다 (담합·보복 신고 대응 세트).
    async report(opts: { targetType: string; targetId: string; reporterId: string; reason: string; detail?: string }) {
        await db.insert(hiqReports)
            .values(opts as any)
            .onConflictDoNothing(); // 동일인 중복 신고는 무시

        const [{ count }] = await db.select({ count: sql<number>`count(DISTINCT ${hiqReports.reporterId})::int` })
            .from(hiqReports)
            .where(and(
                eq(hiqReports.targetType, opts.targetType as any),
                eq(hiqReports.targetId, opts.targetId),
            ));

        let autoBlinded = false;
        let authorId: string | null = null;

        if (count >= 3) {
            if (opts.targetType === "community_post") {
                const post = await this.getPostRaw(opts.targetId);
                if (post && !post.isBlinded) {
                    await db.update(hiqCommunityPosts)
                        .set({ isBlinded: true, blindReason: "신고 누적으로 자동 블라인드 처리되었습니다" })
                        .where(eq(hiqCommunityPosts.id, opts.targetId));
                    autoBlinded = true;
                    authorId = post.authorId;
                }
            } else if (opts.targetType === "community_comment") {
                const comment = await this.getCommentRaw(opts.targetId);
                if (comment && !comment.isBlinded) {
                    await db.update(hiqCommunityComments)
                        .set({ isBlinded: true, blindReason: "신고 누적으로 자동 블라인드 처리되었습니다" })
                        .where(eq(hiqCommunityComments.id, opts.targetId));
                    autoBlinded = true;
                    authorId = comment.authorId;
                }
            }
            // crew_* / member 신고는 자동 블라인드 없이 어드민 검토 큐에 쌓인다
        }

        return { reportCount: count, autoBlinded, authorId };
    }

    // 이의제기 — 자동 블라인드에 대한 작성자의 원탭 절차 (담합 신고 방어)
    async appeal(opts: { targetType: "community_post" | "community_comment"; targetId: string; authorId: string; text: string }) {
        if (opts.targetType === "community_post") {
            const post = await this.getPostRaw(opts.targetId);
            if (!post || post.authorId !== opts.authorId || !post.isBlinded) return false;
            await db.update(hiqCommunityPosts)
                .set({ appealText: opts.text, appealAt: new Date() })
                .where(eq(hiqCommunityPosts.id, opts.targetId));
            return true;
        }
        const comment = await this.getCommentRaw(opts.targetId);
        if (!comment || comment.authorId !== opts.authorId || !comment.isBlinded) return false;
        await db.update(hiqCommunityComments)
            .set({ appealText: opts.text, appealAt: new Date() })
            .where(eq(hiqCommunityComments.id, opts.targetId));
        return true;
    }

    // --- 차단 ---

    async block(blockerId: string, blockedId: string) {
        await db.insert(hiqBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
    }

    async unblock(blockerId: string, blockedId: string) {
        await db.delete(hiqBlocks).where(and(eq(hiqBlocks.blockerId, blockerId), eq(hiqBlocks.blockedId, blockedId)));
    }

    async getBlockedMembers(blockerId: string) {
        return db.select({
            id: hiqBlocks.blockedId,
            name: hiqMembers.name,
            blockedAt: hiqBlocks.createdAt,
        })
            .from(hiqBlocks)
            .innerJoin(hiqMembers, eq(hiqBlocks.blockedId, hiqMembers.id))
            .where(eq(hiqBlocks.blockerId, blockerId));
    }

    // 사이트맵용 — 블라인드 제외 최신 글 (커뮤니티 글은 웹 색인 대상, 오너 결정 2026-08-05)
    async getPostsForSitemap() {
        return db.select({ id: hiqCommunityPosts.id, createdAt: hiqCommunityPosts.createdAt })
            .from(hiqCommunityPosts)
            .where(eq(hiqCommunityPosts.isBlinded, false))
            .orderBy(desc(hiqCommunityPosts.createdAt))
            .limit(5000);
    }

    // --- 소속 근거 ---

    // 최근 30일 내 내가 경기를 기록한 매장 — GPS 없이 쓰는 소속 근거.
    // 서비스 이용 기록이라 위치기반서비스 신고 의무가 없고, 실제로 친 기록이라 더 강하다.
    async getMyRecentStores(memberId: string) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return db.selectDistinct({
            id: hiqStores.id,
            name: hiqStores.name,
        })
            .from(hiqGameHistory)
            .innerJoin(hiqStores, eq(hiqGameHistory.storeId, hiqStores.id))
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                gte(hiqGameHistory.createdAt, since),
            ));
    }

    // 자랑글 경기결과 카드 — 본인 전적인지 검증하고 서버가 스냅샷을 만든다
    async buildGameCard(historyId: string, memberId: string) {
        const [h] = await db.select().from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.id, historyId), eq(hiqGameHistory.memberId, memberId)));
        if (!h) return null;
        return {
            gameType: h.gameType,
            score: h.score,
            innings: h.innings,
            average: h.average,
            isWinner: h.isWinner,
            highRun: h.highRun,
            opponentName: h.opponentName,
            playedAt: h.createdAt.toISOString(),
        };
    }

    // 내 최근 전적 목록 — 글쓰기에서 결과 카드 선택용
    async getMyRecentHistory(memberId: string, limit = 10) {
        return db.select({
            id: hiqGameHistory.id,
            gameType: hiqGameHistory.gameType,
            gameMode: hiqGameHistory.gameMode,
            score: hiqGameHistory.score,
            innings: hiqGameHistory.innings,
            average: hiqGameHistory.average,
            isWinner: hiqGameHistory.isWinner,
            highRun: hiqGameHistory.highRun,
            opponentName: hiqGameHistory.opponentName,
            createdAt: hiqGameHistory.createdAt,
        })
            .from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                eq(hiqGameHistory.sportCategory, "BILLIARDS"),
            ))
            .orderBy(desc(hiqGameHistory.createdAt))
            .limit(limit);
    }
}
