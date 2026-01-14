
import { db } from "../db";
import { brainQuestions, brainGameLogs, profiles } from "@shared/schema";
import { eq, sql, inArray, and, desc, asc } from "drizzle-orm";
import { BrainQuestion, BrainGameLog, InsertBrainQuestion, InsertBrainGameLog } from "@shared/schema";

import { BrainEloSystem } from "../utils/brainElo";

// ELO K-Factor
const K_FACTOR = 32;

export interface BrainStorage {
    createQuestion(question: InsertBrainQuestion): Promise<BrainQuestion>;
    getQuestion(id: number): Promise<BrainQuestion | undefined>;
    getDailyQuestions(userLevel: number): Promise<BrainQuestion[]>;
    recordGameLog(log: InsertBrainGameLog): Promise<BrainGameLog>;
    updateRatings(userId: string, questionId: number, isCorrect: boolean, timeTaken: number): Promise<{ userNewRating: number; questionNewRating: number; diff: number; breakdown: any }>;
    getUserBrainStats(userId: string): Promise<any>; // Returns profile with brain stats
    getLeaderboard(category: string, limit?: number): Promise<any[]>;
}

export class PostgresBrainStorage implements BrainStorage {
    async createQuestion(question: InsertBrainQuestion): Promise<BrainQuestion> {
        const [newQuestion] = await db
            .insert(brainQuestions)
            .values(question)
            .returning();
        return newQuestion;
    }

    async getQuestion(id: number): Promise<BrainQuestion | undefined> {
        const [question] = await db
            .select()
            .from(brainQuestions)
            .where(eq(brainQuestions.id, id));
        return question;
    }

    async getDailyQuestions(userLevel: number): Promise<BrainQuestion[]> {
        // [MODIFIED FOR SAMPLE CHECK]
        // Since we only have LOGIC and MATH data currently uploaded, 
        // we will fetch mixed questions from any available category to ensure a full quiz experience.

        const levels = [
            Math.max(1, userLevel - 1),
            userLevel,
            Math.min(5, userLevel + 1)
        ];

        // Fetch up to 20 random questions from available levels
        const result = await db.select()
            .from(brainQuestions)
            .where(and(
                inArray(brainQuestions.level, levels),
                eq(brainQuestions.isActive, true)
            ))
            .orderBy(sql`RANDOM()`)
            .limit(20);

        return result;
    }

    async recordGameLog(log: InsertBrainGameLog): Promise<BrainGameLog> {
        const [entry] = await db.insert(brainGameLogs).values(log).returning();
        return entry;
    }

