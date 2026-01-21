import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    LucideChevronLeft,
    LucideTrendingUp,
    LucideCalendar,
    LucideTarget,
    LucideHistory,
    LucideBarChart3,
    LucideLayers,
    LucideUsers,
    LucideSwords,
    LucideZap
} from "lucide-react";
import { HiqGameHistory, HiqMember, HiqGame } from "@shared/schema";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ResponsiveContainer, LineChart, Line } from "recharts";

type FilterType = "all" | "3c" | "4c";

export default function HiqHistory() {
    const [, setLocation] = useLocation();
    const [filter, setFilter] = useState<FilterType>("all");
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const { data: history, isLoading } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history"],
    });

    const { data: selectedGameData, isLoading: isLoadingGame } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/game/${selectedGameId}`],
        enabled: !!selectedGameId,
    });

    // Filter history to ONLY show official match games (member vs member)
    const officialHistory = history?.filter(g =>
        g.gameMode === "match" &&
        (g as any).isRanked &&
        (filter === "all" || g.gameType === filter)
    ) || [];

    // Calculate aggregated stats from official match data
    const totalScore = officialHistory.reduce((acc, g) => acc + g.score, 0);
    const totalInnings = officialHistory.reduce((acc, g) => acc + g.innings, 0);
    const cumulativeAverage = totalInnings > 0 ? (totalScore / totalInnings).toFixed(3) : "0.000";

    // Additional stats for the enhanced card
    const totalGames = officialHistory.length;
    const wins = officialHistory.filter(g => (g as any).isWinner).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100).toString() : "0";
    const bestHighRun = Math.max(...officialHistory.map(g => (g as any).highRun || 0), 0);

    // 1. Best Average
    const bestAverage = officialHistory.length > 0
        ? Math.max(...officialHistory.map(g => parseFloat(g.average))).toFixed(3)
        : "0.000";

    // 2. Recent 10 Games Average
    const recent10 = officialHistory.slice(0, 10);
    const r10Score = recent10.reduce((acc, g) => acc + g.score, 0);
    const r10Innings = recent10.reduce((acc, g) => acc + g.innings, 0);
    const recent10Avg = r10Innings > 0 ? (r10Score / r10Innings).toFixed(3) : "0.000";

    // 3. Empty Inning Rate (공타율)
    let totalEmptyInnings = 0;
    let totalCalculatedInnings = 0;
    officialHistory.forEach(g => {
        const data = g.inningData as any;
        if (Array.isArray(data)) {
            if (data.length > 0 && typeof data[0] === 'number') {
                totalEmptyInnings += data.filter(s => s === 0).length;
                totalCalculatedInnings += data.length;
            } else if (data.length > 0 && typeof data[0] === 'object') {
                totalEmptyInnings += data.filter((s: any) => s.score === 0).length;
                totalCalculatedInnings += data.length;
            }
        }
    });
    const emptyInningRate = totalCalculatedInnings > 0
        ? ((totalEmptyInnings / totalCalculatedInnings) * 100).toFixed(1)
        : "0.0";

    // RP (Rankue Point) Calculation for "ALL" tab
    const calculate3cAverage = () => {
        const games3c = history?.filter(g => g.gameType === "3c" && g.gameMode === "match" && (g as any).isRanked) || [];
        if (games3c.length === 0) return 0;
        const totalScore = games3c.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = games3c.reduce((acc, g) => acc + g.innings, 0);
        return totalInnings > 0 ? totalScore / totalInnings : 0;
    };

    const calculate4cAverage = () => {
        const games4c = history?.filter(g => g.gameType === "4c" && g.gameMode === "match" && (g as any).isRanked) || [];
        if (games4c.length === 0) return 0;
        const totalScore = games4c.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = games4c.reduce((acc, g) => acc + g.innings, 0);
        return totalInnings > 0 ? totalScore / totalInnings : 0;
    };

    const calculateRP = (): number => {
        const avg3c = calculate3cAverage();
        const avg4c = calculate4cAverage();
        const allGames = history?.filter(g => g.gameMode === "match" && (g as any).isRanked) || [];
        const totalWins = allGames.filter(g => (g as any).isWinner).length;

        return Math.round((avg3c * 200) + (avg4c * 10) + (totalWins * 5));
    };

    // Combined stats for "ALL" tab
    const allOfficialGames = history?.filter(g => g.gameMode === "match" && (g as any).isRanked) || [];
    const totalAllGames = allOfficialGames.length;
    const totalAllWins = allOfficialGames.filter(g => (g as any).isWinner).length;
    const totalAllWinRate = totalAllGames > 0 ? Math.round((totalAllWins / totalAllGames) * 100).toString() : "0";
    const games3cCount = allOfficialGames.filter(g => g.gameType === "3c").length;
    const games4cCount = allOfficialGames.filter(g => g.gameType === "4c").length;
    const mainMode = games3cCount >= games4cCount ? "3-Cushion" : "4-Ball";

    // Tier calculation with Premium Dark palette
    const getTier = (handi: number, is3c: boolean) => {
        if (is3c) {
            if (handi >= 45) return { label: "MASTER", color: "#ef4444", icon: "🔥", glow: "rgba(239, 68, 68, 0.5)" };
            if (handi >= 35) return { label: "DIAMOND", color: "#B9F2FF", icon: "💠", glow: "rgba(185, 242, 255, 0.5)" };
            if (handi >= 28) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.5)" };
            if (handi >= 22) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.5)" };
            if (handi >= 16) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.5)" };
            return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.5)" };
        } else {
            if (handi >= 700) return { label: "MASTER", color: "#ef4444", icon: "🔥", glow: "rgba(239, 68, 68, 0.5)" };
            if (handi >= 400) return { label: "DIAMOND", color: "#B9F2FF", icon: "💠", glow: "rgba(185, 242, 255, 0.5)" };
            if (handi >= 250) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.5)" };
            if (handi >= 150) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.5)" };
            if (handi >= 80) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.5)" };
            return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.5)" };
        }
    };

    const currentTier = member ? getTier(
        filter === "3c" ? (member.handi3c || 0) : filter === "4c" ? (member.handi4c || 0) : (member.handi4c || 0),
        filter === "3c"
    ) : { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.5)" };

    // Last week comparison (comparing recent 3 games vs previous 3 games)
    const recentGames = [...officialHistory].slice(0, 3);
    const previousGames = [...officialHistory].slice(3, 6);
    const recentAvg = recentGames.length > 0
        ? recentGames.reduce((acc, g) => acc + parseFloat(g.average), 0) / recentGames.length
        : 0;
    const previousAvg = previousGames.length > 0
        ? previousGames.reduce((acc, g) => acc + parseFloat(g.average), 0) / previousGames.length
        : recentAvg;
    const avgChange = recentAvg - previousAvg;

    // Last 10 games for sparkline
    const last10Games = [...officialHistory].slice(0, 10).reverse().map((g, idx) => ({
        index: idx,
        avg: parseFloat(g.average)
    }));

    // Mock rank percentage (would need real ranking data)
    const rankPercentage = "15";

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-12 h-12 border-4 border-[#0e4d2a] border-t-[#ffd700] rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white p-6 pb-24 font-sans">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLocation("/dashboard")}
                    className="bg-white/5 border border-white/10 rounded-xl"
                >
                    <LucideChevronLeft className="w-6 h-6" />
                </Button>
                <div>
                    <h1 className="text-2xl font-black text-white">공식 경기 성적표</h1>
                    <p className="text-[#ffd700] text-[10px] font-black uppercase tracking-widest mt-0.5">Official Match Records</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex p-1 bg-[#151515] rounded-2xl mb-8 border border-[#222]">
                {[
                    { id: "all", label: "전체", icon: LucideLayers },
                    { id: "3c", label: "3구", icon: LucideTarget },
                    { id: "4c", label: "4구", icon: LucideBarChart3 }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setFilter(tab.id as FilterType)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${filter === tab.id
                            ? "bg-[#0e4d2a] text-white shadow-lg"
                            : "text-gray-500 hover:text-gray-300"
                            }`}
                    >
                        <tab.icon className={`w-4 h-4 ${filter === tab.id ? "text-[#ffd700]" : ""}`} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Cumulative Stats Card */}
            <motion.div
                key={filter} // Re-animate on filter change
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8"
            >
                <Card
                    className="rounded-3xl overflow-hidden relative"
                    style={{
                        background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: currentTier.color,
                        boxShadow: `0 0 30px ${currentTier.glow}, 0 20px 60px rgba(0,0,0,0.8)`
                    }}
                >

                    {/* Sparkline Background Chart */}
                    {last10Games.length > 1 && (
                        <div className="absolute bottom-0 left-0 right-0 h-24 opacity-0 pointer-events-none z-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={last10Games}>
                                    <Line
                                        type="monotone"
                                        dataKey="avg"
                                        stroke={currentTier.color}
                                        strokeWidth={3}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}



                    <CardContent className="p-4 relative z-10">
                        {/* TOP LAYER: Tier Badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex items-center gap-3">
                                <span className="text-4xl">{currentTier.icon}</span>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mb-1">TIER</p>
                                    <p
                                        className="text-xl font-black uppercase tracking-wide truncate shadow-sm"
                                        style={{
                                            color: currentTier.color,
                                            textShadow: `0 0 20px ${currentTier.glow}`
                                        }}
                                    >
                                        {currentTier.label}
                                    </p>
                                    <p className="text-[10px] font-bold text-white/20 uppercase mt-0.5">상위 {rankPercentage}%</p>
                                </div>
                            </div>
                        </div>

                        {/* MIDDLE LAYER: Hero Average DISPLAY */}
                        <div className="mb-6 text-center">
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-2 leading-none">CUMULATIVE AVERAGE</p>
                            <h2
                                className="text-7xl font-black leading-none tracking-tighter"
                                style={{
                                    background: `linear-gradient(135deg, ${currentTier.color} 0%, ${currentTier.color}CC 100%)`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    filter: `drop-shadow(0 0 30px ${currentTier.glow})`,
                                    fontFeatureSettings: '"tnum"'
                                }}
                            >
                                {cumulativeAverage}
                            </h2>
                        </div>

                        {/* BOTTOM LAYER: 7 Stats in 4+3 Layout - FIXED PADDING & SPACING */}
                        <div className="space-y-2">
                            {filter === "all" && history?.some(g => g.gameType === "3c") && history?.some(g => g.gameType === "4c") ? (
                                // Show combined stats for "ALL" tab
                                <div className="grid grid-cols-4 gap-2 pt-4">
                                    <div className="text-center px-2 py-3 rounded-xl bg-white/[0.02]">
                                        <p className="text-white/30 text-[9px] font-black uppercase mb-2 tracking-[0.1em]">Total Games</p>
                                        <p className="text-xl font-black text-white">{totalAllGames}</p>
                                    </div>
                                    <div className="text-center px-2 py-3 rounded-xl bg-white/[0.02]">
                                        <p className="text-white/30 text-[9px] font-black uppercase mb-2 tracking-[0.1em]">Total Wins</p>
                                        <p className="text-xl font-black text-white">{totalAllWins}</p>
                                    </div>
                                    <div className="text-center px-2 py-3 rounded-xl bg-white/[0.02]">
                                        <p className="text-white/30 text-[9px] font-black uppercase mb-2 tracking-[0.1em]">Win Rate</p>
                                        <p className="text-xl font-black text-emerald-400">{totalAllWinRate}%</p>
                                    </div>
                                    <div className="text-center px-2 py-3 rounded-xl bg-white/[0.02]">
                                        <p className="text-white/30 text-[9px] font-black uppercase mb-2 tracking-[0.1em]">Main Mode</p>
                                        <p className="text-xs font-black" style={{ color: currentTier.color }}>{mainMode}</p>
                                    </div>
                                </div>
                            ) : (
                                // Show mode-specific stats (Combined Original + New - Fixed 4+3 Grid)
                                <>
                                    {/* Row 1: 4 Columns (Fundamental Stats) */}
                                    <div className="grid grid-cols-4 gap-1">
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Games</p>
                                            <p className="text-xs font-black text-white">{totalGames}</p>
                                        </div>
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Points</p>
                                            <p className="text-xs font-black text-white">{totalScore}</p>
                                        </div>
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Win %</p>
                                            <p className="text-xs font-black text-emerald-400">{winRate}%</p>
                                        </div>
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Best HR</p>
                                            <p className="text-xs font-black text-[#00FFD1]">{bestHighRun}</p>
                                        </div>
                                    </div>

                                    {/* Row 2: 3 Columns (Advanced Performance) */}
                                    <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-white/10">
                                        <div className="text-center py-2 rounded-xl bg-[#ffd700]/10 border border-[#ffd700]/30 min-w-0">
                                            <p className="text-[#ffd700] text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Best AVG</p>
                                            <p className="text-xs font-black text-[#ffd700]">{bestAverage}</p>
                                        </div>
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">Recent 10</p>
                                            <p className="text-xs font-black text-white">{recent10Avg}</p>
                                        </div>
                                        <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
                                            <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">공타율</p>
                                            <p className="text-xs font-black text-red-400">{emptyInningRate}%</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>


            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-white/50">
                <LucideHistory className="w-5 h-5 text-[#ffd700]" />
                최근 공식 매치 리스트
            </h3>
            <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                    {officialHistory.length > 0 ? (
                        officialHistory.map((game, idx) => (
                            <motion.div
                                key={game.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Card
                                    className="bg-[#151515] border-[#222] rounded-2xl overflow-hidden hover:border-[#ffd700]/30 transition-all border-l-4 border-l-transparent hover:border-l-[#0e4d2a] cursor-pointer"
                                    onClick={() => setSelectedGameId(game.gameId)}
                                >
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex gap-2">
                                                <span className="px-2 py-0.5 rounded-lg bg-[#ffd700]/10 text-[#ffd700] border border-[#ffd700]/20 text-[9px] font-black uppercase flex items-center gap-1">
                                                    <div className="w-1 h-1 rounded-full bg-[#ffd700]" /> OFFICIAL
                                                </span>
                                                <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-gray-400 uppercase">
                                                    {game.gameType === "3c" ? "3구" : "4구"}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-600 text-[10px] font-bold">
                                                <LucideCalendar className="w-3 h-3" />
                                                {format(new Date(game.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div className="flex items-baseline gap-4">
                                                <div>
                                                    <p className="text-gray-500 text-[9px] font-bold uppercase mb-0.5">득점</p>
                                                    <p className="text-2xl font-black text-white">{game.score}</p>
                                                </div>
                                                <div className="w-px h-8 bg-white/5" />
                                                <div>
                                                    <p className="text-gray-500 text-[9px] font-bold uppercase mb-0.5">이닝</p>
                                                    <p className="text-2xl font-black text-white">{game.innings}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[#ffd700] text-xs font-black uppercase mb-0.5 tracking-wider">에버리지</p>
                                                <p className="text-3xl font-black text-white leading-none tracking-tighter">{game.average}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="py-24 text-center"
                        >
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                                <LucideHistory className="w-8 h-8 text-white/20" />
                            </div>
                            <p className="text-white font-black text-xl mb-2">인증된 경기 기록이 없습니다</p>
                            <p className="text-gray-500 text-sm font-medium">실제 회원들과 대결하여<br />당신의 공식 에버리지를 기록해보세요!</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <HiqNavigation />

            {/* Match Detail Dialog */}
            <Dialog open={!!selectedGameId} onOpenChange={(open) => !open && setSelectedGameId(null)}>
                <DialogContent className="bg-[#0a0a0a] border-[#222] text-white max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-gradient-to-b from-[#0e4d2a]/20 to-transparent border-b border-white/5">
                        <div>
                            <DialogTitle className="text-xl font-black flex items-center gap-2">
                                <LucideSwords className="w-5 h-5 text-[#ffd700]" />
                                경기 상세 매치 리포트
                            </DialogTitle>
                            <DialogDescription className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">
                                Official Match Breakdown
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
                        {isLoadingGame ? (
                            <div className="py-12 flex justify-center">
                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-2 border-[#ffd700] border-t-transparent rounded-full" />
                            </div>
                        ) : selectedGameData ? (
                            <>
                                {/* VS Section */}
                                <div className="flex items-center justify-between gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <div className="text-center flex-1">
                                        <p className="text-[10px] font-bold text-white/30 uppercase mb-1">ME</p>
                                        <p className="text-lg font-black">{member?.name}</p>
                                        <p className="text-2xl font-black text-[#ffd700]">{selectedGameData.player1Target}</p>
                                    </div>
                                    <div className="flex flex-col items-center opacity-30">
                                        <span className="text-xs font-black italic">VS</span>
                                        <div className="w-px h-8 bg-white/20 my-1" />
                                    </div>
                                    <div className="text-center flex-1">
                                        <p className="text-[10px] font-bold text-white/30 uppercase mb-1">OPPONENT</p>
                                        <p className="text-lg font-black">{selectedGameData.player2Name || "상대방"}</p>
                                        <p className="text-2xl font-black text-white/60">{selectedGameData.player2Target || "-"}</p>
                                    </div>
                                </div>

                                {/* Stat Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                        <div className="flex items-center gap-2 mb-2 text-[#ffd700]">
                                            <LucideZap className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase">하이런 (HR)</span>
                                        </div>
                                        <p className="text-2xl font-black">{selectedGameData.player1HighRun || 0}</p>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                        <div className="flex items-center gap-2 mb-2 text-white/40">
                                            <LucideCalendar className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase">총 이닝</span>
                                        </div>
                                        <p className="text-2xl font-black">{selectedGameData.totalInnings || 0}</p>
                                    </div>
                                </div>

                                {/* Inning Table */}
                                <div>
                                    <h4 className="text-xs font-black uppercase text-white/30 mb-3 flex items-center gap-2">
                                        <LucideUsers className="w-3 h-3" />
                                        이닝별 득점 상세
                                    </h4>
                                    <div className="bg-[#151515] rounded-2xl border border-[#222] overflow-hidden">
                                        <div className="grid grid-cols-[60px_1fr_1fr] bg-white/5 border-b border-white/5 p-3 text-[10px] font-black text-white/40 uppercase">
                                            <div>이닝</div>
                                            <div className="text-center">나</div>
                                            <div className="text-center">상대</div>
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {Array.from({ length: selectedGameData.totalInnings || 0 }).map((_, i) => (
                                                <div key={i} className="grid grid-cols-[60px_1fr_1fr] p-3 border-b border-white/[0.02] items-center">
                                                    <div className="text-[10px] font-black text-white/20 italic">{i + 1}</div>
                                                    <div className="text-center font-black text-sm text-[#ffd700]">
                                                        {(selectedGameData.player1Innings as number[])?.[i] || 0}
                                                    </div>
                                                    <div className="text-center font-bold text-sm text-white/40">
                                                        {(selectedGameData.player2Innings as number[])?.[i] || 0}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="py-12 text-center text-white/40">데이터를 불러오는 중입니다...</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
}
