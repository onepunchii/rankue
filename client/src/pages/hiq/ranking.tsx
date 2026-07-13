import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { LucideMedal, LucideStore, LucideGlobe, LucideTarget, LucideBarChart3, LucideTrophy } from "lucide-react";
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useSport } from "@/contexts/SportContext";

import { cn } from "@/lib/utils";

export default function HiqRanking() {
    const [rankingTab, setRankingTab] = useState<"3c" | "4c">("4c");
    const [rankingScope, setRankingScope] = useState<"national" | "store">("store");
    const { currentSport } = useSport();

    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const { data: rankings, isLoading } = useQuery<HiqMember[]>({
        queryKey: [`/api/hiq/rankings`, rankingScope, currentSport, rankingTab],
        queryFn: async () => {
            const res = await fetch(`/api/hiq/rankings?scope=${rankingScope}&type=${rankingTab}&sport=${currentSport}`);
            const data = await res.json();
            return data.data;
        }
    });

    const rankedMembers = (rankings ?? [])
        .filter((r: any) => {
            if (currentSport === "GOLF") return (r.totalGolfGames || 0) > 0 || (r.golfHandicap || 0) > 0;
            const handi = rankingTab === "3c" ? r.handi3c : r.handi4c;
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
            const handiA = rankingTab === "3c" ? a.handi3c : a.handi4c;
            const handiB = rankingTab === "3c" ? b.handi3c : b.handi4c;
            if (handiB !== handiA) return handiB - handiA;
            return parseFloat(b.average || "0") - parseFloat(a.average || "0");
        });

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white px-5 pt-6 pb-32 font-sans relative overflow-x-hidden">
            <div className="relative z-10">
                <header className="mb-7">
                    <h1 className="text-[26px] font-bold tracking-tight mb-1.5">
                        {currentSport === "GOLF" ? "매장 공식 랭킹" : "실시간 랭킹"}
                    </h1>
                    <p className="text-white/50 text-[13px] font-medium">
                        {currentSport === "GOLF" ? "골프 최고 실력자들" : "당구 최고 실력자들"}
                    </p>
                </header>

                {/* Scope Tabs */}
                <div className="flex p-1 bg-white/[0.04] rounded-2xl mb-4 border border-white/[0.06]">
                    <button
                        onClick={() => setRankingScope("store")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                            rankingScope === "store" ? "bg-brand text-brand-fg" : "text-white/45 hover:text-white/70"
                        )}
                    >
                        <LucideStore className="w-4 h-4" />
                        매장 랭킹
                    </button>
                    <button
                        onClick={() => setRankingScope("national")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                            rankingScope === "national" ? "bg-brand text-brand-fg" : "text-white/45 hover:text-white/70"
                        )}
                    >
                        <LucideGlobe className="w-4 h-4" />
                        전국 랭킹
                    </button>
                </div>

                {/* Ranking Tabs - Only show for Billiards */}
                {currentSport !== "GOLF" && (
                    <div className="flex p-1 bg-white/[0.04] rounded-2xl mb-8 border border-white/[0.06]">
                        <button
                            onClick={() => setRankingTab("4c")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                rankingTab === "4c" ? "bg-brand text-brand-fg" : "text-white/45 hover:text-white/70"
                            )}
                        >
                            <LucideBarChart3 className="w-4 h-4" />
                            4구
                        </button>
                        <button
                            onClick={() => setRankingTab("3c")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                rankingTab === "3c" ? "bg-brand text-brand-fg" : "text-white/45 hover:text-white/70"
                            )}
                        >
                            <LucideTarget className="w-4 h-4" />
                            3쿠션
                        </button>
                    </div>
                )}

                <div className="space-y-2.5">
                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full"
                            />
                        </div>
                    ) : rankedMembers.length === 0 ? (
                        <div className="rk-card p-8 text-center">
                            <LucideTrophy className="w-10 h-10 text-white/15 mx-auto mb-3" />
                            <div className="text-[15px] font-semibold text-white">아직 랭킹이 없습니다</div>
                            <p className="text-[13px] text-white/45 mt-1">
                                {currentSport === "GOLF" ? "라운드 기록이 쌓이면 순위가 표시됩니다" : "경기 기록이 쌓이면 순위가 표시됩니다"}
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
                                                    idx === 0 ? "bg-amber-400/15 text-amber-400" :
                                                        idx === 1 ? "bg-white/10 text-white/70" :
                                                            "bg-orange-700/20 text-orange-400"
                                                )}>
                                                    <LucideMedal className="w-5 h-5" />
                                                </div>
                                            ) : (
                                                <span className="w-10 h-10 flex items-center justify-center font-semibold text-white/40 text-[17px] tabular-nums">
                                                    {idx + 1}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-[16px]">{rank.name}</span>
                                                {rank.id === member?.id && <span className="px-1.5 py-0.5 bg-brand/15 rounded text-[12px] font-semibold text-brand border border-brand/25">내 순위</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                                <span className="text-white/45 text-[12px] font-medium tabular-nums">Lv.{Math.floor((rank.visitCount || 0) / 5) + 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[12px] font-medium text-white/45 mb-1">
                                            {currentSport === "GOLF" ? "평균 타수" : "핸디"}
                                        </div>
                                        <div className="font-bold text-[22px] tabular-nums flex items-baseline gap-1 justify-end">
                                            {currentSport === "GOLF"
                                                ? (() => {
                                                    const score = (rank.golfAvgScore || 0) > 0 ? rank.golfAvgScore : (rank.golfHandicap || 0) + 72;
                                                    return score > 0 ? score.toFixed(0) : "-";
                                                })()
                                                : (rankingTab === "3c" ? rank.handi3c : rank.handi4c)}
                                            <span className="text-[12px] font-medium text-white/45">
                                                {currentSport === "GOLF" ? "" : "점"}
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
