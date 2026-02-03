import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SportConfig, FilterType } from "./types";

interface StatsOverviewCardProps {
    stats: any;
    config: SportConfig;
    filter: FilterType;
    currentSport: string;
}

// 1. 하위 컴포넌트로 분리 (재사용성)
const StatBox = ({ label, value, valueColor = "text-white" }: { label: string, value: string | number, valueColor?: string }) => (
    <div className="text-center py-2 rounded-xl bg-white/[0.03] border border-white/5 min-w-0">
        <p className="text-white/20 text-[7px] font-bold uppercase mb-0.5 leading-none truncate tracking-tighter">
            {label}
        </p>
        <p className={cn("text-xs font-black", valueColor)}>{value}</p>
    </div>
);

export const StatsOverviewCard = ({ stats, config, filter, currentSport }: StatsOverviewCardProps) => {
    // 안전한 데이터 접근을 위한 구조 분해 할당 (기본값 설정)
    const {
        currentTier = { icon: '🏌️', label: 'ROOKIE', color: '#ffffff', glow: '#ffffff' },
        last10Games = [],
        totalGames = 0,
        totalNormalizedScore = 0,
        winRate = 0,
        bestHighRun = 0,
        bestAverage = "0.00",
        recent10Avg = "0.00",
        emptyInningRate = 0,
        mainMode = "-",
        totalAllGames = 0,
        totalAllWins = 0,
        totalAllWinRate = 0,
        hasMixedHistory = false,
        cumulativeAverage = "0.00",
        // member // for golf handicap (not used directly in this refactor, relying on computed golfStats)
    } = stats || {}; // stats가 null일 경우 대비

    // 골프 데이터 계산 로직 (안전하게 수정)
    const golfStats = useMemo(() => {
        if (currentSport !== 'GOLF' || !stats?.officialHistory?.length) return null;

        const validGames = stats.officialHistory.filter((g: any) => g.score > 0);
        if (!validGames.length) return null;

        const scores = validGames.map((g: any) => g.score);
        const bestScore = Math.min(...scores);
        const totalRounds = scores.length;
        const avgScore = (scores.reduce((a: number, b: number) => a + b, 0) / totalRounds).toFixed(1);
        const lastScore = scores[0];

        return { bestScore, totalRounds, avgScore, lastScore };
    }, [stats?.officialHistory, currentSport]);

    // 2. 골프 UI 렌더링
    if (currentSport === 'GOLF') {
        return (
            <motion.div
                key="golf-stats"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8"
            >
                <Card className="rounded-3xl overflow-hidden relative border-[#84cc1644] border-[1.5px] shadow-[0_0_15px_#84cc1622]"
                    style={{ background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)' }}>
                    <CardContent className="p-6 relative z-10">
                        {/* Tier Badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-4xl">{currentTier.icon}</span>
                            <div>
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mb-1">TIER</p>
                                <p className="text-xl font-black uppercase text-[#84cc16] tracking-wide" style={{ textShadow: `0 0 10px #84cc1644` }}>
                                    {currentTier.label}
                                </p>
                                <p className="text-[10px] font-bold text-white/20 uppercase mt-0.5">상위 15%</p>
                            </div>
                        </div>

                        {/* Average Score (Main) */}
                        <div className="mb-8 text-center">
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-2">AVERAGE SCORE</p>
                            <h2 className="text-7xl font-black text-[#84cc16] tracking-tighter" style={{ textShadow: "0 0 20px rgba(132, 204, 22, 0.3)" }}>
                                {golfStats?.avgScore || "-"}
                            </h2>
                        </div>

                        {/* Sub Stats Grid */}
                        <div className="grid grid-cols-3 gap-3 pt-6 border-t border-white/10">
                            <div className="text-center">
                                <p className="text-[9px] font-bold text-white/40 uppercase mb-1">BEST SCORE</p>
                                <p className="text-xl font-black text-white">
                                    {golfStats?.bestScore || "-"} <span className="text-xs text-[#84cc16]">타</span>
                                </p>
                            </div>
                            <div className="text-center border-x border-white/5">
                                <p className="text-[9px] font-bold text-white/40 uppercase mb-1">ROUNDS</p>
                                <p className="text-xl font-black text-white">
                                    {golfStats?.totalRounds || 0} <span className="text-xs text-white/40">회</span>
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[9px] font-bold text-white/40 uppercase mb-1">LAST GAME</p>
                                <p className="text-xl font-black text-white">{golfStats?.lastScore || "-"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    // 3. 당구 UI 렌더링 (기존 로직 유지하되 안전하게)
    return (
        <motion.div key={filter} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-8">
            <Card className="rounded-3xl overflow-hidden relative"
                style={{
                    background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)',
                    borderWidth: '1.5px', borderStyle: 'solid',
                    borderColor: `${currentTier.color}44`,
                    boxShadow: `0 0 15px ${currentTier.glow}, 0 10px 40px rgba(0, 0, 0, 0.6)`
                }}>

                <CardContent className="p-4 relative z-10">
                    {/* Tier Badge */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex items-center gap-3">
                            <span className="text-4xl">{currentTier.icon}</span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mb-1">TIER</p>
                                <p
                                    className="text-xl font-black uppercase tracking-wide truncate shadow-sm"
                                    style={{
                                        color: currentTier.color,
                                        textShadow: `0 0 10px ${currentTier.glow}`
                                    }}
                                >
                                    {currentTier.label}
                                </p>
                                <p className="text-[10px] font-bold text-white/20 uppercase mt-0.5">상위 15%</p>
                            </div>
                        </div>
                    </div>

                    {/* Cumulative Average (Main) */}
                    <div className="mb-6 text-center">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-2">CUMULATIVE AVERAGE</p>
                        <h2 className="text-7xl font-black leading-none tracking-tighter"
                            style={{
                                background: `linear-gradient(135deg, ${currentTier.color} 0%, ${currentTier.color}CC 100%)`,
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                filter: `drop-shadow(0 0 20px ${currentTier.glow})`,
                                fontFeatureSettings: '"tnum"'
                            }}>
                            {cumulativeAverage}
                        </h2>
                    </div>

                    {/* Stats Grid */}
                    <div className="space-y-2">
                        {filter === "all" && hasMixedHistory ? (
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
                            <>
                                {/* Row 1 */}
                                <div className="grid grid-cols-4 gap-1">
                                    <StatBox label={config.statLabels.total} value={totalGames} />
                                    <StatBox label={config.statLabels.score}
                                        value={totalGames > 0 ? (parseFloat(totalNormalizedScore as any) / totalGames).toFixed(1) : "0.0"} />
                                    <StatBox label={config.statLabels.best} value={`${winRate}%`} valueColor="text-emerald-400" />
                                    <StatBox label={config.statLabels.extra3} value={bestHighRun} valueColor="text-[#00FFD1]" />
                                </div>
                                {/* Row 2 */}
                                <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-white/10">
                                    <StatBox label={config.statLabels.bestVal} value={bestAverage} valueColor="text-[#10b981]" />
                                    <StatBox label={config.statLabels.extra1} value={recent10Avg} />
                                    <StatBox label={config.statLabels.extra2} value={`${emptyInningRate}%`} valueColor="text-red-400" />
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};
