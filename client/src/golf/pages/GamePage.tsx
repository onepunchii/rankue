import { useRoute, useLocation } from "wouter";
import {
    LucideChevronLeft,
    LucideChevronRight,
    LucideFlag,
    LucideTrophy,
    LucideCoins,
    LucideMenu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRankueMatch } from "../hooks/useRankueMatch";
import { ScoreCard } from "../components/ScoreCard";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function GolfScorecard() {
    const [, params] = useRoute("/golf/game/:id");
    const matchId = params?.id;
    const [, setLocation] = useLocation();

    // Use new hook
    const {
        session,
        isLoading,
        currentHole,
        setCurrentHole,
        coursePar,
        handleScoreChange,
        handlePenaltyChange,
        finishMatch,
        isFinishing,
        moneyResults
    } = useRankueMatch(matchId || "");

    const [showMoney, setShowMoney] = useState(false);

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">LOADING MATCH...</div>
        </div>
    );

    // Adapt data for ScoreCard component
    const playersAdapter = session.players.map((p: any) => ({
        id: p.memberId,
        name: p.name
    }));

    const playerScoresAdapter: Record<string, number[]> = {};
    session.players.forEach((p: any) => {
        playerScoresAdapter[p.memberId] = p.scores;
    });

    const isLastHole = currentHole === 17;

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col relative">
            {/* Money Overlay (Toggle) */}
            <AnimatePresence>
                {showMoney && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute inset-x-0 top-24 z-30 p-4"
                    >
                        <div className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#FFD700]/30 rounded-3xl p-6 shadow-2xl">
                            <div className="flex items-center gap-2 mb-4">
                                <LucideCoins className="w-5 h-5 text-[#FFD700]" />
                                <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Current Standings</h3>
                            </div>
                            <div className="space-y-3">
                                {session.players.map((p: any) => {
                                    const money = moneyResults[p.memberId] || 0;
                                    return (
                                        <div key={p.memberId} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                                            <span className="font-bold">{p.name}</span>
                                            <span className={cn(
                                                "font-black tracking-tighter",
                                                money > 0 ? "text-[#FF4444]" : money < 0 ? "text-blue-400" : "text-white/40"
                                            )}>
                                                {money > 0 ? `+${money.toLocaleString()}` : money.toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <header className="p-6 flex items-center justify-between bg-gradient-to-b from-[#064e3b]/20 to-transparent border-b border-white/5 relative z-20">
                <button onClick={() => setLocation("/golf/dashboard")} title="Back to Dashboard" className="p-2 -ml-2 text-white/40 hover:text-white transition-colors">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-[#64DD17] animate-pulse" />
                        <span className="text-[9px] font-black text-[#64DD17] tracking-[0.2em] uppercase">LIVE MATCH</span>
                    </div>
                    <h1 className="text-lg font-black tracking-tighter italic">{session.courseName || "CC"}</h1>
                </div>
                <button
                    onClick={() => setShowMoney(!showMoney)}
                    title="Toggle Betting Status"
                    className={cn(
                        "p-2 -mr-2 rounded-full transition-all",
                        showMoney ? "bg-[#FFD700]/20 text-[#FFD700]" : "text-white/40 hover:text-white"
                    )}
                >
                    <LucideCoins className="w-6 h-6" />
                </button>
            </header>

            {/* Betting Status Bar */}
            <div className="px-6 pb-2 -mt-4 mb-2 relative z-20">
                <div className="bg-[#18181b] border border-[#64DD17]/30 rounded-xl p-3 flex items-center justify-between shadow-[0_0_15px_rgba(100,221,23,0.1)]">
                    <div className="flex items-center gap-2">
                        <div className="bg-[#64DD17] text-[#09090b] text-xs font-black px-2 py-0.5 rounded animate-pulse">배판 x2</div>
                        <span className="text-sm font-bold text-white">총 상금 {(session.stake * (session.players.length - 1)).toLocaleString()}원</span>
                    </div>
                    <span className="text-xs text-white/40">이월 0원</span>
                </div>
            </div>

            {/* Hole Info & Navigation */}
            <div className="px-6 py-6 flex flex-col items-center gap-6 relative z-10">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => setCurrentHole(prev => Math.max(0, prev - 1))}
                        disabled={currentHole === 0}
                        title="Previous Hole"
                        className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center disabled:opacity-20 hover:bg-white/10 transition-all border border-white/10"
                    >
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>

                    <div className="relative group cursor-pointer">
                        <div className="absolute inset-0 bg-[#64DD17]/20 blur-3xl rounded-full group-hover:bg-[#64DD17]/30 transition-all" />
                        <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-[#051907] to-[#0a0a0a] border border-[#64DD17]/30 flex flex-col items-center justify-center relative z-10 shadow-[0_0_30px_rgba(100,221,23,0.1)]">
                            <span className="text-4xl font-black italic tracking-tighter text-[#64DD17]">{currentHole + 1}</span>
                            <span className="text-[9px] font-bold text-white/40 uppercase mt-1 tracking-widest">HOLE</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setCurrentHole(prev => Math.min(17, prev + 1))}
                        disabled={currentHole === 17}
                        title="Next Hole"
                        className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center disabled:opacity-20 hover:bg-white/10 transition-all border border-white/10"
                    >
                        <LucideChevronRight className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-5 py-2 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center gap-2">
                        <LucideFlag className="w-3 h-3 text-[#64DD17]" />
                        <span className="text-xs font-black uppercase text-white/60">Par {coursePar[currentHole]}</span>
                    </div>
                </div>
            </div>

            {/* Score Cards Area */}
            <ScoreCard
                players={playersAdapter}
                playerScores={playerScoresAdapter}
                playerPenalties={session.players.reduce((acc: any, p: any) => ({ ...acc, [p.memberId]: p.penalties }), {})}
                currentHole={currentHole}
                coursePar={coursePar[currentHole]}
                onScoreChange={handleScoreChange}
                onPenaltyChange={handlePenaltyChange}
            />

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/95 to-transparent z-40">
                <div className="max-w-md mx-auto flex gap-3">
                    <Button
                        variant="ghost"
                        className="flex-1 h-16 rounded-2xl bg-[#1a1a1a] border border-white/10 text-white/40 font-black text-xs uppercase tracking-widest hover:bg-white/5 hover:text-white"
                        onClick={() => {
                            if (isLastHole) {
                                // Review Card Logic: Maybe go to hole 0 or show a summary modal? 
                                // For now, let's just cycle back to the first hole or keep it as "Next Hole" logic handled by parent
                                setCurrentHole(0);
                            } else {
                                setCurrentHole(prev => Math.min(17, prev + 1));
                            }
                        }}
                    >
                        {isLastHole ? "Review Card" : "Next Hole"}
                    </Button>
                    <Button
                        disabled={isFinishing}
                        onClick={finishMatch}
                        className="flex-[2] h-16 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm uppercase tracking-widest shadow-[0_0_30px_rgba(100,221,23,0.3)] border-none transition-all active:scale-95"
                    >
                        {isFinishing ? (
                            <span className="animate-pulse">Saving...</span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <LucideTrophy className="w-5 h-5" />
                                <span>Finish Game</span>
                            </div>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
