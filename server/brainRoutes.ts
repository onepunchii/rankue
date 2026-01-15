
import { Router } from "express";
import { storage } from "./storage.js";
import { generateBrainQuestions } from "./ai.js";
import { requireAuth } from "./auth.js";
import { BrainEloSystem } from "./utils/brainElo.js";
import { sendSuccess, sendError } from "./utils/response.js";

const router = Router();

// Admin: Generate Questions
router.post("/admin/generate-questions", requireAuth, async (req, res) => {
    const { category, level, count } = req.body;
    if (!category || !level) return sendError(res, 400, "Missing parameters");

    const numCount = count || 5;

    try {
        const generated = await generateBrainQuestions(category, parseInt(level), numCount);

        // Save to DB
        const saved: any[] = [];
        for (const q of generated) {
            const qData = {
                category,
                level: parseInt(level),
                eloRating: 1200 + (parseInt(level) * 100), // Approximate start rating
                content: q, // JSONB
                isActive: true,
            };
            const savedQ = await storage.createBrainQuestion(qData);
            saved.push(savedQ);
        }

        return sendSuccess(res, { generatedCount: saved.length }, "Questions generated successfully");
    } catch (err) {
        console.error(err);
        return sendError(res, 500, "Failed to generate questions");
    }
});

// User: Get Daily Quiz
router.get("/quiz/daily", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const user = await storage.getUserBrainStats(userId);

        let brainLevel = 1;
        if (user) {
            brainLevel = user.brainLevel || 1;
        }

        const questions = await storage.getBrainDailyQuestions(brainLevel);
        return sendSuccess(res, { questions });
    } catch (e: any) {
        console.error(`[BrainQuiz] Error fetching daily quiz:`, e);
        return sendError(res, 500, "서버 오류: " + e.message);
    }
});

// User: Submit Quiz Answer
router.post("/quiz/submit", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { questionId, answer, timeTaken } = req.body;

        const timeInSeconds = typeof timeTaken === 'number' ? timeTaken : 60;

        const question = await storage.getBrainQuestion(questionId);
        if (!question) return sendError(res, 404, "Question not found");

        const content = question.content as any;
        const isCorrect = content.answer === answer;

        const { userNewRating, questionNewRating, diff, breakdown } = await storage.updateBrainRatings(userId, questionId, isCorrect, timeInSeconds);

        const userStats = await storage.getUserBrainStats(userId);

        await storage.recordBrainGameLog({
            userId,
            questionId,
            isCorrect,
            userLevelAtTime: userStats.brainLevel,
        });

        return sendSuccess(res, {
            correct: isCorrect,
            userRating: userNewRating,
            ratingDiff: diff,
            breakdown,
            correctAnswer: isCorrect ? undefined : content.answer,
            explanation: content.explanation
        });
    } catch (error: any) {
        return sendError(res, 500, error.message);
    }
});

// User: Get Stats
router.get("/user/stats", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const user = await storage.getUserBrainStats(userId);

        const totalScore =
            user.brainRatingLogic +
            user.brainRatingMath +
            user.brainRatingVerbal +
            user.brainRatingEconomy +
            user.brainRatingTrivia;

        const iq = BrainEloSystem.calculateBrainIQ(totalScore);
        const report = BrainEloSystem.getBrainComment(iq);

        const stats = {
            level: user.brainLevel,
            ratings: {
                logic: user.brainRatingLogic,
                math: user.brainRatingMath,
                verbal: user.brainRatingVerbal,
                economy: user.brainRatingEconomy,
                trivia: user.brainRatingTrivia,
            },
            totalScore,
            iq,
            report,
            topPercent: 35
        };

        return sendSuccess(res, stats);
    } catch (error: any) {
        return sendError(res, 500, error.message);
    }
});

// Leaderboard
router.get("/brain/leaderboard", async (req, res) => {
    try {
        const { category, limit: queryLimit } = req.query;
        const limit = parseInt(queryLimit as string) || 20;

        const leaderboard = await storage.getBrainLeaderboard(category as string || 'TOTAL', limit);
        return sendSuccess(res, leaderboard);
    } catch (error: any) {
        return sendError(res, 500, error.message);
    }
});

export default router;
