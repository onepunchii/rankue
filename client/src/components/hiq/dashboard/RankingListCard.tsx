import { useState } from "react";
import { HiqMember } from "@shared/schema";
import { cn } from "@/lib/utils";
import { LucideTrophy, LucideTrendingUp, LucideInfo } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RankingListCardProps {
    rankings: HiqMember[] | undefined;
    activeTab: '3c' | '4c';
    onTabChange: (type: '3c' | '4c') => void;
    currentMemberId: number | string;
}

export const RankingListCard = ({ rankings, activeTab, onTabChange, currentMemberId }: RankingListCardProps) => {

    // Sort logic (just in case API didn't sort, though it should)
    // 3c -> rating3c desc, 4c -> rating4c desc
    const sortedRankings = rankings ? [...rankings].sort((a, b) => {
        const field = activeTab === '3c' ? 'rating3c' : 'rating4c';
        return ((b[field] || 0) - (a[field] || 0));
    }) : [];

    // Filter out users with 0 RP if needed, or keep them. Let's keep top 10.
    const displayRankings = sortedRankings.filter(r => (activeTab === '3c' ? r.rating3c : r.rating4c) !== undefined).slice(0, 10);

    return (
        <div className="space-y-4 mb-10 px-2 sm:px-0">
            <header className="mb-2 px-2 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter text-white">CLUB RANKING</h1>
                    <p className="text-white/50 text-xs mt-1 flex items-center gap-1 font-bold">
                        <LucideTrophy className="w-3 h-3 text-[#ffd700]" /> 실시간 매장 랭킹 TOP 10
                    </p>
                </div>

                {/* Minimal Tab Switch */}
                <div className="flex bg-[#18181b] p-1 rounded-xl border border-white/10 relative h-9">
                    <div className={cn(
                        "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out z-0",
                        activeTab === '3c' ? "left-1 bg-[#64DD17]/20 border border-[#64DD17]/30" : "left-[calc(50%+2px)] bg-blue-500/20 border border-blue-500/30"
                    )} />
                    <button
                        onClick={() => onTabChange('3c')}
                        className={cn("px-3 rounded-lg text-xs font-bold relative z-10 transition-colors", activeTab === '3c' ? "text-[#64DD17]" : "text-white/40")}
                    >3C</button>
                    <button
                        onClick={() => onTabChange('4c')}
                        className={cn("px-3 rounded-lg text-xs font-bold relative z-10 transition-colors", activeTab === '4c' ? "text-blue-500" : "text-white/40")}
                    >4B</button>
                </div>
            </header>

            <div className="flex flex-col gap-2">
                <AnimatePresence mode="popLayout">
                    {displayRankings.map((member, idx) => {
                        const isMe = String(member.id) === String(currentMemberId);
                        const rank = idx + 1;
                        const rp = activeTab === '3c' ? member.rating3c : member.rating4c;
                        const avg = member.average || "0.000"; // Note: Average might be overall, not specific to type here unless schema supports separate averages well. Using generic average for now or specific if available.
                        // Ideally we show type specific stats. Let's assume average is general or we just show RP.

                        // Style for top 3
                        let rankStyle = "bg-white/5 text-gray-500";
                        if (rank === 1) rankStyle = "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
                        if (rank === 2) rankStyle = "bg-gray-300/20 text-gray-300 border-gray-300/50";
                        if (rank === 3) rankStyle = "bg-amber-700/20 text-amber-700 border-amber-700/50";

                        return (
                            <motion.div
                                key={member.id}
                                layoutId={member.id.toString()}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2, delay: idx * 0.05 }}
                                className={cn(
                                    "flex items-center p-3 rounded-2xl border transition-all relative overflow-hidden group",
                                    isMe ? "bg-[#10b981]/10 border-[#10b981]/30" : "bg-white/[0.03] border-white/5"
                                )}
                            >
                                {/* Rank Badge */}
                                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg border", rankStyle)}>
                                    {rank}
                                </div>

                                {/* Info */}
                                <div className="ml-4 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("font-bold text-sm", isMe ? "text-white" : "text-white/80")}>
                                            {member.name}
                                        </span>
                                        {isMe && <span className="text-[9px] font-black bg-[#10b981] text-black px-1.5 rounded-md">ME</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-bold text-white/30">AVG {member.average}</span>
                                    </div>
                                </div>

                                {/* Score (RP) */}
                                <div className="text-right px-2">
                                    <span className={cn("block font-black text-xl tracking-tighter", activeTab === '3c' ? "text-[#64DD17]" : "text-blue-500")}>
                                        {rp || 0}
                                    </span>
                                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">RP</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {displayRankings.length === 0 && (
                    <div className="py-10 text-center text-white/20 text-xs font-bold">
                        랭킹 데이터가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};
