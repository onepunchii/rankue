import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { LucideTrophy, LucideMedal, LucideUsers } from "lucide-react";
import { HiqMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
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
        queryKey: [`/api/hiq/rankings`, rankingScope, currentSport],
        queryFn: async () => {
            const res = await fetch(`/api/hiq/rankings?scope=${rankingScope}&sport=${currentSport}`);
            const data = await res.json();
            return data.data;
        }
    });

    return (
        <div className="min-h-screen premium-bg text-white px-5 pt-6 pb-32 font-sans relative overflow-x-hidden">
            <div className="relative z-10">
                <header className="mb-8 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-4">
                        <LucideUsers className="w-3 h-3 text-white/40" />
                        <span className="text-[12px] font-medium text-white/55">
                            {currentSport === "GOLF" ? "골프 리더보드" : "클럽 리더보드"}
                        </span>
                    </div>
                    <h1 className="text-[28px] font-bold tracking-tight mb-2">
                        {currentSport === "GOLF" ? "매장 공식 랭킹" : "실시간 랭킹"}
                    </h1>
                    <p className="text-white/50 text-[13px] font-medium">
                        {currentSport === "GOLF" ? "골프 최고 실력자들" : "당구 최고 실력자들"}
                    </p>
                </header>

                {/* Scope Tabs */}
                <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-4 border border-white/5 mx-auto">
                    <Button
                        variant="ghost"
                        onClick={() => setRankingScope("store")}
                        className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all ${rankingScope === "store" ? "bg-white/10 text-white border border-white/10" : "text-white/45 hover:text-white/70"}`}
                    >
                        🏢 매장 랭킹
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setRankingScope("national")}
                        className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all ${rankingScope === "national" ? "bg-white/10 text-white border border-white/10" : "text-white/45 hover:text-white/70"}`}
                    >
                        🇰🇷 전국 랭킹
                    </Button>
                </div>

                {/* Ranking Tabs - Only show for Billiards */}
                {currentSport !== "GOLF" && (
                    <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-8 border border-white/5">
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("4c")}
                            className={cn(
                                "flex-1 h-12 rounded-xl font-semibold text-sm transition-all",
                                rankingTab === "4c" ? "bg-white/10 text-white border border-white/10" : "text-white/45 hover:text-white/70"
                            )}
                        >
                            🟡 4구 랭킹
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("3c")}
                            className={cn(
                                "flex-1 h-12 rounded-xl font-semibold text-sm transition-all",
                                rankingTab === "3c" ? "bg-white/10 text-white border border-white/10" : "text-white/45 hover:text-white/70"
                            )}
                        >
                            🔴 3구 랭킹
                        </Button>
                    </div>
                )}

                <div className="space-y-3">
                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full"
                            />
                        </div>
                    ) : (
                        rankings?.filter((r: any) => {
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
                            })
                            .map((rank: any, idx: number) => (
                                <motion.div
                                    key={rank.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${rank.id === member?.id
                                        ? "bg-brand/10 border-brand/30"
                                        : "bg-white/[0.03] border-white/[0.06]"
                                        }`}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="relative">
                                            {idx < 3 ? (
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center rotate-45 ${idx === 0 ? "bg-[#ffd700]" :
                                                    idx === 1 ? "bg-gray-300" : "bg-amber-600"
                                                    }`}>
                                                    <LucideMedal className={`w-6 h-6 -rotate-45 ${idx === 0 ? 'text-black' : 'text-white'}`} />
                                                </div>
                                            ) : (
                                                <span className="w-10 h-10 flex items-center justify-center font-medium text-white/45 text-lg ">
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
                                                <span className="text-white/45 text-[12px] font-medium">Lv.{Math.floor((rank.visitCount || 0) / 5) + 1}</span>
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
