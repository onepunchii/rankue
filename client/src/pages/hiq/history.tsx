import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideTarget, LucideBarChart3, LucideLayers } from "lucide-react";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// Refactored Imports
import { useGameStats } from "@/hooks/useGameStats";
import { SPORT_CONFIG, FilterType } from "@/components/hiq/history/types";
import { StatsOverviewCard } from "@/components/hiq/history/StatsOverviewCard";
import { HistoryList } from "@/components/hiq/history/HistoryList";
import { GameDetailDialog } from "@/components/hiq/history/GameDetailDialog";
import { HiqMember } from "@shared/schema";

export default function HiqHistory() {
    const [, setLocation] = useLocation();
    const { currentSport } = useSport();
    const [filter, setFilter] = useState<FilterType>("all");
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    // 1. Data Fetching
    const { data: member } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    // Using the same query key/fn as before
    const { data: history = [], isLoading } = useQuery({
        queryKey: ["/api/hiq/history", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/history?sport=${currentSport}`)
    });

    // 2. Custom Hook for logic
    const stats = useGameStats(history, filter, currentSport, member);

    // 3. Config
    const config = SPORT_CONFIG[currentSport] || SPORT_CONFIG.BILLIARDS;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className={cn(
                        "w-12 h-12 border-4 border-white/10 rounded-full",
                        config.spinnerColor
                    )}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-24 font-sans relative overflow-x-hidden">
            {/* Background Light Effect */}
            <div className={cn(
                "absolute top-0 right-0 w-[80dvw] h-[40dvh] blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none transition-colors duration-1000",
                config.bgLight
            )} />

            {/* Header */}
            <div className="flex items-center gap-5 py-4 mb-6 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all text-white/40"
                >
                    <LucideChevronLeft className="w-6 h-6" />
                </motion.button>
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-white">
                        {config.title}
                    </h1>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">
                        {config.subtitle}
                    </p>
                </div>
            </div>

            {/* Filter Tabs - Only show for Billiards */}
            {currentSport !== "GOLF" && (
                <div className="flex p-1 bg-[#151515] rounded-2xl mb-8 border border-[#222]">
                    {[
                        { id: "all", label: "전체", icon: LucideLayers },
                        { id: "3c", label: "3구", icon: LucideTarget },
                        { id: "4c", label: "4구", icon: LucideBarChart3 }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as FilterType)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all outline-none ring-0",
                                filter === tab.id
                                    ? "bg-[#10b981] text-black shadow-lg"
                                    : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            <tab.icon className={cn("w-4 h-4", filter === tab.id ? "text-black" : "")} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Stats Overview Card */}
            <StatsOverviewCard
                stats={stats}
                config={config}
                filter={filter}
                currentSport={currentSport}
            />

            {/* History List */}
            <HistoryList
                history={stats.officialHistory}
                config={config}
                onGameClick={setSelectedGameId}
                currentSport={currentSport}
            />

            {/* Detail Dialog */}
            <GameDetailDialog
                gameId={selectedGameId}
                onClose={() => setSelectedGameId(null)}
                currentMemberId={member?.id}
                config={config}
                currentSport={currentSport}
            />

            <HiqNavigation />
        </div>
    );
}
