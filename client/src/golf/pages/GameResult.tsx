import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { LucideHome, LucideShare2, LucideCrown, LucideArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { useRankueMatch } from "../hooks/useRankueMatch";
import { useMoneyUnit, formatMoney } from "../lib/money";
import { isCompleteRound, isGuestId, formatRelative, minimalTransfers, rankRound, type Settlement } from "@shared/golfMatch";
import { kstDateLabel } from "@/lib/kst";

/**
 * 랭큐매치 결과.
 *
 * 2026-09-11 다시 썼다. 예전 화면의 문제:
 *  - 'MVP (Birdie)' 는 버디와 상관없이 그냥 우승자 이름이었고, 'OECD Total ₩0' 은 고정값이었다.
 *  - 언더파가 '(+-2)' 로 찍혔고, 동타면 방장이 우승이었다.
 *  - 정산을 볼 때마다 다시 계산했다 → 서버가 종료 순간 못박은 값을 쓴다.
 *  - '결과 공유하기' 는 받는 사람이 열 수 없는 링크(로그인·골프 허용 목록 뒤)였다 → 글로 보낸다.
 *  - 금액은 원화(₩)로만 보였다 → 기본은 포인트, 본인이 켜면 원.
 */
export default function GameResult() {
    const [, params] = useRoute("/golf/game/:id/result");
    const matchId = params?.id;
    const [, setLocation] = useLocation();

    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    const { session, isLoading, error, moneyResults, moneyTransactions, coursePar, parKnown, hasStakes } = useRankueMatch(matchId || "", me);
    const [unit, setUnit] = useMoneyUnit();

    const settlement: Settlement = session?.settlement && typeof session.settlement === "object" && session.settlement.totals
        ? session.settlement
        : { totals: moneyResults, transactions: moneyTransactions };

    // 순위는 서버 기록(isWinner)과 같은 규칙: 친 홀이 많은 사람이 앞, 그다음 파 대비 타수(shared rankRound).
    // 예전엔 파 대비 타수만 봐서 9홀만 친 사람이나 한 홀도 안 적은 사람이 18홀 완주자보다 앞섰다.
    const rows = useMemo(() => {
        if (!session) return [];
        return rankRound(session.players || [], coursePar).map((r: any) => {
            const p = r.player;
            const birdies = (p.scores || []).reduce(
                (n: number, s: number, i: number) => n + (s > 0 && parKnown[i] && s <= coursePar[i] - 1 ? 1 : 0), 0);
            return {
                ...r,
                p,
                complete: isCompleteRound(p.scores),
                guest: isGuestId(p.memberId) || !!p.isGuest,
                birdies,
                money: Number(settlement.totals?.[p.memberId] ?? 0),
            };
        });
    }, [session, coursePar, parKnown, settlement]);

    const rankOf = (i: number) => rows[i].rank;
    const winners = rows.filter((r: any) => r.winner);
    const multi = rows.filter((r: any) => r.holesPlayed > 0).length >= 2;
    const nameOf = (id: string) => rows.find((r: any) => r.p.memberId === id)?.p.name ?? "?";
    const transfers = hasStakes ? minimalTransfers(settlement.totals || {}) : [];
    const birdieKing = [...rows].sort((a: any, b: any) => b.birdies - a.birdies)[0];
    const recordedCount = rows.filter((r: any) => r.complete && !r.guest).length;

    const firedRef = useRef(false);
    useEffect(() => {
        if (firedRef.current || !session || session.status !== "finished") return;
        firedRef.current = true;
        const end = Date.now() + 2500;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        const t: any = setInterval(() => {
            const left = end - Date.now();
            if (left <= 0) return clearInterval(t);
            const count = 50 * (left / 2500);
            confetti({ ...defaults, particleCount: count, origin: { x: 0.1 + Math.random() * 0.2, y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount: count, origin: { x: 0.7 + Math.random() * 0.2, y: Math.random() - 0.2 } });
        }, 250);
        return () => clearInterval(t);
    }, [session]);

    if (error && !session) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="text-white/80 font-bold break-keep">{error?.message || "결과를 불러오지 못했어요"}</p>
            <Button onClick={() => setLocation("/dashboard")} className="h-12 px-6 rounded-2xl bg-[#64DD17] text-[#051907] font-black border-none">홈으로</Button>
        </div>
    );

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold">결과를 불러오는 중…</div>
        </div>
    );

    const dateLabel = kstDateLabel(session.finishedAt || session.updatedAt, { year: "numeric", month: "long", day: "numeric" });

    const share = async () => {
        // 받는 사람이 열 수 있는 건 글뿐이다(결과 화면은 로그인·골프 허용 목록 뒤에 있다). 금액은 싣지 않는다.
        const lines = rows.map((r: any, i: number) =>
            `${rankOf(i)}. ${r.p.name} ${r.strokes}타 (${formatRelative(r.relative)})${r.holesPlayed < 18 ? ` · ${r.holesPlayed}홀` : ""}`);
        const text = `[랭큐] ${session.courseName || "골프"} · ${dateLabel}\n${lines.join("\n")}`;
        try {
            if (navigator.share) { await navigator.share({ title: "랭큐 라운드 결과", text }); return; }
        } catch { return; /* 닫음 */ }
        try { await navigator.clipboard.writeText(text); alert("결과를 복사했어요. 카톡에 붙여 넣어 보내세요."); }
        catch { alert(text); }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto pb-44">
                <div className="relative pt-14 pb-8 px-6 flex flex-col items-center overflow-hidden">
                    <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#64DD17]/15 blur-[100px] rounded-full pointer-events-none" />
                    <p className="relative z-10 text-[12px] font-bold text-white/60">{session.courseName || "골프장 미정"} · {dateLabel}</p>
                    {session.status !== "finished" && (
                        <p className="relative z-10 mt-2 text-[12px] font-bold text-amber-300">아직 끝나지 않은 경기예요 — 지금까지 기록이에요</p>
                    )}

                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex flex-col items-center w-full mt-6">
                        <h1 className="text-[#64DD17] font-black text-3xl tracking-tight mb-6">
                            {!multi ? "라운드 완료" : winners.length > 1 ? "공동 우승" : "우승"}
                        </h1>
                        <div className="flex items-end justify-center gap-6">
                            {(multi ? winners : rows).slice(0, 4).map((w: any) => (
                                <div key={w.p.memberId} className="flex flex-col items-center">
                                    <div className="relative">
                                        {multi && <LucideCrown size={32} className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FFD700] fill-[#FFD700]" />}
                                        <div className="w-24 h-24 rounded-full border-4 border-[#64DD17] p-1 bg-black overflow-hidden">
                                            {w.p.profileImageUrl ? (
                                                <img src={w.p.profileImageUrl} alt={w.p.name} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center text-3xl font-black">{w.p.name.charAt(0)}</div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-3 text-lg font-black">{w.p.name}</p>
                                    <p className="text-sm font-bold text-white/70">
                                        {w.strokes}타 <span className="text-[#64DD17]">({formatRelative(w.relative)})</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                <div className="px-6 space-y-6">
                    <div className="space-y-3">
                        {rows.map((r: any, i: number) => {
                            const rank = rankOf(i);
                            return (
                                <motion.div
                                    key={r.p.memberId}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 + 0.08 * i }}
                                    className={cn(
                                        "flex items-center justify-between p-5 rounded-[1.5rem] border-2",
                                        rank === 1 && multi ? "bg-[#64DD17]/10 border-[#64DD17]/40" : "bg-white/[0.04] border-white/5",
                                    )}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={cn("w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-black text-lg",
                                            rank === 1 && multi ? "bg-[#64DD17] text-black" : "bg-white/10 text-white/60")}>
                                            {rank}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-black text-base truncate">
                                                {r.p.name}
                                                {r.guest && <span className="ml-1.5 text-[10px] font-bold text-white/40">게스트</span>}
                                            </div>
                                            <div className="text-[11px] text-white/60 font-bold">
                                                {r.strokes}타 ({formatRelative(r.relative)})
                                                {r.holesPlayed < 18 && ` · ${r.holesPlayed}홀`}
                                                {r.complete && !r.guest && session.status === "finished" && <span className="text-[#64DD17]"> · 기록됨</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {hasStakes && (
                                        <div className="text-right shrink-0">
                                            <div className="text-[10px] font-bold text-white/40">게임 포인트</div>
                                            <div className={cn("font-black text-lg tracking-tight",
                                                r.money > 0 ? "text-[#64DD17]" : r.money < 0 ? "text-[#FF6E6E]" : "text-white/40")}>
                                                {formatMoney(r.money, unit, true)}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>

                    {hasStakes && transfers.length > 0 && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-[1.5rem] p-5">
                            <div className="flex items-center mb-3">
                                <span className="text-sm font-black">정리하면</span>
                                <span className="ml-2 text-[11px] font-bold text-white/40">가장 적은 건수로</span>
                                <button onClick={() => setUnit(unit === "P" ? "KRW" : "P")} className="ml-auto text-[11px] font-bold text-white/50 underline underline-offset-2">
                                    {unit === "P" ? "원으로 보기" : "포인트로 보기"}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {transfers.map((t, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                                        <span className="flex items-center gap-2 text-sm font-bold">
                                            {nameOf(t.fromId)} <LucideArrowRight className="w-3.5 h-3.5 text-white/40" /> <span className="text-[#64DD17]">{nameOf(t.toId)}</span>
                                        </span>
                                        <span className="text-sm font-black">{formatMoney(t.amount, unit)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-white/[0.03] border border-white/10 rounded-[1.5rem] p-5 grid grid-cols-2 divide-x divide-white/10">
                        <div className="pr-4">
                            <div className="text-[11px] font-bold text-white/50 mb-1">버디 최다</div>
                            <div className="font-black text-base">
                                {birdieKing && birdieKing.birdies > 0 ? `${birdieKing.p.name} · ${birdieKing.birdies}개` : "버디 없음"}
                            </div>
                        </div>
                        <div className="pl-4">
                            <div className="text-[11px] font-bold text-white/50 mb-1">평균·여권에 기록</div>
                            <div className="font-black text-base">{recordedCount}명</div>
                        </div>
                    </div>
                    {recordedCount < rows.filter((r: any) => !r.guest).length && (
                        <p className="text-[11px] font-bold text-white/40 break-keep px-1">
                            18홀을 모두 적은 회원만 평균·여권 도장에 기록돼요.
                        </p>
                    )}
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent z-40 pt-12" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
                <div className="max-w-md mx-auto space-y-3">
                    <Button
                        className="w-full h-16 rounded-[1.5rem] bg-[#FAE100] hover:bg-[#F2D000] text-black font-black text-lg flex items-center justify-center gap-3 border-none active:scale-95"
                        onClick={share}
                    >
                        <LucideShare2 size={22} />
                        결과 보내기
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full h-14 rounded-[1.2rem] bg-white/5 border border-white/10 text-white/70 font-black text-sm hover:bg-white/10 hover:text-white"
                        onClick={() => setLocation("/dashboard")}
                    >
                        <LucideHome size={18} className="mr-2 opacity-60" />
                        홈으로
                    </Button>
                </div>
            </div>
        </div>
    );
}
