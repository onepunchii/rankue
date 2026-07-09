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
    <div className="text-center py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] min-w-0">
        <p className="text-white/45 text-[12px] font-medium mb-1 leading-none truncate">
            {label}
        </p>
        <p className={cn("text-[15px] font-bold tabular-nums", valueColor)}>{value}</p>
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
                <Card className="rounded-3xl overflow-hidden relative border-[#84cc1644] border-[1.5px]"
                    style={{ background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)' }}>
                    <CardContent className="p-6 relative z-10">
                        {/* Tier Badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-4xl">{currentTier.icon}</span>
                            <div>
                                <p className="text-[12px] font-medium text-white/55 uppercase tracking-[0.15em] mb-1">등급</p>
                                <p className="text-xl font-semibold uppercase text-brand tracking-wide" style={{ textShadow: `0 0 10px #84cc1644` }}>
                                    {currentTier.label}
                                </p>
                                <p className="text-[12px] font-medium text-white/45 uppercase mt-0.5">상위 15%</p>
                            </div>
                        </div>

                        {/* Average Score (Main) */}
                        <div className="mb-8 text-center">
                            <p className="text-[12px] font-medium text-white/55 uppercase tracking-[0.3em] mb-2">평균 타수</p>
                            <h2 className="text-7xl font-semibold text-brand tracking-tight" style={{ textShadow: "0 0 20px rgba(132, 204, 22, 0.3)" }}>
                                {golfStats?.avgScore || "-"}
                            </h2>
                        </div>

                        {/* Sub Stats Grid */}
                        <div className="grid grid-cols-3 gap-3 pt-6 border-t border-white/10">
                            <div className="text-center">
                                <p className="text-[12px] font-medium text-white/40 uppercase mb-1">최고 점수</p>
                                <p className="text-xl font-semibold text-white">
                                    {golfStats?.bestScore || "-"} <span className="text-xs text-brand">타</span>
                                </p>
                            </div>
                            <div className="text-center border-x border-white/5">
                                <p className="text-[12px] font-medium text-white/40 uppercase mb-1">라운드</p>
                                <p className="text-xl font-semibold text-white">
                                    {golfStats?.totalRounds || 0} <span className="text-xs text-white/40">회</span>
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[12px] font-medium text-white/40 uppercase mb-1">최근 경기</p>
                                <p className="text-xl font-semibold text-white">{golfStats?.lastScore || "-"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    // 3. 당구 UI 렌더링 — flat, refined card (no gradient wash / glow)
    return (
        <motion.div key={filter} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="rk-card p-5">
                {/* Tier row */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-3xl">{currentTier.icon}</span>
                        <div className="min-w-0">
                            <p className="text-[12px] font-medium text-white/45 mb-0.5">등급</p>
                            <p className="text-[17px] font-bold tracking-tight truncate" style={{ color: currentTier.color }}>
                                {currentTier.label}
                            </p>
                        </div>
                    </div>
                    <span className="rk-chip bg-white/[0.05] text-white/55 shrink-0">상위 15%</span>
                </div>

                {/* Cumulative Average — hero number */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] py-5 text-center mb-4">
                    <p className="text-[12px] font-medium text-white/45 mb-1.5">누적 평균</p>
                    <p className="text-[52px] leading-none font-bold tabular-nums tracking-tight" style={{ color: currentTier.color }}>
                        {cumulativeAverage}
                    </p>
                </div>

                {/* Stats grid */}
                {filter === "all" && hasMixedHistory ? (
                    <div className="grid grid-cols-4 gap-2">
                        <StatBox label="총 경기" value={totalAllGames} />
                        <StatBox label="총 승리" value={totalAllWins} />
                        <StatBox label="승률" value={`${totalAllWinRate}%`} valueColor="text-brand" />
                        <StatBox label="주 종목" value={mainMode} />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                            <StatBox label={config.statLabels.total} value={totalGames} />
                            <StatBox label={config.statLabels.score}
                                value={totalGames > 0 ? (parseFloat(totalNormalizedScore as any) / totalGames).toFixed(1) : "0.0"} />
                            <StatBox label={config.statLabels.best} value={`${winRate}%`} valueColor="text-brand" />
                            <StatBox label={config.statLabels.extra3} value={bestHighRun} valueColor="text-cyan-400" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <StatBox label={config.statLabels.bestVal} value={bestAverage} valueColor="text-brand" />
                            <StatBox label={config.statLabels.extra1} value={recent10Avg} />
                            <StatBox label={config.statLabels.extra2} value={`${emptyInningRate}%`} valueColor="text-red-400" />
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
