import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideMedal, LucideGlobe } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";

// PBA 투어 랭킹 — pbatour.org 공개 데이터 재가공(출처 표기). 시즌 2019~현재.
// 선수 사진은 초상권 문제로 쓰지 않는다 — 국기 + 이름만.

interface PbaRow {
    memCode: string;
    prizeRank: number | null;
    pointRank: number | null;
    prize: number;
    rankingPoint: number;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
}

const L: Record<Locale, Record<string, string>> = {
    ko: {
        title: "PBA 투어 랭킹", subtitle: "프로당구 PBA·LPBA 시즌 랭킹",
        byPrize: "상금순", byPoint: "포인트순", prize: "상금", point: "포인트",
        season: "시즌", empty: "데이터가 없습니다", source: "출처: PBA 투어 공식 기록",
        umbLink: "UMB 세계랭킹 보기", upcoming: "다가오는 대회", dday: "D-", today: "진행 중",
        metaTitle: "PBA 투어 랭킹 · 프로당구 시즌 상금·포인트 순위 | 랭큐",
        metaDesc: "프로당구 PBA·LPBA 시즌별 랭킹. 상금 순위, 랭킹 포인트, 선수별 통산 기록과 시즌 히스토리를 랭큐에서.",
    },
    en: {
        title: "PBA Tour Rankings", subtitle: "Korean pro billiards PBA · LPBA season rankings",
        byPrize: "By prize", byPoint: "By points", prize: "Prize", point: "Points",
        season: "Season", empty: "No data", source: "Source: PBA Tour official records",
        umbLink: "UMB World Ranking", upcoming: "Upcoming events", dday: "D-", today: "Live now",
        metaTitle: "PBA Tour Rankings · Korean Pro Billiards | RANKUE",
        metaDesc: "PBA & LPBA season rankings — prize money, ranking points, and career records of Korean pro billiards players.",
    },
    vi: {
        title: "BXH PBA Tour", subtitle: "Bi-a chuyên nghiệp Hàn Quốc PBA · LPBA",
        byPrize: "Theo tiền thưởng", byPoint: "Theo điểm", prize: "Tiền thưởng", point: "Điểm",
        season: "Mùa giải", empty: "Chưa có dữ liệu", source: "Nguồn: PBA Tour",
        umbLink: "BXH thế giới UMB", upcoming: "Giải sắp tới", dday: "D-", today: "Đang diễn ra",
        metaTitle: "BXH PBA Tour · Bi-a chuyên nghiệp Hàn Quốc | RANKUE",
        metaDesc: "BXH mùa giải PBA & LPBA — tiền thưởng, điểm xếp hạng và thành tích của các cơ thủ chuyên nghiệp.",
    },
    tr: {
        title: "PBA Tur Sıralaması", subtitle: "Kore profesyonel bilardo PBA · LPBA",
        byPrize: "Para ödülü", byPoint: "Puan", prize: "Ödül", point: "Puan",
        season: "Sezon", empty: "Veri yok", source: "Kaynak: PBA Tour",
        umbLink: "UMB Dünya Sıralaması", upcoming: "Yaklaşan turnuvalar", dday: "D-", today: "Devam ediyor",
        metaTitle: "PBA Tur Sıralaması · Kore Profesyonel Bilardo | RANKUE",
        metaDesc: "PBA & LPBA sezon sıralamaları — para ödülleri, sıralama puanları ve oyuncu kariyer kayıtları.",
    },
    es: {
        title: "Ranking PBA Tour", subtitle: "Billar profesional coreano PBA · LPBA",
        byPrize: "Por premios", byPoint: "Por puntos", prize: "Premios", point: "Puntos",
        season: "Temporada", empty: "Sin datos", source: "Fuente: PBA Tour",
        umbLink: "Ranking mundial UMB", upcoming: "Próximos torneos", dday: "D-", today: "En curso",
        metaTitle: "Ranking PBA Tour · Billar Profesional Coreano | RANKUE",
        metaDesc: "Rankings de temporada PBA y LPBA — premios, puntos y récords de los jugadores profesionales.",
    },
};

