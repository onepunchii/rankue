import { useMemo } from "react";
import { HiqGameHistory, HiqMember } from "@shared/schema";
import { FilterType, ExtendedGameHistory } from "../components/hiq/history/types";
import { countsOnSite } from "@shared/golfOnSite";
import { realTierFor } from "@shared/realTier";

export const useGameStats = (
    history: HiqGameHistory[] | undefined,
    filter: FilterType,
    currentSport: string,
    member: HiqMember | undefined
) => {
    return useMemo(() => {
        // Filter history to ONLY show official match games
        // 골프는 공식 라운드만(현장 인증 + 옛 기록) — 미인증은 라운딩 리포트에만 따로 모인다(2026-10-01 오너)
        const officialHistory = (history?.filter(g =>
            g.gameMode === "match" &&
            (g as any).isRanked &&
            (filter === "all" || g.gameType === filter) &&
            (currentSport !== "GOLF" || countsOnSite((g as any).onSite))
        ) || []) as ExtendedGameHistory[];

        // Main Mode — ALL 탭에서 어느 종목을 대표로 볼지
        const games3cCount = officialHistory.filter(g => g.gameType === "3c").length;
        const games4cCount = officialHistory.filter(g => g.gameType === "4c").length;
        const mainMode = games3cCount >= games4cCount ? "3-Cushion" : "4-Ball";

        // 티어·평균 판정의 종목 컨텍스트. ALL 탭에선 주 종목을 따른다.
        // (예전엔 `filter === "3c"`라 ALL 탭이 무조건 4구 기준이 돼 3구 전용 유저가 플래티넘 → 브론즈로 뒤집혔다.)
        const is3cContext = filter === "all" ? mainMode === "3-Cushion" : filter === "3c";

        // ALL 탭은 3구·4구가 섞여 들어온다. 스케일이 다른 두 종목의 점수·이닝을 그대로 합치면
        // 어느 쪽도 대변하지 못하는 평균이 나오므로, 평균 계열 지표는 주 종목 경기만으로 집계한다.
        // (골프 기록은 gameType이 3c/4c가 아니라 분리 대상이 아니다.)
        const avgBase = (currentSport !== "GOLF" && filter === "all")
            ? officialHistory.filter(g => g.gameType === (is3cContext ? "3c" : "4c"))
            : officialHistory;

        // Calculate aggregated stats
        const totalNormalizedScore = officialHistory.reduce((acc, g) => acc + g.score, 0);

        // Calculate Cumulative Average (주 종목 기준)
        const avgBaseScore = avgBase.reduce((acc, g) => acc + g.score, 0);
        const avgBaseInnings = avgBase.reduce((acc, g) => acc + g.innings, 0);
        const cumulativeAverage = avgBaseInnings > 0
            ? (currentSport === "GOLF"
                ? ((avgBaseScore / avgBaseInnings) * 18).toFixed(1)
                : (avgBaseScore / avgBaseInnings).toFixed(3))
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
        const validAverages = avgBase
            .map(g => parseFloat(g.average))
            .filter(v => !isNaN(v));
        const bestAverage = validAverages.length > 0
            ? (currentSport === "GOLF"
                ? Math.min(...validAverages).toFixed(3)
                : Math.max(...validAverages).toFixed(3))
            : "0.000";

        // Recent 10 Games Average
        const recent10 = avgBase.slice(0, 10);
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

        // 골프 등급(핸디 기준). 당구의 실전 등급은 아래 realTier 가 정한다.
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

            // 당구는 여기서 매기지 않는다 — 아래 realTier(shared/realTier: 그 종목의 내 다마)가 정한다.
            void avg; void is3c;
            return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
        };

        // 당구의 실전 등급은 한 가지 식이다(shared/realTier — 그 종목의 내 다마, 2026-10-12).
        // 예전에는 여기서만 **누적 에버리지**로 4단계를 매겨, 친구 · 크루 화면의 등급(4구 다마 6단계)과 서로 달랐다.
        // 다마가 없으면(공식 5판 전) 등급이 없다 — realTier 가 null.
        const realGame: "3c" | "4c" = is3cContext ? "3c" : "4c";
        const realHandi = currentSport === "GOLF" ? null : (is3cContext ? member?.handi3c : member?.handi4c) ?? null;
        const realTier = currentSport === "GOLF" ? null : realTierFor(realHandi, realGame);
        const BILLIARDS_LOOK: Record<string, { label: string; color: string; icon: string; glow: string }> = {
            master: { label: "MASTER", color: "#B4232A", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" },
            diamond: { label: "DIAMOND", color: "#2F6FB5", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" },
            platinum: { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" },
            gold: { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" },
            silver: { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" },
            bronze: { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" },
        };
        const currentTier = currentSport === "GOLF"
            ? getTier(0, false)
            : BILLIARDS_LOOK[realTier?.id ?? "bronze"];

        // Last 10 games for sparkline — 종목이 섞이면 눈금이 달라 선이 의미를 잃으므로 avgBase 기준
        const last10Games = [...avgBase].slice(0, 10).reverse().map((g, idx) => ({
            index: idx,
            avg: parseFloat(g.average) || 0
        }));

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
            /** 당구: 실전 등급의 근거 — 화면이 다마 메달을 그린다. handi 가 null 이면 아직 등급이 없다 */
            realTier: currentSport === "GOLF" ? null : { game: realGame, handi: realHandi, id: realTier?.id ?? null, nameKey: realTier?.nameKey ?? null },
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
