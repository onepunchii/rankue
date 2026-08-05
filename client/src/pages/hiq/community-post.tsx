import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideChevronLeft, LucideSend, LucideMoreVertical } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { CommunityPostCard } from "@/components/hiq/community/CommunityPostCard";
import { SkillBadge } from "@/components/hiq/community/SkillBadge";
import { ReportDialog } from "@/components/hiq/community/ReportDialog";
import type { CommunityComment, CommunityPost } from "@/components/hiq/community/types";
import type { HiqMember } from "@shared/schema";

interface PostDetail extends CommunityPost {
    comments: CommunityComment[];
}

// 커뮤니티 글 상세 — 공개 댓글만. 댓글에도 신고·차단이 반드시 붙는다 (모든 UGC 표면).
export default function HiqCommunityPost() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/community/:id");
    const postId = params?.id;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [comment, setComment] = useState("");
    const [reportTarget, setReportTarget] = useState<CommunityComment | null>(null);
    const [menuCommentId, setMenuCommentId] = useState<string | null>(null);

    const { data: me } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    const { data: post, isLoading } = useQuery<PostDetail>({
        queryKey: [`/api/hiq/community/posts/${postId}`],
        queryFn: async () => apiRequest(`/api/hiq/community/posts/${postId}`),
        enabled: !!postId,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: [`/api/hiq/community/posts/${postId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/community/posts"] });
    };

    const commentMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/community/posts/${postId}/comments`, {
            method: "POST",
            body: { content: comment.trim() },
        }),
        onSuccess: () => { setComment(""); invalidate(); },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => apiRequest(`/api/hiq/community/comments/${commentId}`, { method: "DELETE" }),
        onSuccess: invalidate,
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-40 relative overflow-x-hidden font-sans">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/community")}
                    className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("community.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <h1 className="text-[20px] font-bold tracking-tight text-ink-1">{t("community.title")}</h1>
            </div>

            {isLoading && (
                <div className="rk-card p-8 text-center text-[13.5px] font-medium text-black/40">{t("community.loading")}</div>
            )}
            {!isLoading && !post && (
                <div className="rk-card p-10 text-center text-[14px] font-semibold text-ink-3">{t("community.notFound")}</div>
            )}

            {post && (
                <div className="flex flex-col gap-3 relative z-10">
                    <CommunityPostCard post={post} myId={me?.id} showBoardChip detail onDeleted={() => setLocation("/community")} />

                    {/* 댓글 */}
                    <section className="rk-card p-5">
                        <h2 className="text-[14.5px] font-bold text-ink-1 mb-3">
                            {t("community.comments")} <span className="text-black/40 tabular-nums">{post.comments.filter(c => !c.isBlinded).length}</span>
                        </h2>

                        {post.comments.length === 0 && (
                            <p className="text-[13px] font-medium text-black/40 py-3">{t("community.commentEmpty")}</p>
                        )}

                        <div className="flex flex-col gap-4">
                            {post.comments.map(c => {
                                const isMine = me?.id === c.authorId;
                                return (
                                    <div key={c.id} className="flex gap-2.5">
                                        <div className="w-8 h-8 shrink-0 rounded-full bg-black/[0.06] overflow-hidden">
                                            {c.author?.profileImageUrl ? (
                                                <img src={c.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-black/40">
                                                    {c.author?.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[13px] font-semibold text-ink-1 leading-none">{c.author?.name}</span>
                                                <SkillBadge badge={c.author?.badge} />
                                                <time className="text-[11px] font-medium text-black/40 leading-none">
                                                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: ko })}
                                                </time>
                                            </div>
                                            {c.isBlinded ? (
                                                <p className="text-[13px] font-medium text-black/35 mt-1">{t("community.commentBlinded")}</p>
                                            ) : (
                                                <p className="text-[13.5px] font-medium text-ink-2 mt-1 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                                            )}
                                        </div>
                                        {!c.isBlinded && (
                                            <div className="relative shrink-0">
                                                <button
                                                    onClick={() => setMenuCommentId(menuCommentId === c.id ? null : c.id)}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center text-black/35 hover:bg-black/[0.05] transition-colors"
                                                    aria-label={t("community.more")}
                                                >
                                                    <LucideMoreVertical className="w-4 h-4" />
                                                </button>
                                                {menuCommentId === c.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-10" onClick={() => setMenuCommentId(null)} />
                                                        <div className="absolute right-0 top-8 z-20 w-28 rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.06] overflow-hidden">
                                                            {isMine ? (
                                                                <button
                                                                    onClick={() => {
                                                                        setMenuCommentId(null);
                                                                        if (window.confirm(t("community.deleteConfirm"))) deleteCommentMutation.mutate(c.id);
                                                                    }}
                                                                    className="w-full h-10 px-3.5 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    {t("community.delete")}
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => { setMenuCommentId(null); setReportTarget(c); }}
                                                                    className="w-full h-10 px-3.5 text-left text-[13px] font-semibold text-ink-2 hover:bg-black/[0.04] transition-colors"
                                                                >
                                                                    {t("community.report")}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {/* 댓글 입력 — 하단 고정 */}
            {post && !post.isBlinded && (
                <div className="fixed bottom-20 left-0 right-0 z-30 px-5">
                    <div className="max-w-md mx-auto flex items-center gap-2 bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.05] pl-4 pr-1.5 py-1.5">
                        <input
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            onKeyDown={(e) => {
                                // 한글 IME 조합 중 Enter는 무시 — isComposing 체크 없이는 마지막 글자가 잘린 채 제출된다
                                if (e.key === "Enter" && !e.nativeEvent.isComposing && comment.trim() && !commentMutation.isPending) commentMutation.mutate();
                            }}
                            maxLength={1000}
                            placeholder={t("community.commentPlaceholder")}
                            className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-ink-1 placeholder:text-black/35 outline-none"
                        />
                        <button
                            disabled={!comment.trim() || commentMutation.isPending}
                            onClick={() => commentMutation.mutate()}
                            className="w-10 h-10 shrink-0 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-35 active:scale-95 transition-all"
                            aria-label={t("community.commentSubmit")}
                        >
                            <LucideSend className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>
            )}

            {reportTarget && (
                <ReportDialog
                    open={!!reportTarget}
                    onOpenChange={(o) => { if (!o) setReportTarget(null); }}
                    targetType="community_comment"
                    targetId={reportTarget.id}
                    targetAuthorId={reportTarget.authorId}
                    targetAuthorName={reportTarget.author?.name}
                />
            )}

            <HiqNavigation />
        </div>
    );
}
