import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideSend, LucideTrash2, LucideHeart, LucideMessageSquare, LucideX, LucidePin } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CREW_TEXT, ConfirmDialog, CrewAvatar, CrewError, CrewRoleBadge, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { crewPostCategoryLabelKey } from "@shared/crewBoard";
import { UgcActionMenu } from "./community/UgcActionMenu";
import { useTermsGate } from "./TermsConsent";
import { CreatePostDialog } from "./CreatePostDialog";
import { PostMenu, usePostLike } from "./crew-board/PostMenu";
import { ImageViewer } from "./crew-board/ImageViewer";
import { useDateLocale } from "./crew-board/dateLocale";
import { useLivePost, postsKey, num } from "./crew-board/postCache";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    authorId: string;
    author: {
        name: string;
        profileImageUrl?: string;
    };
}

interface PostDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    post: any;
    isAdmin?: boolean;
    currentMemberId?: string;
}

export function PostDetailDialog({ open, onOpenChange, post: postProp, isAdmin, currentMemberId }: PostDetailDialogProps) {
    const [commentContent, setCommentContent] = useState("");
    const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const { gate } = useTermsGate();
    const { toast } = useToast();
    const { t } = useT();
    const dateLocale = useDateLocale();
    // 글은 목록 캐시에서 최신을 읽는다 — 고정 공지에서 연 상세가 연 순간의 복사본이라 좋아요·댓글 수가 굳어 있었다.
    const post = useLivePost(postProp);
    const likeMutation = usePostLike(post);
    const commentsKey = [`/api/hiq/crews/${post?.crewId}/posts/${post?.id}/comments`];

    // Fetch Comments
    const { data: comments, isLoading, isError, refetch } = useQuery<Comment[]>({
        queryKey: commentsKey,
        enabled: !!open && !!post?.id
    });

    // Create Comment Mutation
    const commentMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!post?.id || !post?.crewId) throw new Error(t("createPost.genericError"));
            return await apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}/comments`, {
                method: "POST",
                body: { content }
            });
        },
        onSuccess: () => {
            setCommentContent("");
            queryClient.invalidateQueries({ queryKey: commentsKey });
            queryClient.invalidateQueries({ queryKey: [postsKey(post?.crewId)] });
        },
        onError: (error: any) => {
            toast({ title: t("postDetail.commentCreateFailed"), description: error.message, variant: "destructive" });
        }
    });

    // Delete Comment Mutation
    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => {
            if (!post?.crewId) throw new Error(t("createPost.genericError"));
            return await apiRequest(`/api/hiq/crews/${post.crewId}/comments/${commentId}`, { method: "DELETE" });
        },
        onSuccess: () => {
            setDeleteCommentId(null);
            toast({ title: t("postDetail.commentDeleted") });
            queryClient.invalidateQueries({ queryKey: commentsKey });
            queryClient.invalidateQueries({ queryKey: [postsKey(post?.crewId)] });
        },
        onError: (error: any) => {
            toast({
                title: t("postDetail.deleteFailed"),
                description: error.message || t("postDetail.noPermissionOrError"),
                variant: "destructive"
            });
        }
    });

    const handleSubmitComment = () => {
        if (!commentContent.trim() || commentMutation.isPending) return;
        gate(() => commentMutation.mutate(commentContent.trim())); // 첫 댓글이면 약관 동의부터(감사 S4)
    };

    const images: string[] = Array.isArray(post?.images) ? post.images.filter(Boolean) : [];
    const categoryKey = crewPostCategoryLabelKey(post?.category);
    const likeCount = num(post?.likeCount);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                hideClose
                className="w-[calc(100%-32px)] max-w-lg max-h-[88dvh] bg-surface-1 border-0 rounded-card sm:rounded-card p-0 gap-0 overflow-hidden flex flex-col"
            >
                <DialogHeader className="flex-row items-start gap-2 px-5 pt-4 pb-3 border-b border-surface-line space-y-0 text-left">
                    <div className="flex-1 min-w-0 pt-2.5">
                        {(post?.isNotice || categoryKey) && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                                {post?.isNotice && (
                                    <span className="rk-chip bg-brand/10 text-brand"><LucidePin className="w-3 h-3" />{t("crewBoard.pinnedNotice")}</span>
                                )}
                                {categoryKey && <span className="rk-chip bg-surface-3 text-ink-2">{t(categoryKey)}</span>}
                            </div>
                        )}
                        <DialogTitle className="text-[17px] font-semibold text-ink-1 leading-snug break-words">{post?.title}</DialogTitle>
                    </div>
                    {post?.id && (
                        <PostMenu
                            post={post}
                            isAdmin={isAdmin}
                            currentMemberId={currentMemberId}
                            onEdit={() => setIsEditOpen(true)}
                            onDeleted={() => onOpenChange(false)}
                            onBlocked={() => onOpenChange(false)}
                            className="mr-0"
                        />
                    )}
                    <IconButton label={t("crewPost.close")} onClick={() => onOpenChange(false)} className="-mr-2"><LucideX /></IconButton>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                    {/* 원글 */}
                    <div className="space-y-4 pb-5 border-b border-surface-line">
                        <div className="flex items-center gap-3">
                            <CrewAvatar src={post?.author?.profileImageUrl} name={post?.author?.name} size={36} />
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[15px] font-semibold text-ink-1 truncate">{post?.author?.name}</span>
                                    <CrewRoleBadge role={post?.author?.role} />
                                </div>
                                {post?.createdAt && (
                                    <time className={CREW_TEXT.caption} dateTime={post.createdAt} title={format(new Date(post.createdAt), "PPpp", { locale: dateLocale })}>
                                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: dateLocale })}
                                    </time>
                                )}
                            </div>
                        </div>
                        <p className="text-[15px] text-ink-1 leading-relaxed whitespace-pre-wrap font-medium break-words">{post?.content}</p>

                        {images.length > 0 && (
                            <div className="space-y-2">
                                {images.map((img, idx) => (
                                    <button
                                        key={img + idx}
                                        type="button"
                                        onClick={() => setViewerIndex(idx)}
                                        aria-label={t("crewPost.openPhoto").replace("{n}", String(idx + 1))}
                                        className="block w-full rounded-tile overflow-hidden bg-surface-3"
                                    >
                                        <img src={img} className="w-full h-auto" alt="" loading="lazy" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* 좋아요 · 댓글 수 — 상세에서도 누를 수 있게(예전엔 목록 카드에서만 됐다) */}
                        <div className="flex items-center -ml-2">
                            <button
                                type="button"
                                onClick={() => likeMutation.mutate()}
                                disabled={likeMutation.isPending || !post?.id}
                                aria-pressed={!!post?.isLiked}
                                aria-label={post?.isLiked ? t("socialPost.unlike") : t("socialPost.like")}
                                className="min-h-11 min-w-11 px-2 inline-flex items-center gap-1.5 rounded-pill active:bg-surface-3"
                            >
                                <LucideHeart weight={post?.isLiked ? "fill" : "regular"} className={cn("w-5 h-5", post?.isLiked ? "text-brand" : "text-ink-3")} />
                                <span className={cn("text-[13px] font-semibold rk-num", post?.isLiked ? "text-brand" : "text-ink-3")}>{likeCount}</span>
                            </button>
                            <span className="min-h-11 px-2 inline-flex items-center gap-1.5 text-ink-3">
                                <LucideMessageSquare className="w-5 h-5" />
                                <span className="text-[13px] font-semibold rk-num">{comments?.length ?? num(post?.commentCount)}</span>
                            </span>
                        </div>
                    </div>

                    {/* 댓글 */}
                    <section className="space-y-4" aria-label={t("postDetail.comments")}>
                        <h4 className={CREW_TEXT.sub}>
                            {t("postDetail.comments")} <span className="rk-num">{comments?.length || 0}</span>
                        </h4>
                        {isLoading ? (
                            <CrewSkeleton rows={2} height={48} />
                        ) : isError ? (
                            <CrewError message={t("postDetail.commentsLoadFailed")} onRetry={() => refetch()} />
                        ) : comments && comments.length > 0 ? (
                            <ul className="space-y-4">
                                {comments.map((comment) => (
                                    <li key={comment.id} className="flex gap-3">
                                        <CrewAvatar src={comment.author.profileImageUrl} name={comment.author.name} size={32} />
                                        <div className="flex-1 min-w-0 space-y-0.5">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-[13px] font-semibold text-ink-1 truncate">{comment.author.name}</span>
                                                <span className={CREW_TEXT.caption}>
                                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: dateLocale })}
                                                </span>
                                            </div>
                                            <p className="text-[15px] text-ink-2 leading-relaxed font-medium whitespace-pre-wrap break-words">{comment.content}</p>
                                        </div>
                                        {currentMemberId && comment.authorId !== currentMemberId && (
                                            <UgcActionMenu
                                                targetType="crew_comment"
                                                targetId={comment.id}
                                                crewId={post?.crewId}
                                                authorId={comment.authorId}
                                                authorName={comment.author?.name}
                                                wrapperClassName="self-start -mr-2"
                                                className="min-w-[44px] min-h-[44px]"
                                            />
                                        )}
                                        {(isAdmin || comment.authorId === currentMemberId) && (
                                            <IconButton
                                                label={t("postDetail.deleteComment")}
                                                tone="danger"
                                                onClick={() => setDeleteCommentId(comment.id)}
                                                className="self-start -mr-2 -mt-2"
                                            >
                                                <LucideTrash2 />
                                            </IconButton>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={cn(CREW_TEXT.sub, "py-6 text-center")}>{t("postDetail.firstComment")}</p>
                        )}
                    </section>
                </div>

                {/* 댓글 입력 */}
                <div className="px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-surface-line">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder={t("postDetail.commentPlaceholder")}
                            aria-label={t("postDetail.commentPlaceholder")}
                            value={commentContent}
                            maxLength={1000}
                            onChange={(e) => setCommentContent(e.target.value)}
                            onKeyDown={(e) => {
                                // 한글 조합 중 Enter 는 글자 확정이다 — 그때 보내면 마지막 글자가 빠지거나 두 번 간다.
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleSubmitComment();
                                }
                            }}
                            className="flex-1 min-w-0 bg-surface-3 text-ink-1 text-[15px] rounded-pill h-11 px-4 outline-none focus-visible:ring-2 focus-visible:ring-brand/40 placeholder:text-ink-4"
                        />
                        <button
                            type="button"
                            disabled={!commentContent.trim() || commentMutation.isPending}
                            onClick={handleSubmitComment}
                            aria-label={t("crewPost.sendComment")}
                            className="w-11 h-11 shrink-0 rounded-full bg-brand text-brand-fg inline-flex items-center justify-center active:bg-brand-strong disabled:opacity-40"
                        >
                            <LucideSend className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <ConfirmDialog
                    open={!!deleteCommentId}
                    onOpenChange={(o) => { if (!o) setDeleteCommentId(null); }}
                    title={t("postDetail.deleteComment")}
                    desc={t("postDetail.confirmDeleteComment")}
                    confirmLabel={t("socialPost.delete")}
                    busy={deleteCommentMutation.isPending}
                    onConfirm={() => { if (deleteCommentId) deleteCommentMutation.mutate(deleteCommentId); }}
                />
                {isEditOpen && post && (
                    <CreatePostDialog open={isEditOpen} onOpenChange={setIsEditOpen} crewId={post.crewId} isAdmin={isAdmin} editPost={post} />
                )}
                <ImageViewer
                    images={images}
                    index={viewerIndex ?? 0}
                    onIndexChange={setViewerIndex}
                    open={viewerIndex !== null}
                    onOpenChange={(o) => { if (!o) setViewerIndex(null); }}
                />
            </DialogContent>
        </Dialog >
    );
}
