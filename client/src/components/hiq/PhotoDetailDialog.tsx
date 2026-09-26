import { useCallback, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogTitle
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideHeart, LucideMessageSquare, LucideSend, LucideTrash2, LucideX, LucideChevronLeft, LucideChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CREW_TEXT, ConfirmDialog, CrewAvatar, CrewError, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { UgcActionMenu } from "./community/UgcActionMenu";
import { useTermsGate } from "./TermsConsent";
import { useHorizontalSwipe, useArrowKeys, PhotoShareButtons } from "./crew-board/ImageViewer";
import { useDateLocale } from "./crew-board/dateLocale";
import { photosKey, num } from "./crew-board/postCache";

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

interface PhotoDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    photo: any;
    isAdmin?: boolean;
    currentMemberId?: string;
    /** 좌우로 넘길 사진 목록(사진첩 순서). 있으면 밀어서·화살표로 이웃 사진으로 간다. */
    photos?: { id: string }[];
    onNavigate?: (photoId: string) => void;
}

/** 사진 캐시(사진첩 무한 쿼리 포함)의 한 장을 고친다 — 좋아요를 누르는 즉시 보이게. */
function patchPhoto(crewId: string, photoId: string, fn: (p: any) => any) {
    const snapshot = queryClient.getQueriesData({ queryKey: [photosKey(crewId)] });
    queryClient.setQueriesData({ queryKey: [photosKey(crewId)] }, (old: any) => {
        const map = (list: any) => (Array.isArray(list) ? list.map((p: any) => (p?.id === photoId ? fn(p) : p)) : list);
        if (Array.isArray(old)) return map(old);
        if (old && Array.isArray(old.pages)) return { ...old, pages: old.pages.map(map) };
        return old;
    });
    return () => { for (const [k, d] of snapshot) queryClient.setQueryData(k, d); };
}

