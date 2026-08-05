import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideTrophy, LucideTrendingUp, LucideArrowRight, LucideX, LucideMedal, LucideCheckCircle2, LucideRefreshCw, LucideLayoutGrid } from "@/lib/icons";
import confetti from "canvas-confetti";
import { useQuery } from "@tanstack/react-query";
import { HiqMember } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FormBadges, MatchResult } from "@/components/hiq/ui/FormBadges";
import { ShareResultButton, type SharePlayer } from "@/components/hiq/game/ShareResultCard";
import { useT } from "@/lib/i18n";

export default function HiqGameResult() {
    const { t } = useT();
    const search = useSearch();
    const gameId = new URLSearchParams(search).get("id");
    const [result, setResult] = useState<any>(null);
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [claiming, setClaiming] = useState<number | null>(null);
    const [isInningModalOpen, setIsInningModalOpen] = useState(false);
    const [viewingPlayer, setViewingPlayer] = useState<any>(null);

    const { data: p1 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${result?.game?.player1Id}`],
        enabled: !!result?.game?.player1Id,
    });

    const { data: p2 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${result?.game?.player2Id}`],
        enabled: !!result?.game?.player2Id,
    });

    const { data: p3 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${result?.game?.player3Id}`],
        enabled: !!result?.game?.player3Id,
    });

    const { data: p4 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${result?.game?.player4Id}`],
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
                            colors: ['#006241', '#cba258', '#ffffff']
                        });
                    }, 500);
                }
            }
        }
    }, [gameId]);

    if (!result) return (
        <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center p-6">
            <Card className="rk-card w-full max-w-sm">
                <CardContent className="p-8 flex flex-col items-center text-center gap-2">
                    <LucideX className="w-8 h-8 text-black/40 mb-2" strokeWidth={2} />
                    <p className="text-[15px] font-medium text-black/55">{t("gameResult.loadError")}</p>
                    <p className="text-[12px] font-medium text-black/40 mb-4">{t("gameResult.loadErrorDesc")}</p>
                    <Button
                        onClick={() => setLocation("/dashboard")}
                        className="rk-btn-secondary w-full h-12"
                    >
                        {t("gameResult.goHome")}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );

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

    // 공유 카드용 데이터 — 화면 카드와 같은 계산식(에버 = 점수 / 총이닝)을 쓴다.
    const avgOf = (score: number) => (Number(score || 0) / (game.totalInnings || 1)).toFixed(2);
    const sharePlayers: SharePlayer[] = [
        {
            name: p1?.name || game.player1Name || `${t("gameResult.player")} 1`,
            score: game.player1Score,
            target: game.player1Target,
            avg: avgOf(game.player1Score),
            highRun: result.p1HighRun ?? 0,
            win: p1Win,
        },
    ];
    if (!isPractice) {
        sharePlayers.push({
            name: p2?.name || game.player2Name || `${t("gameResult.player")} 2`,
            score: game.player2Score,
            target: game.player2Target,
            avg: avgOf(game.player2Score),
            highRun: result.p2HighRun ?? 0,
            win: p2Win,
        });
        if (totalPlayers >= 3) {
            sharePlayers.push({
                name: p3?.name || game.player3Name || `${t("gameResult.player")} 3`,
                score: game.player3Score,
                target: game.player3Target,
                avg: avgOf(game.player3Score),
                highRun: result.p3HighRun ?? 0,
                win: p3Win,
            });
        }
        if (totalPlayers >= 4) {
            sharePlayers.push({
                name: p4?.name || game.player4Name || `${t("gameResult.player")} 4`,
                score: game.player4Score,
                target: game.player4Target,
                avg: avgOf(game.player4Score),
                highRun: result.p4HighRun ?? 0,
                win: p4Win,
            });
        }
    }

    const handleClaim = async (slotIdx: number) => {
        if (!gameId) return;
        setClaiming(slotIdx);
        try {
            await apiRequest(`/api/hiq/game/${gameId}/claim`, {
                method: "POST",
                body: { targetSlot: slotIdx }
            });
            toast({
                title: t("gameResult.claimSuccessTitle"),
                description: t("gameResult.claimSuccessDesc"),
            });
            window.location.reload(); // Refresh to show member data
        } catch (e: any) {
            toast({
                title: t("gameResult.claimFailTitle"),
                description: e.message || t("gameResult.claimFailDesc"),
                variant: "destructive"
            });
        } finally {
            setClaiming(null);
        }
    };

    const PlayerStats = ({ name, score, target, avg, win, handicapUpdate, pNo, memberId, innings, highRun }: any) => (
        <Card className={`rk-card overflow-hidden ${win ? 'border-brand' : ''}`}>
            <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className={`text-[12px] font-semibold ${win ? 'text-brand' : 'text-black/55'}`}>
                            {win ? t("gameResult.winner") : t("gameResult.score")}
                        </p>
                        <h3 className="text-[17px] font-semibold text-[rgba(0,0,0,0.87)] truncate max-w-[120px]">{name || `${t("gameResult.player")} ${pNo}`}</h3>
                    </div>
                    {win && <LucideMedal className="w-8 h-8 text-brand" strokeWidth={2.5} />}
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-[44px] leading-none font-bold tabular-nums tracking-tight text-[rgba(0,0,0,0.87)]">{score}</span>
                    <span className="text-black/40 font-medium text-xl tabular-nums">/ {target}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-black/10">
                    <div>
                        <p className="text-[12px] font-medium text-black/55 mb-0.5">{t("gameResult.avg")}</p>
                        <p className={`text-lg font-bold tabular-nums ${win ? 'text-brand' : 'text-[rgba(0,0,0,0.87)]'}`}>{avg}</p>
                    </div>
                    <div className="text-center border-x border-black/10">
                        <p className="text-[12px] font-medium text-black/55 mb-0.5">{t("gameResult.highRun")}</p>
                        <p className={`text-lg font-bold tabular-nums ${win ? 'text-brand' : 'text-[rgba(0,0,0,0.87)]'}`}>{highRun}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[12px] font-medium text-black/55 mb-1.5">{t("gameResult.status")}</p>
                        <div className="flex justify-end">
                            <FormBadges results={[win ? "W" : "L"] as MatchResult[]} size={26} />
                        </div>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-black/10">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setViewingPlayer({ name: name || `${t("gameResult.player")} ${pNo}`, score, target, avg, innings });
                            setIsInningModalOpen(true);
                        }}
                        className="rk-btn-secondary w-full h-10 text-xs gap-2"
                    >
                        <LucideLayoutGrid className="w-4 h-4 text-brand" />
                        {t("gameResult.viewInnings")}
                    </Button>
                </div>

                {memberId && pNo > 1 && (
                    <div className="mt-4 pt-4 border-t border-black/10 flex items-center gap-2 text-brand justify-center">
                        <LucideCheckCircle2 className="w-4 h-4" />
                        <span className="text-[12px] font-semibold">{t("gameResult.verifiedMember")}</span>
                    </div>
                )}

                {handicapUpdate?.message && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-4 p-3 bg-brand rounded-tile text-brand-fg"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <LucideTrendingUp className="w-3 h-3" />
                            <span className="text-[12px] font-semibold">{t("gameResult.handicapUp")}</span>
                        </div>
                        <p className="text-[12px] font-bold leading-tight">{handicapUpdate.message}</p>
                        <div className="flex items-center gap-1 mt-1 font-semibold text-sm tabular-nums">
                            {handicapUpdate.oldHandi} <LucideArrowRight className="w-2 h-2" /> {handicapUpdate.newHandi}
                        </div>
                    </motion.div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] p-6 flex flex-col items-center justify-center font-sans">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10"
            >
                <h1 className="text-[26px] font-bold tracking-tight mb-1 text-brand">{t("gameResult.gameOver")}</h1>
                <p className="text-black/55 font-medium text-[12px] bg-black/[0.04] px-3 py-1 rounded-full inline-block">
                    {isPractice ? t("gameResult.practiceSession") : t("gameResult.matchResult")} • {game.totalInnings}{t("gameResult.inningsSuffix")}
                </p>
            </motion.div>

            <div className={`w-full max-w-4xl grid ${totalPlayers > 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-4 mb-8`}>
                <PlayerStats
                    name={p1?.name}
                    score={game.player1Score}
                    target={game.player1Target}
                    avg={(game.player1Score / (game.totalInnings || 1)).toFixed(2)}
                    win={p1Win}
                    handicapUpdate={handicapUpdate1}
                    pNo={1}
                    innings={result.p1Innings}
                    highRun={result.p1HighRun}
                />

                {!isPractice && (
                    <>
                        <PlayerStats
                            name={p2?.name || game.player2Name}
                            score={game.player2Score}
                            target={game.player2Target}
                            avg={(game.player2Score / (game.totalInnings || 1)).toFixed(2)}
                            win={p2Win}
                            handicapUpdate={handicapUpdate2}
                            pNo={2}
                            memberId={game.player2Id}
                            innings={result.p2Innings}
                            highRun={result.p2HighRun}
                        />
                        {totalPlayers >= 3 && (
                            <PlayerStats
                                name={p3?.name || game.player3Name}
                                score={game.player3Score}
                                target={game.player3Target}
                                avg={(game.player3Score / (game.totalInnings || 1)).toFixed(2)}
                                win={p3Win}
                                pNo={3}
                                memberId={game.player3Id}
                                innings={result.p3Innings}
                                highRun={result.p3HighRun}
                            />
                        )}
                        {totalPlayers >= 4 && (
                            <PlayerStats
                                name={p4?.name || game.player4Name}
                                score={game.player4Score}
                                target={game.player4Target}
                                avg={(game.player4Score / (game.totalInnings || 1)).toFixed(2)}
                                win={p4Win}
                                pNo={4}
                                memberId={game.player4Id}
                                innings={result.p4Innings}
                                highRun={result.p4HighRun}
                            />
                        )}
                    </>
                )}
            </div>

            <div className="w-full max-w-md flex flex-col gap-3">
                {/* 결과 이미지 공유가 가장 값싼 유입 경로라 여기서는 이게 주 동선이다. */}
                <ShareResultButton
                    data={{
                        players: sharePlayers,
                        innings: game.totalInnings,
                        gameType: game.gameType,
                        isPractice,
                        playedAt: game.playedAt,
                    }}
                    className="w-full h-16 rounded-2xl text-lg"
                />
                <Button
                    variant="ghost"
                    onClick={() => setLocation("/dashboard")}
                    className="rk-btn-secondary w-full h-16 rounded-2xl text-lg gap-2"
                >
                    <LucideArrowRight className="w-5 h-5" />
                    {t("gameResult.goHome")}
                </Button>
            </div>

            <Dialog open={isInningModalOpen} onOpenChange={setIsInningModalOpen}>
                <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-card max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <LucideLayoutGrid className="w-5 h-5 text-brand" />
                            {t("gameResult.inningsRecord")}
                        </DialogTitle>
                        <DialogDescription className="text-black/55">
                            {viewingPlayer?.name}{t("gameResult.inningsDescSuffix")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        <div className="bg-black/[0.04] rounded-2xl p-4 max-h-[40vh] overflow-y-auto">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[12px] font-semibold text-black/55">
                                        <span>{t("gameResult.inningTrend")}</span>
                                        <span className="text-black/55 tabular-nums">{t("gameResult.totalPrefix")}{game.totalInnings}{t("gameResult.inningsSuffix")}</span>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2 mt-2">
                                        {(viewingPlayer?.innings || []).map((inningScore: number, i: number) => (
                                            <div key={i} className="flex flex-col items-center gap-1">
                                                <span className="text-[12px] text-black/40 tabular-nums">{i + 1}</span>
                                                <div className="w-full h-10 flex items-center justify-center rounded-tile text-xs font-semibold tabular-nums bg-white text-brand">
                                                    {inningScore}
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
                            className="rk-btn-secondary w-full h-12"
                        >
                            {t("gameResult.close")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
