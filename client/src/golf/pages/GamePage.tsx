import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRankueMatch, Transaction } from "../hooks/useRankueMatch";
import { useGolfScore } from "../hooks/useGolfScore";
import { ScoreCard } from "../components/ScoreCard";
import { TransactionCard } from "../components/TransactionCard";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import {
    LucideChevronLeft,
    LucideChevronRight,
    LucideFlag,
    LucideTrophy,
    LucideCoins,
    LucideMenu,
    LucideMapPin,
    LucideChevronDown,
    LucideWallet,
    LucideArrowRight
} from "lucide-react";

export default function GolfScorecard() {
    const [, params] = useRoute("/golf/game/:id");
    const matchId = params?.id;
    const [, setLocation] = useLocation();

    // 1. Fetch User Data to sync handicap
    const { data: me } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
        staleTime: 1000 * 60 * 5
    });

    const {
        session,
        isLoading,
        currentHole,
        setCurrentHole,
        localPlayers,
        coursePar,
        handleScoreChange,
        handlePenaltyChange,
        saveCurrentHoleScores,
        autoFillCurrentHole,
        finishMatch,
        isFinishing,
        moneyResults,
        moneyTransactions,
        handleNearChange,
        isCurrentHoleDouble,
        isHost,
        updateCourse,
        getHoleSettlement
    } = useRankueMatch(matchId || "", me);

    const [settlementOpen, setSettlementOpen] = useState(false);
    const [holeSettlement, setHoleSettlement] = useState<any[]>([]);

    // Fetch sub-courses for the current club
    const { data: subCourses } = useQuery<any[]>({
        queryKey: [`/api/hiq/golf/clubs/${session?.courseId}/courses`],
        enabled: !!session?.courseId,
    });

    const isFrontNine = currentHole < 9;
    const currentSubCourseName = isFrontNine ? session?.frontCourseName : session?.backCourseName;

    const [showMoney, setShowMoney] = useState(false);


    // Derive handicap from dashboard stats (avgScore - 72 or golfHandicap)
    const myHandicap = useMemo(() => {
        if (!me) return 18;
        // If they have an average score (e.g., 82.0), handicap index is avg - 72 (e.g., 10)
        if (me.golfAvgScore && me.golfAvgScore > 0) {
            return Math.round(me.golfAvgScore - 72);
        }
        return me.golfHandicap || 18;
    }, [me]);

    const golfScore = useGolfScore(
        session?.players?.[0]?.scores || [],
        coursePar || Array(18).fill(4),
        myHandicap,
        currentHole
    );

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">LOADING MATCH...</div>
        </div>
    );

    // Adapt data for ScoreCard component using local state
    const playersAdapter = localPlayers.map((p: any) => ({
        id: p.memberId,
        name: p.name
    }));

    const playerScoresAdapter: Record<string, number[]> = {};
    localPlayers.forEach((p: any) => {
        playerScoresAdapter[p.memberId] = p.scores;
    });

    const isReviewState = currentHole === 18;

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col relative">
            {/* iOS 상태바 검은 막 — #root의 padding-top(env)이 노치에 비추는 body 크림색을 게임 배경색으로 덮어
                몰입(노치까지 검정)을 유지한다. 화면 전체를 위로 당기지 않으므로 게임 UI는 노치 아래에서 시작하고
                (노치 점령 완화), 홈 이탈 시 흰 띠 잔재도 없다. 노치 높이(env)만큼의 top 스트립이라 콘텐츠는 안 가림. */}
            <div className="fixed top-0 left-0 right-0 h-[env(safe-area-inset-top)] bg-[#050505] z-50" aria-hidden />

            {/* Money Overlay (Toggle) */}
            <AnimatePresence>
                {showMoney && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMoney(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-30"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute inset-x-0 top-32 z-40 p-4 pb-24 overflow-y-auto max-h-[85vh]"
                        >
                            <div className="space-y-4">
                                {/* Player Balances */}
                                <div className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                                    <div className="flex items-center gap-2 mb-4">
                                        <LucideCoins className="w-5 h-5 text-[#FFD700]" />
                                        <h3 className="text-sm font-black text-white/80 uppercase tracking-widest">실시간 정산 현황</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {session.players.map((p: any) => {
                                            const money = moneyResults[p.memberId] || 0;
                                            return (
                                                <div key={p.memberId} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                                                    <span className="font-bold">{p.name}</span>
                                                    <span className={cn(
                                                        "font-black tracking-tighter",
                                                        money > 0 ? "text-[#FF4444]" : money < 0 ? "text-blue-400" : "text-white/40"
                                                    )}>
                                                        {money > 0 ? `+${money.toLocaleString()}` : money.toLocaleString()}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Detailed Transactions - Grouped by Hole */}
                                <div className="space-y-3">
                                    <div className="px-4">
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">상세 내역 (홀별)</span>
                                    </div>
                                    {moneyTransactions.length === 0 ? (
                                        <div className="py-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                                            <span className="text-xs font-bold text-white/20">데이터가 없습니다.</span>
                                        </div>
                                    ) : (
                                        (() => {
                                            // Group transactions by hole
                                            const grouped = moneyTransactions.reduce((acc: Record<number, typeof moneyTransactions>, t) => {
                                                if (!acc[t.holeIndex]) acc[t.holeIndex] = [];
                                                acc[t.holeIndex].push(t);
                                                return acc;
                                            }, {});
                                            const holeKeys = Object.keys(grouped).map(Number).sort((a, b) => b - a); // 최근 홀 먼저

                                            return holeKeys.map(holeIdx => {
                                                const holeTxns = grouped[holeIdx];
                                                const holeTotalAmount = holeTxns.reduce((sum, t) => sum + t.amount, 0);
                                                return (
                                                    <div key={holeIdx} className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-lg">
                                                        {/* Hole Header */}
                                                        <div className="flex items-center justify-between px-5 py-3 bg-white/[0.03] border-b border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <LucideFlag className="w-3.5 h-3.5 text-[#64DD17]" />
                                                                <span className="text-xs font-black text-white/70 tracking-wider">{holeIdx + 1}번 홀</span>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-white/30">
                                                                총 {holeTotalAmount.toLocaleString()}원
                                                            </span>
                                                        </div>
                                                        {/* Hole Transactions */}
                                                        <div className="p-2 space-y-1.5">
                                                            {holeTxns.map((t, idx) => (
                                                                <TransactionCard
                                                                    key={`${t.fromId}-${t.toId}-${holeIdx}-${idx}`}
                                                                    fromName={t.fromName}
                                                                    toName={t.toName}
                                                                    amount={t.amount}
                                                                    details={t.details}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Header with Integrated Hole Nav */}
            <header className="px-4 py-3 flex items-center justify-between relative z-20">
                <button
                    onClick={async () => {
                        if (currentHole > 0) {
                            if (isHost) await saveCurrentHoleScores();
                            setCurrentHole(prev => prev - 1);
                        } else {
                            if (confirm("게임을 종료하고 나가시겠습니까?")) {
                                setLocation("/dashboard");
                            }
                        }
                    }}
                    title="이전 홀"
                    aria-label="이전 홀"
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center flex-1 mx-4">
                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                            <div className="flex items-baseline gap-1.5 min-w-[70px] justify-center">
                                {isReviewState ? (
                                    <span className="text-lg font-black italic tracking-tighter text-[#64DD17]">라운드 종료</span>
                                ) : (
                                    <>
                                        <span className="text-lg font-black italic tracking-tighter text-[#64DD17]">{currentHole + 1}번 홀</span>
                                        <span className="text-[10px] font-bold text-white/40 uppercase">Par {coursePar[currentHole]}</span>
                                    </>
                                )}
                            </div>

                            {!isReviewState && (
                                <div className="flex items-center gap-1.5 pl-3 border-l border-white/10">
                                    <Select
                                        value={currentSubCourseName || ""}
                                        onValueChange={(val) => {
                                            if (isFrontNine) {
                                                updateCourse({ frontCourseName: val });
                                            } else {
                                                updateCourse({ backCourseName: val });
                                            }
                                        }}
                                        disabled={!isHost}
                                    >
                                        <SelectTrigger className="h-8 bg-transparent border-none p-0 text-lg font-black italic tracking-tight text-[#64DD17] hover:brightness-125 transition-all focus:ring-0 justify-start gap-2 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-[#64DD17] [&>svg]:opacity-40 pr-4">
                                            <span className="inline-block translate-y-[1px] pr-1">
                                                {((currentSubCourseName || "선택").replace(/\s*코스\s*/g, ""))}
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#0A0A0A] border-white/10 text-white rounded-none">
                                            {(subCourses || []).map((c) => (
                                                <SelectItem key={c.id} value={c.name} className="text-xs focus:bg-[#64DD17] focus:text-black">
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setShowMoney(!showMoney)}
                    title="스코어 관리"
                    aria-label="스코어 관리"
                    className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-full transition-all border",
                        showMoney
                            ? "bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/30"
                            : "bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10"
                    )}
                >
                    <LucideCoins className="w-5 h-5" />
                </button>
            </header>

            {/* Score Cards Area - Only in Group Mode */}
            {!(session.strokeMode === 'solo' || session.players.length === 1) && (
                <div className={cn("transition-all duration-500", isReviewState && "opacity-50 pointer-events-none grayscale-[0.5]")}>
                    <ScoreCard
                        players={playersAdapter}
                        playerScores={playerScoresAdapter}
                        playerPenalties={localPlayers.reduce((acc: any, p: any) => ({ ...acc, [p.memberId]: p.penalties }), {})}
                        currentHole={currentHole}
                        pars={coursePar}
                        onScoreChange={handleScoreChange}
                        onPenaltyChange={handlePenaltyChange}
                        isSolo={false}
                        isHost={isHost}
                    />

                    {!isHost && (
                        <div className="mt-8 px-8 py-4 mx-6 rounded-2xl bg-[#64DD17]/5 border border-[#64DD17]/10 text-center">
                            <span className="text-[11px] font-bold text-[#64DD17]">
                                🔒 방장이 점수를 입력하고 있습니다. (실시간 업데이트 중)
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Solo Mode: 1. Handicap Pace Maker */}
            {(() => {
                const isSolo = session.strokeMode === 'solo' || session.players.length === 1;
                if (!isSolo) return null;

                const {
                    completedHolesCount,
                    totalStrokes,
                    currentOverPar,
                    handicapAllowed,
                    netScore,
                    paceStatus
                } = golfScore;

                // 스코어 입력이 없으면 표시 안 함
                if (completedHolesCount === 0) return null;

                // 상태 메시지 유지 (paceStatus에 맞게 간소화하거나 기존 로직 유지 가능)
                let statusMessage = "";
                let statusColor = "";

                if (netScore <= -2) {
                    statusMessage = `🔥 핸디캡보다 ${Math.abs(netScore)}타 앞서고 있어요! (완벽)`;
                    statusColor = "text-[#64DD17]";
                } else if (netScore === -1) {
                    statusMessage = `✨ 핸디캡보다 1타 앞서는 중! (우수)`;
                    statusColor = "text-[#64DD17]";
                } else if (netScore === 0) {
                    statusMessage = `👍 핸디캡대로 진행 중 (본전)`;
                    statusColor = "text-white";
                } else if (netScore <= 2) {
                    statusMessage = `⚠️ 핸디캡보다 ${netScore}타 뒤처짐 (주의)`;
                    statusColor = "text-orange-400";
                } else {
                    statusMessage = `🚨 핸디캡보다 ${netScore}타 뒤처짐 (부진)`;
                    statusColor = "text-red-400";
                }

                return (
                    <div className="px-6 pb-6">
                        <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 backdrop-blur-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-xs">
                                            🎯
                                        </div>
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">핸디캡 페이스</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-white/30 font-bold uppercase">평균 핸디캡</span>
                                            <span className="text-sm font-black text-white">{myHandicap}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right flex flex-col items-end">
                                    <span className="text-[9px] text-white/30 font-bold uppercase mb-1">넷 스코어</span>
                                    <span className={cn(
                                        "text-4xl font-black italic leading-none transition-all",
                                        statusColor
                                    )}>
                                        {netScore >= 0 ? `+${netScore}` : netScore}
                                    </span>
                                </div>
                            </div>


                            <div className={cn(
                                "mt-4 py-2 px-3 rounded-xl text-center transition-all border",
                                netScore < 0
                                    ? "bg-[#64DD17]/10 border-[#64DD17]/10"
                                    : netScore === 0
                                        ? "bg-white/5 border-white/5"
                                        : "bg-orange-500/10 border-orange-500/10"
                            )}>
                                <span className={cn("text-[11px] font-bold", statusColor)}>
                                    {statusMessage}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Solo Mode: 2. Scorecard Grid */}
            {(() => {
                const isSolo = session.strokeMode === 'solo' || session.players.length === 1;
                if (!isSolo) return null;

                const player = session.players[0];
                const scores = player?.scores || Array(18).fill(0);

                return (
                    <div className="px-6 mt-2">
                        <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                                        <LucideTrophy className="w-3.5 h-3.5 text-[#64DD17]" />
                                    </div>
                                    <span className="text-xs font-black text-white/40 uppercase tracking-wider">Score Card</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/30 font-bold">총 타수</div>
                                    <div className="text-xl font-black text-white italic">
                                        {golfScore.totalStrokes}
                                    </div>
                                </div>
                            </div>

                            {/* Front 9 (1-9홀) */}
                            <div className="mb-3">
                                <div className="grid grid-cols-10 gap-1 mb-0.5">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2 border-b border-white/10">HOLE</div>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(hole => (
                                        <div key={hole} className="text-[9px] font-bold text-white/40 text-center py-2 border-b border-white/10">
                                            {hole}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-10 gap-1 mb-0.5">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2 border-b border-white/10">PAR</div>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                                        <div key={idx} className="text-[9px] font-bold text-white/60 text-center py-2 border-b border-white/10">
                                            {coursePar[idx]}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-10 gap-1">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2">SCORE</div>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => {
                                        const score = scores[idx] || 0;
                                        const par = coursePar[idx];
                                        // Batch Update: If score is 0 and it's current/past hole, treat as Par (0 diff)
                                        const diff = score > 0 ? score - par : (idx <= currentHole ? 0 : null);
                                        const isCurrent = idx === currentHole;

                                        let bgClass = "bg-white/5";
                                        let textClass = "text-white/20";

                                        if (diff !== null) {
                                            textClass = "text-white";
                                            if (diff <= -2) { bgClass = "bg-[#64DD17]"; textClass = "text-[#051907]"; }
                                            else if (diff === -1) { bgClass = "bg-cyan-500"; }
                                            else if (diff === 0) { bgClass = "bg-[#4A4E57]"; } // Cool Grey
                                            else if (diff === 1) { bgClass = "bg-orange-500"; }
                                            else { bgClass = "bg-red-500"; }
                                        }

                                        return (
                                            <div key={idx} className={cn(
                                                "aspect-square flex flex-col items-center justify-center rounded-md text-[10px] font-black transition-all",
                                                bgClass, textClass,
                                                isCurrent && "ring-2 ring-[#64DD17] ring-offset-2 ring-offset-black"
                                            )}>
                                                <span>{diff !== null ? (diff === 0 ? "0" : (diff > 0 ? `+${diff}` : diff)) : "-"}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Back 9 (10-18홀) */}
                            <div>
                                <div className="grid grid-cols-10 gap-1 mb-0.5">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2 border-b border-white/10">HOLE</div>
                                    {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(hole => (
                                        <div key={hole} className="text-[9px] font-bold text-white/40 text-center py-2 border-b border-white/10">
                                            {hole}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-10 gap-1 mb-0.5">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2 border-b border-white/10">PAR</div>
                                    {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(idx => (
                                        <div key={idx} className="text-[9px] font-bold text-white/60 text-center py-2 border-b border-white/10">
                                            {coursePar[idx]}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-10 gap-1">
                                    <div className="text-[9px] font-bold text-white/30 text-center py-2">SCORE</div>
                                    {[9, 10, 11, 12, 13, 14, 15, 16, 17].map(idx => {
                                        const score = scores[idx] || 0;
                                        const par = coursePar[idx];
                                        // Batch Update: If score is 0 and it's current/past hole, treat as Par (0 diff)
                                        const diff = score > 0 ? score - par : (idx <= currentHole ? 0 : null);
                                        const isCurrent = idx === currentHole;

                                        let bgClass = "bg-white/5";
                                        let textClass = "text-white/20";

                                        if (diff !== null) {
                                            textClass = "text-white";
                                            if (diff <= -2) { bgClass = "bg-[#64DD17]"; textClass = "text-[#051907]"; }
                                            else if (diff === -1) { bgClass = "bg-cyan-500"; }
                                            else if (diff === 0) { bgClass = "bg-[#4A4E57]"; }
                                            else if (diff === 1) { bgClass = "bg-orange-500"; }
                                            else { bgClass = "bg-red-500"; }
                                        }

                                        return (
                                            <div key={idx} className={cn(
                                                "aspect-square flex flex-col items-center justify-center rounded-md text-[10px] font-black transition-all",
                                                bgClass, textClass,
                                                isCurrent && "ring-2 ring-[#64DD17] ring-offset-2 ring-offset-black"
                                            )}>
                                                <span>{diff !== null ? (diff === 0 ? "0" : (diff > 0 ? `+${diff}` : diff)) : "-"}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}


            {/* Solo Mode: 3. Score Input Card (Thumb-friendly position) */}
            {(session.strokeMode === 'solo' || session.players.length === 1) && (
                <div className="mt-8 pb-32">
                    <ScoreCard
                        players={playersAdapter}
                        playerScores={playerScoresAdapter}
                        playerPenalties={localPlayers.reduce((acc: any, p: any) => ({ ...acc, [p.memberId]: p.penalties }), {})}
                        currentHole={currentHole}
                        pars={coursePar}
                        onScoreChange={handleScoreChange}
                        onPenaltyChange={handlePenaltyChange}
                        isSolo={true}
                        isHost={isHost}
                    />

                    {!isHost && (
                        <div className="mt-8 px-8 py-4 mx-6 rounded-2xl bg-[#64DD17]/5 border border-[#64DD17]/10 text-center">
                            <span className="text-[11px] font-bold text-[#64DD17]">
                                🔒 방장이 점수를 입력하고 있습니다. (실시간 업데이트 중)
                            </span>
                        </div>
                    )}
                </div>
            )}


            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/95 to-transparent z-40" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
                <div className="max-w-md mx-auto flex gap-3">
                    <Button
                        variant="ghost"
                        className="flex-1 h-16 rounded-2xl bg-[#1a1a1a] border border-white/10 text-white/60 font-black text-xs uppercase tracking-widest hover:bg-white/5 hover:text-white disabled:opacity-30"
                        onClick={async () => {
                            if (isHost) await saveCurrentHoleScores();
                            setCurrentHole(prev => Math.max(0, prev - 1));
                        }}
                        disabled={currentHole === 0}
                    >
                        이전 홀
                    </Button>

                    {isReviewState ? (
                        isHost ? (
                            <Button
                                disabled={isFinishing}
                                onClick={async () => {
                                    if (isHost) await saveCurrentHoleScores();
                                    finishMatch();
                                }}
                                className="flex-[2] h-16 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm uppercase tracking-widest shadow-[0_0_30px_rgba(100,221,23,0.3)] border-none transition-all active:scale-95"
                                title="Finish Game"
                            >
                                {isFinishing ? (
                                    <span className="animate-pulse">저장 중...</span>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <LucideTrophy className="w-5 h-5" />
                                        <span>라운드 종료</span>
                                    </div>
                                )}
                            </Button>
                        ) : (
                            <div className="flex-[2] h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                <span className="text-xs font-black text-white/30 uppercase tracking-widest">방장 대기 중...</span>
                            </div>
                        )
                    ) : (
                        <Button
                            variant="ghost"
                            className="flex-1 h-16 rounded-2xl bg-[#1a1a1a] border border-white/10 text-white/60 font-black text-xs uppercase tracking-widest hover:bg-white/5 hover:text-white disabled:opacity-30"
                            onClick={async () => {
                                let filledPlayers = localPlayers;
                                if (isHost) {
                                    filledPlayers = autoFillCurrentHole();
                                    await saveCurrentHoleScores(undefined, filledPlayers);
                                }

                                // 판돈이 있고 스트로크 모드가 아닐 때만 정산 팝업 표시
                                if (session?.stake > 0 && session?.gameMode !== 'stroke') {
                                    const settlement = getHoleSettlement(currentHole, filledPlayers);
                                    console.log('[Settlement]', { hole: currentHole + 1, gameMode: session?.gameMode, stake: session?.stake, settlement });
                                    setHoleSettlement(settlement || []);
                                    setSettlementOpen(true);
                                    return;
                                }

                                setCurrentHole(prev => Math.min(17, prev + 1));
                            }}
                        >
                            {currentHole === 17 ? "결과 확인" : "다음 홀"}
                        </Button>
                    )}
                </div>
            </div>
            {/* Settlement Modal */}
            <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black italic tracking-tighter text-[#64DD17] flex items-center gap-2">
                            <LucideWallet className="w-5 h-5" />
                            <span>{currentHole + 1}번 홀 정산</span>
                        </DialogTitle>
                        <DialogDescription className="text-white/40 text-[11px] font-bold uppercase tracking-wider">
                            정산을 확인하고 다음 홀로 이동하세요.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 my-6">
                        {holeSettlement.length > 0 ? (
                            holeSettlement.map((t, idx) => (
                                <div key={idx} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-white">{t.fromName}</span>
                                            <LucideArrowRight className="w-3 h-3 text-white/20" />
                                            <span className="text-sm font-black text-[#64DD17]">{t.toName}</span>
                                        </div>
                                        <span className="text-base font-black text-white italic">
                                            {t.amount.toLocaleString()}원
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {t.details.map((d: string, i: number) => (
                                            <span key={i} className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                                                {d}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <span className="text-sm font-black text-white/40 uppercase tracking-widest">비겼습니다 🤝</span>
                                <span className="text-[10px] font-bold text-white/20 mt-1">모든 플레이어의 점수가 동일합니다.</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {currentHole === 17 ? (
                            isHost ? (
                                <Button
                                    disabled={isFinishing}
                                    className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm uppercase tracking-widest border-none"
                                    onClick={async () => {
                                        setSettlementOpen(false);
                                        finishMatch();
                                    }}
                                >
                                    {isFinishing ? (
                                        <span className="animate-pulse">저장 중...</span>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <LucideTrophy className="w-5 h-5" />
                                            <span>라운드 종료</span>
                                        </div>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    className="w-full h-14 rounded-2xl bg-white/10 text-white/50 font-black text-sm uppercase tracking-widest border-none cursor-default"
                                    onClick={() => {
                                        setSettlementOpen(false);
                                        setCurrentHole(prev => Math.min(17, prev + 1));
                                    }}
                                >
                                    방장 대기 중...
                                </Button>
                            )
                        ) : (
                            <Button
                                className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm uppercase tracking-widest border-none"
                                onClick={() => {
                                    setSettlementOpen(false);
                                    setCurrentHole(prev => Math.min(17, prev + 1));
                                }}
                            >
                                다음 홀로 이동
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
