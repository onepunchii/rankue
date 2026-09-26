import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { LucideHeart, LucideMessageSquare, LucidePin } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { CREW_CARD, CREW_TEXT, CrewAvatar, CrewRoleBadge } from "@/components/hiq/crew-ui";
import { crewPostCategoryLabelKey, canonicalCrewPostCategory } from "@shared/crewBoard";
import { PostDetailDialog } from "./PostDetailDialog";
import { CreatePostDialog } from "./CreatePostDialog";
import { PostMenu, usePostLike } from "./crew-board/PostMenu";
import { ImageViewer } from "./crew-board/ImageViewer";
import { useDateLocale } from "./crew-board/dateLocale";
import { num } from "./crew-board/postCache";

interface PostAuthor {
    name: string;
    profileImageUrl?: string;
    role?: 'leader' | 'manage' | 'member' | string;
}

interface Post {
    id: string;
    crewId: string;
    authorId: string;
    title: string;
    content: string;
    category?: string;
    isNotice: boolean;
    createdAt: string;
    author?: PostAuthor;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    images?: string[] | null;
}

interface SocialPostCardProps {
    post: Post;
    isMember?: boolean;
    isAdmin?: boolean;
    currentMemberId?: string;
}

/** 저장된 카테고리 값(한국어 원문) → 화면 라벨. 모르는 값은 원문 그대로. */
export function useCategoryLabel() {
    const { t } = useT();
    return (v: unknown) => {
        const key = crewPostCategoryLabelKey(v);
        return key ? t(key) : typeof v === "string" ? v : "";
    };
}

