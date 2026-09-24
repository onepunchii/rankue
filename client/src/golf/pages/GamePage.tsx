import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRankueMatch } from "../hooks/useRankueMatch";
import { useMoneyUnit, formatMoney } from "../lib/money";
import { roundTotals, isCompleteRound, isGuestId, formatRelative } from "@shared/golfMatch";
import { useGolfScore } from "../hooks/useGolfScore";
import { ScoreCard } from "../components/ScoreCard";
import { TransactionCard } from "../components/TransactionCard";
import { GolfBackButton } from "../components/common/GolfBackButton";
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
        currentHoleNow,
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
        isHost,
        updateCourse,
        getHoleSettlement,
        parKnown,
        hasStakes,
        abandonMatch,
        isAbandoning,
        error,
    } = useRankueMatch(matchId || "", me, { redirectOnFinish: true });

    const [settlementOpen, setSettlementOpen] = useState(false);
    const [holeSettlement, setHoleSettlement] = useState<any[]>([]);
    // 결과 창이 가리키는 홀. '다음 홀로 이동' 은 이 값 + 1 로 간다(닫히는 0.2초 사이의 두 번째 탭이 홀을 건너뛰었다).
    const [settlementHole, setSettlementHole] = useState(0);

    // Fetch sub-courses for the current club
    const { data: subCourses } = useQuery<any[]>({
        queryKey: [`/api/hiq/golf/clubs/${session?.courseId}/courses`],
        enabled: !!session?.courseId,
    });

    const isFrontNine = currentHole < 9;
    const currentSubCourseName = isFrontNine ? session?.frontCourseName : session?.backCourseName;

    const [showMoney, setShowMoney] = useState(false);
    const [finishOpen, setFinishOpen] = useState(false);
    const [exitOpen, setExitOpen] = useState(false);
    const [unit, setUnit] = useMoneyUnit();

    // 저장이 끝나기 전의 두 번째 탭은 버린다 — 두 탭이 같이 돌면 홀 하나가 빈 채로 넘어갔다.
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const runOnce = async (fn: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try { await fn(); } finally { busyRef.current = false; setBusy(false); }
    };

    // 방장이 대기 중인 방으로 들어오면 대기실로 보낸다(시작 버튼이 거기 있다).
    useEffect(() => {
        if (session?.status === "waiting" && isHost) setLocation(`/golf/game/new?lobby=${session.id}`, { replace: true });
    }, [session?.status, session?.id, isHost, setLocation]);

    // 4~5시간 라운드 내내 홀마다 화면을 다시 켜야 했다 — 이 화면에 있는 동안은 꺼지지 않게 한다(지원 기기만).
    useEffect(() => {
        let lock: any = null;
        let alive = true;
        const acquire = async () => {
            try {
                if (alive && document.visibilityState === "visible" && (navigator as any).wakeLock) {
                    const l = await (navigator as any).wakeLock.request("screen");
                    // 잡는 사이에 화면을 떠났으면 바로 푼다(안 그러면 다른 화면에서도 꺼지지 않는다).
                    if (!alive) { l.release?.(); return; }
                    lock = l;
                }
            } catch { /* 배터리 절약 모드 등 — 못 잡아도 경기는 된다 */ }
        };
        acquire();
        const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            alive = false;
            document.removeEventListener("visibilitychange", onVisible);
            try { lock?.release(); } catch { /* 이미 풀림 */ }
        };
    }, []);


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

    // 없는 경기·권한 없음이면 'LOADING MATCH…' 를 영원히 돌리지 않고 이유를 말한다.
    // 데이터가 있는데 다시 가져오기만 실패한 거면 점수판을 가리지 않는다 — 아래 배너만 띄운다.
    if (error && !session) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="text-white/80 font-bold break-keep">{error?.message || "경기를 불러오지 못했어요"}</p>
            <Button onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-[#64DD17] text-[#051907] font-black border-none">홈으로</Button>
        </div>
    );

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">경기를 불러오는 중…</div>
        </div>
    );

    if (session.status === "abandoned") return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="text-white font-black text-lg">방장이 이 경기를 접었어요</p>
            <p className="text-white/50 text-sm font-bold">기록은 남지 않았어요.</p>
            <Button onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-[#64DD17] text-[#051907] font-black border-none">홈으로</Button>
        </div>
    );

    // 동반자는 방장이 시작할 때까지 여기서 기다린다(예전엔 대기실 없이 빈 점수판으로 떨어졌다).
    if (session.status === "waiting") return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-8 text-center">
            <LucideFlag className="w-10 h-10 text-[#64DD17] animate-pulse" />
            <div>
                <p className="text-[#64DD17] font-black text-lg">방장이 시작하길 기다리는 중</p>
                <p className="text-white/60 text-sm font-bold mt-1">{session.courseName || "골프장 미정"}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
                {(session.players || []).map((p: any) => (
                    <span key={p.memberId} className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-bold">
                        {p.name}{p.isGuest ? " · 게스트" : ""}
                    </span>
                ))}
            </div>
            <p className="text-white/40 text-xs font-bold">시작되면 이 화면이 점수판으로 바뀌어요</p>
            <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-white/5 text-white/70 font-bold">홈에서 기다리기</Button>
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

    const isLast = currentHole === 17;

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col relative">
            {/* iOS 상태바 검은 막 — #root의 padding-top(env)이 노치에 비추는 body 크림색을 게임 배경색으로 덮어
                몰입(노치까지 검정)을 유지한다. 화면 전체를 위로 당기지 않으므로 게임 UI는 노치 아래에서 시작하고
                (노치 점령 완화), 홈 이탈 시 흰 띠 잔재도 없다. 노치 높이(env)만큼의 top 스트립이라 콘텐츠는 안 가림. */}
            <div className="fixed top-0 left-0 right-0 h-[env(safe-area-inset-top)] bg-[#050505] z-50" aria-hidden />
            {error && (
                <div role="status" className="fixed top-[env(safe-area-inset-top)] left-0 right-0 z-50 bg-amber-400 text-black text-[12px] font-bold text-center py-1.5">
                    연결이 불안정해요 · 다시 연결되면 자동으로 맞춰져요
                </div>
            )}

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
                                        <h3 className="text-sm font-black text-white/80 tracking-widest">게임 점수 현황</h3>
                                        <button
                                            onClick={() => setUnit(unit === "P" ? "KRW" : "P")}
                                            className="ml-auto text-[11px] font-bold text-white/50 underline underline-offset-2"
                                        >
                                            {unit === "P" ? "원으로 보기" : "포인트로 보기"}
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {session.players.map((p: any) => {
                                            const money = moneyResults[p.memberId] || 0;
                                            return (
                                                <div key={p.memberId} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                                                    <span className="font-bold">{p.name}</span>
                                                    <span className={cn(
                                                        "font-black tracking-tighter",
                                                        money > 0 ? "text-[#64DD17]" : money < 0 ? "text-[#FF6E6E]" : "text-white/40"
                                                    )}>
                                                        {formatMoney(money, unit, true)}
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
                                                return (
                                                    <div key={holeIdx} className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-lg">
                                                        {/* Hole Header */}
                                                        <div className="flex items-center justify-between px-5 py-3 bg-white/[0.03] border-b border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <LucideFlag className="w-3.5 h-3.5 text-[#64DD17]" />
                                                                <span className="text-xs font-black text-white/70 tracking-wider">{holeIdx + 1}번 홀</span>
                                                            </div>
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
                                                                    unit={unit}
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
                {/* 예전엔 1번 홀에서 이 버튼이 '게임을 종료하고 나가시겠습니까?' 였는데, 눌러도 경기는 안 끝나고
                    돌아올 길만 사라졌다. 이제 나가기·끝내기·접기를 한 곳에서 고른다. 홀 이동은 아래 버튼. */}
                {/* mr-2: 단추 속 -ml-2 만큼 되돌려 오른쪽 w-10 과 폭을 맞춘다 — 가운데 홀 알약이 한가운데 온다 */}
                <GolfBackButton onClick={() => setExitOpen(true)} label="나가기·끝내기" className="mr-2" />

                <div className="flex flex-col items-center flex-1 mx-4">
                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                            <div className="flex items-baseline gap-1.5 min-w-[70px] justify-center">
                                <span className="text-lg font-black italic tracking-tighter text-[#64DD17]">{currentHole + 1}번 홀</span>
                                {parKnown[currentHole] ? (
                                    <span className="text-[10px] font-bold text-white/60 uppercase">Par {coursePar[currentHole]}</span>
                                ) : (
                                    // 이 코스는 파 자료가 없다 — 추정값을 사실처럼 보이지 않는다. 버디 보너스·배판 판정에도 안 쓴다.
                                    <span className="text-[10px] font-bold text-amber-300/90" title="이 홀의 파 정보가 없어요. 버디 보너스·배판은 계산하지 않아요">파 미확인</span>
                                )}
                            </div>

                            {(
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

                {/* 점수 게임(포인트)을 안 하는 경기엔 볼 게 없다 — 예전엔 스트로크 경기에도 숨은 판돈으로 금액이 떴다 */}
                {hasStakes ? (<button
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
                </button>) : <div className="w-10" aria-hidden />}
            </header>

            {/* Score Cards Area - Only in Group Mode */}
            {!(session.strokeMode === 'solo' || session.players.length === 1) && (
                <div className="transition-all duration-500">
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
                                🔒 방장이 점수를 적어요 · 방장이 홀을 넘기면 여기에도 보여요
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
                                🔒 방장이 점수를 적어요 · 방장이 홀을 넘기면 여기에도 보여요
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
                        className="flex-1 h-16 rounded-2xl bg-[#1a1a1a] border border-white/10 text-white/70 font-black text-sm hover:bg-white/5 hover:text-white disabled:opacity-30"
                        onClick={() => runOnce(async () => {
                            if (isHost) { try { await saveCurrentHoleScores(); } catch { return; } }
                            setCurrentHole(prev => Math.max(0, prev - 1));
                        })}
                        disabled={currentHole === 0 || busy}
                    >
                        이전 홀
                    </Button>

                    {/* 18번 홀: 예전엔 홀 번호가 17(0부터)에 묶여 종료 버튼이 뜨는 상태에 영영 못 가서
                        스트로크 경기는 끝낼 방법이 없었다. 이제 모드와 상관없이 '라운드 끝내기' 확인창을 연다. */}
                    <Button
                        disabled={(isLast && !isHost) || busy}
                        className={cn(
                            "flex-[2] h-16 rounded-2xl font-black text-sm transition-all active:scale-95",
                            isLast && isHost
                                ? "bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] border-none shadow-[0_0_30px_rgba(100,221,23,0.3)]"
                                : "bg-[#1a1a1a] border border-white/10 text-white hover:bg-white/5",
                            isLast && !isHost && "text-white/50 disabled:opacity-100",
                        )}
                        onClick={() => runOnce(async () => {
                            const h = currentHoleNow();
                            let filled = localPlayers;
                            if (isHost) {
                                filled = autoFillCurrentHole();
                                try { await saveCurrentHoleScores(h, filled); } catch { return; }
                            }
                            if (hasStakes) {
                                setHoleSettlement(getHoleSettlement(h, filled));
                                setSettlementHole(h);
                                setSettlementOpen(true);
                                return;
                            }
                            if (h === 17) { if (isHost) setFinishOpen(true); return; }
                            setCurrentHole(prev => Math.min(17, prev + 1));
                        })}
                    >
                        {isLast
                            ? (isHost ? <span className="flex items-center gap-2"><LucideTrophy className="w-5 h-5" />라운드 끝내기</span> : "방장이 끝내면 결과로 넘어가요")
                            : "다음 홀"}
                    </Button>
                </div>
            </div>

            {/* 홀 결과 (포인트 게임일 때) */}
            <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black italic tracking-tighter text-[#64DD17] flex items-center gap-2">
                            <LucideWallet className="w-5 h-5" />
                            <span>{settlementHole + 1}번 홀 결과</span>
                        </DialogTitle>
                        <DialogDescription className="text-white/60 text-[11px] font-bold">
                            이 홀에서 오간 포인트예요.{!parKnown[settlementHole] && " 파 정보가 없는 홀이라 버디 보너스·배판은 빼고 셌어요."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 my-6">
                        {holeSettlement.length > 0 ? (
                            holeSettlement.map((t, idx) => (
                                <div key={idx} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-white">{t.fromName}</span>
                                            <LucideArrowRight className="w-3 h-3 text-white/40" />
                                            <span className="text-sm font-black text-[#64DD17]">{t.toName}</span>
                                        </div>
                                        <span className="text-base font-black text-white italic">{formatMoney(t.amount, unit)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {t.details.map((d: string, i: number) => (
                                            <span key={i} className="text-[10px] font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded-full">{d}</span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <span className="text-sm font-black text-white/60">비겼어요 🤝</span>
                                <span className="text-[11px] font-bold text-white/40 mt-1">이 홀에서는 오간 포인트가 없어요.</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {settlementHole === 17 ? (
                            isHost ? (
                                <Button
                                    className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm border-none"
                                    onClick={() => { setSettlementOpen(false); setFinishOpen(true); }}
                                >
                                    <span className="flex items-center gap-2"><LucideTrophy className="w-5 h-5" />라운드 끝내기</span>
                                </Button>
                            ) : (
                                <Button className="w-full h-14 rounded-2xl bg-white/10 text-white/80 font-black text-sm border-none" onClick={() => setSettlementOpen(false)}>
                                    확인
                                </Button>
                            )
                        ) : (
                            <Button
                                className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black text-sm border-none"
                                onClick={() => { if (!settlementOpen) return; setSettlementOpen(false); setCurrentHole(Math.min(17, settlementHole + 1)); }}
                            >
                                다음 홀로 이동
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 라운드 끝내기 확인 — 되돌릴 수 없어서 한 번 묻는다. 누가 기록되는지도 미리 보여 준다. */}
            <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black tracking-tight text-[#64DD17]">라운드를 끝낼까요?</DialogTitle>
                        <DialogDescription className="text-white/60 text-xs font-bold break-keep">
                            끝내면 점수를 고칠 수 없어요. 18홀을 모두 적은 회원만 평균·여권 도장에 기록돼요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 my-4">
                        {localPlayers.map((p: any) => {
                            const t = roundTotals(p.scores, coursePar);
                            const guest = isGuestId(p.memberId) || !!p.isGuest;
                            const full = isCompleteRound(p.scores);
                            return (
                                <div key={p.memberId} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                    <span className="font-bold text-sm">
                                        {p.name}
                                        {guest && <span className="ml-1.5 text-[10px] font-bold text-white/40">게스트</span>}
                                    </span>
                                    <span className="text-right">
                                        <span className="block text-sm font-black">
                                            {t.strokes}타 <span className="text-white/50 text-xs">({formatRelative(t.relative)})</span>
                                        </span>
                                        <span className={cn("block text-[10px] font-bold", full && !guest ? "text-[#64DD17]" : "text-white/40")}>
                                            {guest ? "기록 안 남음" : full ? "기록돼요" : `${18 - t.holesPlayed}홀 미입력 · 기록 안 남음`}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter className="flex-row gap-2">
                        <Button variant="ghost" className="flex-1 h-14 rounded-2xl bg-white/5 text-white/70 font-black" onClick={() => setFinishOpen(false)}>
                            계속 치기
                        </Button>
                        <Button
                            disabled={isFinishing || busy}
                            className="flex-[2] h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black border-none"
                            onClick={() => runOnce(async () => {
                                if (isHost) { try { await saveCurrentHoleScores(); } catch { return; } }
                                finishMatch();
                            })}
                        >
                            {isFinishing ? <span className="animate-pulse">저장 중…</span> : "라운드 끝내기"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 나가기 · 끝내기 · 접기 */}
            <Dialog open={exitOpen} onOpenChange={setExitOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black">경기에서 나갈까요?</DialogTitle>
                        <DialogDescription className="text-white/60 text-xs font-bold break-keep">
                            경기는 그대로 남아요. 홈의 '진행 중 라운드'에서 이어서 할 수 있어요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                        <Button
                            className="w-full h-14 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-black border-none"
                            onClick={async () => {
                                if (isHost) { try { await saveCurrentHoleScores(); } catch { /* 나가는 건 막지 않는다 */ } }
                                setLocation("/dashboard");
                            }}
                        >
                            잠깐 나가기
                        </Button>
                        {isHost && (
                            <Button
                                className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-black border-none"
                                onClick={() => { setExitOpen(false); setFinishOpen(true); }}
                            >
                                지금까지로 라운드 끝내기
                            </Button>
                        )}
                        {isHost && (
                            <Button
                                variant="ghost"
                                disabled={isAbandoning}
                                className="w-full h-12 rounded-2xl text-[#FF6E6E] font-bold hover:bg-[#FF6E6E]/10"
                                onClick={() => { if (window.confirm("이 경기를 접을까요? 점수와 기록이 남지 않아요.")) abandonMatch(); }}
                            >
                                경기 접기 (기록 없음)
                            </Button>
                        )}
                        <Button variant="ghost" className="w-full h-12 rounded-2xl text-white/60 font-bold" onClick={() => setExitOpen(false)}>
                            계속하기
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
