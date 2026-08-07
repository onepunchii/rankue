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
import { UMB_CATEGORIES, UMB_SOURCE_URL, displayName, regionName as intlRegionName, resolveHomeFed, type UmbCategory, type UmbRankingRow, type UmbRankingsResponse } from "@/components/hiq/umb/types";

const PAGE_SIZE = 50;

// 당구 세계랭킹 전체 페이지 — 풀 랭킹(남 3,600+·여 500+·주니어) + 검색 + 한국 필터 + 이번 주 무버.
// 공개 페이지: 비로그인 검색 유입 대상 (사이트맵 등록 + 봇 프리렌더).
export default function HiqWorldRanking() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const [category, setCategory] = useState<UmbCategory>("players");
    const [q, setQ] = useState("");
    const [krOnly, setKrOnly] = useState(false);
    const [older, setOlder] = useState<UmbRankingRow[]>([]);
    const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [view, setView] = useState<"players" | "nations">("players");

    // 뷰어의 "우리나라" — 프로필 국가 우선, 없으면 언어로 추정 (tr→튀르키예, vi→베트남 등)
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"], retry: false });
    const homeFed = resolveHomeFed(me?.countryCode, locale);

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
    const params = `category=${category}&limit=${PAGE_SIZE}${krOnly ? `&fed=${homeFed}` : ""}${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ""}`;

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

    // 국가 랭킹 — 상위 5명 합산 포인트 기준 (스타 1명 왜곡·머릿수 왜곡의 균형점)
    interface Nation { fed: string; players: number; bestRank: number; bestPlayer: string; top5Points: number | null; top20Count: number }
    const { data: nationsData } = useQuery<{ edition: string | null; nations: Nation[] }>({
        queryKey: ["/api/hiq/umb/nations", category],
        queryFn: async () => apiRequest(`/api/hiq/umb/nations?category=${category}`),
        enabled: view === "nations",
        staleTime: 10 * 60 * 1000,
    });

    // 시즌 대회 일정 — 레전드 파싱 (지난 대회 ✓ / 다가오는 대회 D-day)
    interface CalEvent { colKey: string; label: string; kind: string; city: string | null; country: string | null; date: string }
    const { data: calendar = [] } = useQuery<CalEvent[]>({
        queryKey: ["/api/hiq/umb/calendar", category],
        queryFn: async () => apiRequest(`/api/hiq/umb/calendar?category=${category}`),
        staleTime: 30 * 60 * 1000,
    });
    const now = Date.now();
    const dday = (iso: string) => Math.ceil((new Date(iso).getTime() - now) / 86400000);
    // 지난 대회는 최근 2개만, 다가오는 대회는 전부
    const pastEvents = calendar.filter(e => dday(e.date) < 0).slice(-2);
    const futureEvents = calendar.filter(e => dday(e.date) >= 0);
    const seasonEvents = [...pastEvents, ...futureEvents];

    const countryName = (code: string) => intlRegionName(code, locale);

    // 역대 세계 1위 계보 — "지금 1위는 누구" 정답 허브의 시각 요소
    interface Reign { playerUmbId: string; playerName: string; nativeName: string | null; fed: string; from: string; to: string; weeks: number; current: boolean }
    const { data: reigns = [] } = useQuery<Reign[]>({
        queryKey: ["/api/hiq/umb/no1-history", category],
        queryFn: async () => apiRequest(`/api/hiq/umb/no1-history?category=${category}`),
        staleTime: 30 * 60 * 1000,
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

            {/* 부문 탭 + [선수|국가] 보기 전환 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1.5">
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
                <div className="flex bg-brand/[0.08] p-1 rounded-full h-9">
                    {(["players", "nations"] as const).map(v => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            className={cn(
                                "px-3 rounded-full text-[12.5px] font-bold transition-colors",
                                view === v ? "bg-brand text-white" : "text-brand/60"
                            )}
                        >
                            {t(v === "players" ? "umb.viewPlayers" : "umb.viewNations")}
                        </button>
                    ))}
                </div>
            </div>

            {/* 시즌 대회 일정 — 지난 대회 ✓ 최근 2개 + 다가오는 대회 D-day + 공식 중계 안내 */}
            {seasonEvents.length > 0 && !q && !krOnly && (
                <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-2">
                        <h2 className="text-[13px] font-bold text-ink-2">🗓️ {t("umb.calendarTitle")}</h2>
                        <span className="text-[10.5px] font-medium text-black/35">{t("umb.watchNote")}</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
                        {seasonEvents.map(e => {
                            const d = dday(e.date);
                            const past = d < 0;
                            return (
                                <div
                                    key={`${e.colKey}-${e.date}`}
                                    className={cn(
                                        "shrink-0 px-3.5 py-2.5 rounded-2xl",
                                        past ? "bg-white/60 opacity-60" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                                    )}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[15px] leading-none">{e.country ? flagEmoji(e.country) : "🏆"}</span>
                                        <span className="text-[12.5px] font-bold text-ink-1">{e.city || e.label.slice(0, 16)}</span>
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none tabular-nums",
                                            past ? "bg-black/[0.06] text-black/40"
                                                : d === 0 ? "bg-red-500 text-white"
                                                : "bg-brand/10 text-brand"
                                        )}>
                                            {past ? `✓ ${t("umb.finished")}` : d === 0 ? "D-DAY" : `D-${d}`}
                                        </span>
                                    </div>
                                    <div className="text-[10.5px] font-medium text-black/45 mt-1">
                                        {t(e.kind === "championship" ? "umb.kindChampionship" : "umb.kindWorldcup")}
                                        {" · "}{new Date(e.date).toLocaleDateString(locale === "ko" ? "ko-KR" : undefined, { month: "short", day: "numeric" })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── 국가 랭킹 보기 ─── */}
            {view === "nations" && (
                <div className="flex flex-col gap-1.5 relative z-10">
                    <p className="text-[11.5px] font-medium text-black/40 px-1 mb-0.5">{t("umb.nationsDesc")}</p>
                    {(nationsData?.nations || []).map((n, idx) => {
                        const isKr = n.fed === homeFed;
                        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                        return (
                            <div
                                key={n.fed}
                                className={cn(
                                    "flex items-center gap-3 px-3.5 py-3 rounded-2xl",
                                    isKr ? "bg-brand/[0.10]" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                )}
                            >
                                <span className="w-8 shrink-0 text-center">
                                    {medal ? <span className="text-[18px]">{medal}</span>
                                        : <span className={cn("font-bold text-[15px] tabular-nums", isKr ? "text-brand" : "text-black/45")}>{idx + 1}</span>}
                                </span>
                                <span className="text-[19px] leading-none shrink-0">{flagEmoji(n.fed)}</span>
                                <div className="flex-1 min-w-0">
                                    <span className={cn("block text-[14.5px] font-semibold truncate", isKr ? "text-brand" : "text-ink-1")}>{countryName(n.fed)}</span>
                                    <span className="block text-[11.5px] font-medium text-black/45 truncate mt-0.5">
                                        {t("umb.playersCount").replace("{n}", String(n.players))}
                                        {n.top20Count > 0 ? ` · ${t("umb.top20Count").replace("{n}", String(n.top20Count))}` : ""}
                                        {" · "}{n.bestRank}{t("umb.rankSuffix")} {n.bestPlayer}
                                    </span>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-bold text-[16px] tabular-nums text-ink-1">{n.top5Points ?? 0}</div>
                                    <div className="text-[10px] font-semibold text-black/40">{t("umb.top5Sum")}</div>
                                </div>
                            </div>
                        );
                    })}
                    <a href={UMB_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] font-medium text-black/35 py-3">
                        {t("umb.source")}
                    </a>
                </div>
            )}

            {/* ─── 선수 보기 ─── */}
            {view === "players" && (<>
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
                    {flagEmoji(homeFed)} {intlRegionName(homeFed, locale)}
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
                                <span className="text-[13px] font-semibold text-ink-1 max-w-[110px] truncate">{displayName(m, locale)}</span>
                                <span className="text-[12px] font-bold text-brand tabular-nums">▲{m.move}</span>
                                <span className="text-[11.5px] font-medium text-black/40 tabular-nums">{m.rank}{t("umb.rankSuffix")}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 역대 세계 1위 계보 — 재임 기간·주수. 현 1위가 맨 앞 */}
            {reigns.length > 0 && !q && !krOnly && (
                <div className="mb-4">
                    <h2 className="text-[13px] font-bold text-ink-2 mb-2">👑 {t("umb.no1History")}</h2>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
                        {reigns.slice(0, 8).map((rg, i) => (
                            <button
                                key={`${rg.playerUmbId}-${rg.from}`}
                                onClick={() => setOpenPlayerId(rg.playerUmbId)}
                                className={cn(
                                    "shrink-0 px-3.5 py-2.5 rounded-2xl text-left",
                                    rg.current ? "bg-[#F5B721]/15 border border-[#F5B721]/40" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[15px] leading-none">{flagEmoji(rg.fed)}</span>
                                    <span className="text-[12.5px] font-bold text-ink-1 max-w-[130px] truncate">
                                        {locale === "ko" && rg.nativeName ? rg.nativeName : rg.playerName}
                                    </span>
                                    {rg.current && <span className="px-1.5 py-0.5 rounded-full bg-[#F5B721]/25 text-[9.5px] font-bold text-[#8a6a0a] leading-none">{t("umb.reignNow")}</span>}
                                </div>
                                <div className="text-[10.5px] font-medium text-black/45 mt-1 tabular-nums">
                                    {new Date(rg.from).toLocaleDateString(locale === "ko" ? "ko-KR" : undefined, { year: "2-digit", month: "short" })}
                                    {" ~ "}
                                    {rg.current ? "" : new Date(rg.to).toLocaleDateString(locale === "ko" ? "ko-KR" : undefined, { year: "2-digit", month: "short" })}
                                    {" · "}{t("umb.reignWeeks").replace("{n}", String(rg.weeks))}
                                </div>
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
                    const isKr = r.fed === homeFed;
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
                            <span className={cn("flex-1 min-w-0 truncate font-semibold text-[14px]", isKr ? "text-brand" : "text-ink-1")}>{displayName(r, locale)}</span>
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
            </>)}

            <UmbPlayerSheet category={category} playerUmbId={openPlayerId} onClose={() => setOpenPlayerId(null)} onNavigate={setOpenPlayerId} />
            <HiqNavigation />
        </div>
    );
}
