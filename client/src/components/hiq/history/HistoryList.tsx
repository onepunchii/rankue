import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { LucideCalendar, LucideHistory } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-white/50">
                <config.mainIcon className={cn("w-5 h-5", config.themeColor)} />
                {config.listTitle}
            </h3>
            <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                    {history.length > 0 ? (
                        history.map((game, idx) => (
                            <motion.div
                                key={game.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Card
                                    className={cn(
                                        "bg-[#151515] border-[#222] rounded-2xl overflow-hidden transition-all border-l-4 border-l-transparent cursor-pointer",
                                        config.borderColor.replace('hover:', '') // Hack to apply border color
                                            .replace('/30', '0') // Initial state transparent
                                            .replace('border-l-', 'border-l-transparent'), // Base
                                        // But logic was: hover:border-[#Col]/30 hover:border-l-[#Col]
                                        // Let's just use explicit conditional or a helper in config if easier,
                                        // or simple template literal since we know the colors.
                                        currentSport === "GOLF"
                                            ? "hover:border-[#84cc16]/30 hover:border-l-[#84cc16]"
                                            : "hover:border-[#10b981]/30 hover:border-l-[#10b981]"
                                    )}
                                    onClick={() => onGameClick(game.gameId)}
                                >
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex gap-2">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase flex items-center gap-1",
                                                    currentSport === "GOLF"
                                                        ? "bg-[#84cc16]/10 text-[#84cc16] border-[#84cc16]/20"
                                                        : "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                                                )}>
                                                    <div className={cn("w-1 h-1 rounded-full", currentSport === "GOLF" ? "bg-[#84cc16]" : "bg-[#10b981]")} /> OFFICIAL
                                                </span>
                                                <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-gray-400 uppercase">
                                                    {game.gameType === "3c" ? "3구" : (currentSport === "GOLF" ? "18H" : "4구")}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-600 text-[10px] font-bold">
                                                <LucideCalendar className="w-3 h-3" />
                                                {format(new Date(game.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div className="flex items-baseline gap-4">
                                                <div>
                                                    <p className="text-gray-500 text-[9px] font-bold uppercase mb-0.5">
                                                        {config.unit}
                                                    </p>
                                                    <p className="text-2xl font-black text-white">{game.score}</p>
                                                </div>
                                                <div className="w-px h-8 bg-white/5" />
                                                <div>
                                                    <p className="text-gray-500 text-[9px] font-bold uppercase mb-0.5">
                                                        {currentSport === "GOLF" ? "홀" : "이닝"}
                                                    </p>
                                                    <p className="text-2xl font-black text-white">{game.innings}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn(
                                                    "text-xs font-black uppercase mb-0.5 tracking-wider",
                                                    config.themeColor
                                                )}>{currentSport === "GOLF" ? "G-AVG" : "에버리지"}</p>
                                                <p className="text-3xl font-black text-white leading-none tracking-tighter">
                                                    {game.average}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="py-24 text-center"
                        >
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                                <LucideHistory className="w-8 h-8 text-white/20" />
                            </div>
                            <p className="text-white font-black text-xl mb-2">인증된 경기 기록이 없습니다</p>
                            <p className="text-gray-500 text-sm font-medium">실제 회원들과 대결하여<br />공식 기록을 남겨보세요!</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};
