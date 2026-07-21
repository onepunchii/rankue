import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import GolfDashboard from "@/golf/pages/Dashboard";

// New Components
import { DashboardHeader } from "@/components/hiq/dashboard/DashboardHeader";
import { PerformanceCard } from "@/components/hiq/dashboard/PerformanceCard";
import { RankingListCard } from "@/components/hiq/dashboard/RankingListCard";
import { QuickActions } from "@/components/hiq/dashboard/QuickActions";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { PinCodeModal } from "@/components/hiq/dashboard/PinCodeModal";
import { ScoreCorrectionModal } from "@/components/hiq/dashboard/ScoreCorrectionModal";
import { RPGuideModal } from "@/components/hiq/dashboard/RPGuideModal";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { LucideRefreshCw, LucideZap, ChevronUp, ChevronDown } from "@/lib/icons";
import { useT } from "@/lib/i18n";

export default function HiqDashboard() {
    const { t } = useT();
    const { currentSport } = useSport();

    // Redirect to Golf Dashboard if sports mode is GOLF
    if (currentSport === 'GOLF') {
        return <GolfDashboard />;
    }

    // Local State for Ranking Tab
    const [rankingTab, setRankingTab] = useState<'3c' | '4c'>('4c');

    // Use Custom Hook for Data
    const { member, history, rankings, analysis, isLoading } = useDashboardStats(rankingTab);

    // Dedicated 3-cushion ranking list, fetched independently of the ranking tab so the
    // header '상위 N%' percentile is computed against the correct 3c population even when
    // the bottom 매장 랭킹 tab is on 4구. Shares the react-query cache with useDashboardStats'
    // rankings query when rankingTab === '3c' (same key + queryFn).
    const { data: rankings3c } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/rankings", "3c"],
        queryFn: async () => await apiRequest("/api/hiq/rankings?type=3c"),
    });

    // UI Logic Helpers (Keep strict UI logic here or move to utils if generic)
    const getPercentile = useCallback((type: '3c' | '4c') => {
        if (!member) return null;

        // Pick a population that matches the requested type, independent of the ranking tab.
        // (3c always uses the dedicated 3c list; 4c only meaningful when the tab is on 4c.)
        const source = type === '3c' ? rankings3c : (rankingTab === '4c' ? rankings : null);
        if (!source) return null;

        const field = type === '3c' ? 'rating3c' : 'rating4c';
        const ranked = source
            .filter(r => (r[field] ?? 0) > 0)
            .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

        // Match by member id (not score value) so ties / duplicate scores don't mis-rank.
        const myIndex = ranked.findIndex(r => r.id === member.id);
        if (myIndex === -1) return null;

        return Math.max(1, Math.round(((myIndex + 1) / ranked.length) * 100));
    }, [rankings, rankings3c, member, rankingTab]);

    const getTrend = useCallback(() => {
        if (!analysis?.summary) return { label: t("dashboard.trendSteady"), color: "text-black/55", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
        const overall = parseFloat(analysis.summary.overallAvg || "0");
        const recent = parseFloat(analysis.summary.recentAvg || "0");

        if (overall === 0) return { label: t("dashboard.trendNew"), color: "text-brand", icon: <LucideZap className="w-3 h-3" /> };
        if (recent > overall * 1.05) return { label: t("dashboard.trendRising"), color: "text-brand", icon: <ChevronUp className="w-3 h-3" /> };
        if (recent < overall * 0.95) return { label: t("dashboard.trendFalling"), color: "text-black/40", icon: <ChevronDown className="w-3 h-3" /> };
        return { label: t("dashboard.trendSteady"), color: "text-black/55", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
    }, [analysis, t]);

    // Live Avg Helpers
    const calculateLiveAvg = (type: '3c' | '4c') => {
        if (!history) return "0.000";
        const validGames = history.filter(g =>
            g.gameType === type &&
            g.gameMode === "match" &&
            (g as any).isRanked
        );
        if (validGames.length === 0) return "0.000";
        const totalScore = validGames.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = validGames.reduce((acc, g) => acc + g.innings, 0);
        return totalInnings > 0 ? (totalScore / totalInnings).toFixed(3) : "0.000";
    };

    const getTier = (avg: number, is3c: boolean) => {
        // 1. Base Tier (Absolute Evaluation by Average)
        let tier = { label: t("dashboard.tierBronze"), class: "tier-bronze", icon: "🥉" };
        if (is3c) {
            if (avg >= 0.90) tier = { label: t("dashboard.tierPlatinum"), class: "tier-platinum", icon: "💎" };
            else if (avg >= 0.56) tier = { label: t("dashboard.tierGold"), class: "tier-gold", icon: "🥇" };
            else if (avg >= 0.36) tier = { label: t("dashboard.tierSilver"), class: "tier-silver", icon: "🥈" };
        } else {
            if (avg >= 5.00) tier = { label: t("dashboard.tierPlatinum"), class: "tier-platinum", icon: "💎" };
            else if (avg >= 3.00) tier = { label: t("dashboard.tierGold"), class: "tier-gold", icon: "🥇" };
            else if (avg >= 1.51) tier = { label: t("dashboard.tierSilver"), class: "tier-silver", icon: "🥈" };
        }
        return tier;
    };


    // Modal State Management
    const [modalState, setModalState] = useState({
        game: false,
        join: false,
        score: false,
        rpGuide: false
    });

    const [startGameMode, setStartGameMode] = useState<"practice" | "match">("practice");

    const toggleModal = (key: keyof typeof modalState, value: boolean) => {
        setModalState(prev => ({ ...prev, [key]: value }));
    };

    const handleStartGameClick = (mode: "practice" | "match") => {
        setStartGameMode(mode);
        toggleModal('game', true);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-black/10 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    if (!member) return null; // Or redirect

    return (
        <div className="min-h-screen bg-[#f2f0eb] px-5 pb-32">

            {/* Header / Profile */}
            <DashboardHeader
                member={member}
                onOpenRpGuide={() => toggleModal('rpGuide', true)}
                liveAvg3c={calculateLiveAvg('3c')}
                liveAvg4c={calculateLiveAvg('4c')}
                getPercentile={getPercentile}
                getTrend={getTrend}
                tier={getTier(parseFloat(analysis?.summary?.overallAvg || "0"), false)}
            />

            {/* 전적 (승률 게이지 + 최근 폼) */}
            <PerformanceCard history={history} />

            {/* Action Buttons */}
            <QuickActions
                onStartGame={handleStartGameClick}
                onJoinGame={() => toggleModal('join', true)}
            />

            {/* Ranking List - Newly Added */}
            <RankingListCard
                rankings={rankings}
                activeTab={rankingTab}
                onTabChange={setRankingTab}
                currentMemberId={member.id}
            />

            {/* Modals */}
            <GameCreationModal
                open={modalState.game}
                onOpenChange={(v) => toggleModal('game', v)}
                member={member}
                history={history}
                initialMode={startGameMode}
            />

            <PinCodeModal
                open={modalState.join}
                onOpenChange={(v) => toggleModal('join', v)}
            />

            <ScoreCorrectionModal
                open={modalState.score}
                onOpenChange={(v) => toggleModal('score', v)}
                member={member}
            />

            <RPGuideModal
                open={modalState.rpGuide}
                onOpenChange={(v) => toggleModal('rpGuide', v)}
            />

            <HiqNavigation />
        </div>
    );
}
