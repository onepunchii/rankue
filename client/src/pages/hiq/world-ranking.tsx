import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideSearch, LucideTrendingUp } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { UmbPlayerSheet } from "@/components/hiq/umb/UmbPlayerSheet";
import { MoveBadge } from "@/components/hiq/umb/WorldRankingCard";
import { UMB_CATEGORIES, UMB_SOURCE_URL, type UmbCategory, type UmbRankingRow, type UmbRankingsResponse } from "@/components/hiq/umb/types";

const PAGE_SIZE = 50;

// 당구 세계랭킹 전체 페이지 — 풀 랭킹(남 3,600+·여 500+·주니어) + 검색 + 한국 필터 + 이번 주 무버.
// 공개 페이지: 비로그인 검색 유입 대상 (사이트맵 등록 + 봇 프리렌더).
export default function HiqWorldRanking() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [category, setCategory] = useState<UmbCategory>("players");
    const [q, setQ] = useState("");
    const [krOnly, setKrOnly] = useState(false);
    const [older, setOlder] = useState<UmbRankingRow[]>([]);
    const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    useSeo({
        title: "당구 세계랭킹 — UMB 공식 3쿠션 랭킹 | 랭큐",
        description: "UMB 공식 3쿠션 세계랭킹을 매주 업데이트. 남자·여자·주니어 전체 순위, 한국 선수, 순위 변동과 선수별 히스토리를 한눈에.",
        path: "/world-ranking",
    });

    // 검색은 타이핑마다 쏘지 않는다 — 300ms 디바운스
    const [debouncedQ, setDebouncedQ] = useState("");
    useEffect(() => {
        const id = setTimeout(() => setDebouncedQ(q), 300);
        return () => clearTimeout(id);
    }, [q]);

    const filterKey = `${category}|${krOnly}|${debouncedQ}`;
    const filterKeyRef = useRef(filterKey);
    filterKeyRef.current = filterKey;
    const params = `category=${category}&limit=${PAGE_SIZE}${krOnly ? "&fed=KR" : ""}${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ""}`;

    const { data, isLoading } = useQuery<UmbRankingsResponse>({
        queryKey: ["/api/hiq/umb/rankings", filterKey],
        queryFn: async () => apiRequest(`/api/hiq/umb/rankings?${params}`),
        staleTime: 10 * 60 * 1000,
        placeholderData: (prev) => prev, // 검색 중 목록 전체가 깜빡이지 않게
    });

    const { data: movers = [] } = useQuery<Array<UmbRankingRow & { move: number }>>({
        queryKey: ["/api/hiq/umb/movers", category],
        queryFn: async () => apiRequest(`/api/hiq/umb/movers?category=${category}`),
        staleTime: 10 * 60 * 1000,
    });

    const changeFilter = (fn: () => void) => { fn(); setOlder([]); };

    const first = data?.rows || [];
    const seen = new Set(first.map(r => r.playerUmbId));
    const rows = [...first, ...older.filter(r => !seen.has(r.playerUmbId))];
    const total = data?.total ?? 0;
    const canLoadMore = rows.length < total;

    const loadMore = async () => {
        if (isLoadingMore) return; // 더블탭 중복 요청 방지
        setIsLoadingMore(true);
        const keyAtCall = filterKeyRef.current;
        try {
            const more: UmbRankingsResponse = await apiRequest(`/api/hiq/umb/rankings?${params}&offset=${rows.length}`);
            // 응답 도착 전에 탭·검색이 바뀌었으면 버린다 — 옛 필터의 행이 새 목록에 섞이는 경합 방지
            if (filterKeyRef.current !== keyAtCall) return;
            setOlder(prev => {
                const have = new Set([...first, ...prev].map(r => r.playerUmbId));
                return [...prev, ...more.rows.filter(r => !have.has(r.playerUmbId))];
            });
        } catch { /* 네트워크 실패 — 버튼이 다시 활성화되므로 재시도 가능 */ } finally {
            setIsLoadingMore(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("umb.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div>
                    <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">{t("umb.pageTitle")}</h1>
                    <p className="text-[13px] font-medium text-black/55 mt-1">
                        {t("umb.subtitle")}{data?.edition ? ` · Edition ${data.edition}` : ""}
                    </p>
                </div>
            </div>

            {/* 부문 탭 */}
            <div className="flex gap-1.5 mb-4">
                {UMB_CATEGORIES.map(c => (
                    <button
                        key={c.id}
                        onClick={() => changeFilter(() => setCategory(c.id))}
                        className={cn(
                            "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                            category === c.id ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        )}
                    >
                        {t(c.labelKey)}
                    </button>
                ))}
            </div>

            {/* 검색 + 한국 필터 */}
            <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                    <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
                    <input
                        value={q}
                        onChange={(e) => changeFilter(() => setQ(e.target.value))}
                        placeholder={t("umb.searchPlaceholder")}
                        className="w-full h-11 pl-10 pr-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[14px] font-medium text-ink-1 placeholder:text-black/35 outline-none"
                    />
                </div>
                <button
                    onClick={() => changeFilter(() => setKrOnly(v => !v))}
                    className={cn(
                        "shrink-0 h-11 px-4 rounded-full text-[13px] font-semibold transition-colors",
                        krOnly ? "bg-brand text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    )}
                >
                    🇰🇷 {t("umb.krOnly")}
                </button>
            </div>

            {/* 이번 주 무버 */}
            {movers.length > 0 && !q && !krOnly && (
                <div className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-2 mb-2">
                        <LucideTrendingUp className="w-4 h-4 text-brand" /> {t("umb.movers")}
                    </h2>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
                        {movers.map(m => (
                            <button
                                key={m.playerUmbId}
                                onClick={() => setOpenPlayerId(m.playerUmbId)}
                                className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            >
                                <span className="text-[16px] leading-none">{flagEmoji(m.fed)}</span>
                                <span className="text-[13px] font-semibold text-ink-1 max-w-[110px] truncate">{m.playerName}</span>
                                <span className="text-[12px] font-bold text-brand tabular-nums">▲{m.move}</span>
                                <span className="text-[11.5px] font-medium text-black/40 tabular-nums">{m.rank}{t("umb.rankSuffix")}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 랭킹 리스트 */}
            <div className="flex flex-col gap-1.5 relative z-10">
                {!isLoading && total > 0 && (
                    <p className="text-[11.5px] font-medium text-black/40 px-1 mb-0.5 tabular-nums">
                        {t("umb.totalPlayers").replace("{n}", total.toLocaleString())}
                    </p>
                )}
                {isLoading && (
                    <div className="rk-card p-8 text-center text-[13.5px] font-medium text-black/40">{t("umb.loading")}</div>
                )}
                {!isLoading && rows.length === 0 && (
                    <div className="rk-card p-10 text-center text-[14px] font-semibold text-ink-3">{t("umb.empty")}</div>
                )}
                {rows.map(r => {
                    const isKr = r.fed === "KR";
                    return (
                        <button
                            key={r.playerUmbId}
                            onClick={() => setOpenPlayerId(r.playerUmbId)}
                            className={cn(
                                "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors",
                                isKr ? "bg-brand/[0.10]" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-black/[0.015]"
                            )}
                        >
                            <span className={cn("w-10 shrink-0 text-center font-bold text-[15px] tabular-nums", isKr ? "text-brand" : "text-black/45")}>{r.rank}</span>
                            <span className="text-[17px] leading-none shrink-0">{flagEmoji(r.fed)}</span>
                            <span className={cn("flex-1 min-w-0 truncate font-semibold text-[14px]", isKr ? "text-brand" : "text-ink-1")}>{r.playerName}</span>
                            <MoveBadge move={r.move} />
                            <span className="w-12 shrink-0 text-right font-bold text-[15px] tabular-nums text-ink-1">{r.points}</span>
                        </button>
                    );
                })}
                {canLoadMore && rows.length > 0 && (
                    <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="h-12 mt-1 rounded-2xl bg-white text-[14px] font-semibold text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black/[0.02] transition-colors disabled:opacity-50"
                    >
                        {isLoadingMore ? t("umb.loading") : t("umb.loadMore")}
                    </button>
                )}
                <a href={UMB_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] font-medium text-black/35 py-3">
                    {t("umb.source")}
                </a>
            </div>

            <UmbPlayerSheet category={category} playerUmbId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
            <HiqNavigation />
        </div>
    );
}
