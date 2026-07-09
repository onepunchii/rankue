import { useMemo } from "react";
import { HiqGameHistory, HiqMember } from "@shared/schema";
import { FilterType, ExtendedGameHistory } from "../components/hiq/history/types";

export const useGameStats = (
    history: HiqGameHistory[] | undefined,
    filter: FilterType,
    currentSport: string,
    member: HiqMember | undefined
) => {
    return useMemo(() => {
        // Filter history to ONLY show official match games
        const officialHistory = (history?.filter(g =>
            g.gameMode === "match" &&
            (g as any).isRanked &&
            (filter === "all" || g.gameType === filter)
        ) || []) as ExtendedGameHistory[];

        // Calculate aggregated stats
        const totalNormalizedScore = officialHistory.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = officialHistory.reduce((acc, g) => acc + g.innings, 0);

        // Calculate Cumulative Average
        const cumulativeAverage = totalInnings > 0
            ? (currentSport === "GOLF"
                ? ((totalNormalizedScore / totalInnings) * 18).toFixed(1)
                : (totalNormalizedScore / totalInnings).toFixed(3))
            : (currentSport === "GOLF" ? "0.0" : "0.000");

        // Stats
        const totalGames = officialHistory.length;
        const wins = officialHistory.filter(g => g.isWinner).length;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100).toString() : "0";
        const bestHighRun = Math.max(...officialHistory.map(g => g.highRun || 0), 0);
        const bestScore = officialHistory.length > 0
            ? (currentSport === "GOLF" ? Math.min(...officialHistory.map(g => g.score)) : Math.max(...officialHistory.map(g => g.score)))
            : 0;

        // Best Average — filter out NaN (a null/blank `average` would otherwise poison
        // Math.min/Math.max and render "NaN" in the UI).
        const validAverages = officialHistory
            .map(g => parseFloat(g.average))
            .filter(v => !isNaN(v));
        const bestAverage = validAverages.length > 0
            ? (currentSport === "GOLF"
                ? Math.min(...validAverages).toFixed(3)
                : Math.max(...validAverages).toFixed(3))
            : "0.000";

        // Recent 10 Games Average
        const recent10 = officialHistory.slice(0, 10);
        const r10Score = recent10.reduce((acc, g) => acc + g.score, 0);
        const r10Innings = recent10.reduce((acc, g) => acc + g.innings, 0);
        const recent10Avg = r10Innings > 0
            ? (r10Score / r10Innings).toFixed(3)
            : "0.000";

        // Empty Inning Rate
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

        // Tier Calculation (Performance Based)
        const getTier = (avg: number, is3c: boolean) => {
            if (currentSport === "GOLF") {
                const h = member?.golfHandicap || 0;
                if (h <= 0) return { label: "ALBATROSS", color: "#c0c0c0", icon: "🏆", glow: "rgba(192, 192, 192, 0.15)" };
                if (h <= 9) return { label: "EAGLE", color: "#FFD700", icon: "🦅", glow: "rgba(255, 215, 0, 0.15)" };
                if (h <= 18) return { label: "BIRDIE", color: "#10b981", icon: "🐦", glow: "rgba(16, 185, 129, 0.15)" };
                if (h <= 27) return { label: "PAR", color: "#3b82f6", icon: "⭕", glow: "rgba(59, 130, 246, 0.15)" };
                if (h <= 36) return { label: "BOGEY", color: "#94a3b8", icon: "⬜", glow: "rgba(148, 163, 184, 0.15)" };
                return { label: "ROOKIE", color: "#CD7F32", icon: "🐣", glow: "rgba(205, 127, 50, 0.15)" };
            }

            if (is3c) {
                if (avg >= 0.90) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
                if (avg >= 0.56) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
                if (avg >= 0.36) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
                return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
            } else {
                if (avg >= 5.00) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
                if (avg >= 3.00) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
                if (avg >= 1.51) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
                return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
            }
        };

        const currentTier = currentSport === "GOLF"
            ? getTier(0, false)
            : getTier(parseFloat(cumulativeAverage), filter === "3c");

        // Last 10 games for sparkline
        const last10Games = [...officialHistory].slice(0, 10).reverse().map((g, idx) => ({
            index: idx,
            avg: parseFloat(g.average) || 0
        }));

        // Main Mode calculation for "ALL" tab
        const games3cCount = officialHistory.filter(g => g.gameType === "3c").length;
        const games4cCount = officialHistory.filter(g => g.gameType === "4c").length;
        const mainMode = games3cCount >= games4cCount ? "3-Cushion" : "4-Ball";

        // Total stats for combined view
        const totalAllGames = officialHistory.length;
        const totalAllWins = wins;
        const totalAllWinRate = winRate;
        const hasMixedHistory = officialHistory.some(g => g.gameType === "3c") && officialHistory.some(g => g.gameType === "4c");

        return {
            officialHistory,
            totalGames,
            totalNormalizedScore,
            winRate,
            bestHighRun,
            bestScore,
            bestAverage,
            recent10Avg,
            emptyInningRate,
            cumulativeAverage,
            currentTier,
            last10Games,
            mainMode,
            totalAllGames,
            totalAllWins,
            totalAllWinRate,
            hasMixedHistory,
            member // Return member if needed by consumers
        };
    }, [history, filter, currentSport, member]);
};
