import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideTarget, LucideBarChart3, LucideLayers } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// Refactored Imports
import { useGameStats } from "@/hooks/useGameStats";
import { SPORT_CONFIG, FilterType } from "@/components/hiq/history/types";
import { StatsOverviewCard } from "@/components/hiq/history/StatsOverviewCard";
import { GrowthChart } from "@/components/hiq/history/GrowthChart";
import { HistoryList } from "@/components/hiq/history/HistoryList";
import { GameDetailDialog } from "@/components/hiq/history/GameDetailDialog";
import { AchievementCard } from "@/components/hiq/history/AchievementCard";
import { SimHistoryCard } from "@/components/hiq/history/SimHistoryCard";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { LoginGate } from "@/components/hiq/LoginGate";
import { BallDot } from "@/components/hiq/BallDot";
import { GolfRoundReport } from "@/golf/pages/RoundReport";

export default function HiqHistory() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { currentSport } = useSport();
    const [filter, setFilter] = useState<FilterType>("all");
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    // 1. Data Fetching
    const { member, isLoading: isAuthLoading, isGuest } = useAuth();

    // Using the same query key/fn as before
    const { data: history = [], isLoading: isHistoryLoading } = useQuery({
        queryKey: ["/api/hiq/history", currentSport],
        enabled: !!member,
        queryFn: async () => await apiRequest(`/api/hiq/history?sport=${currentSport}`)
    });
    const isLoading = isAuthLoading || (!!member && isHistoryLoading);

    // 2. Custom Hook for logic
    const stats = useGameStats(history, filter, currentSport, member);

    // 3. Config
    const config = SPORT_CONFIG[currentSport] || SPORT_CONFIG.BILLIARDS;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center">
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

    // 비로그인 — 예전에는 "0승 0패 · 누적 평균 0.000" 을 그려서 기록이 없는 것처럼 보였다.
    if (isGuest) {
        return (
            <LoginGate
                icon={LucideBarChart3}
                title={t("historyPage.gateTitle")}
                desc={t("historyPage.gateDesc")}
                links={[
                    { label: t("loginGate.linkWorld"), to: "/world-ranking" },
                    { label: t("loginGate.linkPba"), to: "/pba" },
                ]}
            />
        );
    }

    // 골프는 전용 화면(2026-09-24 오너: 라운딩 리포트 디자인 변경) — 당구 문법(등급·대문자 라벨)이 골프에 그대로 입혀져 있었다
    if ((currentSport as string) === "GOLF") return <GolfRoundReport history={history as any} />;

    return (
        <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] px-5 pt-5 pb-nav font-sans relative overflow-x-hidden">
            {/* iOS 상태바(black-translucent) 배경막 — 스크롤 시 콘텐츠가 반투명 상태바 밑으로 비쳐
                시계·배터리와 겹치는 것을 막는다. 노치 없는 환경에선 높이 0이라 무영향. */}
            <div className="fixed top-0 left-0 right-0 h-[env(safe-area-inset-top)] bg-surface-0 z-40 pointer-events-none" />
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
                        { id: "all", label: t("history.filterAll") },
                        { id: "4c", label: t("history.filter4c") },
                        { id: "3c", label: t("history.filter3c") },
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
                            <BallDot type={tab.id as "all" | "3c" | "4c"} />
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

            {/* 주간 달성률 — 득점÷다마수, '지난주의 나'와 대결 */}
            {currentSport !== "GOLF" && <AchievementCard filter={filter} />}

            {/* 시뮬레이터 기록 — 실전 전적과 별개 테이블, 화면에서도 분리 표기 */}
            {currentSport !== "GOLF" && <SimHistoryCard filter={filter} />}

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

            <AppInstallCard className="mt-6" />

            <HiqNavigation />
        </div>
    );
}
