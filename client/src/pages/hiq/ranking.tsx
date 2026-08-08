import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { LucideMedal, LucideStore, LucideGlobe, LucideTarget, LucideBarChart3, LucideTrophy } from "@/lib/icons";
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useSport } from "@/contexts/SportContext";

import { cn } from "@/lib/utils";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";

// "프로와 나" 카드 문구 — 3쿠션 탭 전용, 실측 PBA 통산 에버리지와 비교
const PRO_L: Record<string, { title: string; mine: string; proAvg: string; percent: (p: number) => string; cta: string }> = {
    ko: { title: "프로와 나", mine: "내 에버리지", proAvg: "PBA 투어 평균", percent: (p) => `프로 평균의 ${p}%까지 왔어요`, cta: "PBA 랭킹 보기" },
    en: { title: "You vs the pros", mine: "My average", proAvg: "PBA Tour average", percent: (p) => `You're at ${p}% of the pro average`, cta: "PBA rankings" },
    vi: { title: "Bạn và dân chuyên", mine: "Average của tôi", proAvg: "Trung bình PBA", percent: (p) => `Bạn đạt ${p}% mức chuyên nghiệp`, cta: "BXH PBA" },
    tr: { title: "Sen ve profesyoneller", mine: "Ortalamam", proAvg: "PBA ortalaması", percent: (p) => `Profesyonel ortalamanın %${p}'indesin`, cta: "PBA sıralaması" },
    es: { title: "Tú y los profesionales", mine: "Mi promedio", proAvg: "Promedio PBA", percent: (p) => `Estás al ${p}% del promedio pro`, cta: "Ranking PBA" },
};

