import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ScorecardScanner } from "../components/ScorecardScanner";

// Components
import { GolfHeader } from "../components/dashboard/GolfHeader";
import { HandicapCard } from "../components/dashboard/HandicapCard";
import { QuickActions } from "../components/dashboard/QuickActions";
import { StatsChart } from "../components/dashboard/StatsChart";
import { MyCrewCard } from "../components/dashboard/MyCrewCard";
import { Ticker } from "../components/dashboard/Ticker";
import { GameModeSheet } from "../components/dashboard/GameModeSheet";
import { PinEntrySheet } from "../components/dashboard/PinEntrySheet";

// Hooks
import { useGolfMatch } from "../hooks/useGolfMatch";
import { useGolfStats } from "../hooks/useGolfStats";

export default function GolfDashboard() {
    const queryClient = useQueryClient();
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    // UI State
    const [isGameModeOpen, setIsGameModeOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Business Logic Hooks
    const matchLogic = useGolfMatch(me);
    const { recentScores, stats } = useGolfStats(me);

    const handleScanComplete = () => {
        setIsScannerOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-32 font-sans relative overflow-x-hidden">
            {/* Background Texture/Gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#64DD17]/5 rounded-full blur-[128px] -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#64DD17]/5 rounded-full blur-[96px] translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* Header & Identity */}
            <GolfHeader member={me} />
            <HandicapCard member={me} />

            {/* Main Actions */}
            <QuickActions
                onOpenGameMode={() => setIsGameModeOpen(true)}
                onOpenJoin={() => matchLogic.setIsJoinOpen(true)}
            />

            {/* Dashboard Widgets */}
            <StatsChart recentScores={recentScores} stats={stats} />
            <MyCrewCard />
            <Ticker />

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

// Helper Mutation Logic (Added inside component for simplicity, in real production move to separate hook)
// Need to add this inside GolfDashboard function before return
/* 
    // Join Match Mutation
    const joinMatch = useMutation({
        mutationFn: async (pin: string) => {
            const res = await apiRequest("/api/hiq/golf/match/join", {
                method: "POST",
                body: {
                    pin,
                    memberId: me?.id,
                    name: me?.name
                }
            });
            return res.json();
        },
        onSuccess: (data) => {
            toast({ title: "입장 성공!", description: "대기실로 이동합니다.. 🚀" });
            setIsJoinOpen(false);
            setLocation(`/golf/game/${data.id}`);
        },
        onError: (e: any) => {
            toast({ variant: "destructive", title: "입장 실패", description: "핀 번호를 다시 확인해주세요." });
            setPinEntry([]);
        }
    });
*/

