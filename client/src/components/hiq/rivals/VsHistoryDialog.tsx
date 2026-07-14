
import { motion } from "framer-motion";
import { LucideFlag, LucideSword, LucideCalendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { HiqGame, HiqMember } from "@shared/schema";
import { HiqMemberWithH2H } from "./types";
import { Button } from "@/components/ui/button";
import { RadialGauge } from "@/components/hiq/ui/RadialGauge";
import { FormBadges, MatchResult } from "@/components/hiq/ui/FormBadges";

interface VsHistoryDialogProps {
    friendId: string | null;
    friend: HiqMemberWithH2H | undefined;
    onClose: () => void;
    currentSport: string;
    vsGames: HiqGame[] | undefined;
    isLoading: boolean;
    me: HiqMember | undefined;
}

export const VsHistoryDialog = ({
    friendId,
    friend,
    onClose,
    currentSport,
    vsGames,
    isLoading,
    me
}: VsHistoryDialogProps) => {
    const myId = me?.id;
    const games = vsGames ?? [];
    const totalVs = games.length;
    const vsWins = games.filter((g) => g.winnerId === myId).length;
    const vsLosses = games.filter((g) => g.winnerId === friendId).length;
    const vsDraws = totalVs - vsWins - vsLosses;
    const vsWinRate = totalVs ? Math.round((vsWins / totalVs) * 100) : 0;
    // vsGames is newest-first
    const vsForm: MatchResult[] = games
        .slice(0, 5)
        .map((g) => (g.winnerId === myId ? "W" : g.winnerId === friendId ? "L" : "D"));

    return (
        <Dialog open={!!friendId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-white text-ink-1 max-w-lg w-[95%] rounded-card p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-black/10">
                    <DialogTitle className="text-[20px] font-bold tracking-tight flex items-center gap-2 text-brand">
                        {currentSport === "GOLF" ? <LucideFlag className="w-5 h-5 text-brand" /> : <LucideSword className="w-5 h-5 text-brand" />}
                        VS {friend?.name}
                    </DialogTitle>
                    <DialogDescription className="text-black/55 text-[13px] font-medium mt-1">
                        상대와의 맞대결 전적
                    </DialogDescription>
                </DialogHeader>

                {!isLoading && totalVs > 0 && (
                    <div className="px-6 pt-5 pb-1">
                        <div className="rk-card p-5 flex items-center gap-5">
                            <RadialGauge value={vsWinRate} size={92} stroke={8}>
                                <div className="text-center leading-none">
                                    <div className="text-[22px] font-bold text-ink-1 tabular-nums">
                                        {vsWinRate}<span className="text-[13px] font-semibold text-black/60">%</span>
                                    </div>
                                    <div className="text-[12px] font-medium text-black/55 mt-1">승률</div>
                                </div>
                            </RadialGauge>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-4 mb-3.5">
                                    <div>
                                        <div className="text-[20px] font-bold text-brand tabular-nums leading-none">{vsWins}</div>
                                        <div className="text-[12px] text-black/55 font-medium mt-1">승</div>
                                    </div>
                                    <div className="w-px h-8 bg-black/10" />
                                    <div>
                                        <div className="text-[20px] font-bold text-red-500 tabular-nums leading-none">{vsLosses}</div>
                                        <div className="text-[12px] text-black/55 font-medium mt-1">패</div>
                                    </div>
                                    {vsDraws > 0 && (
                                        <>
                                            <div className="w-px h-8 bg-black/10" />
                                            <div>
                                                <div className="text-[20px] font-bold text-black/60 tabular-nums leading-none">{vsDraws}</div>
                                                <div className="text-[12px] text-black/55 font-medium mt-1">무</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div>
                                    <div className="text-[12px] font-medium text-black/55 mb-1.5">최근 {vsForm.length}경기</div>
                                    <FormBadges results={vsForm} size={24} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1 }}
                                className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full"
                            />
                        </div>
                    ) : vsGames && vsGames.length > 0 ? (
                        vsGames.map((game) => {
                            const myScore = game.player1Id === myId ? game.player1Score :
                                game.player2Id === myId ? game.player2Score :
                                    game.player3Id === myId ? game.player3Score :
                                        game.player4Score;

                            const friendScore = game.player1Id === friendId ? game.player1Score :
                                game.player2Id === friendId ? game.player2Score :
                                    game.player3Id === friendId ? game.player3Score :
                                        game.player4Score;

                            const isWin = game.winnerId === myId;
                            const isLoss = game.winnerId === friendId;
                            const resultLabel = isWin ? '승' : (isLoss ? '패' : '무');
                            const resultColor = isWin ? 'text-brand' : (isLoss ? 'text-red-500' : 'text-black/40');
                            const resultBg = isWin ? 'bg-brand/12' : (isLoss ? 'bg-red-500/12' : 'bg-black/[0.06]');

                            return (
                                <div key={game.id} className="rk-card p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg ${resultBg} ${resultColor}`}>
                                                {resultLabel}
                                            </span>
                                            <span className="text-[12px] font-medium text-black/55 flex items-center gap-1">
                                                <LucideCalendar className="w-3 h-3" />
                                                {format(new Date(game.playedAt), "yyyy.MM.dd", { locale: ko })}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[13px] font-semibold text-black/60">{game.gameType === '3c' ? '3구' : '4구'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[12px] font-medium text-black/55">점수 (나 : 상대)</p>
                                            <p className="text-[20px] font-bold text-ink-1 tabular-nums">
                                                {myScore} : {friendScore}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-12 text-center text-black/55">
                            <p className="text-[13px] font-medium">대결 기록이 없습니다</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-black/10">
                    <Button
                        onClick={onClose}
                        className="w-full h-14 rk-btn-secondary rounded-tile active:scale-95"
                    >
                        닫기
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
