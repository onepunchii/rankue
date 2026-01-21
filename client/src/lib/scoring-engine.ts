/**
 * HiQ Scoring & Rules Engine
 * Handles both "Sim Points" (Style) and "Game Score" (Rules).
 */

export interface ShotResult {
    cushionCount: number;
    travelDistance: number;
    isSuccess: boolean;
    precisionError: number;
    spinComplexity: number;
}

export interface GameEvent {
    type: 'collision' | 'cushion';
    subject: string;
    object?: string;
}

export interface TurnResult {
    scoreChange: number;
    type: 'success' | 'fail' | 'foul';
    message: string;
    cushionCount?: number;
}

export class GameRuleEngine {
    /**
     * Evaluate a turn based on chronological physics events
     */
    public static evaluateTurn(events: GameEvent[], mode: '3ball' | '4ball'): TurnResult {
        let firstBall: string | null = null;
        let secondBall: string | null = null;
        let hitOpponent = false;
        let cushionsBeforeFirst = 0;
        let cushionsBeforeSecond = 0;

        events.forEach(e => {
            if (e.type === 'cushion') {
                if (e.subject === 'white') {
                    if (!firstBall) cushionsBeforeFirst++;
                    if (!secondBall) cushionsBeforeSecond++;
                }
            } else if (e.type === 'collision') {
                let hit: string | null = null;
                if (e.subject === 'white') hit = e.object || null;
                else if (e.object === 'white') hit = e.subject;

                if (hit) {
                    // Check if hitting the opponent's ball in 4-ball
                    if (mode === '4ball' && hit === 'yellow') hitOpponent = true;

                    // In 3-ball, yellow is an object ball, not an opponent ball. 
                    // But in 4-ball, yellow is the opponent's ball.

                    if (!firstBall) {
                        firstBall = hit;
                    } else if (!secondBall && hit !== firstBall) {
                        secondBall = hit;
                    }
                }
            }
        });

        if (mode === '4ball') {
            return this.evaluate4Ball(firstBall, secondBall, hitOpponent, cushionsBeforeSecond);
        } else {
            return this.evaluate3Ball(firstBall, secondBall, cushionsBeforeFirst, cushionsBeforeSecond);
        }
    }

    private static evaluate4Ball(first: string | null, second: string | null, hitOpponent: boolean, cushions: number): TurnResult {
        if (hitOpponent) {
            return {
                scoreChange: -1,
                type: 'foul',
                message: "파울! 상대방 공을 건드렸습니다. (-1점)"
            };
        }

        const isRed1 = first === 'red' || first === 'red2';
        const isRed2 = second === 'red' || second === 'red2';

        if (isRed1 && isRed2) {
            return {
                scoreChange: 1,
                type: 'success',
                message: "득점 성공! (+1점)",
                cushionCount: cushions
            };
        }

        return { scoreChange: 0, type: 'fail', message: "" };
    }

    private static evaluate3Ball(first: string | null, second: string | null, cBefore1: number, cBefore2: number): TurnResult {
        const isTarget1 = first === 'yellow' || first === 'red';
        const isTarget2 = second === 'yellow' || second === 'red';

        if (!isTarget1 || !isTarget2) return { scoreChange: 0, type: 'fail', message: "" };

        // Goal: 3 cushions before hitting the second ball
        if (cBefore2 >= 3) {
            // Bank Shot: 3 cushions before hitting any ball
            if (cBefore1 >= 3) {
                return {
                    scoreChange: 2,
                    type: 'success',
                    message: "뱅크샷 성공! 🔥 (+2점)",
                    cushionCount: cBefore2
                };
            }
            return {
                scoreChange: 1,
                type: 'success',
                message: "3쿠션 득점! (+1점)",
                cushionCount: cBefore2
            };
        }

        return {
            scoreChange: 0,
            type: 'fail',
            message: "무득점 (쿠션 부족)"
        };
    }
}

export class ScoringEngine {
    /**
     * Calculate Sim Points (SP) based on performance and difficulty
     */
    public static calculatePoints(result: ShotResult): number {
        if (!result.isSuccess) return 0;

        const basePoints = 100;

        // Multipliers
        const cushionMult = 1 + (result.cushionCount * 0.5); // +50% per cushion
        const distanceBonus = Math.floor(result.travelDistance / 100) * 10;

        // Precision deduction (Lower error = higher points)
        // Max error considered: 50 units (ball radius equivalent)
        const precisionBonus = Math.max(0, 50 - result.precisionError) * 2;

        const total = (basePoints * cushionMult) + distanceBonus + precisionBonus;

        return Math.floor(total);
    }

    /**
     * Determine difficulty text based on parameters
     */
    public static getDifficulty(cushionCount: number): 'easy' | 'normal' | 'hard' | 'pro' {
        if (cushionCount <= 1) return 'easy';
        if (cushionCount <= 2) return 'normal';
        if (cushionCount <= 3) return 'hard';
        return 'pro';
    }
}
