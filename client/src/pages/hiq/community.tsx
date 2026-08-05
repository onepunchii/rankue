import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucidePlus } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useT } from "@/lib/i18n";
import { CommunityPostCard } from "@/components/hiq/community/CommunityPostCard";
import { WritePostDialog } from "@/components/hiq/community/WritePostDialog";
import { BOARD_KEYS, type CommunityBoard, type CommunityPost } from "@/components/hiq/community/types";
import type { HiqMember } from "@shared/schema";

const BOARDS: (CommunityBoard | "all")[] = ["all", "brag", "ask", "store", "lesson"];

// 커뮤니티 — 전체 공개 게시판 4개. 크루와 달리 가입이 없고, 채팅·DM도 없다(공개 댓글만).
export default function HiqCommunity() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [board, setBoard] = useState<CommunityBoard | "all">("all");
    const [isWriteOpen, setIsWriteOpen] = useState(false);
    const [older, setOlder] = useState<CommunityPost[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const { data: me } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    const boardParam = board === "all" ? "" : `board=${board}`;
    const { data: latest = [], isLoading } = useQuery<CommunityPost[]>({
        queryKey: ["/api/hiq/community/posts", board],
        queryFn: async () => apiRequest(`/api/hiq/community/posts?${boardParam}`),
    });

    // 커서 페이지네이션 — 탭 전환 시 older를 비운다
    const changeBoard = (b: CommunityBoard | "all") => {
        setBoard(b);
        setOlder([]);
        setHasMore(true);
    };

    // latest는 refetch로 갱신되므로 older와 겹칠 수 있다 — id 기준으로 중복 제거
    const latestIds = new Set(latest.map(p => p.id));
    const posts = [...latest, ...older.filter(p => !latestIds.has(p.id))];
    const lastCreatedAt = posts[posts.length - 1]?.createdAt;
    const canLoadMore = hasMore && latest.length >= 20;

    const loadMore = async () => {
        if (!lastCreatedAt) return;
        const more: CommunityPost[] = await apiRequest(
            `/api/hiq/community/posts?${boardParam}${boardParam ? "&" : ""}cursor=${encodeURIComponent(lastCreatedAt)}`
        );
        if (more.length < 20) setHasMore(false);
        setOlder(prev => {
            const seen = new Set([...latest, ...prev].map(p => p.id));
            return [...prev, ...more.filter(p => !seen.has(p.id))];
        });
    };

    // 글쓰기는 게시판을 정해야 열린다 — 전체 탭에서는 물어보기(마찰 0)로 기본 선택
    const writeBoard: CommunityBoard = board === "all" ? "ask" : board;

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setLocation("/dashboard")}
                        className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        aria-label={t("community.back")}
                    >
                        <LucideChevronLeft className="w-5 h-5" />
                    </motion.button>
                    <div>
                        <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">{t("community.title")}</h1>
                        <p className="text-[13px] font-medium text-black/55 mt-1">{t("community.subtitle")}</p>
                    </div>
                </div>
            </div>

            {/* 게시판 탭 */}
            <div className="flex gap-1.5 mb-5 overflow-x-auto scrollbar-hide -mx-5 px-5">
                {BOARDS.map(b => (
                    <button
                        key={b}
                        onClick={() => changeBoard(b)}
                        className={`shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors ${board === b ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black/[0.02]"}`}
                    >
                        {b === "all" ? t("community.boardAll") : t(BOARD_KEYS[b])}
                    </button>
                ))}
            </div>

            {/* 글 목록 */}
            <div className="flex flex-col gap-3 relative z-10">
                {isLoading && (
                    <div className="rk-card p-8 text-center text-[13.5px] font-medium text-black/40">
                        {t("community.loading")}
                    </div>
                )}
                {!isLoading && posts.length === 0 && (
                    <div className="rk-card p-10 text-center">
                        <p className="text-[15px] font-bold text-ink-2">{t("community.empty")}</p>
                        <p className="text-[13px] font-medium text-black/45 mt-1">{t("community.emptyDesc")}</p>
                    </div>
                )}
                {posts.map(post => (
                    <CommunityPostCard
                        key={post.id}
                        post={post}
                        myId={me?.id}
                        showBoardChip={board === "all"}
                        onClick={() => setLocation(`/community/${post.id}`)}
                    />
                ))}
                {canLoadMore && posts.length > 0 && (
                    <button
                        onClick={loadMore}
                        className="h-12 rounded-2xl bg-white text-[14px] font-semibold text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black/[0.02] transition-colors"
                    >
                        {t("community.loadMore")}
                    </button>
                )}
            </div>

            {/* 글쓰기 FAB — 당구공 노란색. fixed를 그대로 쓰면 데스크탑 프레임에서
                448px 컬럼 밖(창 오른쪽 끝)으로 나가므로, 하단 네비와 같은 방식으로
                전체폭 컨테이너 + max-w-md 정렬로 컬럼 안에 붙인다. */}
            <div className="fixed bottom-28 left-0 right-0 z-30 pointer-events-none">
                <div className="max-w-md mx-auto px-5 flex justify-end">
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setIsWriteOpen(true)}
                        className="pointer-events-auto w-14 h-14 rounded-full bg-[#F5B721] shadow-[0_8px_24px_rgba(245,183,33,0.45)] flex items-center justify-center"
                        aria-label={t("community.write")}
                    >
                        <LucidePlus className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </motion.button>
                </div>
            </div>

            <WritePostDialog open={isWriteOpen} onOpenChange={setIsWriteOpen} board={writeBoard} />

            <HiqNavigation />
        </div>
    );
}
