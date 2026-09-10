import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideChevronLeft, LucideSend, LucideMoreVertical, LucideX } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { CommunityPostCard } from "@/components/hiq/community/CommunityPostCard";
import { SkillBadge } from "@/components/hiq/community/SkillBadge";
import { ReportDialog } from "@/components/hiq/community/ReportDialog";
import type { CommunityComment, CommunityPost } from "@/components/hiq/community/types";
import type { HiqMember } from "@shared/schema";
import { ShareButton } from "@/components/hiq/ShareButton";

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
    // 게스트는 댓글을 쓸 수 없다(서버 401). 예전에는 입력창이 그대로 보여서, 다 쓰고 보내면
    // "로그인이 필요합니다" 토스트만 뜨고 로그인할 길이 없었다 — 유저에겐 '안 써지는' 상태다.
    const { isGuest } = useAuth();
    const [reportTarget, setReportTarget] = useState<CommunityComment | null>(null);
    const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
    // 답글 대상 — 이게 있으면 입력창이 그 댓글에 대한 답글을 보낸다(2026-09-10 오너: 대댓글)
    const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // 고정 입력창이 화면 아래에서 차지하는 높이(윗변 ~ 화면 아래). **재서** 쓴다 — 기기·글자 크기·답글 칩·키보드에 따라
    // 달라져서 숫자로 박으면 어딘가에서 또 붙는다(2026-09-10: 칩이 뜨면 카드와 4px 로 붙어 있었다).
    const barRef = useRef<HTMLDivElement>(null);
    const [barSpace, setBarSpace] = useState(0);
    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const measure = () => setBarSpace(Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top)));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    });

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
            body: { content: comment.trim(), ...(replyTo ? { parentId: replyTo.id } : {}) },
        }),
        onSuccess: () => { setComment(""); setReplyTo(null); invalidate(); },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => apiRequest(`/api/hiq/community/comments/${commentId}`, { method: "DELETE" }),
        onSuccess: invalidate,
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    // 댓글 묶기 — 최상위 댓글과 그 아래 답글(한 단계)
    const allComments = post?.comments ?? [];
    const topComments = allComments.filter(c => !c.parentId);
    const repliesByParent = new Map<string, CommunityComment[]>();
    for (const c of allComments) {
        if (c.parentId) repliesByParent.set(c.parentId, [...(repliesByParent.get(c.parentId) ?? []), c]);
    }
    const visibleCount = allComments.filter(c => !c.isBlinded && !c.isDeleted).length;

    const startReply = (c: CommunityComment) => {
        if (isGuest) { goLogin(setLocation); return; }
        setReplyTo(c);
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    /** 댓글 한 개(최상위든 답글이든 같은 모양, 답글은 아바타만 조금 작다) */
    const renderComment = (c: CommunityComment, isReply: boolean) => {
        const avatarSize = isReply ? "w-7 h-7" : "w-8 h-8";
        if (c.isDeleted) {
            return (
                <div className="flex items-center gap-2.5">
                    <div className={`${avatarSize} shrink-0 rounded-full bg-black/[0.04]`} />
                    <p className="text-[13px] font-medium text-black/40">{t("community.commentDeleted")}</p>
                </div>
            );
        }
        const isMine = me?.id === c.authorId;
        return (
            <div className="flex gap-2.5">
                <div className={`${avatarSize} shrink-0 rounded-full bg-black/[0.06] overflow-hidden`}>
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
                        <p className="text-[13.5px] font-medium text-ink-2 mt-1 leading-relaxed whitespace-pre-wrap break-keep [overflow-wrap:anywhere]">{c.content}</p>
                    )}
                    {!c.isBlinded && !post?.isBlinded && (
                        <button
                            onClick={() => startReply(c)}
                            className="mt-1 -ml-1 px-1 h-7 text-[12px] font-semibold text-black/45 hover:text-ink-1 transition-colors"
                        >
                            {t("community.reply")}
                        </button>
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
    };

    return (
        <div
            className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 relative overflow-x-hidden font-sans"
            // 마지막 댓글이 고정 입력창에 붙지 않게 — 입력창이 실제로 차지하는 높이(barSpace) + 여유 24px 만큼 비워 둔다.
            // 예전 pb-40(160px)은 입력창 윗변과 거의 같아 댓글 카드가 입력창에 붙어 있었다(2026-09-10 오너).
            style={{ paddingBottom: barSpace > 0 ? `${barSpace + 24}px` : "calc(13rem + env(safe-area-inset-bottom))" }}
        >
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
                {post && !post.isBlinded && <ShareButton className="ml-auto" url={`https://www.rankue.co.kr/community/${postId}`} />}
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

                    {/* 댓글 — 댓글끼리는 가는 줄로 나누고, 답글은 부모 아래 옅은 칸에 한 단계 들여 둔다(2026-09-10 오너) */}
                    <section className="rk-card p-5">
                        <h2 className="text-[14.5px] font-bold text-ink-1 mb-1">
                            {t("community.comments")} <span className="text-black/40 tabular-nums">{visibleCount}</span>
                        </h2>

                        {topComments.length === 0 && (
                            <p className="text-[13px] font-medium text-black/40 py-3">{t("community.commentEmpty")}</p>
                        )}

                        <div className="divide-y divide-black/[0.06]">
                            {topComments.map(c => {
                                const replies = repliesByParent.get(c.id) ?? [];
                                return (
                                    <div key={c.id} className="py-4 last:pb-1">
                                        {renderComment(c, false)}
                                        {replies.length > 0 && (
                                            <div className="mt-2 ml-[42px] rounded-2xl bg-black/[0.03] p-3 flex flex-col gap-3">
                                                {replies.map(r => <div key={r.id}>{renderComment(r, true)}</div>)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {/* 댓글 입력 — 하단 고정.
                bottom-20(5rem=80px)은 하단 네비 높이(99px)보다 낮아 입력창 아래가 네비에
                19px 가려져 있었다. 그리고 키보드가 뜰 때 --keyboard-height 를 쓰지 않아
                (크루 채팅은 쓰는데 여기만 빠져 있었다) 소프트 키보드가 입력창을 덮었다.
                → 평소엔 네비 위, 키보드가 뜨면 키보드 바로 위로 올린다. */}
            {post && !post.isBlinded && (
                <div
                    ref={barRef}
                    className="fixed left-0 right-0 z-30 px-5"
                    style={{ bottom: "max(calc(6.75rem + env(safe-area-inset-bottom)), var(--keyboard-height, 0px))" }}
                >
                    {isGuest ? (
                        <button
                            onClick={() => goLogin(setLocation)}
                            className="max-w-md mx-auto w-full flex items-center justify-center gap-2 bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.05] h-[52px] text-[14px] font-bold text-brand active:scale-[0.98] transition-transform"
                        >
                            {t("community.commentLoginCta")}
                        </button>
                    ) : (
                    <div className="max-w-md mx-auto">
                        {/* 답글 대상 — 누구에게 답하는지 입력창 바로 위에 보이고, 취소할 수 있다 */}
                        {replyTo && (
                            <div className="mb-2 mx-1 flex items-center justify-between gap-2 rounded-full bg-black/80 text-white pl-4 pr-1.5 h-9 text-[12.5px] font-semibold">
                                <span className="truncate">{t("community.replyTo").replace("{name}", replyTo.author?.name || "")}</span>
                                <button
                                    onClick={() => setReplyTo(null)}
                                    className="shrink-0 h-7 px-2.5 rounded-full text-white/80 hover:bg-white/10 inline-flex items-center gap-1"
                                >
                                    <LucideX className="w-3.5 h-3.5" />{t("community.replyCancel")}
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2 bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.05] pl-4 pr-1.5 py-1.5">
                            <input
                                ref={inputRef}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                onKeyDown={(e) => {
                                    // 한글 IME 조합 중 Enter는 무시 — isComposing 체크 없이는 마지막 글자가 잘린 채 제출된다
                                    if (e.key === "Enter" && !e.nativeEvent.isComposing && comment.trim() && !commentMutation.isPending) commentMutation.mutate();
                                    if (e.key === "Escape" && replyTo) setReplyTo(null);
                                }}
                                maxLength={1000}
                                placeholder={replyTo ? t("community.replyPlaceholder") : t("community.commentPlaceholder")}
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
