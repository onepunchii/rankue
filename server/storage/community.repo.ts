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
    golfBookings,
    golfRoundPhotos,
} from "../../shared/schema.js";
import { eq, and, desc, sql, lt, gte, inArray, isNull } from "drizzle-orm";
import { reasonLabel } from "../lib/reportQueue.js";

/** 신고 한 건의 상세(detail) 길이 상한 — 검토 중인 회원 신고에 다른 사유를 덧붙일 때 끝없이 자라지 않게 묶는다(한 번의 상세는 라우트가 500자로 자른다) */
const REPORT_DETAIL_MAX = 1000;

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
        lang?: string;
    }) {
        const { board, tag, cursor, viewerId, lang } = opts;
        const limit = Math.min(opts.limit ?? 20, 50);

        const conds: any[] = [notBlockedBy(viewerId, hiqCommunityPosts.authorId)];
        if (board) conds.push(eq(hiqCommunityPosts.board, board as any));
        if (lang) conds.push(eq(hiqCommunityPosts.language, lang));
        if (tag) conds.push(sql`${hiqCommunityPosts.tags} @> ${JSON.stringify([tag])}::jsonb`);
        if (cursor) conds.push(lt(hiqCommunityPosts.createdAt, new Date(cursor)));

        const rows = await db.select({
            id: hiqCommunityPosts.id,
            board: hiqCommunityPosts.board,
            language: hiqCommunityPosts.language,
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
            commentCount: sql<number>`(SELECT count(*)::int FROM ${hiqCommunityComments} c WHERE c.post_id = ${hiqCommunityPosts.id} AND c.is_blinded = false AND c.deleted_at IS NULL${viewerId ? sql` AND NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = c.author_id)` : sql``})`,
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
            language: hiqCommunityPosts.language,
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
            // 글 상세의 💬 숫자 — 목록 쿼리와 **같은 기준**(가려진 댓글·지운 자리·차단한 사람 제외).
            // 예전엔 이 쿼리에만 이 칸이 없어서 상세 화면은 댓글이 몇 개든 늘 💬 0 이었다(2026-09-10 발견).
            commentCount: sql<number>`(SELECT count(*)::int FROM ${hiqCommunityComments} c WHERE c.post_id = ${hiqCommunityPosts.id} AND c.is_blinded = false AND c.deleted_at IS NULL${viewerId ? sql` AND NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = c.author_id)` : sql``})`,
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
            parentId: hiqCommunityComments.parentId,
            deletedAt: hiqCommunityComments.deletedAt,
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

        const mapped = rows.map(r => {
            const { authorName, authorProfileImage, hideSkillBadge, handi3c, handi4c, avg3c, avg4c, deletedAt, ...c } = r;
            const isDeleted = !!deletedAt;
            // 지운 댓글 자리는 누가 썼는지도 내보내지 않는다.
            const masked = isDeleted ? { ...c, content: "", authorId: "" } : c.isBlinded ? { ...c, content: "" } : c;
            return {
                ...masked,
                isDeleted,
                author: isDeleted
                    ? { id: "", name: "", profileImageUrl: null, badge: null }
                    : { id: c.authorId, name: authorName, profileImageUrl: authorProfileImage, badge: buildBadge(r) },
            };
        });
        // 지운 댓글 자리는 **보이는 답글이 있을 때만** 남긴다(차단 등으로 답글이 다 가려지면 빈 자리만 남는다).
        const hasVisibleReply = new Set(mapped.filter(c => c.parentId).map(c => c.parentId));
        return mapped.filter(c => !c.isDeleted || hasVisibleReply.has(c.id));
    }

    async createComment(data: InsertHiqCommunityComment) {
        const [comment] = await db.insert(hiqCommunityComments).values(data).returning();
        return comment;
    }

    async getCommentRaw(commentId: string) {
        const [row] = await db.select().from(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
        return row;
    }

    /**
     * 댓글 지우기(2026-09-10). 답글이 달린 댓글은 행을 남기고 '삭제된 댓글' 로 바꾼다 — 통째로 지우면
     * 남이 단 답글까지 사라진다. 답글을 지운 뒤 그 부모가 이미 지운 댓글이고 남은 답글이 없으면 부모 자리도 치운다.
     */
    async deleteComment(commentId: string) {
        const [target] = await db.select().from(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
        if (!target) return;
        const replyCount = async (id: string) => Number((await db.select({ n: sql<number>`count(*)::int` })
            .from(hiqCommunityComments).where(eq(hiqCommunityComments.parentId, id)))[0]?.n ?? 0);

        if (!target.parentId) {
            if (await replyCount(commentId) > 0) {
                await db.update(hiqCommunityComments).set({ deletedAt: new Date(), content: "" }).where(eq(hiqCommunityComments.id, commentId));
            } else {
                await db.delete(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
            }
            return;
        }
        await db.delete(hiqCommunityComments).where(eq(hiqCommunityComments.id, commentId));
        const [parent] = await db.select().from(hiqCommunityComments).where(eq(hiqCommunityComments.id, target.parentId));
        if (parent?.deletedAt && await replyCount(parent.id) === 0) {
            await db.delete(hiqCommunityComments).where(eq(hiqCommunityComments.id, parent.id));
        }
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
    //
    // 회원 신고(member)만 **닫힌 신고를 다시 연다**(2026-10-06). 대상이 글이 아니라 '사람'이라, 같은 사람이 같은 회원을
    // 다른 일로 다시 신고할 수 있다 — 채팅(조인/부킹·1:1 방)의 메시지 신고가 모두 회원 신고로 들어온다.
    // 예전엔 (대상, 신고자) 한 줄이 이미 있으면 무시해서, 운영자가 앞 신고를 기각·조치한 뒤 다시 신고하면
    // 화면은 "접수됐어요"인데 큐(pending 만 센다)에도 운영자 알림에도 아무것도 없었다.
    //  - 옛 행이 닫힌 상태(actioned·dismissed)일 때만 pending 으로 되돌리고 사유·상세·시각을 새 값으로 바꾼다.
    //    시각(created_at)이 지금이 되므로 큐의 '가장 오래 기다린 신고'와 운영자 알림의 '방금 들어온 신고'(2분 창)가 그대로 맞는다.
    //  - 아직 pending 이면 상태·사유·시각은 **그대로 둔다** — 다시 누를 때마다 시각을 밀면 24시간 기한 시계가 뒤로 간다.
    //    다만 사유가 다르면 그 줄의 상세(detail)에만 "[추가 신고] 사유" 한 줄을 덧붙인다(2차 검토). 채팅 신고는 운영자가 볼 원문이 없어
    //    사유가 사실상 유일한 단서인데, 예전엔 두 번째 사유('욕설')가 통째로 버려져 운영자가 첫 사유('스팸')만 보고 닫을 수 있었다.
    //    같은 사유를 다시 누르거나 이미 덧붙인 줄이면 아무것도 바꾸지 않는다. 운영자 알림은 예전처럼 없다(첫 신고 때 갔고 큐에 열려 있다).
    //  - 앞선 판단(누가·언제·무엇으로 닫았나)은 hiq_moderation_actions 에 따로 쌓여 있어 덮이지 않는다.
    //  - 글·댓글·사진 같은 콘텐츠 신고는 예전 그대로 동일인 중복을 무시한다(대상이 그 콘텐츠 하나라 다시 신고할 '다른 일'이 없다).
    //  - 충돌 대상은 유일 제약 (target_type, target_id, reporter_id) 이다(shared/schema hiqReports, 운영 DB 에도 걸려 있다).
    async report(opts: { targetType: string; targetId: string; reporterId: string; reason: string; detail?: string }) {
        if (opts.targetType === "member") {
            // returning 은 새로 쓴 줄·다시 연 줄만 돌려준다 — 있는 줄이 pending 이면(setWhere 가 거짓) 0줄이다.
            const written = await db.insert(hiqReports)
                .values(opts as any)
                .onConflictDoUpdate({
                    target: [hiqReports.targetType, hiqReports.targetId, hiqReports.reporterId],
                    set: { status: "pending", reason: opts.reason, detail: opts.detail ?? null, createdAt: sql`now()` },
                    setWhere: sql`${hiqReports.status} <> 'pending'`,
                })
                .returning({ id: hiqReports.id });
            if (!written.length) {
                // 검토 중인 줄에 다른 사유로 다시 들어온 신고 — 상세에만 덧붙인다(상태·시각은 그대로, 운영자 화면은 줄바꿈 그대로 보여 준다).
                // 길이는 묶어 둔다: 한 번의 상세는 라우트가 500자로 자르고, 덧붙인 줄까지 합쳐 REPORT_DETAIL_MAX 자.
                const note = `[추가 신고] ${reasonLabel(opts.reason)}${opts.detail ? `: ${opts.detail}` : ""}`;
                await db.update(hiqReports)
                    .set({ detail: sql`left(concat_ws(chr(10), ${hiqReports.detail}, ${note}::text), ${sql.raw(String(REPORT_DETAIL_MAX))})` })
                    .where(and(
                        eq(hiqReports.targetType, "member"),
                        eq(hiqReports.targetId, opts.targetId),
                        eq(hiqReports.reporterId, opts.reporterId),
                        eq(hiqReports.status, "pending"),
                        sql`${hiqReports.reason} <> ${opts.reason}`,                           // 사유가 다를 때만
                        sql`position(${note}::text in coalesce(${hiqReports.detail}, '')) = 0`, // 같은 덧붙임을 되풀이하지 않는다
                    ));
            }
        } else {
            await db.insert(hiqReports)
                .values(opts as any)
                .onConflictDoNothing(); // 동일인 중복 신고는 무시
        }

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
            } else if (opts.targetType === "golf_booking") {
                // 골프 매물도 지우지 않고 가린다 — 지우면 누가 무엇을 올렸는지 추적이 사라진다(2026-09-09).
                const [row] = await db.update(golfBookings)
                    .set({ isBlinded: true, blindReason: "신고 누적으로 자동 블라인드 처리되었습니다" })
                    .where(and(eq(golfBookings.id, opts.targetId), eq(golfBookings.isBlinded, false)))
                    .returning({ ownerId: golfBookings.ownerId });
                if (row) { autoBlinded = true; authorId = row.ownerId ?? null; }
            } else if (opts.targetType === "golf_photo") {
                // 라운드 사진은 공개로 돌리면 골프장 페이지에 **사전 승인 없이** 바로 뜬다(2026-09-30 오너) — 그래서 3명이면 시스템이 가린다.
                // 지우지 않고 가린다: 올린 사람은 앨범에서 '가려진 사진'으로 보고 직접 지울 수 있고, 운영자는 풀 수 있다.
                const [row] = await db.update(golfRoundPhotos)
                    .set({ hiddenAt: new Date() })
                    .where(and(eq(golfRoundPhotos.id, opts.targetId), isNull(golfRoundPhotos.hiddenAt)))
                    .returning({ memberId: golfRoundPhotos.memberId });
                if (row) { autoBlinded = true; authorId = row.memberId; }
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

    // RSS 피드용 — 제목·본문 일부까지 (네이버 서치어드바이저 RSS 제출).
    // 사이트맵과 달리 "무엇에 대한 글인지"가 필요해 title/content 를 함께 읽는다.
    async getPostsForRss(limit = 30) {
        return db.select({
            id: hiqCommunityPosts.id,
            board: hiqCommunityPosts.board,
            language: hiqCommunityPosts.language,
            title: hiqCommunityPosts.title,
            content: hiqCommunityPosts.content,
            createdAt: hiqCommunityPosts.createdAt,
        })
            .from(hiqCommunityPosts)
            .where(eq(hiqCommunityPosts.isBlinded, false))
            .orderBy(desc(hiqCommunityPosts.createdAt))
            .limit(limit);
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
