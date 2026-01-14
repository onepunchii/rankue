
import { Router } from "express";
import { storage } from "./storage";
import { generateBrainQuestions } from "./ai";
import { requireAuth } from "./simpleAuth";
import { BrainEloSystem } from "./utils/brainElo";

const router = Router();

// Admin: Generate Questions
router.post("/admin/generate-questions", requireAuth, async (req, res) => {
    // Security check: Only allow admin (or for now, anyone logged in if we don't have roles)
    // Let's assume basic auth is enough for prototype, or we check userId.
    // if (req.user?.id !== 'ADMIN_ID') ... 

    const { category, level, count } = req.body;
    if (!category || !level) return res.status(400).json({ error: "Missing parameters" });

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

        res.json({ success: true, generated: saved.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to generate questions" });
    }
});

// User: Get Daily Quiz
router.get("/quiz/daily", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        console.log(`[BrainQuiz] User ${userId} requested daily quiz.`);

        const user = await storage.getUserBrainStats(userId);

        let brainLevel = 1;
        if (!user) {
            console.warn(`[BrainQuiz] User profile not found in profiles table: ${userId}. Using defaults.`);
            // If user exists in Auth but not Profile (edge case), default to Level 1
        } else {
            brainLevel = user.brainLevel || 1;
        }

        console.log(`[BrainQuiz] User Brain Level: ${brainLevel}`);

        const questions = await storage.getBrainDailyQuestions(brainLevel);
        console.log(`[BrainQuiz] Questions found: ${questions.length}`);

        if (questions.length === 0) {
            console.warn(`[BrainQuiz] No questions found! Active filter applied?`);
        }

        res.json({ questions });
    } catch (e: any) {
        console.error(`[BrainQuiz] Error fetching daily quiz:`, e);
        res.status(500).json({ error: "서버 오류: " + e.message });
    }
});

// User: Submit Quiz Answer
router.post("/quiz/submit", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { questionId, answer, timeTaken } = req.body;

    // Default time if not provided (assume late/slow)
    const timeInSeconds = typeof timeTaken === 'number' ? timeTaken : 60;

    const question = await storage.getBrainQuestion(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Check answer
    // question.content is JSONB. We need to cast it or access it.
    const content = question.content as any;
    const isCorrect = content.answer === answer;

    // Update Ratings & Log
    const { userNewRating, questionNewRating, diff, breakdown } = await storage.updateBrainRatings(userId, questionId, isCorrect, timeInSeconds);

    await storage.recordBrainGameLog({
        userId,
        questionId,
        isCorrect,
        userLevelAtTime: (await storage.getUserBrainStats(userId)).brainLevel,
    });

    res.json({
        correct: isCorrect,
        userRating: userNewRating,
        ratingDiff: diff,
        breakdown,
        correctAnswer: isCorrect ? undefined : content.answer,
        explanation: content.explanation
    });
});

// User: Get Stats
router.get("/user/stats", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const user = await storage.getUserBrainStats(userId);

    // Calculate total score
    const totalScore =
        user.brainRatingLogic +
        user.brainRatingMath +
        user.brainRatingVerbal +
        user.brainRatingEconomy +
        user.brainRatingTrivia;

    // Calculate IQ & Report
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
        report, // title, comment, icon, topPercent
        // Mock percentile for now
        topPercent: 35
    };

    res.json(stats);
});

// Leaderboard
router.get("/rank/top", async (req, res) => {
    const { category, page } = req.query;
    const limit = 50;
    // page logic implementation needed in storage if we want pagination

    const leaderboard = await storage.getBrainLeaderboard(category as string, limit);
    res.json(leaderboard);
});

export default router;
