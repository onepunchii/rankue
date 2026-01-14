import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { BalanceGame } from "../../../shared/schema";
import { Crown } from "lucide-react";

interface BalanceGameCardProps {
    game: BalanceGame;
    onVote: (gameId: number, choice: 'A' | 'B') => Promise<void>;
    userVote?: 'A' | 'B' | null;
}

export function BalanceGameCard({ game, onVote, userVote: initialUserVote }: BalanceGameCardProps) {
    const [voted, setVoted] = useState<'A' | 'B' | null>(initialUserVote || null);
    const [isVoting, setIsVoting] = useState(false);

    // Calculate Percentages
    const countA = game.countA || 0;
    const countB = game.countB || 0;
    const totalVotes = countA + countB;
    const percentA = totalVotes === 0 ? 50 : Math.round((countA / totalVotes) * 100);
    const percentB = totalVotes === 0 ? 50 : 100 - percentA;

    useEffect(() => {
        setVoted(initialUserVote || null);
    }, [initialUserVote]);

    const handleVote = async (choice: 'A' | 'B') => {
        if (voted || isVoting) return;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(50);
        }

        setIsVoting(true);
        // We set voted state optimistically or wait for parent?
        // For the new stack flow, we might want to wait or do it immediately. 
        // The user prompt implies immediate visual feedback then transition.

        try {
            await onVote(game.id, choice);
            setVoted(choice);
        } catch (e) {
            console.error(e);
        } finally {
            setIsVoting(false);
        }
    }

    const optionA = game.optionA as any;
    const optionB = game.optionB as any;

    return (
        <div className="w-full relative rounded-3xl overflow-hidden cursor-pointer select-none group h-[420px] flex flex-col border border-white/5 bg-black/50 backdrop-blur-2xl shadow-2xl transition-transform active:scale-[0.99]">

            {/* Header / Title Area */}
            <div className="relative z-30 pt-8 pb-4 px-6 text-center pointer-events-none">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-2 block drop-shadow-md">
                    {game.category} BALANCE
                </span>
                <h2 className="text-2xl font-black text-white leading-tight drop-shadow-lg line-clamp-2">
                    {game.title}
                </h2>
            </div>

            {/* Content Area - Fixed Layout */}
            <div className="flex-1 relative flex items-stretch w-full overflow-hidden mt-2">

                {/* [Left] Option A - Violet */}
                <div
                    className={cn(
                        "flex-1 relative flex flex-col items-center justify-end pb-10 cursor-pointer transition-all duration-300",
                        !voted && "hover:bg-white/5"
                    )}
                    onClick={() => handleVote('A')}
                >
                    {/* Vertical Fill Animation (Background Layer) */}
                    <div className="absolute inset-0 flex items-end w-full h-full overflow-hidden rounded-bl-3xl">
                        <motion.div
                            initial={{ height: "0%" }}
                            animate={{ height: voted ? `${percentA}%` : "0%" }}
                            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
                            className="w-full bg-gradient-to-t from-violet-600/40 via-violet-900/10 to-transparent border-t border-violet-400/50 shadow-[0_-8px_20px_-5px_rgba(124,58,237,0.5)]"
                        />
                    </div>

                    {/* Content Layer */}
                    <div className="relative z-10 flex flex-col items-center w-full h-full justify-center">
                        <motion.div
                            className="text-6xl mb-6 filter drop-shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-transform duration-500"
                            animate={voted === 'A' ? { scale: 1.15, y: -15 } : { scale: 1, y: 0 }}
                        >
                            {optionA?.emoji || "🟣"}
                        </motion.div>

                        <h3 className={cn(
                            "text-white font-bold text-xl leading-none text-center transition-all drop-shadow-md px-4",
                            voted === 'A' ? "text-violet-100 drop-shadow-[0_0_10px_rgba(167,139,250,0.8)]" : "text-gray-400"
                        )}>
                            {optionA?.text || "A"}
                        </h3>

                        {optionA?.keyword && (
                            <span className="mt-3 text-[10px] font-bold text-violet-200/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                {optionA.keyword}
                            </span>
                        )}

                        {/* Percentage Text */}
                        {voted && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="mt-6 z-20"
                            >
                                <span className="text-5xl font-black italic tracking-tighter text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                    {percentA}%
                                </span>
                            </motion.div>
                        )}

                        {/* Winner Badge */}
                        {voted && percentA > percentB && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute top-6 z-30"
                            >
                                <Crown className="w-6 h-6 text-yellow-300 fill-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.6)]" />
                            </motion.div>
                        )}
                    </div>
                </div>


                {/* [Center] Divider & VS */}
                <div className="absolute inset-y-0 left-1/2 w-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="h-full w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                    {/* Simplified Neon Toggle VS */}
                    <div className="absolute z-30">
                        <span className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-emerald-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-pulse">
                            VS
                        </span>
                    </div>
                </div>


                {/* [Right] Option B - Emerald */}
                <div
                    className={cn(
                        "flex-1 relative flex flex-col items-center justify-end pb-10 cursor-pointer transition-all duration-300",
                        !voted && "hover:bg-white/5"
                    )}
                    onClick={() => handleVote('B')}
                >
                    {/* Vertical Fill Animation */}
                    <div className="absolute inset-0 flex items-end w-full h-full overflow-hidden rounded-br-3xl">
                        <motion.div
                            initial={{ height: "0%" }}
                            animate={{ height: voted ? `${percentB}%` : "0%" }}
                            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
                            className="w-full bg-gradient-to-t from-emerald-500/40 via-emerald-900/10 to-transparent border-t border-emerald-300/50 shadow-[0_-8px_20px_-5px_rgba(52,211,153,0.5)]"
                        />
                    </div>

                    {/* Content Layer */}
                    <div className="relative z-10 flex flex-col items-center w-full h-full justify-center">
                        {/* Emoji */}
                        <motion.div
                            className="text-6xl mb-6 filter drop-shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-transform duration-500"
                            animate={voted === 'B' ? { scale: 1.15, y: -15 } : { scale: 1, y: 0 }}
                        >
                            {optionB?.emoji || "🟢"}
                        </motion.div>

                        <h3 className={cn(
                            "text-white font-bold text-xl leading-none text-center transition-all drop-shadow-md px-4",
                            voted === 'B' ? "text-emerald-100 drop-shadow-[0_0_10px_rgba(110,231,183,0.8)]" : "text-gray-400"
                        )}>
                            {optionB?.text || "B"}
                        </h3>

                        {optionB?.keyword && (
                            <span className="mt-3 text-[10px] font-bold text-emerald-200/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                {optionB.keyword}
                            </span>
                        )}

                        {/* Percentage Text */}
                        {voted && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="mt-6 z-20"
                            >
                                <span className="text-5xl font-black italic tracking-tighter text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] bg-clip-text">
                                    {percentB}%
                                </span>
                            </motion.div>
                        )}

                        {/* Winner Badge */}
                        {voted && percentB > percentA && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute top-6 z-30"
                            >
                                <Crown className="w-6 h-6 text-yellow-300 fill-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.6)]" />
                            </motion.div>
                        )}
                    </div>
                </div>

            </div>

            {/* Voting Overlay Spinner */}
            {isVoting && (
                <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
                </div>
            )}
        </div>
    );
}
