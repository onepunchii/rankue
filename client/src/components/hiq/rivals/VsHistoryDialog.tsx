
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
            <DialogContent className="bg-[#050505] border-[#222] text-white max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                <DialogHeader className="p-6 bg-gradient-to-b from-[#0e4d2a]/20 to-transparent border-b border-white/5">
                    <DialogTitle className="text-xl font-black flex items-center gap-2">
                        {currentSport === "GOLF" ? <LucideFlag className="w-5 h-5 text-[#84cc16]" /> : <LucideSword className="w-5 h-5 text-[#10b981]" />}
                        VS {friend?.name}
                    </DialogTitle>
                    <DialogDescription className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">
                        Head to Head History
                    </DialogDescription>
                </DialogHeader>

                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1 }}
                                className="w-8 h-8 border-2 border-[#10b981] border-t-transparent rounded-full"
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
                            const resultLabel = isWin ? 'WIN' : (isLoss ? 'LOSE' : 'DRAW');
                            const resultColor = isWin ? 'text-[#10b981]' : (isLoss ? 'text-red-500' : 'text-gray-400');
                            const resultBg = isWin ? 'bg-[#10b981]/20' : (isLoss ? 'bg-red-500/20' : 'bg-white/10');

                            return (
                                <div key={game.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${resultBg} ${resultColor}`}>
                                                {resultLabel}
                                            </span>
                                            <span className="text-[10px] font-bold text-white/40 flex items-center gap-1">
                                                <LucideCalendar className="w-3 h-3" />
                                                {format(new Date(game.playedAt), "yyyy.MM.dd", { locale: ko })}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-bold text-white/60">{game.gameType === '3c' ? '3구' : '4구'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-white/30 uppercase">SCORE (ME : YOU)</p>
                                            <p className="text-xl font-black text-white">
                                                {myScore} : {friendScore}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-12 text-center text-white/40">
                            <p className="text-xs font-bold">대결 기록이 없습니다.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                    <Button
                        onClick={onClose}
                        className="w-full h-14 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all active:scale-95"
                    >
                        닫기
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
