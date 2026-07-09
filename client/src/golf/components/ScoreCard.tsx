import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HiqMember } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { LucideWaves, LucideXCircle } from "lucide-react";

interface ScoreCardProps {
    players: Array<{ id: string; name: string }>;
    playerScores: Record<string, number[]>;
    playerPenalties?: Record<string, Array<{ ob: boolean; hazard: boolean }>>;
    currentHole: number;
    pars: number[];
    onScoreChange: (playerId: string, diff: number) => void;
    onPenaltyChange?: (playerId: string, type: 'ob' | 'hazard') => void;
    isSolo?: boolean;
    isHost?: boolean;
}

import { useGolfScore, calculateGolfScore } from "../hooks/useGolfScore";
import { useState } from "react";

export function ScoreCard({ players, playerScores, playerPenalties = {}, currentHole, pars, onScoreChange, onPenaltyChange, isSolo = false, isHost = true }: ScoreCardProps) {
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const currentHolePar = pars[currentHole];

    return (
        <div className={cn(
            "overflow-y-auto px-6 space-y-4",
            isSolo ? "pb-4" : "pb-40 flex-1"
        )}>
            {players.map((p) => {
                const pId = p.id;
                const scores = playerScores[pId] || Array(18).fill(0);
                const penalties = playerPenalties[pId] || Array(18).fill({});
                const currentPenalty = penalties[currentHole] || { ob: false, hazard: false };

                const { totalStrokes, currentOverPar } = calculateGolfScore(scores, pars, 18, currentHole);
                const holeScore = scores[currentHole] || currentHolePar;

                return (
                    <Card
                        key={pId}
                        className={cn(
                            "bg-white/[0.03] border-white/5 rounded-[2rem] overflow-hidden group transition-all duration-300 cursor-pointer active:scale-[0.99]",
                            expandedPlayerId === pId && "bg-white/[0.07] border-white/10 ring-1 ring-white/10"
                        )}
                        onClick={() => setExpandedPlayerId(expandedPlayerId === pId ? null : pId)}
                    >
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-xl shadow-inner">
                                        {pId === member?.id ? "👑" : "🧢"}
                                    </div>
                                    <div>
                                        <p className="font-black text-lg tracking-tight">{p.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-end gap-2 leading-none">
                                    <span className={cn(
                                        "text-3xl font-black italic tracking-tighter",
                                        currentOverPar > 0 ? "text-[#FF4444]" : currentOverPar < 0 ? "text-cyan-400" : "text-white/60"
                                    )}>
                                        {currentOverPar > 0 ? `+${currentOverPar}` : currentOverPar === 0 ? "E" : currentOverPar}
                                    </span>
                                    <span className="text-white/30 text-2xl font-black mb-0.5">/</span>
                                    <span className="text-white/70 text-2xl font-black mb-0.5">{totalStrokes}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {isHost && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onScoreChange(pId, -1);
                                        }}
                                        title="타수 줄이기"
                                        className="w-16 h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center border border-white/10 relative z-10"
                                    >
                                        <span className="text-2xl font-black text-white/40">-</span>
                                    </button>
                                )}

                                <div className="flex-1 h-16 bg-black/40 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group/input">
                                    <div className="absolute inset-0 bg-[#84cc16]/5 opacity-0 group-hover/input:opacity-100 transition-opacity" />
                                    <span className="text-3xl font-black italic tracking-tighter text-white z-10">{holeScore}</span>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] z-10">STROKES</span>
                                </div>

                                {isHost && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onScoreChange(pId, 1);
                                        }}
                                        title="타수 늘리기"
                                        className="w-16 h-16 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] active:scale-90 transition-all flex items-center justify-center shadow-[0_10px_20px_rgba(100,221,23,0.2)] relative z-10"
                                    >
                                        <span className="text-2xl font-black text-[#051907]">+</span>
                                    </button>
                                )}
                            </div>

                            {/* Score Name Display (e.g., Birdie, Bogey) */}
                            <div className="mt-4 text-center">
                                <span className={cn(
                                    "text-sm font-black uppercase tracking-[0.3em] transition-all duration-300",
                                    holeScore - currentHolePar <= -2 ? "text-[#64DD17] drop-shadow-[0_0_10px_rgba(100,221,23,0.5)] scale-125" :
                                        holeScore - currentHolePar === -1 ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] scale-110" :
                                            holeScore - currentHolePar === 0 ? "text-slate-400" :
                                                holeScore - currentHolePar === 1 ? "text-orange-400" :
                                                    holeScore - currentHolePar >= 2 ? "text-red-500 font-extrabold" :
                                                        "text-slate-400"
                                )}>
                                    {(() => {
                                        const diff = holeScore - currentHolePar;
                                        if (diff <= -3) return "앨버트로스";
                                        if (diff === -2) return "이글";
                                        if (diff === -1) return "버디";
                                        if (diff === 0) return "파";
                                        if (diff === 1) return "보기";
                                        if (diff === 2) return "더블 보기";
                                        if (diff >= 3) return "트리플 보기 이상";
                                        return `${diff > 0 ? '+' : ''}${diff} 오버`;
                                    })()}
                                </span>
                            </div>

                            {/* Dropdown Scorecard Grid */}
                            <AnimatePresence>
                                {expandedPlayerId === pId && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-6 pt-6 border-t border-white/5 overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="space-y-4">
                                            {/* Front 9 */}
                                            <div className="grid grid-cols-10 gap-1">
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center border-b border-white/5 pb-1 uppercase italic">Hole</div>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                                                    <div key={h} className="text-[8px] font-bold text-white/40 flex items-center justify-center border-b border-white/5 pb-1">{h}</div>
                                                ))}
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center border-b border-white/5 pb-1 uppercase italic">Par</div>
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                                                    <div key={idx} className="text-[8px] font-bold text-white/60 flex items-center justify-center border-b border-white/5 pb-1">{pars[idx]}</div>
                                                ))}
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center py-2 uppercase italic">Score</div>
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => {
                                                    const s = scores[idx] || 0;
                                                    const p = pars[idx];
                                                    // Batch Update: If score is 0 and it's current hole, treat as Par (0 diff)
                                                    const d = s > 0 ? s - p : (idx <= currentHole ? 0 : null);
                                                    const isCur = idx === currentHole;
                                                    let bg = "bg-white/5";
                                                    let tx = "text-white/20";
                                                    if (d !== null) {
                                                        tx = "text-white";
                                                        if (d <= -2) { bg = "bg-[#64DD17]"; tx = "text-[#051907]"; }
                                                        else if (d === -1) { bg = "bg-cyan-500"; }
                                                        else if (d === 0) { bg = "bg-[#4A4E57]"; }
                                                        else if (d === 1) { bg = "bg-orange-500"; }
                                                        else { bg = "bg-red-500"; }
                                                    }
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "aspect-square flex flex-col items-center justify-center rounded-md text-[9px] font-black",
                                                            bg, tx, isCur && "ring-1 ring-[#64DD17] ring-offset-1 ring-offset-black"
                                                        )}>
                                                            {d !== null ? (d === 0 ? "0" : (d > 0 ? `+${d}` : d)) : "-"}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Back 9 */}
                                            <div className="grid grid-cols-10 gap-1">
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center border-b border-white/5 pb-1 uppercase italic">Hole</div>
                                                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                                                    <div key={h} className="text-[8px] font-bold text-white/40 flex items-center justify-center border-b border-white/5 pb-1">{h}</div>
                                                ))}
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center border-b border-white/5 pb-1 uppercase italic">Par</div>
                                                {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(idx => (
                                                    <div key={idx} className="text-[8px] font-bold text-white/60 flex items-center justify-center border-b border-white/5 pb-1">{pars[idx]}</div>
                                                ))}
                                                <div className="text-[8px] font-bold text-white/20 flex items-center justify-center py-2 uppercase italic">Score</div>
                                                {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(idx => {
                                                    const s = scores[idx] || 0;
                                                    const p = pars[idx];
                                                    // Batch Update: If score is 0 and it's current hole, treat as Par (0 diff)
                                                    const d = s > 0 ? s - p : (idx <= currentHole ? 0 : null);
                                                    const isCur = idx === currentHole;
                                                    let bg = "bg-white/5";
                                                    let tx = "text-white/20";
                                                    if (d !== null) {
                                                        tx = "text-white";
                                                        if (d <= -2) { bg = "bg-[#64DD17]"; tx = "text-[#051907]"; }
                                                        else if (d === -1) { bg = "bg-cyan-500"; }
                                                        else if (d === 0) { bg = "bg-[#4A4E57]"; }
                                                        else if (d === 1) { bg = "bg-orange-500"; }
                                                        else { bg = "bg-red-500"; }
                                                    }
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "aspect-square flex flex-col items-center justify-center rounded-md text-[9px] font-black",
                                                            bg, tx, isCur && "ring-1 ring-[#64DD17] ring-offset-1 ring-offset-black"
                                                        )}>
                                                            {d !== null ? (d === 0 ? "0" : (d > 0 ? `+${d}` : d)) : "-"}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
