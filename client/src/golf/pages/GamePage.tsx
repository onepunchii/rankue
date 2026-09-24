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
import { ScoreCard, HoleGrid } from "../components/ScoreCard";
import { TransactionCard } from "../components/TransactionCard";
import { GolfBackButton } from "../components/common/GolfBackButton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
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
            <Button onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-[#64DD17] text-[#051907] font-bold border-none">홈으로</Button>
        </div>
    );

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">경기를 불러오는 중…</div>
        </div>
    );

    if (session.status === "abandoned") return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="text-white font-bold text-lg">방장이 이 경기를 접었어요</p>
            <p className="text-white/50 text-sm font-bold">기록은 남지 않았어요.</p>
            <Button onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-[#64DD17] text-[#051907] font-bold border-none">홈으로</Button>
        </div>
    );

    // 동반자는 방장이 시작할 때까지 여기서 기다린다(예전엔 대기실 없이 빈 점수판으로 떨어졌다).
    if (session.status === "waiting") return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-8 text-center">
            <LucideFlag className="w-10 h-10 text-[#64DD17] animate-pulse" />
            <div>
                <p className="text-[#64DD17] font-bold text-lg">방장이 시작하길 기다리는 중</p>
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
                                        <h3 className="text-sm font-bold text-white/80">게임 점수 현황</h3>
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
                                                        "font-bold tracking-tight",
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
                                        <span className="text-[12px] font-bold text-white/30">상세 내역 (홀별)</span>
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
                                                                <span className="text-xs font-bold text-white/70">{holeIdx + 1}번 홀</span>
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

            {/* 머리 — 뒤로 · 몇 번 홀·파·코스 · 포인트(2026-09-24 둘째 판: 기울인 굵은 글씨·네온을 걷고 한 줄로) */}
            <header className="relative z-20 bg-[#050505] border-b border-[#FFFFFF0F]">
                <div className="h-16 px-3 flex items-center gap-2">
                    {/* 예전엔 1번 홀에서 이 버튼이 '게임을 종료하고 나가시겠습니까?' 였는데, 눌러도 경기는 안 끝나고
                        돌아올 길만 사라졌다. 이제 나가기·끝내기·접기를 한 곳에서 고른다. 홀 이동은 아래 버튼. */}
                    <GolfBackButton onClick={() => setExitOpen(true)} label="나가기·끝내기" className="-ml-1" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[20px] font-bold tracking-tight text-[#ffffff] tabular-nums">{currentHole + 1}번 홀</span>
                            {parKnown[currentHole] ? (
                                <span className="text-[14px] font-medium text-[#9BEF5C] tabular-nums">파 {coursePar[currentHole]}</span>
                            ) : (
                                // 이 코스는 파 자료가 없다 — 추정값을 사실처럼 보이지 않는다. 버디 보너스·배판 판정에도 안 쓴다.
                                <span className="text-[12.5px] text-[#FFD266]" title="이 홀의 파 정보가 없어요. 버디 보너스·배판은 계산하지 않아요">파 미확인</span>
                            )}
                        </div>
                        {/* 코스(전반·후반) — 방장만 바꾼다 */}
                        <Select
                            value={currentSubCourseName || ""}
                            onValueChange={(val) => updateCourse(isFrontNine ? { frontCourseName: val } : { backCourseName: val })}
                            disabled={!isHost}
                        >
                            <SelectTrigger className="h-5 w-auto max-w-full bg-transparent border-none p-0 gap-1 text-[12.5px] text-[#FFFFFF8C] focus:ring-0 justify-start [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:opacity-60">
                                <span className="truncate">{session.courseName ? `${session.courseName} · ` : ""}{isFrontNine ? "전반" : "후반"} {currentSubCourseName || "코스 선택"}</span>
                            </SelectTrigger>
                            <SelectContent className="bg-[#141414] border-[#FFFFFF1A] text-white">
                                {(subCourses || []).map((c) => (
                                    <SelectItem key={c.id} value={c.name} className="text-[14px]">{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {/* 점수 게임(포인트)을 안 하는 경기엔 볼 게 없다 — 예전엔 스트로크 경기에도 숨은 판돈으로 금액이 떴다 */}
                    {hasStakes && (
                        <button
                            type="button" onClick={() => setShowMoney(!showMoney)} aria-label="포인트 현황" aria-pressed={showMoney}
                            className={cn("shrink-0 h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium", showMoney ? "bg-[#FFC43D] text-[#1F1500]" : "bg-[#FFFFFF0F] text-[#FFFFFFCC]")}
                        >
                            <LucideCoins className="w-4 h-4" />포인트
                        </button>
                    )}
                </div>
                {/* 18홀 진행 막대 — 전반 9칸 | 후반 9칸. 적은 홀은 채우고 지금 홀은 라임 */}
                <div className="px-4 pb-2.5 flex gap-[3px]" aria-hidden>
                    {Array.from({ length: 18 }, (_, i) => {
                        const done = (localPlayers[0]?.scores?.[i] ?? 0) > 0;
                        return <span key={i} className={cn("h-1 flex-1 rounded-full", i === 9 && "ml-1.5", i === currentHole ? "bg-[#64DD17]" : done ? "bg-[#FFFFFF59]" : "bg-[#FFFFFF14]")} />;
                    })}
                </div>
            </header>

            {/* Score Cards Area - Only in Group Mode */}
            {!(session.strokeMode === 'solo' || session.players.length === 1) && (
                <div className="pt-3">
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
                        <p className="mt-2 mx-4 px-4 py-3 rounded-2xl bg-[#FFFFFF08] text-center text-[13px] text-[#FFFFFF99]">
                            방장이 점수를 적어요 · 방장이 홀을 넘기면 여기에도 보여요
                        </p>
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
                    statusColor = "text-[#9BEF5C]";
                } else if (netScore === -1) {
                    statusMessage = `✨ 핸디캡보다 1타 앞서는 중! (우수)`;
                    statusColor = "text-[#9BEF5C]";
                } else if (netScore === 0) {
                    statusMessage = `👍 핸디캡대로 진행 중 (본전)`;
                    statusColor = "text-white";
                } else if (netScore <= 2) {
                    statusMessage = `⚠️ 핸디캡보다 ${netScore}타 뒤처짐 (주의)`;
                    statusColor = "text-[#FFB27A]";
                } else {
                    statusMessage = `🚨 핸디캡보다 ${netScore}타 뒤처짐 (부진)`;
                    statusColor = "text-[#FF8A8C]";
                }

                return (
                    <div className="px-4 pt-3">
                        {/* 핸디캡 페이스 — 한 줄 요약. 이모지·경고 문구 줄 대신 숫자와 짧은 말 하나 */}
                        <div className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-4 py-3.5 flex items-center gap-3">
                            <span className="flex-1 min-w-0">
                                <span className="block text-[12px] text-[#FFFFFF73]">핸디캡 {myHandicap} 기준 페이스</span>
                                <span className={cn("block mt-0.5 text-[14px] font-medium", statusColor)}>
                                    {netScore < 0 ? `핸디캡보다 ${Math.abs(netScore)}타 앞서요` : netScore === 0 ? "핸디캡대로 가고 있어요" : `핸디캡보다 ${netScore}타 뒤져요`}
                                </span>
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="block text-[11px] text-[#FFFFFF59]">넷</span>
                                <span className={cn("block text-[26px] leading-none font-bold tabular-nums", statusColor)}>{netScore >= 0 ? `+${netScore}` : netScore}</span>
                            </span>
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
                    <div className="px-4 mt-2">
                        <div className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-4 py-4">
                            <div className="flex items-baseline justify-between mb-3">
                                <span className="text-[13px] font-semibold text-[#FFFFFF99]">기록표</span>
                                <span className="text-[13px] text-[#FFFFFF73] tabular-nums">총 <span className="text-[17px] font-bold text-[#ffffff]">{golfScore.totalStrokes}</span>타</span>
                            </div>
                            <HoleGrid scores={scores} pars={coursePar} currentHole={currentHole} />
                        </div>
                    </div>
                );
            })()}


            {/* Solo Mode: 3. Score Input Card (Thumb-friendly position) */}
            {(session.strokeMode === 'solo' || session.players.length === 1) && (
                <div className="mt-3 pb-32">
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
                        <p className="mt-2 mx-4 px-4 py-3 rounded-2xl bg-[#FFFFFF08] text-center text-[13px] text-[#FFFFFF99]">
                            방장이 점수를 적어요 · 방장이 홀을 넘기면 여기에도 보여요
                        </p>
                    )}
                </div>
            )}


            {/* 아래 단추 — 이전 홀 · 다음 홀(18번 홀이면 라운드 끝내기) */}
            <div className="fixed bottom-0 inset-x-0 z-40 bg-[#050505F2] border-t border-[#FFFFFF14] px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <div className="max-w-md mx-auto flex gap-2">
                    <button
                        type="button"
                        className="w-[34%] h-14 rounded-2xl bg-[#FFFFFF0F] text-[15px] font-medium text-[#FFFFFFCC] active:bg-[#FFFFFF1A] disabled:opacity-30 inline-flex items-center justify-center gap-1"
                        onClick={() => runOnce(async () => {
                            if (isHost) { try { await saveCurrentHoleScores(); } catch { return; } }
                            setCurrentHole(prev => Math.max(0, prev - 1));
                        })}
                        disabled={currentHole === 0 || busy}
                    >
                        <LucideChevronLeft className="w-4 h-4" />{currentHole > 0 ? `${currentHole}번 홀` : "이전"}
                    </button>

                    {/* 18번 홀: 예전엔 홀 번호가 17(0부터)에 묶여 종료 버튼이 뜨는 상태에 영영 못 가서
                        스트로크 경기는 끝낼 방법이 없었다. 이제 모드와 상관없이 '라운드 끝내기' 확인창을 연다. */}
                    <button
                        type="button"
                        disabled={(isLast && !isHost) || busy}
                        className={cn(
                            "flex-1 h-14 rounded-2xl text-[16px] font-semibold inline-flex items-center justify-center gap-1.5",
                            isLast && !isHost ? "bg-[#FFFFFF0A] text-[#FFFFFF73] text-[13.5px] font-medium" : "bg-[#64DD17] text-[#051907] active:bg-[#58C414]",
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
                            ? (isHost ? <><LucideTrophy className="w-5 h-5" />라운드 끝내기</> : "방장이 끝내면 결과로 넘어가요")
                            : <>{currentHole + 2}번 홀로<LucideChevronRight className="w-5 h-5" /></>}
                    </button>
                </div>
            </div>

            {/* 홀 결과 (포인트 게임일 때) */}
            <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold tracking-tight text-[#64DD17] flex items-center gap-2">
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
                                            <span className="text-sm font-bold text-white">{t.fromName}</span>
                                            <LucideArrowRight className="w-3 h-3 text-white/40" />
                                            <span className="text-sm font-bold text-[#64DD17]">{t.toName}</span>
                                        </div>
                                        <span className="text-base font-bold text-white">{formatMoney(t.amount, unit)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {t.details.map((d: string, i: number) => (
                                            <span key={i} className="text-[12px] font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded-full">{d}</span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <span className="text-sm font-bold text-white/60">비겼어요 🤝</span>
                                <span className="text-[11px] font-bold text-white/40 mt-1">이 홀에서는 오간 포인트가 없어요.</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {settlementHole === 17 ? (
                            isHost ? (
                                <Button
                                    className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-bold text-sm border-none"
                                    onClick={() => { setSettlementOpen(false); setFinishOpen(true); }}
                                >
                                    <span className="flex items-center gap-2"><LucideTrophy className="w-5 h-5" />라운드 끝내기</span>
                                </Button>
                            ) : (
                                <Button className="w-full h-14 rounded-2xl bg-white/10 text-white/80 font-bold text-sm border-none" onClick={() => setSettlementOpen(false)}>
                                    확인
                                </Button>
                            )
                        ) : (
                            <Button
                                className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-bold text-sm border-none"
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
                        <DialogTitle className="text-xl font-bold tracking-tight text-[#64DD17]">라운드를 끝낼까요?</DialogTitle>
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
                                        {guest && <span className="ml-1.5 text-[12px] font-bold text-white/40">게스트</span>}
                                    </span>
                                    <span className="text-right">
                                        <span className="block text-sm font-bold">
                                            {t.strokes}타 <span className="text-white/50 text-xs">({formatRelative(t.relative)})</span>
                                        </span>
                                        <span className={cn("block text-[12px] font-bold", full && !guest ? "text-[#64DD17]" : "text-white/40")}>
                                            {guest ? "기록 안 남음" : full ? "기록돼요" : `${18 - t.holesPlayed}홀 미입력 · 기록 안 남음`}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter className="flex-row gap-2">
                        <Button variant="ghost" className="flex-1 h-14 rounded-2xl bg-white/5 text-white/70 font-bold" onClick={() => setFinishOpen(false)}>
                            계속 치기
                        </Button>
                        <Button
                            disabled={isFinishing || busy}
                            className="flex-[2] h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-bold border-none"
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
                        <DialogTitle className="text-lg font-bold">경기에서 나갈까요?</DialogTitle>
                        <DialogDescription className="text-white/60 text-xs font-bold break-keep">
                            경기는 그대로 남아요. 홈의 '진행 중 라운드'에서 이어서 할 수 있어요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                        <Button
                            className="w-full h-14 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold border-none"
                            onClick={async () => {
                                if (isHost) { try { await saveCurrentHoleScores(); } catch { /* 나가는 건 막지 않는다 */ } }
                                setLocation("/dashboard");
                            }}
                        >
                            잠깐 나가기
                        </Button>
                        {isHost && (
                            <Button
                                className="w-full h-14 rounded-2xl bg-[#64DD17] hover:bg-[#76ff03] text-[#051907] font-bold border-none"
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
