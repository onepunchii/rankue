
import { motion, AnimatePresence } from "framer-motion";
import { LucideZap, LucideTrophy, LucideTarget, LucideUserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecentOpponent, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";

interface RecentOpponentsSliderProps {
    opponents: RecentOpponent[];
    config: SportConfig;
    currentSport: string;
    onAddFriend: (id: string) => void;
}

export const RecentOpponentsSlider = ({ opponents, config, currentSport, onAddFriend }: RecentOpponentsSliderProps) => {
    if (opponents.length === 0) return null;

    return (
        <div className="mb-14 relative z-10">
            <div className="flex items-center justify-between px-2 mb-6">
                <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.bgColor)} />
                    <h2 className="text-[10px] font-black text-white/30 tracking-[0.3em] uppercase">최근 매칭 상대</h2>
                </div>
                <span className="text-[9px] font-black text-[#10b981]/60 uppercase tracking-widest">Recent Players</span>
            </div>

            <div className="flex gap-5 overflow-x-auto pb-8 scrollbar-hide -mx-6 px-6">
                <AnimatePresence>
                    {opponents.map((opponent, idx) => {
                        const handi = currentSport === "GOLF" ? opponent.golfHandicap : opponent.handi4c;
                        const tier = getTier(handi || 0, false, currentSport);
                        return (
                            <motion.div
                                key={opponent.id}
                                initial={{ opacity: 0, scale: 0.95, x: 50 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="flex-shrink-0"
                            >
                                <div className="w-72 p-8 rounded-[3rem] bg-white/[0.03] border border-white/5 relative overflow-hidden group backdrop-blur-sm">
                                    <div className={cn("absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:opacity-20 transition-colors", config.bgLight)} />

                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h3 className="text-2xl font-black text-white tracking-tighter mb-1">{opponent.name}</h3>
                                                <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full border bg-white/5 backdrop-blur-md", tier.class)}>
                                                    <span className="text-xs">{tier.icon}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest">{tier.label}</span>
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center opacity-40">
                                                <LucideZap className="w-5 h-5" />
                                            </div>
                                        </div>

                                        <div className="mb-8 p-5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Last Match</span>
                                                <span className={`text-sm font-black ${opponent.lastGameResult === 'win' ? 'text-emerald-400' : 'text-white/60'}`}>
                                                    {opponent.lastGameResult === 'win' ? 'Win' : 'Loss'} {opponent.lastGameScore}
                                                </span>
                                            </div>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${opponent.lastGameResult === 'win' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/5 text-white/20'}`}>
                                                {opponent.lastGameResult === 'win' ? <LucideTrophy className="w-4 h-4" /> : <LucideTarget className="w-4 h-4" />}
                                            </div>
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => onAddFriend(opponent.id)}
                                            className={cn(
                                                "w-full py-4 rounded-2xl border font-black text-xs flex items-center justify-center gap-2 transition-all shadow-xl",
                                                "bg-white/5 hover:text-black",
                                                currentSport === "GOLF"
                                                    ? "hover:bg-[#84cc16] border-white/10 hover:border-[#84cc16]"
                                                    : "hover:bg-[#10b981] border-white/10 hover:border-[#10b981]"
                                            )}
                                        >
                                            <LucideUserPlus className="w-4 h-4" />
                                            {config.actionText}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
};
