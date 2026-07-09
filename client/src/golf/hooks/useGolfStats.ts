import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useGolfStats(member: any) {
    const { data: historyData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ["/api/hiq/history", { sport: "GOLF" }],
        queryFn: async () => await apiRequest("/api/hiq/history?sport=GOLF")
    });

    // Process History Data: apiRequest already returns json.data
    const officialHistory = Array.isArray(historyData) ? historyData : (historyData as any)?.data || [];
    const validGames = officialHistory.filter((g: any) => g.sportCategory === 'GOLF' && g.score > 0);

    // 1. Recent Scores (for Graph) - Reverse to show chronological order left-to-right if needed, 
    // but typically graphs expect chronological. Assuming API returns newest first?
    // Let's assume API returns newest first (desc). We want oldest -> newest for graph usually.
    // Taking last 10 games.
    const recentScores = validGames
        .slice(0, 10)
        .reverse()
        .map((g: any, i: number) => ({
            id: i,
            score: g.score,
            date: g.playedAt
        }));

    // 2. Calculate Stats
    const totalRounds = validGames.length;

    // Average Score
    const totalScore = validGames.reduce((sum: number, g: any) => sum + g.score, 0);
    // Always a string ("82.0") so consumers never have to handle a number|string union.
    const avgScore = totalRounds > 0 ? (totalScore / totalRounds).toFixed(1) : "0.0";

    // Best Score
    const bestScore = validGames.length > 0
        ? Math.min(...validGames.map((g: any) => g.score))
        : (member?.golfBestScore || 0);

    const stats = {
        bestScore: totalRounds > 0 ? bestScore : (member?.golfBestScore || 0),
        totalRounds,
        avgScore: totalRounds > 0 ? avgScore : (member?.golfAvgScore ? Number(member.golfAvgScore).toFixed(1) : "0.0"),
    };

    return { recentScores, stats, isLoading: isHistoryLoading };
}