export default function HiqRanking() {
    const { t, locale } = useT();
    const [rankingTab, setRankingTab] = useState<"3c" | "4c">("4c");
    // 매장(하이퍼로컬) → 국가 → 글로벌 3계층 랭킹
    const [rankingScope, setRankingScope] = useState<"store" | "country" | "national">("store");
    const { currentSport } = useSport();

    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    // PBA 벤치마크 — 3쿠션 탭 + 내 에버리지가 있을 때만 조회
    const myAvg3c = (member as any)?.avg3c || 0;
    const { data: bench } = useQuery<any>({
        queryKey: ["/api/hiq/pba/benchmark"],
        enabled: currentSport !== "GOLF" && rankingTab === "3c" && myAvg3c > 0,
        staleTime: 60 * 60 * 1000,
    });

    const [rankingCountry, setRankingCountry] = useState<string | null>(null);
    const { data: rankings, isLoading } = useQuery<HiqMember[]>({
        queryKey: [`/api/hiq/rankings`, rankingScope, currentSport, rankingTab],
        queryFn: async () => {
            const res = await fetch(`/api/hiq/rankings?scope=${rankingScope}&type=${rankingTab}&sport=${currentSport}`);
            const data = await res.json();
            // country 스코프는 {country, rankings} 형태로 옴 — 표시용 국가 저장
            if (rankingScope === "country" && data.data?.rankings) {
                setRankingCountry(data.data.country ?? null);
                return data.data.rankings;
            }
            setRankingCountry(null);
            return data.data;
        }
    });

    const rankedMembers = (rankings ?? [])
        .filter((r: any) => {
            if (currentSport === "GOLF") return (r.totalGolfGames || 0) > 0 || (r.golfHandicap || 0) > 0;
            const handi = rankingTab === "3c" ? r.rating3c : r.rating4c;
            return handi > 0;
        })
        .sort((a: any, b: any) => {
            if (currentSport === "GOLF") {
                const scoreA = (a.golfAvgScore || 0) > 0 ? a.golfAvgScore : (a.golfHandicap || 0) + 72;
                const scoreB = (b.golfAvgScore || 0) > 0 ? b.golfAvgScore : (b.golfHandicap || 0) + 72;

                if (scoreA === 0 && scoreB === 0) return 0;
                if (scoreA === 0) return 1;
                if (scoreB === 0) return -1;

                return scoreA - scoreB;
            }
            const handiA = rankingTab === "3c" ? a.rating3c : a.rating4c;
            const handiB = rankingTab === "3c" ? b.rating3c : b.rating4c;
            if (handiB !== handiA) return handiB - handiA;
            return parseFloat(b.average || "0") - parseFloat(a.average || "0");
        });

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] px-5 pt-6 pb-32 font-sans relative overflow-x-hidden">
            <div className="relative z-10">
                <header className="mb-7">
                    <h1 className="text-[26px] font-bold tracking-tight mb-1.5">
                        {currentSport === "GOLF" ? t("ranking.golfTitle") : t("ranking.title")}
                    </h1>
                    <p className="text-black/55 text-[13px] font-medium">
                        {currentSport === "GOLF" ? t("ranking.golfSubtitle") : t("ranking.subtitle")}
                    </p>
                </header>

                {/* Scope Tabs */}
                <div className="flex p-1 bg-black/[0.04] rounded-2xl mb-4 ">
                    <button
                        onClick={() => setRankingScope("store")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                            rankingScope === "store" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-black/70"
                        )}
                    >
                        <LucideStore className="w-4 h-4" />
                        {t("ranking.storeTab")}
                    </button>
                    <button
                        onClick={() => setRankingScope("country")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                            rankingScope === "country" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-black/70"
                        )}
                    >
                        {/* 국가 랭킹 — 내 국가 기준 (3쿠션 국가 대항 정서) */}
                        <span className="text-[15px] leading-none">{flagEmoji(rankingCountry || (member as any)?.countryCode) || "🏳️"}</span>
                        {t("ranking.countryTab")}
                    </button>
                    <button
                        onClick={() => setRankingScope("national")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                            rankingScope === "national" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-black/70"
                        )}
                    >
                        <LucideGlobe className="w-4 h-4" />
                        {t("ranking.globalTab")}
                    </button>
                </div>

                {/* Ranking Tabs - Only show for Billiards */}
                {currentSport !== "GOLF" && (
                    <div className="flex p-1 bg-black/[0.04] rounded-2xl mb-8 ">
                        <button
                            onClick={() => setRankingTab("4c")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                rankingTab === "4c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-black/70"
                            )}
                        >
                            <LucideBarChart3 className="w-4 h-4" />
                            {t("ranking.fourBall")}
                        </button>
                        <button
                            onClick={() => setRankingTab("3c")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                rankingTab === "3c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-black/70"
                            )}
                        >
                            <LucideTarget className="w-4 h-4" />
                            {t("ranking.threeCushion")}
                        </button>
                    </div>
                )}

                {/* 프로와 나 — 3쿠션 탭 + 기록 보유 시. 나열이 아니라 '나와의 거리' 프레임 */}
                {currentSport !== "GOLF" && rankingTab === "3c" && myAvg3c > 0 && bench?.PBA?.avg && (() => {
                    const pl = PRO_L[locale] ?? PRO_L.ko;
                    const pct = Math.min(999, Math.round((myAvg3c / bench.PBA.avg) * 100));
                    return (
                        <button
                            onClick={() => (window.location.href = "/pba")}
                            className="w-full mb-4 rounded-2xl bg-ink-1 p-4 text-left active:scale-[0.99] transition-transform"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[11.5px] font-bold text-white/55">{pl.title}</span>
                                <span className="text-[11.5px] font-bold text-brand-fg/70 text-white/70">{pl.cta} →</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-3 tabular-nums">
                                <span className="text-white"><b className="text-[22px]">{myAvg3c.toFixed(3)}</b> <span className="text-[11px] text-white/50">{pl.mine}</span></span>
                                <span className="text-white/35 text-[13px]">vs</span>
                                <span className="text-white"><b className="text-[22px]">{Number(bench.PBA.avg).toFixed(3)}</b> <span className="text-[11px] text-white/50">{pl.proAvg}</span></span>
                            </div>
                            <div className="mt-2.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full bg-[#F5B721]" style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                            <p className="mt-1.5 text-[12px] font-semibold text-[#F5B721]">{pl.percent(pct)}</p>
                        </button>
                    );
                })()}

                <div className="space-y-2.5">
                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                className="w-8 h-8 border-2 border-black/10 border-t-brand rounded-full"
                            />
                        </div>
                    ) : rankedMembers.length === 0 ? (
                        <div className="rk-card p-8 text-center">
                            <LucideTrophy className="w-10 h-10 text-black/25 mx-auto mb-3" />
                            <div className="text-[15px] font-semibold text-[rgba(0,0,0,0.87)]">{t("ranking.empty")}</div>
                            <p className="text-[13px] text-black/55 mt-1">
                                {currentSport === "GOLF" ? t("ranking.emptyGolfDesc") : t("ranking.emptyDesc")}
                            </p>
                        </div>
                    ) : (
                        rankedMembers
                            .map((rank: any, idx: number) => (
                                <motion.div
                                    key={rank.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-tile border transition-colors",
                                        rank.id === member?.id
                                            ? "bg-brand/10 border-brand/30"
                                            : "bg-surface-1 border-surface-line"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            {idx < 3 ? (
                                                <div className={cn(
                                                    "w-10 h-10 rounded-tile flex items-center justify-center",
                                                    idx === 0 ? "bg-[#cba258]/12 text-[#cba258]" :
                                                        idx === 1 ? "bg-black/[0.06] text-black/60" :
                                                            "bg-orange-500/12 text-orange-700"
                                                )}>
                                                    <LucideMedal className="w-5 h-5" />
                                                </div>
                                            ) : (
                                                <span className="w-10 h-10 flex items-center justify-center font-semibold text-black/40 text-[17px] tabular-nums">
                                                    {idx + 1}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                {/* 글로벌·국가 랭킹에서 국기로 소속 표시 */}
                                                {rankingScope !== "store" && flagEmoji(rank.countryCode) && <span className="text-[15px]">{flagEmoji(rank.countryCode)}</span>}
                                                <span className="font-semibold text-[16px]">{rank.name}</span>
                                                {rank.handle && <span className="text-[12px] font-medium text-black/40">@{rank.handle}</span>}
                                                {rank.id === member?.id && <span className="px-1.5 py-0.5 bg-brand/15 rounded text-[12px] font-semibold text-brand border border-brand/25">{t("ranking.myRank")}</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                                <span className="text-black/55 text-[12px] font-medium tabular-nums">Lv.{Math.floor((rank.visitCount || 0) / 5) + 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[12px] font-medium text-black/55 mb-1">
                                            {currentSport === "GOLF" ? t("ranking.golfAvgScore") : t("ranking.handicap")}
                                        </div>
                                        <div className="font-bold text-[22px] tabular-nums flex items-baseline gap-1 justify-end">
                                            {currentSport === "GOLF"
                                                ? (() => {
                                                    const score = (rank.golfAvgScore || 0) > 0 ? rank.golfAvgScore : (rank.golfHandicap || 0) + 72;
                                                    return score > 0 ? score.toFixed(0) : "-";
                                                })()
                                                : (rankingTab === "3c" ? rank.rating3c : rank.rating4c)}
                                            <span className="text-[12px] font-medium text-black/55">
                                                {currentSport === "GOLF" ? "" : t("ranking.pointUnit")}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                    )}
                </div>
            </div>

            <HiqNavigation />
        </div>
    );
}