    async updateRatings(userId: string, questionId: number, isCorrect: boolean, timeTaken: number): Promise<{ userNewRating: number; questionNewRating: number; diff: number; breakdown: any }> {
        // 1. Get current stats
        const user = await this.getUserBrainStats(userId);
        const question = await this.getQuestion(questionId);

        if (!user || !question) throw new Error("User or Question not found");

        // Determine category rating and column
        let userRating = 1200;
        let ratingColumn = 'brainRatingLogic'; // default

        switch (question.category) {
            case 'LOGIC': userRating = user.brainRatingLogic; ratingColumn = 'brainRatingLogic'; break;
            case 'MATH': userRating = user.brainRatingMath; ratingColumn = 'brainRatingMath'; break;
            case 'VERBAL': userRating = user.brainRatingVerbal; ratingColumn = 'brainRatingVerbal'; break;
            case 'ECONOMY': userRating = user.brainRatingEconomy; ratingColumn = 'brainRatingEconomy'; break;
            case 'TRIVIA': userRating = user.brainRatingTrivia; ratingColumn = 'brainRatingTrivia'; break;
        }

        // 2. Get Statistics for ELO Calculation
        // Count total games played by user (for provisional rating)
        const [totalGamesResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(brainGameLogs)
            .where(eq(brainGameLogs.userId, userId));

        const totalGamesPlayed = Number(totalGamesResult?.count || 0);

        // Calculate current streak
        // We fetch last 20 logs to check for consecutive wins
        const recentLogs = await db
            .select()
            .from(brainGameLogs)
            .where(eq(brainGameLogs.userId, userId))
            .orderBy(desc(brainGameLogs.solvedAt))
            .limit(20);

        let currentStreak = 0;
        if (isCorrect) {
            currentStreak = 1; // Current win
            for (const log of recentLogs) {
                if (log.isCorrect) currentStreak++;
                else break;
            }
        }
        // Note: If !isCorrect, streak is 0.

        // 3. Calculate New Ratings using BrainEloSystem
        const { newPlayerRating, newProblemDifficulty, diff, breakdown } = BrainEloSystem.calculateNewRating(
            userRating,
            question.eloRating,
            isCorrect,
            timeTaken,
            currentStreak,
            totalGamesPlayed
        );

        // 4. Update DB
        // Update User Rating & Streak
        await db.update(profiles)
            .set({
                [ratingColumn]: newPlayerRating,
                brainCurrentStreak: currentStreak
            })
            .where(eq(profiles.id, userId));

        // Update Question Rating
        await db.update(brainQuestions)
            .set({ eloRating: newProblemDifficulty })
            .where(eq(brainQuestions.id, questionId));

        // 5. Update Overall Level
        // Re-fetch updated user to calculate global average for level
        const updatedUser = await this.getUserBrainStats(userId);
        const allRatings = [
            updatedUser.brainRatingLogic,
            updatedUser.brainRatingMath,
            updatedUser.brainRatingVerbal,
            updatedUser.brainRatingEconomy,
            updatedUser.brainRatingTrivia
        ];

        // Calculate Average
        const avgRating = allRatings.reduce((a, b) => a + b, 0) / 5;
        const newLevel = BrainEloSystem.getLevel(avgRating);

        if (newLevel !== user.brainLevel) {
            await db.update(profiles)
                .set({ brainLevel: newLevel })
                .where(eq(profiles.id, userId));
        }

        return { userNewRating: newPlayerRating, questionNewRating: newProblemDifficulty, diff, breakdown };
    }

    async getUserBrainStats(userId: string): Promise<any> {
        const [user] = await db.select().from(profiles).where(eq(profiles.id, userId));
        return user;
    }

    async getLeaderboard(category: string, limit: number = 50): Promise<any[]> {
        let orderBy;
        switch (category) {
            case 'LOGIC': orderBy = desc(profiles.brainRatingLogic); break;
            case 'MATH': orderBy = desc(profiles.brainRatingMath); break;
            case 'VERBAL': orderBy = desc(profiles.brainRatingVerbal); break;
            case 'ECONOMY': orderBy = desc(profiles.brainRatingEconomy); break;
            case 'TRIVIA': orderBy = desc(profiles.brainRatingTrivia); break;
            default:
                // Sort by Total Score (Sum of all ratings)
                orderBy = sql`(brain_rating_logic + brain_rating_math + brain_rating_verbal + brain_rating_economy + brain_rating_trivia) DESC`;
                break;
        }

        return await db.select({
            id: profiles.id,
            username: profiles.nickname,
            avatarUrl: profiles.profileImageUrl,
            brainLevel: profiles.brainLevel,
            brainRatingLogic: profiles.brainRatingLogic,
            brainRatingMath: profiles.brainRatingMath,
            brainRatingVerbal: profiles.brainRatingVerbal,
            brainRatingEconomy: profiles.brainRatingEconomy,
            brainRatingTrivia: profiles.brainRatingTrivia,
            brainCurrentStreak: profiles.brainCurrentStreak,
            brainLastRank: profiles.brainLastRank,
            totalScore: sql<number>`(brain_rating_logic + brain_rating_math + brain_rating_verbal + brain_rating_economy + brain_rating_trivia)`
        })
            .from(profiles)
            .orderBy(orderBy)
            .limit(limit);
    }
}
