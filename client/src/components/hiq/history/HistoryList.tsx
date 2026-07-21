import { motion, AnimatePresence } from "framer-motion";
import { LucideCalendar, LucideHistory } from "@/lib/icons";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { SportConfig, ExtendedGameHistory } from "./types";
import { useT } from "@/lib/i18n";

interface HistoryListProps {
    history: ExtendedGameHistory[];
    config: SportConfig;
    onGameClick: (gameId: string) => void;
    currentSport: string;
}

export const HistoryList = ({ history, config, onGameClick, currentSport }: HistoryListProps) => {
    const { t } = useT();
    return (
        <>
            <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2 text-black/55">
                <config.mainIcon className="w-4 h-4 text-brand" />
                {t(config.listTitle)}
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
                                            <span className="w-1 h-1 rounded-full bg-brand" /> {t("historyList.official")}
                                        </span>
                                        <span className="px-2 py-0.5 bg-black/[0.04] rounded-lg text-[12px] font-semibold text-black/55">
                                            {game.gameType === "3c" ? t("historyList.threeBall") : (currentSport === "GOLF" ? "18H" : t("historyList.fourBall"))}
                                        </span>
                                        {currentSport !== "GOLF" && (game.isWinner === true || game.isWinner === false) && (
                                            <span className={
                                                "px-2 py-0.5 rounded-lg border text-[12px] font-bold " +
                                                (game.isWinner
                                                    ? "bg-brand/12 text-brand border-brand/20"
                                                    : "bg-red-500/12 text-red-600 border-red-500/20")
                                            }>
                                                {game.isWinner ? t("historyList.win") : t("historyList.loss")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-black/40 text-[12px] font-medium">
                                        <LucideCalendar className="w-3 h-3" />
                                        {format(new Date(game.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                                    </div>
                                </div>

                                {/* Golf Course Name Display */}
                                {currentSport === "GOLF" && game.locationName && (
                                    <div className="mb-2">
                                        <h4 className="text-[rgba(0,0,0,0.87)] font-semibold text-[17px] leading-tight flex items-end gap-2">
                                            {game.locationName}
                                            {game.subType && (
                                                <span className="text-[12px] text-black/55 font-medium mb-0.5">{game.subType}</span>
                                            )}
                                        </h4>
                                    </div>
                                )}

                                <div className="flex justify-between items-end">
                                    <div className="flex items-center gap-5">
                                        <div>
                                            <p className="text-black/55 text-[12px] font-medium mb-0.5">{config.unit}</p>
                                            <p className="text-[22px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums leading-none">{game.score}</p>
                                        </div>
                                        <div className="w-px h-6 bg-black/10" />
                                        <div>
                                            <p className="text-black/55 text-[12px] font-medium mb-0.5">{currentSport === "GOLF" ? t("historyList.hole") : t("historyList.inning")}</p>
                                            <p className="text-[22px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums leading-none">{game.innings}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-brand text-[12px] font-semibold mb-0.5">{currentSport === "GOLF" ? t("historyList.avgStrokes") : t("historyList.average")}</p>
                                        <p className="text-[28px] font-bold text-[rgba(0,0,0,0.87)] leading-none tracking-tight tabular-nums">
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
                            <div className="w-16 h-16 bg-black/[0.04] rounded-full flex items-center justify-center mx-auto mb-5 ">
                                <LucideHistory className="w-8 h-8 text-black/40" />
                            </div>
                            <p className="text-[rgba(0,0,0,0.87)] font-semibold text-[17px] mb-1.5">{t("historyList.emptyTitle")}</p>
                            <p className="text-black/55 text-[13px] font-medium leading-relaxed">{t("historyList.emptyDesc1")}<br />{t("historyList.emptyDesc2")}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};
