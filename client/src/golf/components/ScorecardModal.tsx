import { useState } from 'react';
import { LucideX, LucideFlag } from 'lucide-react';
import { cn } from "@/lib/utils";

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

// Fallback Mock Data if no props provided
const MOCK_PARS = [4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4];

export default function ScorecardModal({
    isOpen,
    onClose,
    courseName = "88 CC",
    pars = MOCK_PARS,
    players = []
}: ScorecardModalProps) {
    const [view, setView] = useState<'OUT' | 'IN'>('OUT');

    if (!isOpen) return null;

    // Use passed pars or fill with 4 if data is missing/short
    const displayPars = pars.length === 18 ? pars : [...pars, ...Array(18 - pars.length).fill(4)];

    const startIdx = view === 'OUT' ? 0 : 9;
    const endIdx = view === 'OUT' ? 9 : 18;

    const getScoreStyle = (score: number, par: number) => {
        if (!score) return "text-white/20"; // No score yet
        const diff = score - par;
        if (diff < 0) return "bg-[#64DD17] text-[#09090b] font-black border border-[#64DD17]";
        if (diff === 0) return "text-white font-bold";
        if (diff === 1) return "bg-blue-500/20 text-blue-400 font-bold";
        return "bg-[#27272a] text-white/40 font-bold";
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-2xl bg-[#09090b] rounded-none md:rounded-3xl h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#18181b]">
                    <div>
                        <h2 className="text-xl font-black italic tracking-tighter">SCORECARD</h2>
                        <p className="text-xs text-white/40">{courseName} • {new Date().toLocaleDateString()}</p>
                    </div>
                    <button onClick={onClose} title="닫기" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white">
                        <LucideX className="w-6 h-6" />
                    </button>
                </div>

                {/* Course Tab */}
                <div className="flex bg-[#121212] p-2 gap-2">
                    <button
                        onClick={() => setView('OUT')}
                        className={cn("flex-1 py-3 rounded-xl text-sm font-black transition-colors", view === 'OUT' ? "bg-[#64DD17] text-[#09090b]" : "text-white/30 hover:bg-white/5")}
                    >
                        OUT COURSE (1-9)
                    </button>
                    <button
                        onClick={() => setView('IN')}
                        className={cn("flex-1 py-3 rounded-xl text-sm font-black transition-colors", view === 'IN' ? "bg-[#64DD17] text-[#09090b]" : "text-white/30 hover:bg-white/5")}
                    >
                        IN COURSE (10-18)
                    </button>
                </div>

                {/* Grid Table */}
                <div className="flex-1 overflow-x-auto overflow-y-auto p-4 bg-[#09090b]">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-left sticky left-0 bg-[#09090b] z-10 min-w-[120px]">
                                    <span className="text-xs font-bold text-white/30">PLAYER</span>
                                </th>
                                {displayPars.slice(startIdx, endIdx).map((par, i) => (
                                    <th key={i} className="p-2 min-w-[50px] text-center">
                                        <div className="text-[10px] text-white/30 mb-1">{startIdx + i + 1}H</div>
                                        <div className="text-xs font-bold text-white/50">P{par}</div>
                                    </th>
                                ))}
                                <th className="p-2 min-w-[60px] text-center bg-[#18181b]">
                                    <div className="text-xs font-black text-[#64DD17]">TOT</div>
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-white/5">
                            {players.map((player) => (
                                <tr key={player.id}>
                                    <td className="p-3 sticky left-0 bg-[#09090b] z-10 border-r border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#18181b] flex items-center justify-center text-sm border border-white/10">
                                                {player.avatar || "👤"}
                                            </div>
                                            <div className="font-bold text-sm truncate max-w-[80px]">{player.name}</div>
                                        </div>
                                    </td>

                                    {player.scores.slice(startIdx, endIdx).map((score, i) => (
                                        <td key={i} className="p-2 text-center">
                                            <div className={cn(
                                                "w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm",
                                                getScoreStyle(score, displayPars[startIdx + i])
                                            )}>
                                                {score || "-"}
                                            </div>
                                        </td>
                                    ))}

                                    <td className="p-2 text-center bg-[#18181b] font-black text-lg text-white">
                                        {player.total}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer Summary */}
                <div className="p-4 border-t border-white/5 bg-[#121212] flex justify-between text-xs text-white/30">
                    <div className="flex gap-3">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#64DD17]" /> 버디 (Under)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/50" /> 보기 (Over)</span>
                    </div>
                    <div>RANKUE OFFICIAL SCORECARD</div>
                </div>
            </div>
        </div>
    );
}