export function SocialPostCard({ post, isMember, isAdmin, currentMemberId }: SocialPostCardProps) {
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const { toast } = useToast();
    const { t } = useT();
    const dateLocale = useDateLocale();
    const categoryLabel = useCategoryLabel();
    const likeMutation = usePostLike(post);

    const content = post?.content || "";
    // 긴 글은 카드에서 잘라 보여 주고 '더 보기' 는 상세로 연다. 예전엔 카드 안에서 펼쳤는데, 펼치면 사진이
    // 사라졌고(!isExpanded 조건) 본문을 눌러도 상세가 안 열렸다.
    const isLongText = content.length > 150 || content.split('\n').length > 3;
    const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
    const likeCount = num(post.likeCount);
    const commentCount = num(post.commentCount);
    const category = canonicalCrewPostCategory(post.category);

    const guard = (fn: () => void) => {
        if (!isMember) {
            toast({ title: t("socialPost.accessRestricted"), description: t("socialPost.membersOnly"), variant: "destructive" });
            return;
        }
        fn();
    };
    const openDetail = () => guard(() => setIsDetailOpen(true));

    return (
        <article className={cn(CREW_CARD, "flex flex-col gap-3")}>
            {/* 머리: 글쓴이 · 역할 · 시각 · 메뉴 */}
            <header className="flex items-center gap-3 -mt-1">
                <CrewAvatar src={post.author?.profileImageUrl} name={post.author?.name} size={36} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[15px] font-semibold text-ink-1 truncate">{post.author?.name}</span>
                        <CrewRoleBadge role={post.author?.role} />
                        {/* 분류는 글쓴이 옆에 — 예전엔 카드 맨 아래 오른쪽에, 그것도 '자유'가 아닐 때만 있어 카드마다 자리가 달랐다 */}
                        {category && <span className="rk-chip bg-surface-3 text-ink-2 shrink-0">{categoryLabel(category)}</span>}
                    </div>
                    <time className={CREW_TEXT.caption} dateTime={post.createdAt}>
                        {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: dateLocale }) : ""}
                    </time>
                </div>
                {isMember && (
                    <PostMenu
                        post={post}
                        isAdmin={isAdmin}
                        currentMemberId={currentMemberId}
                        onEdit={() => setIsEditOpen(true)}
                    />
                )}
            </header>

            {/* 본문 — 누르면 상세(댓글)로 */}
            <div
                role="button"
                tabIndex={0}
                onClick={openDetail}
                onKeyDown={(e) => { if (e.key === 'Enter') openDetail(); }}
                className="flex flex-col gap-1.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-tile"
            >
                <h3 className="text-[17px] font-semibold text-ink-1 leading-snug line-clamp-2 flex items-start gap-1.5">
                    {post.isNotice && <LucidePin className="w-4 h-4 mt-1 shrink-0 text-brand" aria-label={t("crewBoard.pinnedNotice")} />}
                    <span className="min-w-0">{post.title || t("crewBoard.untitled")}</span>
                </h3>
                {content && (
                    <p className="text-[15px] font-medium text-ink-2 leading-relaxed whitespace-pre-wrap line-clamp-3">{content}</p>
                )}
                {isLongText && <span className="text-[13px] font-semibold text-ink-3">{t("socialPost.seeMore")}</span>}
            </div>

            {/* 사진 — 글을 펼쳐도 사라지지 않는다. 누르면 크게 보기 */}
            {images.length > 0 && (
                <div className={cn("grid gap-1 rounded-tile overflow-hidden", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                    {images.slice(0, 4).map((img, idx) => (
                        <button
                            key={img + idx}
                            type="button"
                            onClick={() => guard(() => setViewerIndex(idx))}
                            aria-label={t("crewPost.openPhoto").replace("{n}", String(idx + 1))}
                            className={cn(
                                "relative bg-surface-3 overflow-hidden",
                                images.length === 1 ? "aspect-[4/3]" : "aspect-square",
                                images.length === 3 && idx === 0 && "row-span-2 aspect-auto",
                            )}
                        >
                            <img src={img} className="w-full h-full object-cover" alt="" loading="lazy" />
                            {idx === 3 && images.length > 4 && (
                                // 색 토큰은 var() 라 투명도(/50)가 안 먹는다 — 어둡게 덮는 대신 모서리 칩으로 남은 장수를 말한다.
                                <span className="absolute right-2 bottom-2 rk-chip rk-num bg-surface-1 text-ink-1 shadow-sm">
                                    +{images.length - 4}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* 발: 좋아요 · 댓글 (각 44px) — 왼쪽 정렬, 카드 안쪽 여백에 맞춰 -ml-2 */}
            <footer className="flex items-center -mb-2 -ml-2 -mt-1">
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => guard(() => likeMutation.mutate())}
                        disabled={likeMutation.isPending}
                        aria-pressed={!!post.isLiked}
                        aria-label={post.isLiked ? t("socialPost.unlike") : t("socialPost.like")}
                        className="min-h-11 min-w-11 px-2 inline-flex items-center gap-1.5 rounded-pill active:bg-surface-3"
                    >
                        <LucideHeart weight={post.isLiked ? "fill" : "regular"} className={cn("w-5 h-5", post.isLiked ? "text-brand" : "text-ink-3")} />
                        <span className={cn("text-[13px] font-semibold rk-num", post.isLiked ? "text-brand" : "text-ink-3")}>{likeCount}</span>
                    </button>
                    <button
                        type="button"
                        onClick={openDetail}
                        aria-label={`${t("socialPost.comments")} ${commentCount}`}
                        className="min-h-11 min-w-11 px-2 inline-flex items-center gap-1.5 rounded-pill active:bg-surface-3"
                    >
                        <LucideMessageSquare className="w-5 h-5 text-ink-3" />
                        <span className="text-[13px] font-semibold text-ink-3 rk-num">{commentCount}</span>
                    </button>
                </div>
            </footer>

            {isDetailOpen && (
                <PostDetailDialog
                    open={isDetailOpen}
                    onOpenChange={setIsDetailOpen}
                    post={post}
                    isAdmin={isAdmin}
                    currentMemberId={currentMemberId}
                />
            )}
            {isEditOpen && (
                <CreatePostDialog
                    open={isEditOpen}
                    onOpenChange={setIsEditOpen}
                    crewId={post.crewId}
                    isAdmin={isAdmin}
                    editPost={post}
                />
            )}
            <ImageViewer
                images={images}
                index={viewerIndex ?? 0}
                onIndexChange={setViewerIndex}
                open={viewerIndex !== null}
                onOpenChange={(o) => { if (!o) setViewerIndex(null); }}
            />
        </article>
    );
}