export function PhotoDetailDialog({ open, onOpenChange, photo, isAdmin, currentMemberId, photos, onNavigate }: PhotoDetailDialogProps) {
    const { t } = useT();
    const { gate } = useTermsGate();
    const [commentContent, setCommentContent] = useState("");
    const [confirmPhotoDelete, setConfirmPhotoDelete] = useState(false);
    const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
    const { toast } = useToast();
    const dateLocale = useDateLocale();
    const commentsKey = [`/api/hiq/crews/${photo?.crewId}/photos/${photo?.id}/comments`];

    // 이웃 사진 — 사진첩 순서대로 좌우 넘기기
    const idx = photos && photo ? photos.findIndex((p) => p.id === photo.id) : -1;
    const prevId = idx > 0 ? photos![idx - 1].id : null;
    const nextId = idx >= 0 && idx < (photos?.length ?? 0) - 1 ? photos![idx + 1].id : null;
    const goPrev = useCallback(() => { if (prevId) { setCommentContent(""); onNavigate?.(prevId); } }, [prevId, onNavigate]);
    const goNext = useCallback(() => { if (nextId) { setCommentContent(""); onNavigate?.(nextId); } }, [nextId, onNavigate]);
    const swipe = useHorizontalSwipe(goPrev, goNext);
    useArrowKeys(open && !!onNavigate, goPrev, goNext);

    // Fetch Comments
    const { data: comments, isLoading: isCommentsLoading, isError: isCommentsError, refetch } = useQuery<Comment[]>({
        queryKey: commentsKey,
        enabled: !!photo?.id && open
    });

    // Like — 즉시 반영, 실패하면 되돌린다
    const likeMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/crews/${photo.crewId}/photos/${photo.id}/like`, { method: "POST" }),
        onMutate: () => ({
            rollback: patchPhoto(photo.crewId, photo.id, (p) => ({
                ...p, isLiked: !p.isLiked, likeCount: Math.max(0, num(p.likeCount) + (p.isLiked ? -1 : 1)),
            })),
        }),
        onError: (error: any, _v, ctx) => {
            ctx?.rollback?.();
            toast({ title: t("photoDetail.likeFailed"), description: error.message, variant: "destructive" });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: [photosKey(photo.crewId)] }),
    });

    // Create Comment Mutation
    const commentMutation = useMutation({
        mutationFn: async (content: string) => apiRequest(`/api/hiq/crews/${photo.crewId}/photos/${photo.id}/comments`, {
            method: "POST",
            body: { content }
        }),
        onSuccess: () => {
            setCommentContent("");
            queryClient.invalidateQueries({ queryKey: commentsKey });
            queryClient.invalidateQueries({ queryKey: [photosKey(photo.crewId)] });
        },
        onError: (error: any) => {
            toast({ title: t("photoDetail.commentFailed"), description: error.message, variant: "destructive" });
        }
    });

    // Delete Photo Mutation
    const deletePhotoMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/crews/${photo.crewId}/photos/${photo.id}`, { method: "DELETE" }),
        onSuccess: () => {
            setConfirmPhotoDelete(false);
            toast({ title: t("photoDetail.photoDeleted") });
            onOpenChange(false);
            queryClient.invalidateQueries({ queryKey: [photosKey(photo.crewId)] });
        },
        onError: (error: any) => {
            toast({
                title: t("photoDetail.deleteFailed"),
                description: error.message || t("photoDetail.noPermissionOrError"),
                variant: "destructive"
            });
        }
    });

    // Delete Comment Mutation
    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => apiRequest(`/api/hiq/crews/${photo.crewId}/photo-comments/${commentId}`, { method: "DELETE" }),
        onSuccess: () => {
            setDeleteCommentId(null);
            toast({ title: t("photoDetail.commentDeleted") });
            queryClient.invalidateQueries({ queryKey: commentsKey });
            queryClient.invalidateQueries({ queryKey: [photosKey(photo.crewId)] });
        },
        onError: (error: any) => {
            toast({
                title: t("photoDetail.deleteFailed"),
                description: error.message || t("photoDetail.noPermissionOrError"),
                variant: "destructive"
            });
        }
    });

    const handleSubmitComment = () => {
        if (!commentContent.trim() || commentMutation.isPending) return;
        gate(() => commentMutation.mutate(commentContent.trim())); // 첫 댓글이면 약관 동의부터(감사 S4)
    };

    if (!photo) return null;
    const canDeletePhoto = isAdmin || photo.uploaderId === currentMemberId;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* 전체 화면 — 휴대폰에서 모서리·여백 없는 사진 보기. 넓은 화면에선 가운데 카드(모서리 둥글게). */}
            <DialogContent
                hideClose
                className="max-w-none md:max-w-lg w-screen md:w-[calc(100%-32px)] h-[100dvh] md:h-auto md:max-h-[90dvh] p-0 gap-0 border-0 rounded-none sm:rounded-none md:rounded-card bg-surface-1 overflow-hidden flex flex-col"
            >
                <header className="flex items-center gap-2 pl-1 pr-2 pt-[env(safe-area-inset-top)] min-h-14 border-b border-surface-line shrink-0">
                    <IconButton label={t("crewPost.close")} onClick={() => onOpenChange(false)}><LucideX /></IconButton>
                    <CrewAvatar src={photo.author?.profileImageUrl} name={photo.author?.name} size={32} />
                    <div className="flex-1 min-w-0">
                        <DialogTitle className="text-[15px] font-semibold text-ink-1 truncate">{photo.author?.name}</DialogTitle>
                        <p className={CREW_TEXT.caption}>
                            {photo.createdAt ? formatDistanceToNow(new Date(photo.createdAt), { addSuffix: true, locale: dateLocale }) : ""}
                        </p>
                    </div>
                    {/* 남의 사진 — 신고·차단. 차단하면 사진이 목록에서 빠지므로 창도 닫는다 */}
                    {currentMemberId && photo.uploaderId !== currentMemberId && (
                        <UgcActionMenu
                            targetType="crew_photo"
                            targetId={photo.id}
                            crewId={photo.crewId}
                            authorId={photo.uploaderId}
                            authorName={photo.author?.name}
                            onBlocked={() => onOpenChange(false)}
                            className="w-11 h-11"
                            iconClassName="w-5 h-5"
                        />
                    )}
                    {canDeletePhoto && (
                        <IconButton label={t("photoDetail.deletePhoto")} tone="danger" onClick={() => setConfirmPhotoDelete(true)}>
                            <LucideTrash2 />
                        </IconButton>
                    )}
                </header>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* 사진 — 좌우로 밀어 이웃 사진 */}
                    <div className="relative bg-surface-3 h-[min(70dvh,100vw)] md:h-[420px] flex items-center justify-center overflow-hidden select-none" {...swipe}>
                        <img key={photo.url} src={photo.url} className="max-w-full max-h-full object-contain" alt={photo.caption || ""} draggable={false} />
                        {prevId && (
                            <IconButton label={t("crewAlbum.prev")} onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-surface-1 shadow-sm hidden md:inline-flex">
                                <LucideChevronLeft />
                            </IconButton>
                        )}
                        {nextId && (
                            <IconButton label={t("crewAlbum.next")} onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-1 shadow-sm hidden md:inline-flex">
                                <LucideChevronRight />
                            </IconButton>
                        )}
                        {photos && idx >= 0 && photos.length > 1 && (
                            <span className="absolute bottom-2 right-2 rk-chip rk-num bg-surface-1 text-ink-2">{idx + 1} / {photos.length}</span>
                        )}
                    </div>

                    {/* 캡션 · 좋아요 · 댓글 수 */}
                    <div className="px-4 pt-2 pb-3 space-y-1">
                        <div className="flex items-center -ml-2">
                            <button
                                type="button"
                                onClick={() => likeMutation.mutate()}
                                disabled={likeMutation.isPending}
                                aria-pressed={!!photo.isLiked}
                                aria-label={photo.isLiked ? t("socialPost.unlike") : t("socialPost.like")}
                                className="min-h-11 min-w-11 px-2 inline-flex items-center gap-1.5 rounded-pill active:bg-surface-3"
                            >
                                <LucideHeart weight={photo.isLiked ? "fill" : "regular"} className={cn("w-6 h-6", photo.isLiked ? "text-brand" : "text-ink-3")} />
                                <span className={cn("text-[15px] font-semibold rk-num", photo.isLiked ? "text-brand" : "text-ink-3")}>{num(photo.likeCount)}</span>
                            </button>
                            <span className="min-h-11 px-2 inline-flex items-center gap-1.5 text-ink-3">
                                <LucideMessageSquare className="w-6 h-6" />
                                <span className="text-[15px] font-semibold rk-num">{comments?.length ?? num(photo.commentCount)}</span>
                            </span>
                            <span className="flex-1" />
                            {photo.url && <PhotoShareButtons url={photo.url} title={photo.caption ?? undefined} />}
                        </div>
                        {photo.caption && (
                            <p className="text-[15px] font-medium text-ink-1 leading-relaxed whitespace-pre-wrap break-words">{photo.caption}</p>
                        )}
                    </div>

                    {/* 댓글 */}
                    <section className="px-4 pb-6 space-y-4 border-t border-surface-line pt-4" aria-label={t("photoDetail.comments")}>
                        <h4 className={CREW_TEXT.sub}>{t("photoDetail.comments")} <span className="rk-num">{comments?.length || 0}</span></h4>
                        {isCommentsLoading ? (
                            <CrewSkeleton rows={2} height={48} />
                        ) : isCommentsError ? (
                            <CrewError onRetry={() => refetch()} />
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
                                                targetType="crew_photo_comment"
                                                targetId={comment.id}
                                                crewId={photo.crewId}
                                                authorId={comment.authorId}
                                                authorName={comment.author?.name}
                                                wrapperClassName="self-start -mr-2"
                                                className="min-w-[44px] min-h-[44px]"
                                            />
                                        )}
                                        {/* 휴대폰엔 hover 가 없다 — 지우기는 늘 보이게, 44px 로 */}
                                        {(isAdmin || comment.authorId === currentMemberId) && (
                                            <IconButton
                                                label={t("photoDetail.deleteComment")}
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
                            <p className={cn(CREW_TEXT.sub, "py-6 text-center")}>{t("photoDetail.beFirstToComment")}</p>
                        )}
                    </section>
                </div>

                {/* 댓글 입력 */}
                <div className="px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-surface-line shrink-0">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder={t("photoDetail.addCommentPlaceholder")}
                            aria-label={t("photoDetail.addCommentPlaceholder")}
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
                    open={confirmPhotoDelete}
                    onOpenChange={setConfirmPhotoDelete}
                    title={t("photoDetail.deletePhoto")}
                    desc={t("photoDetail.confirmDeletePhoto")}
                    confirmLabel={t("socialPost.delete")}
                    busy={deletePhotoMutation.isPending}
                    onConfirm={() => deletePhotoMutation.mutate()}
                />
                <ConfirmDialog
                    open={!!deleteCommentId}
                    onOpenChange={(o) => { if (!o) setDeleteCommentId(null); }}
                    title={t("photoDetail.deleteComment")}
                    desc={t("photoDetail.confirmDeleteComment")}
                    confirmLabel={t("socialPost.delete")}
                    busy={deleteCommentMutation.isPending}
                    onConfirm={() => { if (deleteCommentId) deleteCommentMutation.mutate(deleteCommentId); }}
                />
            </DialogContent>
        </Dialog >
    );
}
