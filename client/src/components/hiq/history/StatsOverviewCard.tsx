import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RadialGauge } from "../ui/RadialGauge";
import { FormBadges, MatchResult } from "../ui/FormBadges";
import { BilliardBall, BallColor } from "../ui/BilliardBall";
import { SportConfig, FilterType } from "./types";
import { useT } from "@/lib/i18n";

// Tier → billiard-ball color (replaces the emoji medal with our ball motif).
const tierBall = (label: string): BallColor => {
    const t = (label || "").toUpperCase();
    if (t.includes("골드") || t.includes("GOLD")) return "yellow";
    if (t.includes("플래티넘") || t.includes("PLATINUM") || t.includes("실버") || t.includes("SILVER") || t.includes("DIAMOND")) return "white";
    return "red";
};

interface StatsOverviewCardProps {
    stats: any;
    config: SportConfig;
    filter: FilterType;
    currentSport: string;
}

// 1. 하위 컴포넌트로 분리 (재사용성)
const StatBox = ({ label, value, valueColor = "text-[rgba(0,0,0,0.87)]" }: { label: string, value: string | number, valueColor?: string }) => (
    <div className="text-center py-2.5 rounded-xl bg-black/[0.04] min-w-0">
        <p className="text-black/55 text-[12px] font-medium mb-1 leading-none truncate">
            {label}
        </p>
        <p className={cn("text-[15px] font-bold tabular-nums", valueColor)}>{value}</p>
    </div>
);

