
import { motion, AnimatePresence } from "framer-motion";
import { LucideZap, LucideUserPlus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { RecentOpponent, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";
import { FormBadges, MatchResult } from "@/components/hiq/ui/FormBadges";

interface RecentOpponentsSliderProps {
    opponents: RecentOpponent[];
    config: SportConfig;
    currentSport: string;
    onAddFriend: (id: string) => void;
}

export const RecentOpponentsSlider = ({ opponents, config, currentSport, onAddFriend }: RecentOpponentsSliderProps) => {
    if (opponents.length === 0) return null;

    return (
        <div className="mb-10 relative z-10">
            <div className="flex items-center justify-between px-1 mb-4">
                <h2 className="text-[15px] font-semibold text-black/60">최근 매칭 상대</h2>
                <span className="text-[12px] font-medium text-black/55">최근 플레이어</span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
                <AnimatePresence>
                    {opponents.map((opponent, idx) => {
                        const golfScore = Number((opponent.golfAvgScore || 0) > 0 ? opponent.golfAvgScore : (opponent.golfHandicap || 0) + 72);
                        const handi = currentSport === "GOLF" ? golfScore : opponent.handi4c;
                        const tier = getTier(Number(handi || 0), false, currentSport);
                        const lastForm: MatchResult = opponent.lastGameResult === 'win' ? 'W' : opponent.lastGameResult === 'loss' ? 'L' : 'D';
                        return (
                            <motion.div
                                key={opponent.id}
                                initial={{ opacity: 0, scale: 0.95, x: 50 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="flex-shrink-0"
                            >
                                <div className="w-72 p-6 rk-card">
                                    <div>
                                        <div className="flex justify-between items-start mb-5">
                                            <div>
                                                <h3 className="text-[22px] font-bold text-ink-1 mb-1.5 tracking-tight">{opponent.name}</h3>
                                                <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-black/[0.04]", tier.class)}>
                                                    <span className="text-xs">{tier.icon}</span>
                                                    <span className="text-[12px] font-semibold">{tier.label}</span>
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-tile bg-black/[0.04] flex items-center justify-center overflow-hidden text-black/40">
                                                {(opponent as any).profileImageUrl ? (
                                                    <img
                                                        src={(opponent as any).profileImageUrl}
                                                        className="w-full h-full object-cover"
                                                        alt={opponent.name}
                                                    />
                                                ) : (
                                                    <LucideZap className="w-5 h-5 opacity-40" />
                                                )}
                                            </div>
                                        </div>

                                        <div className="mb-6 p-4 rounded-tile bg-black/[0.04] flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-medium text-black/55 mb-1">최근 경기</span>
                                                <span className={`text-[15px] font-bold tabular-nums ${opponent.lastGameResult === 'win' ? 'text-brand' : 'text-black/60'}`}>
                                                    {opponent.lastGameResult === 'win' ? '승' : '패'} {opponent.lastGameScore}
                                                </span>
                                            </div>
                                            <FormBadges results={[lastForm]} size={32} />
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => onAddFriend(opponent.id)}
                                            className="w-full py-3.5 rounded-tile rk-btn-secondary text-[13px] flex items-center justify-center gap-2"
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
