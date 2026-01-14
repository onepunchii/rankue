
export interface RatingResult {
    newPlayerRating: number;
    diff: number;
    newProblemDifficulty: number;
    breakdown: {
        base: number;
        timeBonus: number;
        streakBonus: number;
        kFactor: number;
    };
}

export class BrainEloSystem {
    // 1. Core Variables & Constants
    private static readonly BASE_K_FACTOR = 32;
    private static readonly PLACEMENT_K_FACTOR = 64;
    private static readonly PLACEMENT_GAMES_THRESHOLD = 10;
    private static readonly ANTI_ABUSE_THRESHOLD = 0.5; // seconds

    /**
     * Calculates the new rating for a user and the problem based on the outcome.
     */
    static calculateNewRating(
        playerRating: number,
        problemDifficulty: number,
        isCorrect: boolean,
        timeTaken: number,
        currentStreak: number,
        totalGamesPlayed: number
    ): RatingResult {
        // 0. Anti-Abuse Check
        if (timeTaken < this.ANTI_ABUSE_THRESHOLD) {
            return {
                newPlayerRating: playerRating,
                diff: 0,
                newProblemDifficulty: problemDifficulty,
                breakdown: { base: 0, timeBonus: 0, streakBonus: 0, kFactor: 0 },
            };
        }

        // 1. Determine K-Factor (Placement vs Standard)
        const kFactor =
            totalGamesPlayed < this.PLACEMENT_GAMES_THRESHOLD
                ? this.PLACEMENT_K_FACTOR
                : this.BASE_K_FACTOR;

        // 2. Calculate Expected Score (Standard ELO Formula)
        // E = 1 / (1 + 10 ^ ((OpponentRating - PlayerRating) / 400))
        const expectedScore =
            1 / (1 + Math.pow(10, (problemDifficulty - playerRating) / 400));

        // 3. Calculate Base Rating Change
        // Actual Score: 1 (Win) or 0 (Loss)
        const actualScore = isCorrect ? 1 : 0;
        let rankDiff = kFactor * (actualScore - expectedScore);

        // 4. Time-Weighting Multiplier (Only on Win)
        let timeBonus = 0;
        if (isCorrect) {
            const multiplier = this.getTimeMultiplier(timeTaken);
            // The bonus is the extra points added by the multiplier
            // NewDiff = BaseDiff * Multiplier
            // Bonus = NewDiff - BaseDiff
            const originalDiff = rankDiff;
            rankDiff = rankDiff * multiplier;
            timeBonus = rankDiff - originalDiff;
        }

        // 5. Winning Streak Bonus (Only on Win)
        let streakBonus = 0;
        if (isCorrect) {
            streakBonus = this.getStreakBonus(currentStreak);
            rankDiff += streakBonus;
        }

        // Final Rounding
        rankDiff = Math.round(rankDiff);
        timeBonus = Math.round(timeBonus);
        // Streak bonus is integer already

        // 6. Calculate New Ratings
        const newPlayerRating = playerRating + rankDiff;

        // Problem rating updates inversely
        // For PvE, usually the problem loses points if solved, gains if failed.
        // We use the raw ELO formulas inverse for the problem usually, but let's just reverse the diff
        // strictly based on the K-factor standard exchange (ignoring user streak/time bonuses for the problem to prevent inflation?
        // The prompt says: "The problem's rating should also update inversely"
        // Usually only the Base K-Factor exchange is applied to the opponent to avoid inflation.
        // Let's calculate purely ELO-based change for the problem.
        const problemExpected = 1 / (1 + Math.pow(10, (playerRating - problemDifficulty) / 400));
        const problemActual = isCorrect ? 0 : 1;
        // We stick to Base K for problem to stabilize Difficulty
        const problemDiff = Math.round(this.BASE_K_FACTOR * (problemActual - problemExpected));
        const newProblemDifficulty = problemDifficulty + problemDiff;

        return {
            newPlayerRating,
            diff: rankDiff,
            newProblemDifficulty,
            breakdown: {
                base: Math.round(rankDiff - timeBonus - streakBonus),
                timeBonus,
                streakBonus,
                kFactor,
            },
        };
    }

    /**
     * Helper: Time-Weighting Multiplier
     */
    private static getTimeMultiplier(timeTaken: number): number {
        if (timeTaken <= 0.5) return 0; // Should be handled by anti-abuse, but safe fallback
        if (timeTaken <= 5.0) return 1.5; // Super Fast
        if (timeTaken <= 20.0) return 1.2; // Fast
        if (timeTaken <= 50.0) return 1.0; // Normal
        return 0.8; // Late
    }

    /**
     * Helper: Winning Streak Bonus
     * Note: The prompt implies the streak *before* this game or *including* this game?
     * "If the user is on a streak". Usually calculated inclusive of the current win if checking > 10.
     * Assuming `currentStreak` passed in INCLUDES the current win (e.g. they had 2, won, now 3).
     * Or if passing "previous streak", we need to increment.
     * Let's assume input `currentStreak` is the streak count AFTER this win.
     */
    private static getStreakBonus(currentStreak: number): number {
        if (currentStreak >= 10) return 10;
        if (currentStreak >= 5) return 5;
        if (currentStreak >= 3) return 3;
        return 0;
    }

    /**
     * 4. Level Calculation Helper
     */
    static getLevel(score: number): number {
        if (score <= 1200) return 1; // Bronze
        if (score <= 1400) return 2; // Silver
        if (score <= 1600) return 3; // Gold
        if (score <= 1800) return 4; // Platinum
        return 5; // Diamond
    }

    /**
     * 5. IQ Calculation Helper
     * @param totalEloScore Sum of 5 category ratings (approx 6000 base)
     */
    static calculateBrainIQ(totalEloScore: number): number {
        // Base: 6000 (1200 * 5) -> IQ 100
        // Every 50 points deviation from 6000 -> 1 IQ point (approx)
        const diff = totalEloScore - 6000;
        // Clamp min IQ to 50, max to 200 just in case
        return Math.max(50, Math.min(200, 100 + Math.round(diff / 50)));
    }

    /**
     * 6. Brain Comment Helper
     */
    static getBrainComment(iq: number): { title: string; topPercent: string; comment: string; icon: string } {
        if (iq >= 145) {
            return {
                title: "지구에 불시착한 외계인",
                topPercent: "상위 0.1%",
                comment: "혹시 NASA에서 오셨나요? 인류의 데이터로는 당신을 측정 불가!",
                icon: "👽"
            };
        }
        if (iq >= 130) {
            return {
                title: "걸어 다니는 슈퍼컴퓨터",
                topPercent: " 상위 2%",
                comment: "AI가 당신을 라이벌로 인식하기 시작했습니다.",
                icon: "🤖"
            };
        }
        if (iq >= 115) {
            return {
                title: "전교 1등 포스",
                topPercent: "상위 15%",
                comment: "어딜 가나 '똑똑하다'는 소리 좀 듣지 않나요?",
                icon: "🎓"
            };
        }
        if (iq >= 95) {
            return {
                title: "말랑말랑한 평범한 뇌",
                topPercent: "상위 50%",
                comment: "지극히 정상입니다! 조금만 훈련하면 '수재'가 될 잠재력이 보여요.",
                icon: "🧠"
            };
        }
        return {
            title: "생각하는 돌맹이",
            topPercent: "상위 80%",
            comment: "혹시 문제를 발로 푸셨나요? 우뇌와 좌뇌가 아직 서먹한 사이인 듯합니다.",
            icon: "🗿"
        };
    }
}