export const StatsOverviewCard = ({ stats, config, filter, currentSport }: StatsOverviewCardProps) => {
    const { t } = useT();
    // 안전한 데이터 접근을 위한 구조 분해 할당 (기본값 설정)
    const {
        currentTier = { icon: '🏌️', label: 'ROOKIE', color: '#ffffff', glow: '#ffffff' },
        last10Games = [],
        totalGames = 0,
        totalNormalizedScore = 0,
        winRate = 0,
        bestHighRun = 0,
        // 평균 표기는 앱 전체가 3자리(useGameStats도 toFixed(3))라 기본값도 3자리로 맞춘다.
        bestAverage = "0.000",
        recent10Avg = "0.000",
        emptyInningRate = 0,
        mainMode = "-",
        totalAllGames = 0,
        totalAllWins = 0,
        totalAllWinRate = 0,
        hasMixedHistory = false,
        cumulativeAverage = "0.000",
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
                <Card className="rounded-3xl overflow-hidden relative shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    style={{ background: '#ffffff' }}>
                    <CardContent className="p-6 relative z-10">
                        {/* Tier Badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <BilliardBall color={tierBall(currentTier.label)} size={40} />
                            <div>
                                <p className="text-[12px] font-medium text-black/55 uppercase tracking-[0.15em] mb-1">{t("statsOverview.tier")}</p>
                                {/* statsOverview.topPercent("상위 15%")는 데이터와 무관한 고정 문자열이라 제거.
                                    이 화면엔 모집단 정보가 없어 실제 백분위를 계산할 수 없다. */}
                                <p className="text-xl font-semibold uppercase text-brand tracking-wide">
                                    {currentTier.label}
                                </p>
                            </div>
                        </div>

                        {/* Average Score (Main) */}
                        <div className="mb-8 text-center">
                            <p className="text-[12px] font-medium text-black/55 uppercase tracking-[0.3em] mb-2">{t("statsOverview.avgStrokes")}</p>
                            <h2 className="text-7xl font-semibold text-brand tracking-tight">
                                {golfStats?.avgScore || "-"}
                            </h2>
                        </div>

                        {/* Sub Stats Grid */}
                        <div className="grid grid-cols-3 gap-3 pt-6 border-t border-black/10">
                            <div className="text-center">
                                <p className="text-[12px] font-medium text-black/55 uppercase mb-1">{t("statsOverview.bestScore")}</p>
                                <p className="text-xl font-semibold text-[rgba(0,0,0,0.87)]">
                                    {golfStats?.bestScore || "-"} <span className="text-xs text-brand">{t("statsOverview.strokesUnit")}</span>
                                </p>
                            </div>
                            <div className="text-center border-x border-black/10">
                                <p className="text-[12px] font-medium text-black/55 uppercase mb-1">{t("statsOverview.rounds")}</p>
                                <p className="text-xl font-semibold text-[rgba(0,0,0,0.87)]">
                                    {golfStats?.totalRounds || 0} <span className="text-xs text-black/40">{t("statsOverview.roundsUnit")}</span>
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[12px] font-medium text-black/55 uppercase mb-1">{t("statsOverview.recentGame")}</p>
                                <p className="text-xl font-semibold text-[rgba(0,0,0,0.87)]">{golfStats?.lastScore || "-"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    // 3. 당구 UI 렌더링 — flat, refined card (no gradient wash / glow)
    // 승률 게이지 · 최근 폼 배지에 쓸 표시용 파생값 (officialHistory는 최신순)
    const billiardsMatches: any[] = stats?.officialHistory || [];
    const winRateNum = Number(winRate) || 0;
    const wins = billiardsMatches.filter((g: any) => g.isWinner).length;
    const losses = Math.max(0, totalGames - wins);
    const recentForm: MatchResult[] = billiardsMatches
        .slice(0, 5)
        .map((g: any) => (g.isWinner ? "W" : "L"));

    return (
        <motion.div key={filter} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="rk-card p-5">
                {/* Tier row — 우측 "상위 15%" 칩은 고정 문자열이라 제거했다(모집단을 몰라 계산 불가). */}
                <div className="flex items-center mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                        <BilliardBall color={tierBall(currentTier.label)} size={36} />
                        <div className="min-w-0">
                            <p className="text-[12px] font-medium text-black/45 mb-0.5">{t("statsOverview.tier")}</p>
                            <p className="text-[17px] font-bold tracking-tight truncate text-ink-1">
                                {currentTier.label}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Hero — 승률 게이지 + 누적 평균 + 승/패 */}
                <div className="rounded-2xl bg-black/[0.04] p-5 mb-4">
                    <div className="flex items-center gap-5">
                        <RadialGauge value={winRateNum} size={104} stroke={9}>
                            <div className="text-center leading-none">
                                <div className="text-[26px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums tracking-tight">
                                    {winRateNum}<span className="text-[14px] font-semibold text-black/55">%</span>
                                </div>
                                <div className="text-[12px] font-medium text-black/55 mt-1">{t("statsOverview.winRate")}</div>
                            </div>
                        </RadialGauge>

                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-black/55 mb-1">{t("statsOverview.cumulativeAvg")}</p>
                            <p className="text-[36px] leading-none font-bold tabular-nums tracking-tight mb-3.5" style={{ color: currentTier.color }}>
                                {cumulativeAverage}
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[20px] font-bold text-brand tabular-nums leading-none">{wins}</span>
                                    <span className="text-[12px] font-medium text-black/55">{t("statsOverview.winsUnit")}</span>
                                </div>
                                <div className="w-px h-4 bg-black/10" />
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[20px] font-bold text-red-500 tabular-nums leading-none">{losses}</span>
                                    <span className="text-[12px] font-medium text-black/55">{t("statsOverview.lossesUnit")}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {recentForm.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-black/[0.08]">
                            <p className="text-[12px] font-medium text-black/55 mb-2">{t("statsOverview.recentFive")}</p>
                            <FormBadges results={recentForm} size={24} />
                        </div>
                    )}
                </div>

                {/* Stats grid */}
                {filter === "all" && hasMixedHistory ? (
                    <div className="grid grid-cols-4 gap-2">
                        <StatBox label={t("statsOverview.totalGames")} value={totalAllGames} />
                        <StatBox label={t("statsOverview.totalWins")} value={totalAllWins} />
                        <StatBox label={t("statsOverview.winRate")} value={`${totalAllWinRate}%`} valueColor="text-brand" />
                        <StatBox label={t("statsOverview.mainMode")} value={mainMode} />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                            <StatBox label={t(config.statLabels.total)} value={totalGames} />
                            <StatBox label={t(config.statLabels.score)}
                                value={totalGames > 0 ? (parseFloat(totalNormalizedScore as any) / totalGames).toFixed(1) : "0.0"} />
                            <StatBox label={t(config.statLabels.best)} value={`${winRate}%`} valueColor="text-brand" />
                            <StatBox label={t(config.statLabels.extra3)} value={bestHighRun} valueColor="text-brand" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <StatBox label={t(config.statLabels.bestVal)} value={bestAverage} valueColor="text-brand" />
                            <StatBox label={t(config.statLabels.extra1)} value={recent10Avg} />
                            <StatBox label={t(config.statLabels.extra2)} value={`${emptyInningRate}%`} valueColor="text-red-500" />
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
