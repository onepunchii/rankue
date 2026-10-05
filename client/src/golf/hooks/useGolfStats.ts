import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { countsOnSite } from "@shared/golfOnSite";

export function useGolfStats(member: any) {
    const { data: historyData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ["/api/hiq/history", { sport: "GOLF" }],
        queryFn: async () => await apiRequest("/api/hiq/history?sport=GOLF"),
        // 비로그인은 부르지 않는다(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다").
        // 내 기록은 로그인 필수라 401 만 돌아온다 — 비로그인 골프 홈은 이 값 대신 예시(shared/guestSample)를 그린다.
        // 회원에게는 달라지는 게 없다: 골프 홈은 '나'를 받은 뒤에야 그려진다.
        enabled: !!member,
    });

    // Process History Data: apiRequest already returns json.data
    const officialHistory = Array.isArray(historyData) ? historyData : (historyData as any)?.data || [];
    // 공식 라운드만(현장 인증 + 옛 기록) — 홈 그래프·평균이 라운딩 리포트 기본값과 같은 숫자여야 한다(2026-10-01 오너)
    const validGames = officialHistory.filter((g: any) => g.sportCategory === 'GOLF' && g.score > 0 && countsOnSite(g.onSite));

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
