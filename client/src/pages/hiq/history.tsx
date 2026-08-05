import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideTarget, LucideBarChart3, LucideLayers } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// Refactored Imports
import { useGameStats } from "@/hooks/useGameStats";
import { SPORT_CONFIG, FilterType } from "@/components/hiq/history/types";
import { StatsOverviewCard } from "@/components/hiq/history/StatsOverviewCard";
import { GrowthChart } from "@/components/hiq/history/GrowthChart";
import { HistoryList } from "@/components/hiq/history/HistoryList";
import { GameDetailDialog } from "@/components/hiq/history/GameDetailDialog";
import { HiqMember } from "@shared/schema";
import { useT } from "@/lib/i18n";

export default function HiqHistory() {
    const { t } = useT();
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
            <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className={cn(
                        "w-12 h-12 border-4 border-black/10 rounded-full",
                        config.spinnerColor
                    )}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] px-5 pt-5 pb-28 font-sans relative overflow-x-hidden">
            {/* iOS 상태바(black-translucent) 배경막 — 스크롤 시 콘텐츠가 반투명 상태바 밑으로 비쳐
                시계·배터리와 겹치는 것을 막는다. 노치 없는 환경에선 높이 0이라 무영향. */}
            <div className="fixed top-0 left-0 right-0 h-[env(safe-area-inset-top)] bg-[#f2f0eb] z-40 pointer-events-none" />
            {/* Header */}
            <div className="flex items-center gap-3 mb-7 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/dashboard")}
                    className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center transition-transform text-black/55 shrink-0"
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div>
                    <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">
                        {t(config.title)}
                    </h1>
                    <p className="text-[13px] font-medium text-black/55 mt-1.5">
                        {t(config.subtitle)}
                    </p>
                </div>
            </div>

            {/* Filter Tabs - Only show for Billiards */}
            {currentSport !== "GOLF" && (
                <div className="flex p-1 bg-black/[0.04] rounded-2xl mb-6 ">
                    {[
                        { id: "all", label: t("history.filterAll"), icon: LucideLayers },
                        { id: "3c", label: t("history.filter3c"), icon: LucideTarget },
                        { id: "4c", label: t("history.filter4c"), icon: LucideBarChart3 }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as FilterType)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors outline-none ring-0",
                                filter === tab.id
                                    ? "bg-brand text-brand-fg"
                                    : "text-black/55 hover:text-black/70"
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

            {/* 성장 그래프 — 골프는 스코어가 낮을수록 좋아 '평균 추이' 해석이 반대라 제외한다 */}
            {currentSport !== "GOLF" && (
                <GrowthChart
                    history={stats.officialHistory}
                    filter={filter}
                    mainMode={stats.mainMode}
                />
            )}

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
