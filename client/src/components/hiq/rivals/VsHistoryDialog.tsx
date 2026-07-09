
import { motion } from "framer-motion";
import { LucideFlag, LucideSword, LucideCalendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { HiqGame, HiqMember } from "@shared/schema";
import { HiqMemberWithH2H } from "./types";
import { Button } from "@/components/ui/button";

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
    return (
        <Dialog open={!!friendId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-[#0A0A0A] border border-white/10 text-white max-w-lg w-[95%] rounded-card p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-white/5">
                    <DialogTitle className="text-[19px] font-bold tracking-tight flex items-center gap-2">
                        {currentSport === "GOLF" ? <LucideFlag className="w-5 h-5 text-brand" /> : <LucideSword className="w-5 h-5 text-brand" />}
                        VS {friend?.name}
                    </DialogTitle>
                    <DialogDescription className="text-white/45 text-[13px] font-medium mt-1">
                        상대와의 맞대결 전적
                    </DialogDescription>
                </DialogHeader>

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
                            const myId = me?.id;
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
                            const resultColor = isWin ? 'text-brand' : (isLoss ? 'text-red-500' : 'text-gray-400');
                            const resultBg = isWin ? 'bg-brand/20' : (isLoss ? 'bg-red-500/20' : 'bg-white/10');

                            return (
                                <div key={game.id} className="rk-card p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg ${resultBg} ${resultColor}`}>
                                                {resultLabel}
                                            </span>
                                            <span className="text-[12px] font-medium text-white/45 flex items-center gap-1">
                                                <LucideCalendar className="w-3 h-3" />
                                                {format(new Date(game.playedAt), "yyyy.MM.dd", { locale: ko })}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[13px] font-semibold text-white/60">{game.gameType === '3c' ? '3구' : '4구'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[12px] font-medium text-white/45">점수 (나 : 상대)</p>
                                            <p className="text-[20px] font-bold text-white tabular-nums">
                                                {myScore} : {friendScore}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-12 text-center text-white/45">
                            <p className="text-[13px] font-medium">대결 기록이 없습니다</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5">
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
