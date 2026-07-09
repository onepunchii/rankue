import { useState } from 'react';
import { LucideX, LucideTrophy, LucideChevronDown, LucideChevronUp } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ScorecardModalProps {
    isOpen: boolean;
    onClose: () => void;
    courseName?: string;
    pars?: number[];
    players?: Array<{
        id: string;
        name: string;
        avatar?: string;
        scores: number[];
        total: number;
    }>;
}

const MOCK_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

export default function ScorecardModal({
    isOpen,
    onClose,
    courseName = "GOLF COURSE",
    pars = MOCK_PARS,
    players = []
}: ScorecardModalProps) {
    // Default to expanding the first player or all? Let's manage expanded state.
    // If only one player, expand by default.
    const [expandedPlayerIds, setExpandedPlayerIds] = useState<string[]>(players.length > 0 ? [players[0].id] : []);

    if (!isOpen) return null;

    // Use passed pars or fill with 4
    const displayPars = pars.length === 18 ? pars : [...pars, ...Array(18 - pars.length).fill(4)];

    const togglePlayer = (id: string) => {
        setExpandedPlayerIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const calculateStats = (scores: number[]) => {
        let totalStrokes = 0;
        let totalPar = 0;

        scores.forEach((score, idx) => {
            if (score > 0) {
                totalStrokes += score;
                totalPar += displayPars[idx];
            }
        });

        const diff = totalStrokes - totalPar;
        return { totalStrokes, diff };
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-md bg-[#09090b] h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden border border-white/10 shadow-2xl md:rounded-[2rem]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#18181b]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#64DD17]/10 flex items-center justify-center text-[#64DD17]">
                            <LucideTrophy className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black italic tracking-tighter text-white">SCORE CARD</h2>
                            <p className="text-xs text-white/40 font-bold uppercase tracking-wider">{courseName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                        aria-label="Close"
                        title="Close"
                    >
                        <LucideX className="w-6 h-6 text-white/60" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {players.map((player) => {
                        const { totalStrokes, diff } = calculateStats(player.scores);
                        const isExpanded = expandedPlayerIds.includes(player.id);

                        return (
                            <div key={player.id} className="bg-white/[0.03] border border-white/5 rounded-[1.5rem] overflow-hidden">
                                {/* Player Summary Header */}
                                <div
                                    className="p-5 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors"
                                    onClick={() => togglePlayer(player.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-[#27272a] border border-white/10 flex items-center justify-center text-sm overflow-hidden">
                                            {player.avatar ? (
                                                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                                            ) : (
                                                "👤"
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-black text-lg text-white leading-none mb-1">{player.name}</div>
                                            <div className={cn(
                                                "text-xs font-bold",
                                                diff < 0 ? "text-[#64DD17]" : diff > 0 ? "text-[#FF4444]" : "text-white/40"
                                            )}>
                                                {diff === 0 ? "E (Even)" : `${diff > 0 ? '+' : ''}${diff} (${totalStrokes})`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="text-[10px] font-bold text-white/30 uppercase">TOTAL</div>
                                            <div className="text-xl font-black text-white italic">{totalStrokes}</div>
                                        </div>
                                        {isExpanded ? <LucideChevronUp className="w-5 h-5 text-white/20" /> : <LucideChevronDown className="w-5 h-5 text-white/20" />}
                                    </div>
                                </div>

                                {/* Expanded Grid */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-white/5 bg-black/20"
                                        >
                                            <div className="p-4 space-y-4">
                                                {/* Front 9 */}
                                                <div>
                                                    <div className="grid grid-cols-10 gap-x-1 gap-y-2">
                                                        {/* Headers */}
                                                        <div className="text-[9px] text-white/30 font-bold text-center">H</div>
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => <div key={h} className="text-[9px] text-white/30 font-bold text-center">{h}</div>)}

                                                        <div className="text-[9px] text-white/30 font-bold text-center">P</div>
                                                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="text-[9px] text-white/50 font-bold text-center">{displayPars[i]}</div>)}

                                                        <div className="text-[9px] text-white/30 font-bold text-center mt-1">S</div>
                                                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
                                                            const s = player.scores[i] || 0;
                                                            return (
                                                                <div key={i} className={cn(
                                                                    "aspect-square rounded flex items-center justify-center text-xs font-black",
                                                                    s === 0 ? "text-white/10" :
                                                                        s < displayPars[i] ? "bg-[#64DD17] text-black" :
                                                                            s > displayPars[i] ? "bg-[#FF4444]/20 text-[#FF4444]" :
                                                                                "bg-white/10 text-white"
                                                                )}>
                                                                    {s || "-"}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Back 9 */}
                                                <div>
                                                    <div className="grid grid-cols-10 gap-x-1 gap-y-2">
                                                        {/* Headers */}
                                                        <div className="text-[9px] text-white/30 font-bold text-center">H</div>
                                                        {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => <div key={h} className="text-[9px] text-white/30 font-bold text-center">{h}</div>)}

                                                        <div className="text-[9px] text-white/30 font-bold text-center">P</div>
                                                        {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(i => <div key={i} className="text-[9px] text-white/50 font-bold text-center">{displayPars[i]}</div>)}

                                                        <div className="text-[9px] text-white/30 font-bold text-center mt-1">S</div>
                                                        {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(i => {
                                                            const s = player.scores[i] || 0;
                                                            return (
                                                                <div key={i} className={cn(
                                                                    "aspect-square rounded flex items-center justify-center text-xs font-black",
                                                                    s === 0 ? "text-white/10" :
                                                                        s < displayPars[i] ? "bg-[#64DD17] text-black" :
                                                                            s > displayPars[i] ? "bg-[#FF4444]/20 text-[#FF4444]" :
                                                                                "bg-white/10 text-white"
                                                                )}>
                                                                    {s || "-"}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-white/5 bg-[#121212] text-center">
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Rankue Official Records</p>
                </div>
            </div>
        </div>
    );
}
