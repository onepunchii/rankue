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
        <div className="min-h-screen premium-bg text-white p-6 pb-32 font-sans relative overflow-x-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-0 w-full h-[50dvh] pointer-events-none z-0 overflow-hidden">
                <div
                    className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-[100px] opacity-20 transition-colors duration-1000"
                    style={{ background: currentSport === "GOLF" ? "#84cc16" : 'var(--brand-primary)' }}
                />
                <div className="absolute inset-0 premium-vignette" />
                <div className="absolute inset-0 premium-grid" />
            </div>

            <div className="relative z-10">
                <header className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4">
                        <LucideUsers className="w-3 h-3 text-white/40" />
                        <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">
                            {currentSport === "GOLF" ? "Golf Leaderboard" : "Club Leaderboard"}
                        </span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter mb-2">
                        {currentSport === "GOLF" ? "매장 공식 랭킹" : "실시간 랭킹"}
                    </h1>
                    <p className="text-gray-500 text-sm">
                        {currentSport === "GOLF" ? "하이큐 골프클럽 최고 실력자들" : "하이큐 당구클럽 최고 실력자들"}
                    </p>
                </header>

                {/* Scope Tabs */}
                <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-4 border border-white/5 mx-auto">
                    <Button
                        variant="ghost"
                        onClick={() => setRankingScope("store")}
                        className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${rankingScope === "store" ? "bg-white/10 text-white shadow-lg border border-white/10" : "text-gray-500 hover:text-gray-300"}`}
                    >
                        🏢 매장 랭킹
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setRankingScope("national")}
                        className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${rankingScope === "national" ? "bg-white/10 text-white shadow-lg border border-white/10" : "text-gray-500 hover:text-gray-300"}`}
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
                                "flex-1 h-12 rounded-xl font-black text-sm transition-all",
                                rankingTab === "4c" ? "bg-white/10 text-white shadow-lg border border-white/10" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            🟡 4구 랭킹
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("3c")}
                            className={cn(
                                "flex-1 h-12 rounded-xl font-black text-sm transition-all",
                                rankingTab === "3c" ? "bg-white/10 text-white shadow-lg border border-white/10" : "text-gray-500 hover:text-gray-300"
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
                            if (currentSport === "GOLF") return (r.totalGolfGames || 0) > 0;
                            const handi = rankingTab === "3c" ? r.handi3c : r.handi4c;
                            return handi > 0;
                        })
                            .sort((a: any, b: any) => {
                                if (currentSport === "GOLF") {
                                    // Lower handicap is better in golf
                                    if (a.golfHandicap !== b.golfHandicap) return a.golfHandicap - b.golfHandicap;
                                    return a.golfAvgScore - b.golfAvgScore;
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
                                    className={`flex items-center justify-between p-5 rounded-[1.5rem] border transition-all ${rank.id === member?.id
                                        ? "bg-white/[0.08] border-white/20 shadow-xl"
                                        : "bg-white/[0.03] border-white/5"
                                        }`}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="relative">
                                            {idx < 3 ? (
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center rotate-45 ${idx === 0 ? "bg-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.3)]" :
                                                    idx === 1 ? "bg-gray-300" : "bg-amber-600"
                                                    }`}>
                                                    <LucideMedal className={`w-6 h-6 -rotate-45 ${idx === 0 ? 'text-black' : 'text-white'}`} />
                                                </div>
                                            ) : (
                                                <span className="w-10 h-10 flex items-center justify-center font-black text-white/20 text-lg italic">
                                                    {idx + 1}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-lg">{rank.name}</span>
                                                {rank.id === member?.id && <span className="px-1.5 py-0.5 bg-white/10 rounded text-[8px] font-black text-white/40 border border-white/10 uppercase tracking-tighter">My Rank</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500/40" />
                                                <span className="text-white/20 text-[9px] font-bold uppercase tracking-widest">Lv.{Math.floor((rank.visitCount || 0) / 5) + 1} Player</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-white/30 tracking-[0.1em] uppercase mb-1">
                                            {currentSport === "GOLF" ? "Golf Handicap" : "Target Score"}
                                        </div>
                                        <div className="font-black text-2xl flex items-baseline gap-1">
                                            {currentSport === "GOLF" ? (rank.golfHandicap || 0) : (rankingTab === "3c" ? rank.handi3c : rank.handi4c)}
                                            <span className="text-[10px] text-white/20">
                                                {currentSport === "GOLF" ? "H" : "pts"}
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
