import { motion, AnimatePresence } from "framer-motion";
import { LucideCalendar, LucideHistory } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { SportConfig, ExtendedGameHistory } from "./types";

interface HistoryListProps {
    history: ExtendedGameHistory[];
    config: SportConfig;
    onGameClick: (gameId: string) => void;
    currentSport: string;
}

export const HistoryList = ({ history, config, onGameClick, currentSport }: HistoryListProps) => {
    return (
        <>
            <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2 text-white/55">
                <config.mainIcon className="w-4 h-4 text-brand" />
                {config.listTitle}
            </h3>
            <div className="space-y-2.5">
                <AnimatePresence mode="popLayout">
                    {history.length > 0 ? (
                        history.map((game, idx) => (
                            <motion.div
                                key={game.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                                onClick={() => onGameClick(game.id)}
                                className="rk-card p-4 cursor-pointer active:bg-surface-2 transition-colors"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex gap-1.5">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand/12 text-brand border border-brand/20 text-[12px] font-semibold">
                                            <span className="w-1 h-1 rounded-full bg-brand" /> 공식
                                        </span>
                                        <span className="px-2 py-0.5 bg-white/[0.05] border border-white/10 rounded-lg text-[12px] font-semibold text-white/55">
                                            {game.gameType === "3c" ? "3구" : (currentSport === "GOLF" ? "18H" : "4구")}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-white/40 text-[12px] font-medium">
                                        <LucideCalendar className="w-3 h-3" />
                                        {format(new Date(game.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                                    </div>
                                </div>

                                {/* Golf Course Name Display */}
                                {currentSport === "GOLF" && game.locationName && (
                                    <div className="mb-2">
                                        <h4 className="text-white font-semibold text-[17px] leading-tight flex items-end gap-2">
                                            {game.locationName}
                                            {game.subType && (
                                                <span className="text-[12px] text-white/50 font-medium mb-0.5">{game.subType}</span>
                                            )}
                                        </h4>
                                    </div>
                                )}

                                <div className="flex justify-between items-end">
                                    <div className="flex items-center gap-5">
                                        <div>
                                            <p className="text-white/45 text-[12px] font-medium mb-0.5">{config.unit}</p>
                                            <p className="text-[22px] font-bold text-white tabular-nums leading-none">{game.score}</p>
                                        </div>
                                        <div className="w-px h-6 bg-white/10" />
                                        <div>
                                            <p className="text-white/45 text-[12px] font-medium mb-0.5">{currentSport === "GOLF" ? "홀" : "이닝"}</p>
                                            <p className="text-[22px] font-bold text-white tabular-nums leading-none">{game.innings}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-brand text-[12px] font-semibold mb-0.5">{currentSport === "GOLF" ? "평균 타수" : "평균"}</p>
                                        <p className="text-[28px] font-bold text-white leading-none tracking-tight tabular-nums">
                                            {currentSport === "GOLF" ? game.score : game.average}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="py-24 text-center"
                        >
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-5 border border-white/10">
                                <LucideHistory className="w-8 h-8 text-white/45" />
                            </div>
                            <p className="text-white font-semibold text-[17px] mb-1.5">인증된 경기 기록이 없습니다</p>
                            <p className="text-white/45 text-[13px] font-medium leading-relaxed">실제 회원들과 대결하여<br />공식 기록을 남겨보세요</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};
