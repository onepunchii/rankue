import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LucideSwords, LucideZap, LucideCalendar, LucideUsers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { HiqGame } from "@shared/schema";
import { SportConfig } from "./types";
import ScorecardModal from "@/golf/components/ScorecardModal";

interface GameDetailDialogProps {
    gameId: string | null;
    onClose: () => void;
    currentMemberId: string | undefined;
    config: SportConfig;
    currentSport: string;
}

export const GameDetailDialog = ({ gameId, onClose, currentMemberId, config, currentSport }: GameDetailDialogProps) => {

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
            <DialogContent className="bg-[#050505] border-[#222] text-white max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                <DialogHeader className="p-6 bg-gradient-to-b from-[#0e4d2a]/20 to-transparent border-b border-white/5">
                    <div>
                        <div>
                            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                                <config.mainIcon className={cn("w-5 h-5", config.themeColor)} />
                                {config.detailTitle}
                            </DialogTitle>
                            <DialogDescription className="text-white/40 text-[12px] uppercase font-bold tracking-normal mt-1">
                                {config.detailSubtitle}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-2 border-[#ffd700] border-t-transparent rounded-full" />
                        </div>
                    ) : game ? (
                        <>
                            {/* Players Section (Dynamic 2-4 Players) */}
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[12px] font-medium text-white/55 uppercase">참가자</span>
                                    <span className={cn("text-[12px] font-bold", config.themeColor)}>
                                        {game.gameType === '4c' ? '4구' : (currentSport === "GOLF" ? "18H" : "3구")}
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
                                            <div key={idx} className="text-center bg-black/20 rounded-lg py-2 border border-white/5 relative overflow-hidden">
                                                {game.winnerId === pId && <div className="absolute top-0 right-0 p-1"><div className="w-2 h-2 bg-[#ffd700] rounded-full" /></div>}
                                                <p className={`text-[12px] font-bold mb-0.5 ${isMe ? 'text-blue-400' : 'text-gray-500'}`}>
                                                    {isMe ? 'ME' : `P${idx}`}
                                                </p>
                                                <p className="text-sm font-semibold truncate px-1">{pName || (isMe ? "나" : `Player ${idx}`)}</p>
                                                <div className={`text-lg font-semibold flex items-center justify-center gap-1 ${isMe ? config.themeColor : 'text-white/60'}`}>
                                                    {currentSport === "GOLF" ? (
                                                        <span>{pScore || 0}</span>
                                                    ) : (
                                                        <>
                                                            <span>{pTarget || "-"}</span>
                                                            <span className="text-white/45 text-sm">/</span>
                                                            <span className={isMe ? 'text-white' : 'text-white/40'}>{pScore || 0}</span>
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
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <div className={cn(
                                        "flex items-center gap-2 mb-2",
                                        config.themeColor
                                    )}>
                                        <LucideZap className="w-4 h-4" />
                                        <span className="text-[12px] font-semibold uppercase">
                                            {config.statLabels.extra3 || "High Run"}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-semibold">
                                        {(() => {
                                            const mySlot = [1, 2, 3, 4].find(i => (game as any)[`player${i}Id`] === currentMemberId) || 1;
                                            return (game as any)[`player${mySlot}HighRun`] || 0;
                                        })()}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <div className="flex items-center gap-2 mb-2 text-white/40">
                                        <LucideCalendar className="w-4 h-4" />
                                        <span className="text-[12px] font-semibold uppercase">
                                            {currentSport === "GOLF" ? "총 홀" : "총 이닝"}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-semibold">{game.totalInnings || 0}</p>
                                </div>
                            </div>

                            {/* Inning Table */}
                            <div>
                                <h4 className="text-xs font-semibold uppercase text-white/55 mb-3 flex items-center gap-2">
                                    <LucideUsers className="w-3 h-3" />
                                    {currentSport === "GOLF" ? "홀별 스코어 상세" : "이닝별 득점 상세"}
                                </h4>
                                <div className="bg-[#151515] rounded-2xl border border-[#222] overflow-hidden">
                                    <div
                                        className={cn(
                                            "grid bg-white/5 border-b border-white/5 p-3 text-[12px] font-medium text-white/40 uppercase gap-1",
                                            game.player4Name ? "grid-cols-[60px_repeat(4,1fr)]" :
                                                game.player3Name ? "grid-cols-[60px_repeat(3,1fr)]" :
                                                    "grid-cols-[60px_repeat(2,1fr)]"
                                        )}
                                    >
                                        <div>{currentSport === "GOLF" ? "HOLE" : "이닝"}</div>
                                        {[1, 2, 3, 4].map(idx => {
                                            if (idx > 2 && !(game as any)[`player${idx}Name`]) return null;
                                            const isMe = currentMemberId && (game as any)[`player${idx}Id`] === currentMemberId;
                                            return (
                                                <div key={idx} className={`text-center truncate px-1 ${isMe ? 'text-blue-400' : ''}`}>
                                                    {isMe ? '나' : ((game as any)[`player${idx}Name`] || `P${idx}`)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {Array.from({ length: game.totalInnings || 0 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "grid p-3 border-b border-white/[0.02] items-center gap-1",
                                                    game.player4Name ? "grid-cols-[60px_repeat(4,1fr)]" :
                                                        game.player3Name ? "grid-cols-[60px_repeat(3,1fr)]" :
                                                            "grid-cols-[60px_repeat(2,1fr)]"
                                                )}
                                            >
                                                <div className="text-[12px] font-medium text-white/45 ">{i + 1}</div>

                                                {[1, 2, 3, 4].map(idx => {
                                                    if (idx > 2 && !(game as any)[`player${idx}Name`]) return null;
                                                    const isMe = currentMemberId && (game as any)[`player${idx}Id`] === currentMemberId;
                                                    const sc = ((game as any)[`player${idx}Innings`] as number[])?.[i] || 0;
                                                    const displayScore = game.gameType === '4c' && sc >= 10 ? sc / 10 : sc;

                                                    return (
                                                        <div key={idx} className={cn(
                                                            "text-center font-bold text-sm",
                                                            isMe ? config.themeColor : "text-white/40"
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
                        <div className="py-12 text-center text-white/40">데이터를 불러오는 중입니다...</div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
