import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LucideSwords, LucideZap, LucideCalendar, LucideUsers } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { HiqGame } from "@shared/schema";
import { SportConfig } from "./types";
import ScorecardModal from "@/golf/components/ScorecardModal";
import { useT } from "@/lib/i18n";

interface GameDetailDialogProps {
    gameId: string | null;
    onClose: () => void;
    currentMemberId: string | undefined;
    config: SportConfig;
    currentSport: string;
}

export const GameDetailDialog = ({ gameId, onClose, currentMemberId, config, currentSport }: GameDetailDialogProps) => {
    const { t } = useT();

    const { data: game, isLoading } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/history/${gameId}/detail`],
        queryFn: async () => await apiRequest(`/api/hiq/history/${gameId}/detail`),
        enabled: !!gameId,
    });

    if (currentSport === "GOLF" && game && !isLoading) {
        // Transform HiqGame to ScorecardModal props
        const pars = (game as any).pars || [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
        const players = [1, 2, 3, 4].map(idx => {
            const id = (game as any)[`player${idx}Id`];
            if (!id) return null;
            return {
                id,
                name: (game as any)[`player${idx}Name`] || `Player ${idx}`,
                scores: (game as any)[`player${idx}Innings`] || [],
                total: (game as any)[`player${idx}Score`] || 0,
                avatar: (game as any)[`player${idx}Avatar`],
            };
        }).filter(Boolean) as any[];

        return (
            <ScorecardModal
                isOpen={!!gameId}
                onClose={onClose}
                courseName={(game as any).locationName || "Golf Course"}
                pars={pars}
                players={players}
            />
        );
    }

    return (
        <Dialog open={!!gameId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                <DialogHeader className="p-6 bg-gradient-to-b from-[#006241]/[0.06] to-transparent border-b border-black/[0.08]">
                    <div>
                        <div>
                            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                                <config.mainIcon className={cn("w-5 h-5", config.themeColor)} />
                                {t(config.detailTitle)}
                            </DialogTitle>
                            <DialogDescription className="text-black/55 text-[12px] uppercase font-bold tracking-normal mt-1">
                                {t(config.detailSubtitle)}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
                        </div>
                    ) : game ? (
                        <>
                            {/* Players Section (Dynamic 2-4 Players) */}
                            <div className="p-4 bg-black/[0.03] rounded-2xl ">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[12px] font-medium text-black/55 uppercase">{t("gameDetailDialog.participants")}</span>
                                    <span className={cn("text-[12px] font-bold", config.themeColor)}>
                                        {game.gameType === '4c' ? t("gameDetailDialog.fourBall") : (currentSport === "GOLF" ? "18H" : t("gameDetailDialog.threeBall"))}
                                    </span>
                                </div>
                                <div className={`grid gap-3 ${game.player3Name ? (game.player4Name ? 'grid-cols-4' : 'grid-cols-3') : 'grid-cols-2'}`}>
                                    {[1, 2, 3, 4].map((idx) => {
                                        const pId = (game as any)[`player${idx}Id`];
                                        const pName = (game as any)[`player${idx}Name`];
                                        const pTarget = (game as any)[`player${idx}Target`];
                                        const pScore = (game as any)[`player${idx}Score`];
                                        const isMe = currentMemberId && pId === currentMemberId;

                                        // Skip if player doesn't exist (e.g. P3/P4 in a 2p game)
                                        if (idx > 2 && !pName) return null;

                                        return (
                                            <div key={idx} className="text-center bg-white rounded-lg py-2 relative overflow-hidden">
                                                {game.winnerId === pId && <div className="absolute top-0 right-0 p-1"><div className="w-2 h-2 bg-[#cba258] rounded-full" /></div>}
                                                <p className={`text-[12px] font-bold mb-0.5 ${isMe ? 'text-brand' : 'text-black/55'}`}>
                                                    {isMe ? 'ME' : `P${idx}`}
                                                </p>
                                                <p className="text-sm font-semibold truncate px-1">{pName || (isMe ? t("gameDetailDialog.me") : `Player ${idx}`)}</p>
                                                <div className={`text-lg font-semibold flex items-center justify-center gap-1 ${isMe ? config.themeColor : 'text-black/60'}`}>
                                                    {currentSport === "GOLF" ? (
                                                        <span>{pScore || 0}</span>
                                                    ) : (
                                                        <>
                                                            <span>{pTarget || "-"}</span>
                                                            <span className="text-black/40 text-sm">/</span>
                                                            <span className={isMe ? 'text-[rgba(0,0,0,0.87)]' : 'text-black/40'}>{pScore || 0}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Stat Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 bg-black/[0.03] rounded-2xl ">
                                    <div className={cn(
                                        "flex items-center gap-2 mb-2",
                                        config.themeColor
                                    )}>
                                        <LucideZap className="w-4 h-4" />
                                        <span className="text-[12px] font-semibold uppercase">
                                            {t(config.statLabels.extra3) || "High Run"}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-semibold">
                                        {(() => {
                                            const mySlot = [1, 2, 3, 4].find(i => (game as any)[`player${i}Id`] === currentMemberId) || 1;
                                            return (game as any)[`player${mySlot}HighRun`] || 0;
                                        })()}
                                    </p>
                                </div>
                                <div className="p-4 bg-black/[0.03] rounded-2xl ">
                                    <div className="flex items-center gap-2 mb-2 text-black/55">
                                        <LucideCalendar className="w-4 h-4" />
                                        <span className="text-[12px] font-semibold uppercase">
                                            {currentSport === "GOLF" ? t("gameDetailDialog.totalHoles") : t("gameDetailDialog.totalInnings")}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-semibold">{game.totalInnings || 0}</p>
                                </div>
                            </div>

                            {/* Inning Table */}
                            <div>
                                <h4 className="text-xs font-semibold uppercase text-black/55 mb-3 flex items-center gap-2">
                                    <LucideUsers className="w-3 h-3" />
                                    {currentSport === "GOLF" ? t("gameDetailDialog.holeScoreDetail") : t("gameDetailDialog.inningScoreDetail")}
                                </h4>
                                <div className="bg-white rounded-2xl overflow-hidden">
                                    <div
                                        className={cn(
                                            "grid bg-black/[0.04] border-b border-black/[0.08] p-3 text-[12px] font-medium text-black/55 uppercase gap-1",
                                            game.player4Name ? "grid-cols-[60px_repeat(4,1fr)]" :
                                                game.player3Name ? "grid-cols-[60px_repeat(3,1fr)]" :
                                                    "grid-cols-[60px_repeat(2,1fr)]"
                                        )}
                                    >
                                        <div>{currentSport === "GOLF" ? "HOLE" : t("gameDetailDialog.inning")}</div>
                                        {[1, 2, 3, 4].map(idx => {
                                            if (idx > 2 && !(game as any)[`player${idx}Name`]) return null;
                                            const isMe = currentMemberId && (game as any)[`player${idx}Id`] === currentMemberId;
                                            return (
                                                <div key={idx} className={`text-center truncate px-1 ${isMe ? 'text-brand' : ''}`}>
                                                    {isMe ? t("gameDetailDialog.me") : ((game as any)[`player${idx}Name`] || `P${idx}`)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {Array.from({ length: game.totalInnings || 0 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "grid p-3 border-b border-black/[0.05] items-center gap-1",
                                                    game.player4Name ? "grid-cols-[60px_repeat(4,1fr)]" :
                                                        game.player3Name ? "grid-cols-[60px_repeat(3,1fr)]" :
                                                            "grid-cols-[60px_repeat(2,1fr)]"
                                                )}
                                            >
                                                <div className="text-[12px] font-medium text-black/55 ">{i + 1}</div>

                                                {[1, 2, 3, 4].map(idx => {
                                                    if (idx > 2 && !(game as any)[`player${idx}Name`]) return null;
                                                    const isMe = currentMemberId && (game as any)[`player${idx}Id`] === currentMemberId;
                                                    const sc = ((game as any)[`player${idx}Innings`] as number[])?.[i] || 0;
                                                    const displayScore = game.gameType === '4c' && sc >= 10 ? sc / 10 : sc;

                                                    return (
                                                        <div key={idx} className={cn(
                                                            "text-center font-bold text-sm",
                                                            isMe ? config.themeColor : "text-black/40"
                                                        )}>
                                                            {displayScore}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="py-12 text-center text-black/55">{t("gameDetailDialog.loadingData")}</div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
