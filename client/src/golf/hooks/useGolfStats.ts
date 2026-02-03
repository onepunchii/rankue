export function useGolfStats(member: any) {
    // Mock Data for "Golf Life"
    // In the future, this can be replaced with actual API calls
    const recentScores = [
        { id: 1, score: 92 },
        { id: 2, score: 88 },
        { id: 3, score: 85 },
        { id: 4, score: 82 },
        { id: 5, score: 78 } // Best/Last
    ];

    // Calculate Average Score
    const totalScore = recentScores.reduce((sum, item) => sum + item.score, 0);
    const avgScore = recentScores.length > 0 ? Math.round(totalScore / recentScores.length) : 0;

    const stats = {
        bestScore: member?.golfBestScore || 78,
        totalRounds: 42, // Mock accumulated rounds (since we only show recent 5)
        avgScore: avgScore
    };

    return { recentScores, stats };
}
