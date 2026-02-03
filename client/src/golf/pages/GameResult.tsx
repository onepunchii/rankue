import { useRoute, useLocation } from "wouter";
import { useRankueMatch, COURSE_PAR } from "../hooks/useRankueMatch";
import { useState } from "react";
import { LucideTrophy, LucideHome, LucideListChecks, LucideCoins, LucideShare2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ScorecardModal from "../components/ScorecardModal";
import { Button } from "@/components/ui/button";

export default function GameResult() {
    const [, params] = useRoute("/golf/game/:id/result");
    const matchId = params?.id;
    const [, setLocation] = useLocation();

    const { session, isLoading, moneyResults } = useRankueMatch(matchId || "");
    const [isScorecardOpen, setIsScorecardOpen] = useState(false);

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">CALCULATING RESULTS...</div>
        </div>
    );

    // Sort players by Money Won (descending)
    const sortedPlayers = [...session.players].sort((a, b) => {
        const moneyA = moneyResults[a.memberId] || 0;
        const moneyB = moneyResults[b.memberId] || 0;
        return moneyB - moneyA;
    });

    const mvp = sortedPlayers[0];
    const mvpMoney = moneyResults[mvp.memberId] || 0;

    // Prepare data for ScorecardModal
    const scorecardPlayers = session.players.map((p: any) => ({
        id: p.memberId,
        name: p.name,
        avatar: p.memberId === session.hostId ? "👑" : "🧢", // Simple avatar logic
        scores: p.scores || Array(18).fill(0),
        total: (p.scores || []).reduce((a: number, b: number) => a + (b || 0), 0)
    }));

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-y-auto pb-20">
            {/* 1. Header Area with MVP Highlight */}
            <div className="relative pt-12 pb-8 px-6 bg-gradient-to-b from-[#64DD17]/10 to-transparent">
                <div className="text-center mb-6">
                    <span className="inline-block px-3 py-1 rounded-full bg-[#64DD17]/10 text-[#64DD17] text-[10px] font-black tracking-widest mb-2 border border-[#64DD17]/20">
                        GAME FINISHED
                    </span>
                    <h1 className="text-2xl font-black italic tracking-tighter">{session.courseName}</h1>
                    <p className="text-white/40 text-xs mt-1">{new Date(session.createdAt).toLocaleDateString()}</p>
                </div>

                {/* MVP Card */}
                <div className="bg-gradient-to-br from-[#1a1a1a] to-black border border-[#FFD700]/30 rounded-[2rem] p-6 shadow-[0_0_30px_rgba(255,215,0,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <LucideTrophy className="w-24 h-24 text-[#FFD700]" />
                    </div>

                    <div className="flex flex-col items-center relative z-10">
                        <div className="w-20 h-20 rounded-full bg-[#FFD700]/10 border border-[#FFD700]/50 flex items-center justify-center text-3xl mb-3 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                            👑
                        </div>
                        <div className="text-[#FFD700] text-xs font-black tracking-widest uppercase mb-1">MOST VALUABLE PLAYER</div>
                        <div className="text-2xl font-black text-white mb-2">{mvp.name}</div>
                        <div className="bg-[#FFD700] text-black font-black text-xl px-4 py-1 rounded-lg">
                            +{mvpMoney.toLocaleString()}원
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Action Button (Scorecard) */}
            <div className="flex justify-center mb-8 px-6">
                <button
                    onClick={() => setIsScorecardOpen(true)}
                    className="w-full py-4 rounded-2xl bg-[#18181b] border border-white/10 text-white/70 text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#27272a] hover:text-white transition-all active:scale-95 group"
                >
                    <LucideListChecks className="w-5 h-5 text-[#64DD17] group-hover:scale-110 transition-transform" />
                    상세 스코어카드 보기
                </button>
            </div>

            {/* 3. Ranking List */}
            <div className="px-6 space-y-3">
                <h3 className="text-xs font-black text-white/30 uppercase tracking-widest mb-4">Final Standings</h3>
                {sortedPlayers.map((player, idx) => {
                    const money = moneyResults[player.memberId] || 0;
                    const totalScore = (player.scores || []).reduce((a: number, b: number) => a + (b || 0), 0);

                    return (
                        <div key={player.memberId} className="flex items-center justify-between p-4 rounded-2xl bg-[#18181b] border border-white/5">
                            <div className="flex items-center gap-4">
                                <span className={cn(
                                    "font-black text-lg w-4 text-center",
                                    idx === 0 ? "text-[#FFD700]" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-amber-600" : "text-white/20"
                                )}>{idx + 1}</span>
                                <div>
                                    <div className="font-bold text-sm">{player.name}</div>
                                    <div className="text-xs text-white/40 font-medium">Total {totalScore} ({totalScore - 72})</div>
                                </div>
                            </div>
                            <div className={cn(
                                "font-black text-lg tracking-tight",
                                money > 0 ? "text-[#FF4444]" : money < 0 ? "text-blue-400" : "text-white/40"
                            )}>
                                {money > 0 ? `+${money.toLocaleString()}` : money.toLocaleString()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 4. Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/95 to-transparent z-40 flex gap-3">
                <Button
                    variant="ghost"
                    className="flex-1 h-16 rounded-2xl bg-[#1a1a1a] text-white/40 hover:text-white hover:bg-[#27272a]"
                    onClick={() => console.log("Share")}
                >
                    <LucideShare2 className="w-5 h-5 mr-2" /> 공유
                </Button>
                <Button
                    className="flex-[2] h-16 rounded-2xl bg-[#64DD17] text-[#051907] font-black text-lg hover:bg-[#76ff03]"
                    onClick={() => setLocation("/golf/dashboard")}
                >
                    <LucideHome className="w-5 h-5 mr-2" /> 대시보드 홈
                </Button>
            </div>

            {/* Scorecard Modal */}
            <ScorecardModal
                isOpen={isScorecardOpen}
                onClose={() => setIsScorecardOpen(false)}
                courseName={session.courseName}
                pars={COURSE_PAR} // Should come from session ideally
                players={scorecardPlayers}
            />
        </div>
    );
}
