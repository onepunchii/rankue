import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ScorecardScanner } from "../components/ScorecardScanner";
import { apiRequest } from "@/lib/queryClient";
import { useGameStats } from "@/hooks/useGameStats";
import { useAuth } from "@/hooks/useAuth";
import { GuestJoinCta } from "@/components/hiq/GuestGate";
import { GUEST_SAMPLE } from "@shared/guestSample";

// Components
import { GolfHeader } from "../components/dashboard/GolfHeader";
import { HandicapCard } from "../components/dashboard/HandicapCard";
import { QuickActions } from "../components/dashboard/QuickActions";
import { StatsChart } from "../components/dashboard/StatsChart";
import { MyCrewCard } from "../components/dashboard/MyCrewCard";
import { GolfRankingCard } from "../components/dashboard/GolfRankingCard";
import { HotDealTicker } from "../components/dashboard/HotDealTicker";
import { GameModeSheet } from "../components/dashboard/GameModeSheet";
import { PinEntrySheet } from "../components/dashboard/PinEntrySheet";
import { ActiveRoundCard } from "../components/dashboard/ActiveRoundCard";
import { CourseHomeEntry } from "../components/course/list/CourseHomeEntry";

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
    // 비로그인 방문자(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다").
    // 골프 홈을 그대로 열고, 내 기록이 들어갈 자리(큰 숫자·스코어 트렌드)는 예시 인물의 숫자로 채운다 — 카드마다 "예시" 표시가 붙는다.
    // 회원이면 sample 은 null 이라 아래 화면이 예전과 한 글자도 다르지 않다. 로그인 확인이 끝난 뒤에만 방문자로 본다(isGuest).
    const { isGuest } = useAuth();
    const sample = isGuest ? GUEST_SAMPLE.golf : null;

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
        queryFn: async () => await apiRequest("/api/hiq/history?sport=GOLF"),
        // 비로그인은 부르지 않는다 — 내 기록은 로그인 필수라 401 만 돌아온다(useGolfStats 의 같은 쿼리도 같이 잠근다)
        enabled: !!me,
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

    // golf-home: 홈은 굵기를 낮추지 않는다(2026-09-21 오너: "홈은 바꾸면 안 돼, 두께가 생명이라") — index.css 골프 블록 참고
    return (
        <div className="golf-home min-h-screen bg-[#0A0A0A] text-white p-6 pb-32 font-sans relative overflow-x-hidden">
            {/* Background Texture/Gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#64DD17]/5 rounded-full blur-[128px] -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#64DD17]/5 rounded-full blur-[96px] translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* Header & Identity */}
            <GolfHeader member={me} />
            {/* 진행 중 라운드·긴급티는 회원의 것이다 — 비로그인에게는 두 카드가 스스로 숨는다(부르지도 않는다) */}
            <ActiveRoundCard />
            <HotDealTicker />
            <HandicapCard
                member={sample ? sample.member : me}
                avgScore={sample ? sample.avgScore : effectiveAvg}
                sample={!!sample}
            />
            {/* 예시 숫자 바로 아래 — 이 숫자가 어떻게 생기는지와 가입으로 가는 길.
                '골프장에서': 홈의 큰 숫자와 그래프는 현장 인증된 라운드만 센다(예시도 그런 라운드로 만든 숫자다) — 조건을 빼면 집에서 적고 0.0 을 본다 */}
            {sample && (
                <GuestJoinCta
                    tone="dark"
                    title="가입하면 내 스코어가 이렇게 쌓여요"
                    desc="골프장에서 라운드를 적으면 핸디캡과 그래프가 만들어져요"
                    className="relative z-10 mb-8"
                />
            )}

            {/* Main Actions */}
            <QuickActions
                onOpenGameMode={() => setIsGameModeOpen(true)}
                onOpenJoin={() => matchLogic.setIsJoinOpen(true)}
            />

            {/* 전국 골프장(2026-09-24) — 골프장 목록·지역·부킹/조인/긴급 허브의 입구 */}
            <CourseHomeEntry />

            {/* Dashboard Widgets */}
            <StatsChart
                recentScores={sample ? sample.recentScores : recentScores}
                stats={sample ? sample.stats : {
                    bestScore: officialStats.bestScore,
                    totalRounds: officialStats.totalGames,
                    avgScore: effectiveAvg
                }}
                sample={!!sample}
            />
            <GolfRankingCard />
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
