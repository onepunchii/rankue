import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideHeart, LucideMessageCircle, LucideMoreVertical } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { SkillBadge } from "./SkillBadge";
import { GameResultCard } from "./GameResultCard";
import { ReportDialog } from "./ReportDialog";
import { BOARD_KEYS, invalidateCommunityPosts, type CommunityPost } from "./types";

interface CommunityPostCardProps {
    post: CommunityPost;
    myId?: string;
    showBoardChip?: boolean;
    onClick?: () => void;
    detail?: boolean; // 상세 화면에서는 본문 전체 + 큰 이미지
    onDeleted?: () => void; // 상세 화면에서 삭제 시 목록으로 이동
}

export const CommunityPostCard = ({ post, myId, showBoardChip, onClick, detail, onDeleted }: CommunityPostCardProps) => {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const isMine = myId === post.authorId;

    const likeMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/community/posts/${post.id}/like`, { method: "POST" }),
        onSuccess: () => invalidateCommunityPosts(queryClient),
    });

    const deleteMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/community/posts/${post.id}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: t("community.deleted") });
            invalidateCommunityPosts(queryClient);
            onDeleted?.();
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const appealMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/community/appeals", {
            method: "POST",
            body: { targetType: "community_post", targetId: post.id, text: "이의제기합니다" },
        }),
        onSuccess: () => {
            toast({ title: t("community.appealDone") });
            invalidateCommunityPosts(queryClient);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    // 블라인드 글 — 본문·이미지는 서버에서 이미 비워져 온다. 작성자에게만 이의제기 원탭.
    if (post.isBlinded) {
        return (
            <article className="rk-card p-5 flex items-center justify-between gap-3">
                <p className="text-[13.5px] font-medium text-black/45">{t("community.blinded")}</p>
                {isMine && (
                    <button
                        onClick={(e) => { e.stopPropagation(); appealMutation.mutate(); }}
                        className="shrink-0 px-3 h-9 rounded-full bg-black/[0.05] text-[12.5px] font-semibold text-ink-2 hover:bg-black/[0.08] transition-colors"
                    >
                        {t("community.appeal")}
                    </button>
                )}
            </article>
        );
    }

    const images = post.images || [];

    return (
        <article
            onClick={onClick}
            className={`rk-card p-5 flex flex-col gap-3 ${onClick ? "cursor-pointer hover:bg-black/[0.01] transition-colors" : ""}`}
        >
            {/* 작성자 + 실력 뱃지 + 시간 */}
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-black/[0.06] overflow-hidden">
                        {post.author?.profileImageUrl ? (
                            <img src={post.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[12px] font-bold text-black/40">
                                {post.author?.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[14px] font-semibold text-ink-1 leading-none">{post.author?.name}</span>
                            <SkillBadge badge={post.author?.badge} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <time className="text-[11.5px] font-medium text-black/45 leading-none">
                                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko })}
                            </time>
                            {post.storeName && <span className="text-[11.5px] font-medium text-black/45 leading-none">· {post.storeName}</span>}
                            {post.regionName && <span className="text-[11.5px] font-medium text-black/45 leading-none">· {post.regionName}</span>}
                        </div>
                    </div>
                </div>

                {/* 더보기 — 본인 글은 삭제, 남의 글은 신고/차단 (모든 UGC 표면 필수) */}
                <div className="relative shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(v => !v); }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-black/40 hover:bg-black/[0.05] transition-colors"
                        aria-label={t("community.more")}
                    >
                        <LucideMoreVertical className="w-[18px] h-[18px]" />
                    </button>
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} />
                            <div className="absolute right-0 top-9 z-20 w-32 rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.06] overflow-hidden">
                                {isMine ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); setIsMenuOpen(false);
                                            if (window.confirm(t("community.deleteConfirm"))) deleteMutation.mutate();
                                        }}
                                        className="w-full h-11 px-4 text-left text-[13.5px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        {t("community.delete")}
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsReportOpen(true); }}
                                        className="w-full h-11 px-4 text-left text-[13.5px] font-semibold text-ink-2 hover:bg-black/[0.04] transition-colors"
                                    >
                                        {t("community.report")}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* 게시판/태그 칩 */}
            {(showBoardChip || !!post.tags?.length) && (
                <div className="flex items-center gap-1.5 flex-wrap -mt-0.5">
                    {showBoardChip && (
                        <span className="px-2 py-0.5 rounded-full bg-black/[0.05] text-[11px] font-semibold text-ink-3 leading-none">
                            {t(BOARD_KEYS[post.board])}
                        </span>
                    )}
                    {post.tags?.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-[#F5B721]/15 text-[11px] font-semibold text-[#8a6a0a] leading-none">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            {/* 본문 — 자랑은 캡션이 곧 제목 */}
            <div>
                {post.title && <h3 className="text-[15.5px] font-bold text-ink-1 mb-1">{post.title}</h3>}
                <p className={`text-[14px] font-medium text-ink-2 leading-relaxed whitespace-pre-wrap ${detail ? "" : "line-clamp-4"}`}>
                    {post.content}
                </p>
            </div>

            {/* 경기결과 카드 (위조 불가) */}
            {post.gameCard && <GameResultCard card={post.gameCard} compact={!detail} />}

            {/* 사진 */}
            {images.length > 0 && (
                <div className={images.length === 1 ? "" : "grid grid-cols-2 gap-1.5"}>
                    {images.map((url, i) => (
                        <img
                            key={i}
                            src={url}
                            loading="lazy"
                            className={`w-full object-cover rounded-2xl bg-black/[0.04] ${images.length === 1 ? (detail ? "max-h-[420px]" : "max-h-[300px]") : "aspect-square"}`}
                            alt=""
                        />
                    ))}
                </div>
            )}

            {/* 좋아요 · 댓글 */}
            <footer className="flex items-center gap-4 pt-0.5">
                <button
                    onClick={(e) => { e.stopPropagation(); likeMutation.mutate(); }}
                    className={`flex items-center gap-1.5 text-[13px] font-semibold transition-colors ${post.isLiked ? "text-red-500" : "text-black/45 hover:text-black/65"}`}
                >
                    <LucideHeart className={`w-[17px] h-[17px] ${post.isLiked ? "fill-red-500" : ""}`} />
                    <span className="tabular-nums">{post.likeCount}</span>
                </button>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-black/45">
                    <LucideMessageCircle className="w-[17px] h-[17px]" />
                    <span className="tabular-nums">{post.commentCount ?? 0}</span>
                </span>
            </footer>

            <ReportDialog
                open={isReportOpen}
                onOpenChange={setIsReportOpen}
                targetType="community_post"
                targetId={post.id}
                targetAuthorId={isMine ? undefined : post.authorId}
                targetAuthorName={post.author?.name}
            />
        </article>
    );
};
