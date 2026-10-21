import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucidePlus } from "@/lib/icons";
import { SportBackHeader } from "@/components/hiq/SportHeader";
import { useSport } from "@/contexts/SportContext";
import { apiRequest } from "@/lib/queryClient";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useT } from "@/lib/i18n";
import { CommunityPostCard } from "@/components/hiq/community/CommunityPostCard";
import { WritePostDialog } from "@/components/hiq/community/WritePostDialog";
import { BOARD_KEYS, type CommunityBoard, type CommunityPost } from "@/components/hiq/community/types";
import type { HiqMember } from "@shared/schema";
import { goLogin } from "@/components/hiq/LoginGate";

const BOARDS: (CommunityBoard | "all")[] = ["all", "brag", "ask", "store", "lesson"];

// 커뮤니티 — 전체 공개 게시판 4개. 크루와 달리 가입이 없고, 채팅·DM도 없다(공개 댓글만).
export default function HiqCommunity() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const { sport } = useSport();
    const [board, setBoard] = useState<CommunityBoard | "all">("all");
    // 언어 필터 — 기본은 전체. 글이 몇 건 없는 지금 내 언어만 기본으로 걸면 빈 목록이 된다
    // (오너 결정 2026-08-31: 게시판 분리가 아니라 태그+필터). 내 언어가 아닌 글에는 뱃지가 붙는다.
    const [langOnly, setLangOnly] = useState(false);
    const [isWriteOpen, setIsWriteOpen] = useState(false);
    // 이야기 거리로 연 글쓰기 — 그 게시판 · 첫 문장(2026-10-21)
    const [starter, setStarter] = useState<{ board: CommunityBoard; text: string } | null>(null);
    const [older, setOlder] = useState<CommunityPost[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const { data: me } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    const params = new URLSearchParams();
    if (board !== "all") params.set("board", board);
    if (langOnly) params.set("lang", locale);
    const listQs = params.toString();
    const { data: latest = [], isLoading } = useQuery<CommunityPost[]>({
        queryKey: ["/api/hiq/community/posts", board, langOnly ? locale : "all"],
        queryFn: async () => apiRequest(`/api/hiq/community/posts?${listQs}`),
    });

    // 커서 페이지네이션 — 탭 전환 시 older를 비운다
    const changeBoard = (b: CommunityBoard | "all") => {
        setBoard(b);
        setOlder([]);
        setHasMore(true);
    };
    const toggleLangOnly = () => {
        setLangOnly(v => !v);
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
            `/api/hiq/community/posts?${listQs}${listQs ? "&" : ""}cursor=${encodeURIComponent(lastCreatedAt)}`
        );
        if (more.length < 20) setHasMore(false);
        setOlder(prev => {
            const seen = new Set([...latest, ...prev].map(p => p.id));
            return [...prev, ...more.filter(p => !seen.has(p.id))];
        });
    };

    // 글쓰기는 게시판을 정해야 열린다 — 전체 탭에서는 물어보기(마찰 0)로 기본 선택
    const writeBoard: CommunityBoard = starter?.board ?? (board === "all" ? "ask" : board);
    // 비로그인은 글쓰기 창 대신 로그인 팝업(2026-10-21 — 예전엔 창을 열고 보내기에서야 막혔다)
    const openWrite = (s?: { board: CommunityBoard; text: string }) => {
        if (!me) { goLogin(setLocation); return; }
        setStarter(s ?? null);
        setIsWriteOpen(true);
    };
    // 이야기 거리 — 글이 적은 동안만(여섯 개 미만), 게시판마다 셋. 누르면 그 게시판 · 그 첫 문장으로 글쓰기
    const STARTER_BOARDS: CommunityBoard[] = board === "all" ? ["ask", "brag", "store"] : [board];
    const starters = STARTER_BOARDS.flatMap((b) => (board === "all" ? [0] : [0, 1, 2]).map((i) => ({ board: b, text: t(`community.starter.${b}.${i}`) })));

    return (
        <div className="rk-clip-x min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative font-sans">
            {/* 머리줄 — 세 종목의 뒤로가기 머리줄(맨 위에 붙는다) */}
            <SportBackHeader sport={sport} title={t("community.title")} bleed={20} lift={24} />
            <p className="mt-4 mb-5 text-[13px] font-medium text-black/55">{t("community.subtitle")}</p>

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
                {/* 내 언어만 보기 — 글이 여러 언어로 쌓이기 시작하면 이 칩이 공간을 가른다.
                    기본은 전체: 지금 글이 몇 건 없어 내 언어 기본이면 빈 목록이 된다. */}
                <button
                    onClick={toggleLangOnly}
                    className={`shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors ${langOnly ? "bg-brand text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black/[0.02]"}`}
                >
                    {t("community.myLanguage")}
                </button>
            </div>

            {/* 글 목록 */}
            <div className="flex flex-col gap-3 relative z-10">
                {isLoading && (
                    <div className="rk-card p-8 text-center text-[13.5px] font-medium text-black/40">
                        {t("community.loading")}
                    </div>
                )}
                {/* 이야기 거리(2026-10-21 디자인 리뷰 — 지금까지 글 세 개, 게시판 셋은 비어 있었다). 글이 쌓이면(여섯 개 이상) 사라진다.
                    가짜 글을 깔지 않는다 — 쓸 거리를 건네고, 누르면 그 게시판 글쓰기가 첫 문장과 함께 열린다 */}
                {!isLoading && !langOnly && posts.length < 6 && (
                    <div className="rk-card p-4" data-testid="community-starters">
                        <p className="text-[15px] font-bold text-ink-1">{t(posts.length === 0 ? "community.empty" : "community.starterTitle")}</p>
                        <p className="mt-0.5 text-[12.5px] font-medium text-black/50 break-keep">{t("community.starterDesc")}</p>
                        <div className="mt-3 flex flex-col gap-1.5">
                            {starters.map((s) => (
                                <button key={`${s.board}-${s.text}`} type="button" onClick={() => openWrite(s)}
                                    className="flex items-center gap-2 rounded-xl bg-black/[0.035] px-3 py-2.5 text-left active:bg-black/[0.06]" data-testid="community-starter">
                                    {board === "all" && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-ink-3">{t(BOARD_KEYS[s.board])}</span>}
                                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-1">{s.text}</span>
                                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="shrink-0" fill="none" stroke="#C9920E" strokeWidth="2" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
                                </button>
                            ))}
                        </div>
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
            <div className="fixed above-nav left-0 right-0 z-30 pointer-events-none">
                <div className="max-w-md mx-auto px-5 flex justify-end">
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => openWrite()}
                        className="pointer-events-auto w-14 h-14 rounded-full bg-[#F5B721] shadow-[0_8px_24px_rgba(245,183,33,0.45)] flex items-center justify-center"
                        aria-label={t("community.write")}
                    >
                        <LucidePlus className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </motion.button>
                </div>
            </div>

            <WritePostDialog open={isWriteOpen} onOpenChange={(o) => { setIsWriteOpen(o); if (!o) setStarter(null); }} board={writeBoard} starter={starter?.text} />

            <HiqNavigation />
        </div>
    );
}
