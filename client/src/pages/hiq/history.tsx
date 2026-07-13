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
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
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
        <div className="min-h-screen bg-[#0A0A0A] text-white px-5 pt-5 pb-28 font-sans relative overflow-x-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 mb-7 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-11 h-11 rounded-full bg-surface-1 border border-surface-line flex items-center justify-center transition-transform text-white/55 shrink-0"
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div>
                    <h1 className="text-[26px] font-bold tracking-tight text-white leading-none">
                        {config.title}
                    </h1>
                    <p className="text-[13px] font-medium text-white/45 mt-1.5">
                        {config.subtitle}
                    </p>
                </div>
            </div>

            {/* Filter Tabs - Only show for Billiards */}
            {currentSport !== "GOLF" && (
                <div className="flex p-1 bg-white/[0.04] rounded-2xl mb-6 border border-white/[0.06]">
                    {[
                        { id: "all", label: "전체", icon: LucideLayers },
                        { id: "3c", label: "3쿠션", icon: LucideTarget },
                        { id: "4c", label: "4구", icon: LucideBarChart3 }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as FilterType)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                filter === tab.id
                                    ? "bg-brand text-brand-fg"
                                    : "text-white/45 hover:text-white/70"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
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
