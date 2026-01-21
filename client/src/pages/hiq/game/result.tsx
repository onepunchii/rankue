import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideTrophy, LucideTrendingUp, LucideArrowRight, LucideX, LucideMedal, LucideCheckCircle2, LucideRefreshCw, LucideLayoutGrid } from "lucide-react";
import confetti from "canvas-confetti";
import { useQuery } from "@tanstack/react-query";
import { HiqMember } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function HiqGameResult() {
    const search = useSearch();
    const gameId = new URLSearchParams(search).get("id");
    const [result, setResult] = useState<any>(null);
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [claiming, setClaiming] = useState<number | null>(null);
    const [isInningModalOpen, setIsInningModalOpen] = useState(false);
    const [viewingPlayer, setViewingPlayer] = useState<any>(null);

    const { data: p1 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/member/${result?.game?.player1Id}`],
        enabled: !!result?.game?.player1Id,
    });

    const { data: p2 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/member/${result?.game?.player2Id}`],
        enabled: !!result?.game?.player2Id,
    });

    const { data: p3 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/member/${result?.game?.player3Id}`],
        enabled: !!result?.game?.player3Id,
    });

    const { data: p4 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/member/${result?.game?.player4Id}`],
        enabled: !!result?.game?.player4Id,
    });

    useEffect(() => {
        if (gameId) {
            const stored = localStorage.getItem(`game_result_${gameId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                setResult(parsed);

                // Trigger confetti for any handicap update or win
                const hasUpdate = parsed.handicapUpdate1?.message || parsed.handicapUpdate2?.message;
                if (hasUpdate) {
                    setTimeout(() => {
                        confetti({
                            particleCount: 150,
                            spread: 70,
                            origin: { y: 0.6 },
                            colors: ['#0e4d2a', '#ffd700', '#ffffff']
                        });
                    }, 500);
                }
            }
        }
    }, [gameId]);

    if (!result) return <div className="min-h-screen bg-black flex items-center justify-center text-white">결과를 불러올 수 없습니다.</div>;

    const { game, handicapUpdate1, handicapUpdate2 } = result;
    const isPractice = game.gameMode === "practice";

    // Use winnerIndex if available (new logic), then winnerId, then score fallback
    const winnerIdx = result.winnerIndex;
    const p1Win = winnerIdx ? winnerIdx === 1 : (game.winnerId ? game.winnerId === game.player1Id : (game.player1Score >= game.player1Target));
    const p2Win = winnerIdx ? winnerIdx === 2 : (!isPractice && (game.winnerId ? game.winnerId === game.player2Id : (game.player2Score >= game.player2Target)));
    const p3Win = winnerIdx ? winnerIdx === 3 : (!isPractice && (game.winnerId ? game.winnerId === game.player3Id : (game.player3Score >= game.player3Target)));
    const p4Win = winnerIdx ? winnerIdx === 4 : (!isPractice && (game.winnerId ? game.winnerId === game.player4Id : (game.player4Score >= game.player4Target)));

    let totalPlayers = 1;
    if (game.player2Id || game.player2Name) totalPlayers = 2;
    if (game.player3Id || game.player3Name) totalPlayers = 3;
    if (game.player4Id || game.player4Name) totalPlayers = 4;

    const handleClaim = async (slotIdx: number) => {
        if (!gameId) return;
        setClaiming(slotIdx);
        try {
            await apiRequest(`/api/hiq/game/${gameId}/claim`, {
                method: "POST",
                body: { targetSlot: slotIdx }
            });
            toast({
                title: "기록 연동 완료",
                description: "경기가 회원님의 기록으로 저장되었습니다.",
            });
            window.location.reload(); // Refresh to show member data
        } catch (e: any) {
            toast({
                title: "연동 실패",
                description: e.message || "기록을 연동할 수 없습니다. 로그인 상태를 확인하세요.",
                variant: "destructive"
            });
        } finally {
            setClaiming(null);
        }
    };

    const PlayerStats = ({ name, score, target, avg, win, handicapUpdate, pNo, memberId, innings, highRun }: any) => (
        <Card className={`bg-[#111] border-2 rounded-[2rem] overflow-hidden ${win ? 'border-[#ffd700] shadow-[0_0_30px_rgba(255,215,0,0.15)]' : 'border-[#222]'}`}>
            <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${win ? 'text-[#ffd700]' : 'text-gray-500'}`}>
                            {win ? 'Winner' : 'Points'}
                        </p>
                        <h3 className="text-xl font-black text-white truncate max-w-[120px]">{name || (pNo === 1 ? 'PLAYER 1' : `PLAYER ${pNo}`)}</h3>
                    </div>
                    {win && <LucideMedal className="w-8 h-8 text-[#ffd700]" strokeWidth={2.5} />}
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-5xl font-black text-white">{game.gameType === '4c' ? Math.floor(score / 10) : score}</span>
                    <span className="text-white/20 font-black text-xl">/ {game.gameType === '4c' ? Math.floor(target / 10) : target}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/5">
                    <div>
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-0.5">Average</p>
                        <p className={`text-lg font-black ${win ? 'text-[#ffd700]' : 'text-white'}`}>{avg}</p>
                    </div>
                    <div className="text-center border-x border-white/5">
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-0.5">High Run</p>
                        <p className={`text-lg font-black ${win ? 'text-[#ffd700]' : 'text-white'}`}>{highRun}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-0.5">Status</p>
                        <p className={`text-lg font-black uppercase ${win ? 'text-[#ffd700]' : 'text-gray-600'}`}>
                            {win ? 'W' : 'L'}
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setViewingPlayer({ name: name || (pNo === 1 ? 'PLAYER 1' : `PLAYER ${pNo}`), score, target, avg, innings });
                            setIsInningModalOpen(true);
                        }}
                        className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-black gap-2 border border-white/5"
                    >
                        <LucideLayoutGrid className="w-4 h-4 text-[#ffd700]" />
                        이닝별 기록 보기
                    </Button>
                </div>

                {memberId && pNo > 1 && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-green-500/50 justify-center">
                        <LucideCheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase">Verified Member</span>
                    </div>
                )}

                {handicapUpdate?.message && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-4 p-3 bg-[#ffd700] rounded-xl text-black"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <LucideTrendingUp className="w-3 h-3 font-bold" />
                            <span className="text-[10px] font-black uppercase">Handicap Up!</span>
                        </div>
                        <p className="text-[11px] font-bold leading-tight">{handicapUpdate.message}</p>
                        <div className="flex items-center gap-1 mt-1 font-black text-sm">
                            {handicapUpdate.oldHandi} <LucideArrowRight className="w-2 h-2" /> {handicapUpdate.newHandi}
                        </div>
                    </motion.div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="min-h-screen bg-[#050505] text-white p-6 flex flex-col items-center justify-center font-sans">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10"
            >
                <h1 className="text-5xl font-black mb-1 uppercase tracking-tighter text-[#ffd700]">GAME OVER</h1>
                <p className="text-gray-500 font-black uppercase tracking-widest text-[10px] bg-white/5 px-3 py-1 rounded-full inline-block">
                    {isPractice ? "Practice Session" : "Match Result"} • {game.totalInnings} Innings
                </p>
            </motion.div>

            <div className={`w-full max-w-4xl grid ${totalPlayers > 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-4 mb-8`}>
                <PlayerStats
                    name={p1?.name}
                    score={game.player1Score}
                    target={game.player1Target}
                    avg={(game.player1Score / (game.gameType === '4c' ? 10 : 1) / (game.totalInnings || 1)).toFixed(2)}
                    win={p1Win}
                    handicapUpdate={handicapUpdate1}
                    pNo={1}
                    innings={result.p1Innings}
                    highRun={game.gameType === '4c' ? Math.floor(result.p1HighRun / 10) : result.p1HighRun}
                />

                {!isPractice && (
                    <>
                        <PlayerStats
                            name={p2?.name || game.player2Name}
                            score={game.player2Score}
                            target={game.player2Target}
                            avg={(game.player2Score / (game.gameType === '4c' ? 10 : 1) / (game.totalInnings || 1)).toFixed(2)}
                            win={p2Win}
                            handicapUpdate={handicapUpdate2}
                            pNo={2}
                            memberId={game.player2Id}
                            innings={result.p2Innings}
                            highRun={game.gameType === '4c' ? Math.floor(result.p2HighRun / 10) : result.p2HighRun}
                        />
                        {totalPlayers >= 3 && (
                            <PlayerStats
                                name={p3?.name || game.player3Name}
                                score={game.player3Score}
                                target={game.player3Target}
                                avg={(game.player3Score / (game.gameType === '4c' ? 10 : 1) / (game.totalInnings || 1)).toFixed(2)}
                                win={p3Win}
                                pNo={3}
                                memberId={game.player3Id}
                                innings={result.p3Innings}
                                highRun={game.gameType === '4c' ? Math.floor(result.p3HighRun / 10) : result.p3HighRun}
                            />
                        )}
                        {totalPlayers >= 4 && (
                            <PlayerStats
                                name={p4?.name || game.player4Name}
                                score={game.player4Score}
                                target={game.player4Target}
                                avg={(game.player4Score / (game.gameType === '4c' ? 10 : 1) / (game.totalInnings || 1)).toFixed(2)}
                                win={p4Win}
                                pNo={4}
                                memberId={game.player4Id}
                                innings={result.p4Innings}
                                highRun={game.gameType === '4c' ? Math.floor(result.p4HighRun / 10) : result.p4HighRun}
                            />
                        )}
                    </>
                )}
            </div>

            <div className="w-full max-w-md grid grid-cols-2 gap-3">
                <Button
                    variant="outline"
                    onClick={() => setLocation("/dashboard")}
                    className="h-16 rounded-[1.5rem] border-[#222] bg-[#111] text-gray-400 hover:text-white font-black text-lg"
                >
                    홈으로
                </Button>
                <Button
                    onClick={() => setLocation("/dashboard")}
                    className="h-16 rounded-[1.5rem] bg-[#ffd700] text-black hover:bg-[#ffea00] font-black text-lg shadow-[0_10px_20px_rgba(255,215,0,0.2)]"
                >
                    다음 경기
                </Button>
            </div>

            <Dialog open={isInningModalOpen} onOpenChange={setIsInningModalOpen}>
                <DialogContent className="bg-[#111] border-[#222] text-white rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black flex items-center gap-2">
                            <LucideLayoutGrid className="w-5 h-5 text-[#ffd700]" />
                            이닝별 기록
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {viewingPlayer?.name} 님의 이번 경기 기록입니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 max-h-[40vh] overflow-y-auto">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                                        <span>Inning Score Flow</span>
                                        <span className="text-white/40">Total {game.totalInnings} Innings</span>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2 mt-2">
                                        {(viewingPlayer?.innings || []).map((inningScore: number, i: number) => (
                                            <div key={i} className="flex flex-col items-center gap-1">
                                                <span className="text-[8px] text-white/20">{i + 1}</span>
                                                <div className="w-full h-10 flex items-center justify-center rounded-lg text-xs font-black bg-white/5 text-[#ffd700]">
                                                    {game.gameType === '4c' ? Math.floor(inningScore / 10) : inningScore}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => setIsInningModalOpen(false)}
                            className="w-full h-12 bg-white/10 hover:bg-white/20 rounded-xl font-bold"
                        >
                            닫기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
