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
import { WorldRankingCard } from "@/components/hiq/umb/WorldRankingCard";
import { QuickActions } from "@/components/hiq/dashboard/QuickActions";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { PinCodeModal } from "@/components/hiq/dashboard/PinCodeModal";
import { ScoreCorrectionModal } from "@/components/hiq/dashboard/ScoreCorrectionModal";
import { RPGuideModal } from "@/components/hiq/dashboard/RPGuideModal";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { LucideRefreshCw, LucideZap, ChevronUp, ChevronDown } from "@/lib/icons";
import { useT } from "@/lib/i18n";

import { useLocation } from "wouter";

// 서버 GET /api/hiq/rankings 는 항상 상위 20명만 잘라서 준다(getTopRankings(storeId, 20, type)).
// 응답 길이가 이 값에 닿았다면 뒤에 몇 명이 더 있는지 알 수 없다.
const RANKINGS_API_LIMIT = 20;

export default function HiqDashboard() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { currentSport } = useSport();

    // Redirect to Golf Dashboard if sports mode is GOLF
    if (currentSport === 'GOLF') {
        return <GolfDashboard />;
    }

    // Local State for Ranking Tab
    const [rankingTab, setRankingTab] = useState<'3c' | '4c'>('4c');
    // 랭킹 섹션 소스 — 기본 세계(UMB), 토글로 매장
    const [rankingSource, setRankingSource] = useState<'world' | 'store'>('world');

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

        // 목록이 상한에 걸렸으면 이건 매장 전체가 아니라 '상위 20명'일 뿐이다.
        // 이걸 모집단으로 쓰면 회원 400명 매장에서도 "상위 50%" 같은 거짓 숫자가 나오므로,
        // 모집단을 확신할 수 없을 땐 백분위를 포기한다(DashboardHeader는 null이면 '분석 중'을 띄운다).
        if (source.length >= RANKINGS_API_LIMIT) return null;

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

            {/* 프로필 완성 넛지 — 가입에서 설정으로 옮긴 선택 정보(성별·출생연도) 채움 유도 */}
            {member && (!(member as any).gender || !(member as any).birthYear) && (
                <button
                    onClick={() => setLocation("/settings")}
                    className="w-full mb-4 px-4 py-3 rounded-tile bg-brand/10 border border-brand/25 flex items-center justify-between text-left active:scale-[0.99] transition-transform"
                >
                    <span className="text-[13px] font-semibold text-brand">{t("dashboard.completeProfile")}</span>
                    <span className="text-[12px] text-brand/70">{t("dashboard.completeProfileCta")}</span>
                </button>
            )}

            {/* 전적 (승률 게이지 + 최근 폼) */}
            <PerformanceCard history={history} />

            {/* Action Buttons */}
            <QuickActions
                onStartGame={handleStartGameClick}
                onJoinGame={() => toggleModal('join', true)}
            />

            {/* 랭킹 섹션 — 기본은 UMB 세계랭킹(볼거리·매주 갱신), 매장 랭킹은 토글로.
                매장 데이터가 쌓이면 기본값 재검토 (오너 결정 2026-08-05) */}
            <div className="mb-10">
                <header className="mb-4 flex items-end justify-between">
                    <div>
                        <h2 className="text-[19px] font-bold tracking-tight text-ink-1">
                            {rankingSource === "world" ? t("umb.title") : t("rankingListCard.title")}
                        </h2>
                        <p className="text-black/55 text-[13px] mt-1 font-medium">
                            {rankingSource === "world" ? t("umb.subtitle") : t("rankingListCard.subtitle")}
                        </p>
                    </div>
                    <div className="flex bg-brand/[0.08] p-1 rounded-full relative h-9">
                        <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-brand transition-all duration-300 ease-out z-0 shadow-[0_1px_3px_rgba(0,98,65,0.25)] ${rankingSource === "world" ? "left-1" : "left-[calc(50%+2px)]"}`} />
                        <button
                            onClick={() => setRankingSource("world")}
                            className={`px-3.5 rounded-full text-[13px] font-bold relative z-10 transition-colors ${rankingSource === "world" ? "text-white" : "text-brand/60"}`}
                        >{t("umb.sourceWorld")}</button>
                        <button
                            onClick={() => setRankingSource("store")}
                            className={`px-3.5 rounded-full text-[13px] font-bold relative z-10 transition-colors ${rankingSource === "store" ? "text-white" : "text-brand/60"}`}
                        >{t("umb.sourceStore")}</button>
                    </div>
                </header>

                {rankingSource === "world" ? (
                    <WorldRankingCard />
                ) : (
                    <RankingListCard
                        rankings={rankings}
                        activeTab={rankingTab}
                        onTabChange={setRankingTab}
                        currentMemberId={member.id}
                        hideHeader
                    />
                )}
            </div>

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
