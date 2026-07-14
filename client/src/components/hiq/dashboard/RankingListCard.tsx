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
        <div className="space-y-4 mb-10">
            <header className="mb-2 flex items-end justify-between">
                <div>
                    <h2 className="text-[19px] font-bold tracking-tight text-ink-1">매장 랭킹</h2>
                    <p className="text-black/55 text-[13px] mt-1 flex items-center gap-1.5 font-medium">
                        <LucideTrophy className="w-3.5 h-3.5 text-[#cba258]" /> 실시간 상위 10명
                    </p>
                </div>

                {/* Minimal Tab Switch */}
                <div className="flex bg-black/[0.04] p-1 rounded-xl relative h-9">
                    <div className={cn(
                        "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out z-0",
                        activeTab === '3c' ? "left-1 bg-brand/15 border border-brand/25" : "left-[calc(50%+2px)] bg-brand/12 border border-brand/25"
                    )} />
                    <button
                        onClick={() => onTabChange('3c')}
                        className={cn("px-3.5 rounded-lg text-[13px] font-semibold relative z-10 transition-colors", activeTab === '3c' ? "text-brand" : "text-black/55")}
                    >3쿠션</button>
                    <button
                        onClick={() => onTabChange('4c')}
                        className={cn("px-3.5 rounded-lg text-[13px] font-semibold relative z-10 transition-colors", activeTab === '4c' ? "text-brand" : "text-black/55")}
                    >4구</button>
                </div>
            </header>

            <div className="flex flex-col gap-2">
                <AnimatePresence mode="popLayout">
                    {displayRankings.map((member, idx) => {
                        const isMe = String(member.id) === String(currentMemberId);
                        const rank = idx + 1;
                        const rp = activeTab === '3c' ? member.rating3c : member.rating4c;
                        const isTop3 = rank <= 3;
                        // Refined medal accents for the podium; plain muted numerals below.
                        const medal = rank === 1 ? "bg-[#cba258]/12 text-[#cba258]"
                            : rank === 2 ? "bg-slate-400/15 text-slate-500"
                                : "bg-orange-400/15 text-orange-500";
                        const rpColor = activeTab === '3c' ? "text-brand" : "text-brand";

                        return (
                            <motion.div
                                key={member.id}
                                layoutId={member.id.toString()}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2, delay: idx * 0.05 }}
                                className={cn(
                                    "flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-colors",
                                    isMe ? "bg-brand/[0.07]" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                )}
                            >
                                {/* Rank */}
                                <div className="w-9 flex justify-center shrink-0">
                                    {isTop3 ? (
                                        <div className={cn("w-9 h-9 rounded-tile flex items-center justify-center font-bold text-[16px] tabular-nums", medal)}>
                                            {rank}
                                        </div>
                                    ) : (
                                        <span className="font-semibold text-[16px] tabular-nums text-black/40">{rank}</span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className={cn("font-semibold text-[15px] truncate", isMe ? "text-ink-1" : "text-black/70")}>
                                            {member.name}
                                        </span>
                                        {isMe && <span className="shrink-0 px-1.5 py-px rounded-full text-[12px] font-semibold text-brand bg-brand/12">나</span>}
                                    </div>
                                    <span className="block text-[12px] font-medium text-black/40 tabular-nums mt-0.5">평균 {member.average || "0.000"}</span>
                                </div>

                                {/* Score (RP) */}
                                <div className="flex items-baseline gap-1 shrink-0">
                                    <span className={cn("font-bold text-[20px] tabular-nums tracking-tight", rpColor)}>
                                        {rp || 0}
                                    </span>
                                    <span className="text-[12px] font-semibold text-black/40">RP</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {displayRankings.length === 0 && (
                    <div className="py-12 text-center text-black/40 text-[14px] font-medium">
                        아직 랭킹 데이터가 없습니다
                    </div>
                )}
            </div>
        </div>
    );
};
