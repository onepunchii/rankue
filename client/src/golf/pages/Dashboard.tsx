import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ScorecardScanner } from "../components/ScorecardScanner";
import { apiRequest } from "@/lib/queryClient";
import { useGameStats } from "@/hooks/useGameStats";

// Components
import { GolfHeader } from "../components/dashboard/GolfHeader";
import { HandicapCard } from "../components/dashboard/HandicapCard";
import { QuickActions } from "../components/dashboard/QuickActions";
import { StatsChart } from "../components/dashboard/StatsChart";
import { MyCrewCard } from "../components/dashboard/MyCrewCard";
import { HotDealTicker } from "../components/dashboard/HotDealTicker";
import { GameModeSheet } from "../components/dashboard/GameModeSheet";
import { PinEntrySheet } from "../components/dashboard/PinEntrySheet";
import { ActiveRoundCard } from "../components/dashboard/ActiveRoundCard";

// Hooks
import { useGolfMatch } from "../hooks/useGolfMatch";
import { useGolfStats } from "../hooks/useGolfStats";

export default function GolfDashboard() {
    const queryClient = useQueryClient();
    // 1. Identity & Profile
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    // 2. UI State & Logic
    const [isGameModeOpen, setIsGameModeOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const matchLogic = useGolfMatch(me);
    const [, setLocation] = useLocation();

    // 로그인 전에 초대 링크를 눌렀던 사람 — 로그인 뒤 여기서 이어서 들어간다(App.tsx GolfOnly 가 핀을 남긴다).
    useEffect(() => {
        if (!me?.golfAccess) return;
        try {
            const pin = sessionStorage.getItem("rankue_golf_pending_pin");
            if (!pin) return;
            sessionStorage.removeItem("rankue_golf_pending_pin");
            setLocation(`/golf/game/new?mode=join&pin=${encodeURIComponent(pin)}`);
        } catch { /* 저장소를 못 쓰는 환경 */ }
    }, [me?.golfAccess, setLocation]);

    // 3. Game History Data (Master Record)
    const { data: history = [] } = useQuery({
        // Key shape MUST match useGolfStats/usePassportData (["/api/hiq/history", { sport: "GOLF" }])
        // so they share one cache entry and a single invalidation refreshes all of them.
        queryKey: ["/api/hiq/history", { sport: "GOLF" }],
        queryFn: async () => await apiRequest("/api/hiq/history?sport=GOLF")
    });

    // 4. Official Stats & Calculated Handicap
    // This hook is what calculates the 82.0 in the History page
    const officialStats = useGameStats(history, "all", "GOLF", me);
    const { recentScores } = useGolfStats(me); // Legacy formatting for graph

    const handleScanComplete = () => {
        setIsScannerOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
    };

    // Calculate display score (derived from history first to match scorecard)
    const effectiveAvg = officialStats.cumulativeAverage !== "0.0"
        ? officialStats.cumulativeAverage
        : (me?.golfAvgScore ? Number(me.golfAvgScore).toFixed(1) : "0.0");

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-32 font-sans relative overflow-x-hidden">
            {/* Background Texture/Gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#64DD17]/5 rounded-full blur-[128px] -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#64DD17]/5 rounded-full blur-[96px] translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* Header & Identity */}
            <GolfHeader member={me} />
            <ActiveRoundCard />
            <HotDealTicker />
            <HandicapCard
                member={me}
                avgScore={effectiveAvg}
            />

            {/* Main Actions */}
            <QuickActions
                onOpenGameMode={() => setIsGameModeOpen(true)}
                onOpenJoin={() => matchLogic.setIsJoinOpen(true)}
            />

            {/* Dashboard Widgets */}
            <StatsChart
                recentScores={recentScores}
                stats={{
                    bestScore: officialStats.bestScore,
                    totalRounds: officialStats.totalGames,
                    avgScore: effectiveAvg
                }}
            />
            <MyCrewCard />

            {/* Modals & Sheets */}
            <GameModeSheet
                open={isGameModeOpen}
                onOpenChange={setIsGameModeOpen}
                onOpenScanner={() => setIsScannerOpen(true)}
            />

            <PinEntrySheet
                open={matchLogic.isJoinOpen}
                onOpenChange={matchLogic.setIsJoinOpen}
                pinEntry={matchLogic.pinEntry}
                onKeyPress={matchLogic.handleKeypadPress}
                onDelete={matchLogic.handleDelete}
                onSetDigits={matchLogic.handleSetDigits}
                error={matchLogic.error}
                isLoading={matchLogic.isLoading}
            />

            {isScannerOpen && (
                <ScorecardScanner
                    onClose={() => setIsScannerOpen(false)}
                    onComplete={handleScanComplete}
                />
            )}

            <HiqNavigation />
        </div>
    );
}
