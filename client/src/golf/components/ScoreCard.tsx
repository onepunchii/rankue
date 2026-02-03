
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HiqMember } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

import { LucideWaves, LucideXCircle } from "lucide-react";

interface ScoreCardProps {
    players: Array<{ id: string; name: string }>;
    playerScores: Record<string, number[]>;
    // New: Penalty Data
    playerPenalties?: Record<string, Array<{ ob: boolean; hazard: boolean }>>;
    currentHole: number;
    coursePar: number;
    onScoreChange: (playerId: string, diff: number) => void;
    onPenaltyChange?: (playerId: string, type: 'ob' | 'hazard') => void;
}

export function ScoreCard({ players, playerScores, playerPenalties = {}, currentHole, coursePar, onScoreChange, onPenaltyChange }: ScoreCardProps) {
    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    return (
        <div className="flex-1 overflow-y-auto px-6 pb-40 space-y-4">
            {players.map((p) => {
                const pId = p.id;
                const scores = playerScores[pId] || Array(18).fill(0);
                const penalties = playerPenalties[pId] || Array(18).fill({});
                const currentPenalty = penalties[currentHole] || { ob: false, hazard: false };

                const holeScore = scores[currentHole] || coursePar;
                const totalScore = scores.reduce((a, b) => a + (b || 0), 0);
                const relativeToPar = scores.slice(0, currentHole + 1).reduce((acc, s, idx) => acc + (s ? s - coursePar : 0), 0);

                return (
                    <Card key={pId} className="bg-white/[0.03] border-white/5 rounded-[2rem] overflow-hidden group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-xl shadow-inner">
                                        {pId === member?.id ? "👑" : "🧢"}
                                    </div>
                                    <div>
                                        <p className="font-black text-lg tracking-tight">{p.name}</p>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-widest",
                                                relativeToPar > 0 ? "text-red-400" : relativeToPar < 0 ? "text-blue-400" : "text-white/40"
                                            )}>
                                                {relativeToPar > 0 ? `+${relativeToPar}` : relativeToPar === 0 ? "EVEN" : relativeToPar}
                                            </span>
                                            <span className="text-[10px] text-white/20 font-bold">•</span>
                                            <span className="text-[10px] text-white/20 font-bold uppercase">Total {totalScore}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => onScoreChange(pId, -1)}
                                    title="타수 줄이기"
                                    className="w-16 h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center border border-white/10"
                                >
                                    <span className="text-2xl font-black text-white/40">-</span>
                                </button>

                                <div className="flex-1 h-16 bg-black/40 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group/input">
                                    <div className="absolute inset-0 bg-[#84cc16]/5 opacity-0 group-hover/input:opacity-100 transition-opacity" />
                                    <span className="text-3xl font-black italic tracking-tighter text-white z-10">{holeScore}</span>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] z-10">STROKES</span>
                                </div>

                                <button
                                    onClick={() => onScoreChange(pId, 1)}
                                    title="타수 늘리기"
                                    className="w-16 h-16 rounded-2xl bg-[#84cc16] hover:bg-[#a3e635] active:scale-90 transition-all flex items-center justify-center shadow-[0_10px_20px_rgba(132,204,22,0.2)]"
                                >
                                    <span className="text-2xl font-black text-black">+</span>
                                </button>
                            </div>

                            {/* Score Name Display (e.g., Birdie, Bogey) */}
                            <div className="mt-4 text-center">
                                <span className={cn(
                                    "text-sm font-black uppercase tracking-[0.3em] transition-all duration-300",
                                    holeScore - coursePar === -1 ? "text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)] scale-110" :
                                        holeScore - coursePar === -2 ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] scale-125" :
                                            holeScore - coursePar === 0 ? "text-white/60" :
                                                holeScore - coursePar === 1 ? "text-orange-400" :
                                                    holeScore - coursePar >= 2 ? "text-red-500 font-extrabold" : "text-white/40"
                                )}>
                                    {(() => {
                                        const diff = holeScore - coursePar;
                                        if (diff === -3) return "Albatross";
                                        if (diff === -2) return "Eagle";
                                        if (diff === -1) return "Birdie";
                                        if (diff === 0) return "Par";
                                        if (diff === 1) return "Bogey";
                                        if (diff === 2) return "Double Bogey";
                                        if (diff === 3) return "Triple Bogey";
                                        return `${diff > 0 ? '+' : ''}${diff} Over`;
                                    })()}
                                </span>
                            </div>

                            {/* Penalty Toggles */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => onPenaltyChange?.(pId, 'ob')}
                                    className={cn(
                                        "flex-1 h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
                                        currentPenalty.ob
                                            ? "bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                                            : "bg-[#27272a] border-transparent text-white/30 hover:bg-[#3f3f46]"
                                    )}
                                >
                                    <LucideXCircle className="w-3.5 h-3.5" /> OB
                                </button>
                                <button
                                    onClick={() => onPenaltyChange?.(pId, 'hazard')}
                                    className={cn(
                                        "flex-1 h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
                                        currentPenalty.hazard
                                            ? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                                            : "bg-[#27272a] border-transparent text-white/30 hover:bg-[#3f3f46]"
                                    )}
                                >
                                    <LucideWaves className="w-3.5 h-3.5" /> HAZARD
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
