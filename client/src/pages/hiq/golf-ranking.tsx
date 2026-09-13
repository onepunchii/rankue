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
import { ShareButton } from "@/components/hiq/ShareButton";
import { GOLF_TOURS, GOLF_TOUR_META, STAT_HIGHLIGHTS, formatRankValue, formatStatValue, isGolfTour } from "@shared/golfTours";
import { regionName } from "@/components/hiq/umb/types";
import { GolferSheet } from "@/components/hiq/golf/GolferSheet";
import { GMove, useGolfTheme } from "@/components/hiq/golf/ui";
import { golferName, iocToAlpha2, type GolfRankRow, type GolfRankingsResponse, type GolfStatKey, type GolfStatRow, type GolfTour } from "@/components/hiq/golf/types";

const PAGE_SIZE = 50;
const API = "/api/hiq/golf-rank";

// 골프 랭킹 전체 페이지(2026-09-13 오너: "골프 탭에 당구와 비슷한 랭킹 — PGA·LPGA·KPGA·KLPGA, 공개 전체").
// 당구 세계랭킹 페이지(world-ranking.tsx)와 같은 골격: 투어 탭 + [선수|국가|기록] + 검색·한국 필터 + 이번 주 상승.
// 공개 페이지: 비로그인 검색 유입 대상(사이트맵 등록 + 봇 프리렌더). 골프 접근 통제를 타지 않는다.
export default function HiqGolfRanking() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    useGolfTheme();
    const initialTour = (() => { try { const v = new URLSearchParams(window.location.search).get("tour"); return isGolfTour(v) ? v : "owgr"; } catch { return "owgr" as GolfTour; } })();
    const [tour, setTour] = useState<GolfTour>(initialTour);
    const [q, setQ] = useState("");
    const [krOnly, setKrOnly] = useState(false);
    const [older, setOlder] = useState<GolfRankRow[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [view, setView] = useState<"players" | "nations" | "stats">("players");
    const [statKey, setStatKey] = useState<string | null>(null);
    const meta = GOLF_TOUR_META[tour];
    const homeFed = "KOR";

    useSeo({
        title: `${t("golf.pageTitle")} — ${t("golf.subtitle")} | RANKUE`,
        description: t("golf.seoDesc"),
        path: "/golf-ranking",
    });

    const [debouncedQ, setDebouncedQ] = useState("");
    useEffect(() => { const id = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(id); }, [q]);

    const filterKey = `${tour}|${krOnly}|${debouncedQ}`;
    const filterKeyRef = useRef(filterKey);
    filterKeyRef.current = filterKey;
    const params = `tour=${tour}&limit=${PAGE_SIZE}${krOnly ? `&country=${homeFed}` : ""}${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ""}`;

    const { data, isLoading } = useQuery<GolfRankingsResponse>({
        queryKey: [`${API}/rankings`, filterKey],
        queryFn: async () => apiRequest(`${API}/rankings?${params}`),
        staleTime: 10 * 60 * 1000,
        placeholderData: (prev) => prev,
    });
    const { data: movers = [] } = useQuery<GolfRankRow[]>({
        queryKey: [`${API}/movers`, tour],
        queryFn: async () => apiRequest(`${API}/movers?tour=${tour}`),
        staleTime: 10 * 60 * 1000,
    });
    interface Nation { fed: string; players: number; bestRank: number; bestPlayer: string; top5Points: number; top20Count: number }
    const { data: nationsData } = useQuery<{ edition: string | null; nations: Nation[] }>({
        queryKey: [`${API}/nations`, tour],
        queryFn: async () => apiRequest(`${API}/nations?tour=${tour}`),
        enabled: view === "nations" && meta.world,
        staleTime: 10 * 60 * 1000,
    });
    // 기록(투어 랭킹만): 지표 목록 → 고른 지표의 톱 50
    const { data: statKeys } = useQuery<{ season: string | null; keys: GolfStatKey[] }>({
        queryKey: [`${API}/stats`, tour, "keys"],
        queryFn: async () => apiRequest(`${API}/stats?tour=${tour}`),
        enabled: !meta.world,
        staleTime: 30 * 60 * 1000,
    });
    const activeKey = statKey ?? STAT_HIGHLIGHTS[tour as "kpga" | "klpga"]?.[0]?.key ?? null;
    const { data: statList } = useQuery<{ season: string; key: string; rows: GolfStatRow[] }>({
        queryKey: [`${API}/stats`, tour, activeKey],
        queryFn: async () => apiRequest(`${API}/stats?tour=${tour}&key=${encodeURIComponent(activeKey!)}&limit=50`),
        enabled: view === "stats" && !meta.world && !!activeKey,
        staleTime: 30 * 60 * 1000,
    });

    const changeFilter = (fn: () => void) => { fn(); setOlder([]); };
    const changeTour = (next: GolfTour) => {
        changeFilter(() => { setTour(next); setStatKey(null); });
        // 투어별로 의미 없는 보기는 되돌린다(국가 → 세계 랭킹만, 기록 → 투어 랭킹만)
        const m = GOLF_TOUR_META[next];
        if (view === "nations" && !m.world) setView("players");
        if (view === "stats" && m.world) setView("players");
        try { window.history.replaceState(null, "", `/golf-ranking?tour=${next}`); } catch { /* 무시 */ }
    };

    const first = data?.rows || [];
    const seen = new Set(first.map(r => r.playerId));
    const rows = [...first, ...older.filter(r => !seen.has(r.playerId))];
    const total = data?.total ?? 0;
    const canLoadMore = rows.length < total;

    const loadMore = async () => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);
        const keyAtCall = filterKeyRef.current;
        try {
            const more: GolfRankingsResponse = await apiRequest(`${API}/rankings?${params}&offset=${rows.length}`);
            if (filterKeyRef.current !== keyAtCall) return;
            setOlder(prev => {
                const have = new Set([...first, ...prev].map(r => r.playerId));
                return [...prev, ...more.rows.filter(r => !have.has(r.playerId))];
            });
        } catch { /* 재시도 가능 */ } finally {
            setIsLoadingMore(false);
        }
    };

    const views: Array<"players" | "nations" | "stats"> = ["players", meta.world ? "nations" : "stats"];
    const editionLabel = data?.edition ? t("golf.asOf").replace("{date}", data.edition) : "";
    const valueLabel = t(meta.valueLabelKey);

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center transition-transform text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("golf.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div className="min-w-0">
                    <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">⛳ {t("golf.pageTitle")}</h1>
                    <p className="text-[13px] font-medium text-ink-3 mt-1 truncate">{t("golf.subtitle")}</p>
                </div>
                <ShareButton className="ml-auto" url={`https://www.rankue.co.kr/golf-ranking?tour=${tour}`} title={t("golf.pageTitle")} />
            </div>

            {/* 투어 탭(가로 스크롤) */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 mb-3">
                {GOLF_TOURS.map(id => (
                    <button
                        key={id}
                        onClick={() => changeTour(id)}
                        className={cn(
                            "shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                            tour === id ? "bg-brand text-brand-fg" : "bg-surface-1 text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        )}
                    >
                        {GOLF_TOUR_META[id].gender === "M" ? "♂ " : "♀ "}{t(GOLF_TOUR_META[id].labelKey)}
                    </button>
                ))}
            </div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-[11.5px] font-medium text-ink-4 truncate">{t(meta.world ? "golf.worldNote" : "golf.tourNote")}{editionLabel ? ` · ${editionLabel}` : ""}</span>
                <div className="flex bg-brand/[0.12] p-1 rounded-full h-9 shrink-0">
                    {views.map(v => (
                        <button
                            key={v} onClick={() => setView(v)}
                            className={cn("px-3 rounded-full text-[12.5px] font-bold transition-colors", view === v ? "bg-brand text-brand-fg" : "text-brand/70")}
                        >
                            {t(v === "players" ? "golf.viewPlayers" : v === "nations" ? "golf.viewNations" : "golf.viewStats")}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── 국가 랭킹(세계 랭킹) ─── */}
            {view === "nations" && (
                <div className="flex flex-col gap-1.5 relative z-10">
                    <p className="text-[11.5px] font-medium text-ink-4 px-1 mb-0.5">{t("golf.nationsDesc")}</p>
                    {(nationsData?.nations || []).map((n, idx) => {
                        const isKr = n.fed === homeFed;
                        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                        return (
                            <div key={n.fed} className={cn("flex items-center gap-3 px-3.5 py-3 rounded-2xl", isKr ? "bg-brand/[0.14]" : "bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]")}>
                                <span className="w-8 shrink-0 text-center">
                                    {medal ? <span className="text-[18px]">{medal}</span> : <span className={cn("font-bold text-[15px] tabular-nums", isKr ? "text-brand" : "text-ink-3")}>{idx + 1}</span>}
                                </span>
                                <span className="text-[19px] leading-none shrink-0">{flagEmoji(iocToAlpha2(n.fed))}</span>
                                <div className="flex-1 min-w-0">
                                    <span className={cn("block text-[14.5px] font-semibold truncate", isKr ? "text-brand" : "text-ink-1")}>{regionName(iocToAlpha2(n.fed), locale)}</span>
                                    <span className="block text-[11.5px] font-medium text-ink-3 truncate mt-0.5">
                                        {t("golf.playersCount").replace("{n}", String(n.players))}
                                        {n.top20Count > 0 ? ` · ${t("golf.top20Count").replace("{n}", String(n.top20Count))}` : ""}
                                        {" · "}{n.bestRank}{t("umb.rankSuffix")} {n.bestPlayer}
                                    </span>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-bold text-[16px] tabular-nums text-ink-1">{n.top5Points.toFixed(1)}</div>
                                    <div className="text-[10px] font-semibold text-ink-3">{t("golf.top5Sum")}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── 시즌 기록(투어 랭킹): 지표 칩 → 톱 50 ─── */}
            {view === "stats" && (
                <div className="relative z-10">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 mb-3">
                        {(STAT_HIGHLIGHTS[tour as "kpga" | "klpga"] ?? []).map(h => {
                            const k = statKeys?.keys.find(x => x.statKey === h.key);
                            if (!k) return null;
                            return (
                                <button key={h.key} onClick={() => setStatKey(h.key)} className={cn("shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors", activeKey === h.key ? "bg-ink-1 text-surface-0" : "bg-surface-1 text-ink-2")}>
                                    {h.emoji} {h.short}
                                </button>
                            );
                        })}
                        {(statKeys?.keys ?? []).filter(k => !(STAT_HIGHLIGHTS[tour as "kpga" | "klpga"] ?? []).some(h => h.key === k.statKey)).map(k => (
                            <button key={k.statKey} onClick={() => setStatKey(k.statKey)} className={cn("shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors", activeKey === k.statKey ? "bg-ink-1 text-surface-0" : "bg-surface-1 text-ink-2")}>
                                {k.label}
                            </button>
                        ))}
                    </div>
                    {statList && (
                        <p className="text-[11.5px] font-medium text-ink-4 px-1 mb-2">
                            {statList.rows[0]?.label}{statList.rows[0]?.unit ? ` (${statList.rows[0].unit})` : ""} · {t("golf.statSeason").replace("{season}", statList.season)}
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                        {(statList?.rows ?? []).map((r, i) => (
                            <button
                                key={r.playerId} onClick={() => setOpenId(r.playerId)}
                                className={cn("flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-3")}
                            >
                                <span className={cn("w-10 shrink-0 text-center font-bold text-[15px] tabular-nums", i < 3 ? "text-brand" : "text-ink-3")}>{r.rank}</span>
                                <span className="flex-1 min-w-0 truncate font-semibold text-[14px] text-ink-1">{r.playerName}</span>
                                <span className="shrink-0 text-right font-bold text-[15px] tabular-nums text-ink-1">{formatStatValue(r.value, r.unit)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── 선수 보기 ─── */}
            {view === "players" && (<>
                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                        <input
                            value={q}
                            onChange={(e) => changeFilter(() => setQ(e.target.value))}
                            placeholder={t("golf.searchPlaceholder")}
                            className="w-full h-11 pl-10 pr-4 rounded-full bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[14px] font-medium text-ink-1 placeholder:text-ink-4 outline-none"
                        />
                    </div>
                    {meta.world && (
                        <button
                            onClick={() => changeFilter(() => setKrOnly(v => !v))}
                            className={cn("shrink-0 h-11 px-4 rounded-full text-[13px] font-semibold transition-colors", krOnly ? "bg-brand text-brand-fg" : "bg-surface-1 text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]")}
                        >
                            {flagEmoji("KR")} {regionName("KR", locale)}
                        </button>
                    )}
                </div>

                {movers.length > 0 && !q && !krOnly && (
                    <div className="mb-4">
                        <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-2 mb-2">
                            <LucideTrendingUp className="w-4 h-4 text-brand" /> {t("golf.movers")}
                        </h2>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
                            {movers.map(m => (
                                <button key={m.playerId} onClick={() => setOpenId(m.playerId)} className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                    <span className="text-[16px] leading-none">{flagEmoji(iocToAlpha2(m.country))}</span>
                                    <span className="text-[13px] font-semibold text-ink-1 max-w-[110px] truncate">{golferName(m, locale)}</span>
                                    <span className="text-[12px] font-bold text-brand tabular-nums">▲{m.move}</span>
                                    <span className="text-[11.5px] font-medium text-ink-3 tabular-nums">{m.rank}{t("umb.rankSuffix")}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-1.5 relative z-10">
                    {!isLoading && total > 0 && (
                        <div className="flex items-center justify-between px-1 mb-0.5">
                            <p className="text-[11.5px] font-medium text-ink-4 tabular-nums">{t("golf.totalPlayers").replace("{n}", total.toLocaleString())}</p>
                            <p className="text-[11.5px] font-medium text-ink-4">{valueLabel}</p>
                        </div>
                    )}
                    {isLoading && <div className="rk-card p-8 text-center text-[13.5px] font-medium text-ink-3">{t("golf.loading")}</div>}
                    {!isLoading && rows.length === 0 && <div className="rk-card p-10 text-center text-[14px] font-semibold text-ink-3">{t("golf.empty")}</div>}
                    {rows.map(r => {
                        const isKr = meta.world && r.country === homeFed;
                        return (
                            <button
                                key={r.playerId}
                                onClick={() => setOpenId(r.playerId)}
                                className={cn(
                                    "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors",
                                    isKr ? "bg-brand/[0.14]" : "bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-3"
                                )}
                            >
                                <span className={cn("w-10 shrink-0 text-center font-bold text-[15px] tabular-nums", isKr ? "text-brand" : "text-ink-3")}>{r.rank}</span>
                                <span className="text-[17px] leading-none shrink-0">{flagEmoji(iocToAlpha2(r.country))}</span>
                                <span className={cn("flex-1 min-w-0 truncate font-semibold text-[14px]", isKr ? "text-brand" : "text-ink-1")}>{golferName(r, locale)}</span>
                                {/* 세계 랭킹은 출처가 지난주 순위를 주고, 투어 랭킹은 우리 직전 스냅샷과 비교 — 직전이 없으면(첫 회차) 변동 칸을 비운다 */}
                                {meta.world || data?.prevEdition ? <GMove move={r.move} newLabel={t("golf.new")} /> : <span className="w-8 shrink-0" />}
                                <span className="w-14 shrink-0 text-right font-bold text-[15px] tabular-nums text-ink-1">{formatRankValue(tour, r.points)}</span>
                            </button>
                        );
                    })}
                    {canLoadMore && rows.length > 0 && (
                        <button
                            onClick={loadMore} disabled={isLoadingMore}
                            className="h-12 mt-1 rounded-2xl bg-surface-1 text-[14px] font-semibold text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-surface-3 transition-colors disabled:opacity-50"
                        >
                            {isLoadingMore ? t("golf.loading") : t("golf.loadMore")}
                        </button>
                    )}
                    <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] font-medium text-ink-4 py-3">
                        {t("golf.source").replace("{name}", meta.sourceName)}
                    </a>
                </div>
            </>)}

            <GolferSheet tour={tour} playerId={openId} onClose={() => setOpenId(null)} onNavigate={setOpenId} />
            <HiqNavigation />
        </div>
    );
}
