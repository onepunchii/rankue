import { useState, useCallback } from "react";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import GolfDashboard from "@/golf/pages/Dashboard";
import { motion } from "framer-motion";

// New Components
import { DashboardHeader } from "@/components/hiq/dashboard/DashboardHeader";
import { TrendChartCard } from "@/components/hiq/dashboard/TrendChartCard";
import { PerformanceCard } from "@/components/hiq/dashboard/PerformanceCard";
import { RankingListCard } from "@/components/hiq/dashboard/RankingListCard";
import { QuickActions } from "@/components/hiq/dashboard/QuickActions";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { PinCodeModal } from "@/components/hiq/dashboard/PinCodeModal";
import { ScoreCorrectionModal } from "@/components/hiq/dashboard/ScoreCorrectionModal";
import { RPGuideModal } from "@/components/hiq/dashboard/RPGuideModal";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { LucideRefreshCw, LucideZap, ChevronUp, ChevronDown } from "lucide-react";

export default function HiqDashboard() {
    const { currentSport } = useSport();

    // Redirect to Golf Dashboard if sports mode is GOLF
    if (currentSport === 'GOLF') {
        return <GolfDashboard />;
    }

    // Local State for Ranking Tab
    const [rankingTab, setRankingTab] = useState<'3c' | '4c'>('4c');

    // Use Custom Hook for Data
    const { member, history, rankings, analysis, isLoading } = useDashboardStats(rankingTab);

    // UI Logic Helpers (Keep strict UI logic here or move to utils if generic)
    const getPercentile = useCallback((type: '3c' | '4c') => {
        if (!rankings || !member) return null;
        if (type !== rankingTab) return null; // Only calculate for current tab

        const field = type === '3c' ? 'rating3c' : 'rating4c';
        const scores = rankings
            .map(r => r[field])
            .filter((s): s is number => (s ?? 0) > 0)
            .sort((a, b) => b - a);

        const myScore = member[field];
        if (!myScore) return null;

        const rank = scores.indexOf(myScore);
        if (rank === -1) return null;

        return Math.max(1, Math.round(((rank + 1) / scores.length) * 100));
    }, [rankings, member, rankingTab]);

    const getTrend = useCallback(() => {
        if (!analysis?.summary) return { label: "유지 중", color: "text-white/55", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
        const overall = parseFloat(analysis.summary.overallAvg || "0");
        const recent = parseFloat(analysis.summary.recentAvg || "0");

        if (overall === 0) return { label: "신규 기록", color: "text-blue-400", icon: <LucideZap className="w-3 h-3" /> };
        if (recent > overall * 1.05) return { label: "상승 중", color: "text-red-400", icon: <ChevronUp className="w-3 h-3" /> };
        if (recent < overall * 0.95) return { label: "하락 중", color: "text-gray-500", icon: <ChevronDown className="w-3 h-3" /> };
        return { label: "유지 중", color: "text-white/55", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
    }, [analysis]);

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
        let tier = { label: "브론즈", class: "tier-bronze", icon: "🥉" };
        if (is3c) {
            if (avg >= 0.90) tier = { label: "플래티넘", class: "tier-platinum", icon: "💎" };
            else if (avg >= 0.56) tier = { label: "골드", class: "tier-gold", icon: "🥇" };
            else if (avg >= 0.36) tier = { label: "실버", class: "tier-silver", icon: "🥈" };
        } else {
            if (avg >= 5.00) tier = { label: "플래티넘", class: "tier-platinum", icon: "💎" };
            else if (avg >= 3.00) tier = { label: "골드", class: "tier-gold", icon: "🥇" };
            else if (avg >= 1.51) tier = { label: "실버", class: "tier-silver", icon: "🥈" };
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
            <div className="min-h-screen bg-black flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-12 h-12 border-4 border-[#0e4d2a] border-t-[#ffd700] rounded-full"
                />
            </div>
        );
    }

    if (!member) return null; // Or redirect

    return (
        <div className="min-h-screen bg-[#0A0A0A] px-5 pb-32">

            {/* Header / Profile */}
            <DashboardHeader
                member={member}
                onOpenRpGuide={() => toggleModal('rpGuide', true)}
                liveAvg3c={calculateLiveAvg('3c')}
                liveAvg4c={calculateLiveAvg('4c')}
                getPercentile={getPercentile}
                getTrend={getTrend}
                tier={getTier(parseFloat(analysis?.summary?.avg4c || "0"), false)}
            />

            {/* 전적 (승률 게이지 + 최근 폼) */}
            <PerformanceCard history={history} />

            {/* AVG Chart */}
            <TrendChartCard history={history} />

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
