import { memo, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LucidePin, LucideLayoutList, LucideReceipt, LucidePlus, LucideChevronRight, LucideLoader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { SocialPostCard } from "@/components/hiq/SocialPostCard";
import { useT } from "@/lib/i18n";
import { CREW_BTN, CREW_CARD, CREW_TEXT, CrewChip, CrewChipRow, CrewEmpty, CrewError } from "@/components/hiq/crew-ui";
import { CREW_POST_CATEGORIES, CREW_POSTS_FIRST_PAGE, canonicalCrewPostCategory, crewPostCategoryLabelKey, nextCrewCursor } from "@shared/crewBoard";
import { postsKey } from "@/components/hiq/crew-board/postCache";

// '전체' 는 화면 전용 거르기 값(저장되지 않는다). club-detail 이 이 값을 상태로 들고 있어 그대로 쓴다.
const ALL = "전체";
const OLDER_PAGE = 20;

export interface Post {
    id: string;
    crewId: string;
    authorId: string;
    title: string;
    content: string;
    category?: string;
    isNotice: boolean;
    createdAt: string;
    author?: {
        name: string;
        profileImageUrl?: string;
        role?: string;
    };
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    images?: string[] | null;
}

interface CrewBoardTabProps {
    posts: Post[];
    category: string;
    onCategoryChange: (cat: string) => void;
    onPostClick: (post: Post) => void;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
    onCreatePost: () => void;
    onCreateSettlement: () => void;
    /** 글 목록을 못 불러왔을 때 — '글이 없어요' 와 구분해 다시 시도를 준다(club-detail 이 넘긴다). */
    isError?: boolean;
    onRetry?: () => void;
}

// 고정 공지 줄의 날짜 — 언어별 짧은 월·일("9. 26." / "9/26"). 예전엔 "MM.dd" 를 박아 두었다.
function useShortDate() {
    const { locale } = useT();
    return useMemo(() => {
        const f = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
        return (v?: string) => (v ? f.format(new Date(v)) : "");
    }, [locale]);
}

export const CrewBoardTab = memo(({
    posts, category, onCategoryChange, onPostClick, isMember, isAdmin, currentMemberId, onCreatePost, onCreateSettlement, isError, onRetry,
}: CrewBoardTabProps) => {
    const { t } = useT();
    const shortDate = useShortDate();
    const crewId = posts?.[0]?.crewId;

    // 첫 쪽은 club-detail 이 준다(파라미터 없는 GET = 공지 + 최근 글 CREW_POSTS_FIRST_PAGE 개).
    // 그보다 오래된 글은 여기서 '더 보기' 로 이어 받는다. 첫 쪽이 새로 오면(글 추가) 커서가 바뀌어 이어 받기도 새로 한다.
    const firstCursor = useMemo(() => nextCrewCursor(posts ?? [], CREW_POSTS_FIRST_PAGE), [posts]);
    const [wantOlder, setWantOlder] = useState(false);
    const older = useInfiniteQuery({
        queryKey: [postsKey(crewId ?? ""), "older", firstCursor],
        queryFn: ({ pageParam, signal }) => apiRequest(
            `${postsKey(crewId!)}?before=${encodeURIComponent(String(pageParam))}&limit=${OLDER_PAGE}`,
            { signal },
        ) as Promise<Post[]>,
        initialPageParam: firstCursor as string | null,
        getNextPageParam: (last: Post[]) => nextCrewCursor(last ?? [], OLDER_PAGE),
        enabled: wantOlder && !!crewId && !!firstCursor,
    });

    const allPosts = useMemo(() => {
        const seen = new Set<string>();
        const out: Post[] = [];
        for (const p of [...(posts ?? []), ...((older.data?.pages ?? []).flat() as Post[])]) {
            if (!p?.id || seen.has(p.id)) continue;
            seen.add(p.id);
            out.push(p);
        }
        return out;
    }, [posts, older.data]);

    const notices = useMemo(() => allPosts.filter(p => p.isNotice).slice(0, 3), [allPosts]);

    const filteredPosts = useMemo(() => {
        // 고정 공지 칸에 이미 보인 글은 목록에서 빼 두 번 그리지 않는다.
        const pinnedIds = new Set(notices.map(n => n.id));
        return allPosts.filter(p =>
            (category === ALL || canonicalCrewPostCategory(p.category) === canonicalCrewPostCategory(category)) && !pinnedIds.has(p.id));
    }, [allPosts, category, notices]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const p of allPosts) {
            const k = canonicalCrewPostCategory(p.category);
            if (k) c[k] = (c[k] ?? 0) + 1;
        }
        return c;
    }, [allPosts]);

    const hasMore = wantOlder ? !!older.hasNextPage : !!firstCursor;
    const loadMore = () => {
        if (!wantOlder) setWantOlder(true);
        else if (older.hasNextPage && !older.isFetchingNextPage) void older.fetchNextPage();
    };
    const loadingMore = older.isFetching;

    return (
        <div className="min-h-full px-4 pt-4 pb-32 flex flex-col gap-4">
            {/* 카테고리 칩 — CrewChipRow 가 탭 전체의 좌우 밀기와 싸우지 않게 막는다 */}
            <CrewChipRow label={t("createPost.categoryLabel")}>
                {[ALL, ...CREW_POST_CATEGORIES].map((cat) => (
                    <CrewChip
                        key={cat}
                        selected={category === cat || (cat !== ALL && canonicalCrewPostCategory(category) === cat)}
                        onClick={() => onCategoryChange(cat)}
                        count={cat === ALL ? undefined : counts[cat] || undefined}
                    >
                        {cat === ALL ? t("crewBoard.categoryAll") : t(crewPostCategoryLabelKey(cat) ?? cat)}
                    </CrewChip>
                ))}
            </CrewChipRow>

            {isError ? (
                <CrewError onRetry={onRetry} />
            ) : (
                <>
                    {/* 고정 공지 */}
                    {notices.length > 0 && (
                        <section className={cn(CREW_CARD, "p-0 overflow-hidden")} aria-label={t("crewBoard.pinnedNotice")}>
                            <h2 className={cn(CREW_TEXT.caption, "px-4 pt-3 pb-1 flex items-center gap-1.5 text-brand")}>
                                <LucidePin className="w-3.5 h-3.5" /> {t("crewBoard.pinnedNotice")}
                            </h2>
                            <ul>
                                {notices.map((notice) => (
                                    <li key={notice.id} className="border-t border-surface-line first:border-0">
                                        <button
                                            type="button"
                                            onClick={() => onPostClick(notice)}
                                            className="w-full min-h-12 px-4 flex items-center gap-3 text-left active:bg-surface-3"
                                        >
                                            <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink-1">{notice.title || t("crewBoard.untitled")}</span>
                                            <span className="text-[12px] font-medium text-ink-3 rk-num shrink-0">{shortDate(notice.createdAt)}</span>
                                            <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* 글 목록 */}
                    {filteredPosts.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {filteredPosts.map((post) => (
                                <SocialPostCard
                                    key={post.id}
                                    post={post}
                                    isMember={isMember}
                                    isAdmin={isAdmin}
                                    currentMemberId={currentMemberId}
                                />
                            ))}
                        </div>
                    ) : !hasMore ? (
                        <CrewEmpty
                            icon={<LucideLayoutList />}
                            title={t("crewBoard.emptyTitle")}
                            desc={t("crewBoard.emptyCta")}
                            action={isMember ? { label: t("crewBoard.createPost"), onClick: onCreatePost } : undefined}
                        />
                    ) : null}

                    {older.isError && <CrewError onRetry={() => void older.refetch()} />}
                    {hasMore && !older.isError && (
                        <button type="button" onClick={loadMore} disabled={loadingMore} className={cn(CREW_BTN.secondary, "w-full")}>
                            {loadingMore ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : null}
                            {t("crewPost.loadMore")}
                        </button>
                    )}
                </>
            )}

            {/* 떠 있는 버튼 */}
            {isMember && (
                <div className="fixed above-nav right-4 flex flex-col items-end gap-3 z-30">
                    {isAdmin && (
                        <button
                            type="button"
                            onClick={onCreateSettlement}
                            className="w-14 h-14 bg-surface-1 text-brand rounded-full flex items-center justify-center rk-shadow active:bg-surface-3"
                            title={t("crewBoard.createSettlement")}
                            aria-label={t("crewBoard.createSettlement")}
                        >
                            <LucideReceipt className="w-6 h-6" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onCreatePost}
                        className="w-14 h-14 bg-brand text-brand-fg rounded-full flex items-center justify-center rk-shadow active:bg-brand-strong"
                        title={t("crewBoard.createPost")}
                        aria-label={t("crewBoard.createPost")}
                    >
                        <LucidePlus className="w-7 h-7" />
                    </button>
                </div>
            )}
        </div>
    );
});

CrewBoardTab.displayName = "CrewBoardTab";
