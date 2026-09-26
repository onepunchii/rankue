/**
 * 크루 글 한 편의 동작 — 좋아요(즉시 반영) · 메뉴(고치기·공지 고정·지우기·신고·차단).
 *
 * 예전 카드는 26px 휴지통 + 따로 뜨는 ⋯(신고) 두 개였고, 글 고치기·공지 고정이 아예 없었다.
 * 메뉴 하나(44px)에 모은다. 되돌릴 수 없는 것(지우기·차단)은 ConfirmDialog 로 묻는다.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LucideMoreVertical, LucidePencil, LucidePin, LucideTrash2, LucideFlag, LucideUserX } from "@/lib/icons";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/hiq/crew-ui";
import { ReportDialog, useBlockMember, blockConfirmText } from "@/components/hiq/community/ReportDialog";
import { patchPostInCaches, postsKey, photosKey, num } from "./postCache";

export interface CrewPostLike {
    id: string;
    crewId: string;
    authorId: string;
    title?: string;
    isNotice?: boolean;
    isLiked?: boolean;
    likeCount?: number | string;
    author?: { name?: string | null } | null;
}

/** 좋아요 — 모든 글 캐시를 즉시 고치고, 실패하면 되돌린다. 수는 숫자로 맞춘다(옛 문자열 캐시 대비). */
export function usePostLike(post: CrewPostLike | null | undefined) {
    const { t } = useT();
    const { toast } = useToast();
    return useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/crews/${post!.crewId}/posts/${post!.id}/like`, { method: "POST" }),
        onMutate: async () => {
            if (!post) return {};
            await queryClient.cancelQueries({ queryKey: [postsKey(post.crewId)] });
            const rollback = patchPostInCaches(queryClient, post.crewId, post.id, (p) => ({
                ...p,
                isLiked: !p.isLiked,
                likeCount: Math.max(0, num(p.likeCount) + (p.isLiked ? -1 : 1)),
            }));
            return { rollback };
        },
        onError: (_e, _v, ctx) => {
            ctx?.rollback?.();
            toast({ title: t("socialPost.errorOccurred"), description: t("socialPost.likeFailed"), variant: "destructive" });
        },
        onSettled: () => {
            if (post) queryClient.invalidateQueries({ queryKey: [postsKey(post.crewId)] });
        },
    });
}

interface PostMenuProps {
    post: CrewPostLike;
    isAdmin?: boolean;
    currentMemberId?: string;
    onEdit?: () => void;
    /** 지운 뒤(상세 창이면 닫기) */
    onDeleted?: () => void;
    /** 차단 뒤 — 그 사람 글이 목록에서 빠지므로 상세 창은 닫는다 */
    onBlocked?: () => void;
    className?: string;
}

export function PostMenu({ post, isAdmin, currentMemberId, onEdit, onDeleted, onBlocked, className }: PostMenuProps) {
    const { t } = useT();
    const { toast } = useToast();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmBlock, setConfirmBlock] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const block = useBlockMember(onBlocked);

    const isMine = !!currentMemberId && post.authorId === currentMemberId;
    const canEdit = isMine || !!isAdmin;
    const canDelete = isMine || !!isAdmin;
    const canReport = !!currentMemberId && !isMine;

    const deleteMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}`, { method: "DELETE" }),
        onSuccess: () => {
            setConfirmDelete(false);
            toast({ title: t("socialPost.postDeleted") });
            queryClient.invalidateQueries({ queryKey: [postsKey(post.crewId)] });
            // 글 사진의 사진첩 복사본도 함께 지워졌다 — 사진첩도 새로.
            queryClient.invalidateQueries({ queryKey: [photosKey(post.crewId)] });
            onDeleted?.();
        },
        onError: (error: any) => toast({
            title: t("socialPost.deleteFailed"),
            description: error?.message || t("socialPost.noPermissionOrError"),
            variant: "destructive",
        }),
    });

    const pinMutation = useMutation({
        mutationFn: async (isNotice: boolean) => apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}`, {
            method: "PATCH",
            body: { isNotice },
        }),
        onSuccess: (_d, isNotice) => {
            toast({ title: isNotice ? t("crewPost.pinned") : t("crewPost.unpinned") });
            queryClient.invalidateQueries({ queryKey: [postsKey(post.crewId)] });
        },
        onError: (error: any) => toast({ title: t("crewPost.actionFailed"), description: error?.message, variant: "destructive" }),
    });

    if (!canEdit && !canDelete && !canReport) return null;

    const itemClass = "min-h-11 px-3 text-[15px] font-medium text-ink-1 gap-2.5 cursor-pointer";
    return (
        // 카드의 '상세 열기' 로 번지지 않게 막는다(포털로 뜬 창의 클릭도 React 트리를 따라 올라온다).
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={t("crewPost.menu")}
                        title={t("crewPost.menu")}
                        className={cn("w-11 h-11 -mr-2 rounded-full inline-flex items-center justify-center text-ink-3 active:bg-surface-3", className)}
                    >
                        <LucideMoreVertical className="w-5 h-5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px] rounded-tile bg-surface-1 border-surface-line p-1">
                    {canEdit && onEdit && (
                        <DropdownMenuItem className={itemClass} onSelect={() => onEdit()}>
                            <LucidePencil className="text-ink-3" /> {t("crewPost.edit")}
                        </DropdownMenuItem>
                    )}
                    {isAdmin && (
                        <DropdownMenuItem className={itemClass} disabled={pinMutation.isPending} onSelect={() => pinMutation.mutate(!post.isNotice)}>
                            <LucidePin className="text-ink-3" /> {post.isNotice ? t("crewPost.unpin") : t("crewPost.pin")}
                        </DropdownMenuItem>
                    )}
                    {canDelete && (
                        <DropdownMenuItem className={cn(itemClass, "text-destructive")} onSelect={() => setConfirmDelete(true)}>
                            <LucideTrash2 /> {t("socialPost.deletePost")}
                        </DropdownMenuItem>
                    )}
                    {canReport && (canEdit || canDelete) && <DropdownMenuSeparator className="bg-surface-line" />}
                    {canReport && (
                        <>
                            <DropdownMenuItem className={itemClass} onSelect={() => setReportOpen(true)}>
                                <LucideFlag className="text-ink-3" /> {t("community.report")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className={cn(itemClass, "text-destructive")} onSelect={() => setConfirmBlock(true)}>
                                <LucideUserX /> {t("community.blockMenu")}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t("socialPost.deletePost")}
                desc={t("socialPost.deleteConfirmDesc")}
                confirmLabel={t("socialPost.delete")}
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
            />
            <ConfirmDialog
                open={confirmBlock}
                onOpenChange={setConfirmBlock}
                title={t("community.blockMenu")}
                desc={blockConfirmText(t, "crew_post", post.author?.name ?? undefined)}
                confirmLabel={t("community.blockMenu")}
                busy={block.isPending}
                onConfirm={() => { setConfirmBlock(false); block.mutate(post.authorId); }}
            />
            {canReport && (
                <ReportDialog
                    open={reportOpen}
                    onOpenChange={setReportOpen}
                    targetType="crew_post"
                    targetId={post.id}
                    targetAuthorId={post.authorId}
                    targetAuthorName={post.author?.name ?? undefined}
                    crewId={post.crewId}
                    onBlocked={onBlocked}
                />
            )}
        </div>
    );
}