// 표기 유틸은 프리렌더와 문자 단위 일치가 필요해 shared 로 공유한다
export { seasonLabel, formatPrize } from "@shared/pbaMeta";
import { seasonLabel, formatPrize } from "@shared/pbaMeta";

export default function HiqPba() {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const [, setLocation] = useLocation();
    const [league, setLeague] = useState<"PBA" | "LPBA">("PBA");
    const [by, setBy] = useState<"prize" | "point">("prize");
    const [season, setSeason] = useState<number | null>(null);

    const { data: seasonsData } = useQuery<{ seasons: { league: string; seasons: number[] }[]; current: number }>({
        queryKey: ["/api/hiq/pba/seasons"],
        queryFn: async () => apiRequest("/api/hiq/pba/seasons"),
        staleTime: 10 * 60 * 1000,
    });
    const seasons = seasonsData?.seasons.find((s) => s.league === league)?.seasons ?? [];
    const activeSeason = season ?? seasonsData?.current ?? new Date().getFullYear();

    const { data, isLoading } = useQuery<{ rows: PbaRow[] }>({
        queryKey: ["/api/hiq/pba/rankings", league, activeSeason, by],
        queryFn: async () => apiRequest(`/api/hiq/pba/rankings?league=${league}&season=${activeSeason}&by=${by}`),
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });
    const rows = data?.rows ?? [];

    // 다가오는 대회 — 라이브 프록시 (시즌 일정)
    const { data: sched } = useQuery<{ upcoming: Array<{ title: string; league: string; startDate: string; endDate: string; place: string | null }> }>({
        queryKey: ["/api/hiq/pba/schedule"],
        queryFn: async () => apiRequest("/api/hiq/pba/schedule"),
        staleTime: 60 * 60 * 1000,
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    const dday = (d: string) => Math.ceil((new Date(d + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86400000);

    useSeo({
        title: t.metaTitle,
        description: t.metaDesc,
        path: "/pba",
        locale,
        jsonLd: rows.length ? {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: t.metaTitle,
            itemListElement: rows.slice(0, 20).map((r, i) => ({
                "@type": "ListItem", position: i + 1, name: r.nameKo,
                url: `https://www.rankue.co.kr/pba-player/${r.memCode}`,
            })),
        } : null,
    });

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t.title}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div>
                    <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">{t.title}</h1>
                    <p className="text-[13px] font-medium text-black/55 mt-1">{t.subtitle}</p>
                </div>
            </div>

            {/* 리그 탭 + 정렬 전환 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1.5">
                    {(["PBA", "LPBA"] as const).map((lg) => (
                        <button
                            key={lg}
                            onClick={() => setLeague(lg)}
                            className={cn(
                                "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                league === lg ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                            )}
                        >
                            {lg}
                        </button>
                    ))}
                </div>
                <div className="flex bg-brand/[0.08] p-1 rounded-full h-9">
                    {(["prize", "point"] as const).map((v) => (
                        <button
                            key={v}
                            onClick={() => setBy(v)}
                            className={cn(
                                "px-3 rounded-full text-[12.5px] font-bold transition-colors",
                                by === v ? "bg-brand text-white" : "text-brand/60",
                            )}
                        >
                            {v === "prize" ? t.byPrize : t.byPoint}
                        </button>
                    ))}
                </div>
            </div>

            {/* 시즌 칩 */}
            {seasons.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-5 px-5 scrollbar-hide">
                    {seasons.map((s) => (
                        <button
                            key={s}
                            onClick={() => setSeason(s)}
                            className={cn(
                                "shrink-0 h-8 px-3.5 rounded-full text-[12.5px] font-semibold tabular-nums transition-colors",
                                s === activeSeason ? "bg-brand text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                            )}
                        >
                            {seasonLabel(s)}
                        </button>
                    ))}
                </div>
            )}

            {/* 다가오는 대회 스트립 */}
            {(sched?.upcoming?.length ?? 0) > 0 && (
                <div className="mb-4">
                    <p className="text-[11.5px] font-bold text-black/40 mb-2">{t.upcoming}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-hide">
                        {sched!.upcoming.map((e) => {
                            const d = dday(e.startDate);
                            const live = e.startDate <= todayStr && e.endDate >= todayStr;
                            return (
                                <div key={`${e.title}-${e.startDate}`} className="shrink-0 w-[190px] rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                    <div className="flex items-center gap-1.5">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                                            live ? "bg-[#E02D2D] text-white" : "bg-brand/10 text-brand",
                                        )}>
                                            {live ? t.today : `${t.dday}${d}`}
                                        </span>
                                        <span className="text-[10.5px] font-bold text-black/40">{e.league.replace(/1$/, "")}</span>
                                    </div>
                                    <p className="mt-1.5 text-[12.5px] font-bold leading-snug line-clamp-2">{e.title}</p>
                                    <p className="mt-1 text-[10.5px] text-black/40 tabular-nums">
                                        {e.startDate.slice(5).replace("-", ".")}~{e.endDate.slice(5).replace("-", ".")}{e.place ? ` · ${e.place}` : ""}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 랭킹 목록 */}
            <div className="space-y-2">
                {isLoading && !rows.length ? (
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-[64px] bg-black/[0.04] rounded-2xl animate-pulse" />
                    ))
                ) : rows.length === 0 ? (
                    <div className="rk-card p-8 text-center text-[14px] text-black/45">{t.empty}</div>
                ) : (
                    rows.map((r, idx) => {
                        const rank = by === "point" ? r.pointRank : r.prizeRank;
                        return (
                            <motion.button
                                key={r.memCode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                onClick={() => setLocation(`/pba-player/${r.memCode}`)}
                                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-left active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-center gap-3.5 min-w-0">
                                    {rank != null && rank <= 3 ? (
                                        <div className={cn(
                                            "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center",
                                            rank === 1 ? "bg-[#cba258]/12 text-[#cba258]" :
                                                rank === 2 ? "bg-black/[0.06] text-black/60" : "bg-orange-500/12 text-orange-700",
                                        )}>
                                            <LucideMedal className="w-[18px] h-[18px]" />
                                        </div>
                                    ) : (
                                        <span className="w-9 shrink-0 text-center font-semibold text-black/40 text-[15px] tabular-nums">{rank ?? "-"}</span>
                                    )}
                                    <span className="text-[16px] leading-none shrink-0">{flagEmoji(r.nationCode ?? "") || "🏳️"}</span>
                                    <div className="min-w-0">
                                        <span className="block text-[15.5px] font-semibold truncate">{r.nameKo}</span>
                                        {r.nameEn && <span className="block text-[11.5px] font-medium text-black/40 truncate">{r.nameEn}</span>}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                    <span className="block text-[15px] font-bold tabular-nums">
                                        {by === "prize" ? formatPrize(r.prize, locale) : r.rankingPoint.toLocaleString()}
                                    </span>
                                    <span className="block text-[11px] font-medium text-black/40">
                                        {by === "prize" ? t.prize : t.point}
                                    </span>
                                </div>
                            </motion.button>
                        );
                    })
                )}
            </div>

            {/* UMB 교차 링크 + 출처 */}
            <button
                onClick={() => setLocation("/world-ranking")}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-brand/[0.08] text-brand text-[13.5px] font-bold"
            >
                <LucideGlobe className="w-4 h-4" />
                {t.umbLink}
            </button>
            <p className="mt-4 text-center text-[11px] text-black/35">{t.source}</p>
        </div>
    );
}
