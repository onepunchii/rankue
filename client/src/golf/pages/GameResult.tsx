import { useRoute, useLocation } from "wouter";
import { useRankueMatch, COURSE_PAR } from "../hooks/useRankueMatch";
import { useEffect, useState } from "react";
import { LucideTrophy, LucideHome, LucideShare2, LucideCrown, LucidePartyPopper, LucideTrendingUp, LucideTrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ScorecardModal from "../components/ScorecardModal";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";

export default function GameResult() {
    const [, params] = useRoute("/golf/game/:id/result");
    const matchId = params?.id;
    const [, setLocation] = useLocation();

    const { session, isLoading, moneyResults, coursePar } = useRankueMatch(matchId || "");
    const [isScorecardOpen, setIsScorecardOpen] = useState(false);

    useEffect(() => {
        if (!isLoading && session) {
            // Trigger confetti
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
            }, 250);

            return () => clearInterval(interval);
        }
    }, [isLoading, session]);

    if (isLoading || !session) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-[#64DD17] animate-pulse font-bold tracking-widest uppercase">CALCULATING GLORY...</div>
        </div>
    );

    // Calculate total strokes for each player
    const getPlayerStats = (player: any) => {
        const scores = player.scores || Array(18).fill(0);
        const totalStrokes = scores.reduce((a: number, b: number) => a + (b || 0), 0);
        // Sum the ACTUAL par of each played hole (not a flat par-4) so the +/- relative score
        // is correct on courses with par-3/par-5 holes.
        const totalPar = scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? (coursePar[idx] || 4) : 0), 0);
        const relative = totalStrokes - totalPar;
        return { totalStrokes, relative };
    };

    // Sort players by total strokes (ascending)
    const sortedPlayers = [...session.players].sort((a, b) => {
        const statsA = getPlayerStats(a);
        const statsB = getPlayerStats(b);
        return statsA.totalStrokes - statsB.totalStrokes;
    });

    const winner = sortedPlayers[0];
    const winnerStats = getPlayerStats(winner);

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden selection:bg-[#64DD17]/30 flex flex-col">
            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px) rotate(12deg); }
                    50% { transform: translateY(-10px) rotate(15deg); }
                    100% { transform: translateY(0px) rotate(12deg); }
                }
                .animate-float-crown {
                    animation: float 3s ease-in-out infinite;
                }
            `}</style>

            <div className="flex-1 overflow-y-auto pb-44">
                {/* 1. 상단: [승자 독식 구역 (The Winner)] */}
                <div className="relative pt-16 pb-10 px-6 flex flex-col items-center overflow-hidden">
                    {/* Background Spotlight Effect (무게감의 핵심) */}
                    <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#64DD17]/15 blur-[100px] rounded-full pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative z-10 flex flex-col items-center w-full"
                    >
                        <motion.h1
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-[#64DD17] font-black text-4xl italic tracking-tighter mb-8 drop-shadow-[0_0_15px_rgba(100,221,23,0.5)]"
                        >
                            WINNER!
                        </motion.h1>

                        <div className="relative mb-10">
                            {/* Crown Icon (Overlaying with Animation) */}
                            <div className="absolute -top-7 -right-4 z-20 animate-float-crown">
                                <LucideCrown size={44} className="text-[#FFD700] fill-[#FFD700] drop-shadow-[0_0_12px_rgba(255,215,0,0.6)]" />
                            </div>

                            {/* Profile Circle with Heavy Glow */}
                            <div className="w-32 h-32 rounded-full border-[5px] border-[#64DD17] p-1 shadow-[0_0_40px_rgba(100,221,23,0.35)] bg-black z-10 relative overflow-hidden">
                                {winner.profileImageUrl ? (
                                    <img src={winner.profileImageUrl} alt={winner.name} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    <div className="w-full h-full rounded-full bg-gradient-to-br from-[#1a1a1a] to-black flex items-center justify-center text-4xl font-black text-white/90">
                                        {winner.name.charAt(0)}
                                    </div>
                                )}
                            </div>

                            {/* Score Badge (Overlaying Bottom - Anchor Point) */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap"
                            >
                                <div className="bg-[#1a1a1a] border-2 border-[#64DD17] px-4 py-1.5 rounded-full shadow-2xl">
                                    <span className="text-white font-black text-lg italic tracking-tight">
                                        {winnerStats.totalStrokes}타 <span className="text-[#64DD17] text-xs ml-1">(+{winnerStats.relative})</span>
                                    </span>
                                </div>
                            </motion.div>
                        </div>

                        <motion.h2
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="text-white text-2xl font-black tracking-tight uppercase"
                        >
                            {winner.name}
                        </motion.h2>
                    </motion.div>
                </div>

                {/* 2. 중단: [내기 정산 & 순위 리스트] */}
                <div className="px-6 space-y-8">
                    <div>
                        <div className="space-y-4">
                            {sortedPlayers.map((player, idx) => {
                                const stats = getPlayerStats(player);
                                const money = moneyResults[player.memberId] || 0;
                                const isWinner = idx === 0;

                                return (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 + (0.1 * idx) }}
                                        key={player.memberId}
                                        className={cn(
                                            "flex items-center justify-between p-5 rounded-[2rem] transition-all border-2",
                                            isWinner
                                                ? "bg-[#64DD17]/10 border-[#64DD17]/40 shadow-[0_15px_35px_rgba(100,221,23,0.15)]"
                                                : "bg-white/[0.04] border-white/5"
                                        )}
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className={cn(
                                                "w-9 h-9 rounded-full flex items-center justify-center font-black italic text-xl",
                                                isWinner ? "bg-[#64DD17] text-black" : "bg-white/10 text-white/40"
                                            )}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <div className="font-black text-lg tracking-tight mb-0.5 flex items-center gap-2">
                                                    {player.name}
                                                    {isWinner && <LucideCrown size={14} className="text-[#FFD700]" />}
                                                </div>
                                                <div className="text-[10px] text-white/30 font-black uppercase tracking-widest">
                                                    {stats.totalStrokes}타 (+{stats.relative})
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-[9px] font-black text-white/20 uppercase mb-0.5">정산 금액</div>
                                            <div className={cn(
                                                "font-black text-xl tracking-tighter",
                                                money > 0 ? "text-[#64DD17]" : money < 0 ? "text-[#FF4444]" : "text-white/30"
                                            )}>
                                                {money > 0 ? `+ ₩${money.toLocaleString()}` : money < 0 ? `- ₩${Math.abs(money).toLocaleString()}` : "₩0"}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 3. Highlight Stats (Unified Card) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-7 flex items-center divide-x divide-white/10"
                    >
                        <div className="flex-1 flex flex-col items-center pr-4">
                            <div className="flex items-center gap-1.5 mb-2 opacity-50">
                                <LucideTrendingUp size={14} className="text-[#FFD700]" />
                                <span className="text-[10px] text-[#FFD700] font-black uppercase tracking-wider">MVP (Birdie)</span>
                            </div>
                            <span className="font-black text-lg italic text-white">{winner.name}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center pl-4">
                            <div className="flex items-center gap-1.5 mb-2 opacity-50">
                                <LucideTrophy size={14} className="text-[#FF4444]" />
                                <span className="text-[10px] text-[#FF4444] font-black uppercase tracking-wider">OECD Total</span>
                            </div>
                            <span className="font-black text-lg italic text-white">₩0</span>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* 4. 하단: [액션 버튼 (The Exit)] - Fixed at bottom */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent z-40 pt-12">
                <div className="max-w-md mx-auto space-y-4">
                    <Button
                        className="w-full h-16 rounded-[1.5rem] bg-[#FAE100] hover:bg-[#F2D000] text-black font-black text-lg flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(250,225,0,0.3)] border-none transition-all active:scale-95"
                        onClick={() => {
                            const shareData = {
                                title: 'RanKue Golf Match Result',
                                text: `[RanKue] ${winner.name}님이 ${winnerStats.totalStrokes}타로 우승했습니다!`,
                                url: window.location.href,
                            };

                            if (navigator.share) {
                                navigator.share(shareData)
                                    .then(() => console.log('Successful share'))
                                    .catch((error) => console.log('Error sharing', error));
                            } else {
                                // Fallback: Copy link or show alert
                                navigator.clipboard.writeText(window.location.href);
                                alert("링크가 클립보드에 복사되었습니다. 친구들에게 공유해 보세요!");
                            }
                        }}
                    >
                        <LucideShare2 size={24} />
                        결과 공유하기
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full h-14 rounded-[1.2rem] bg-white/5 border border-white/10 text-white/50 font-black text-sm uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
                        onClick={() => setLocation("/dashboard")}
                    >
                        <LucideHome size={18} className="mr-2 opacity-50" />
                        메인으로 돌아가기
                    </Button>
                </div>
            </div>
        </div>
    );
}
