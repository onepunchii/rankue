
import { Router } from "express";
import { storage } from "../storage.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { authenticateUser } from "../auth.js";

const router = Router();

// 1. Presidential Approval
router.get("/presidential-approval", async (req, res) => {
    try {
        const stats = await storage.getLatestPoliticalStats();
        if (!stats) return sendSuccess(res, []);

        const p = stats.presidential;
        const total = stats.totalParticipants || 1;

        // Transform to array expected by some parts of frontend
        const data = [
            { label: "매우 잘하고 있다", value: Math.round((p.positive * 0.6)) }, // Placeholder/Simulation if only aggregate exists
            { label: "잘하는 편이다", value: Math.round((p.positive * 0.4)) },
            { label: "잘못하는 편이다", value: Math.round((p.negative * 0.4)) },
            { label: "매우 잘못하고 있다", value: Math.round((p.negative * 0.6)) },
            { label: "잘 모름", value: p.neutral || 0 }
        ];

        // Add metadata like totalParticipants
        (data as any).totalParticipants = stats.totalParticipants;

        return sendSuccess(res, data);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch presidential approval");
    }
});

// 2. Party Support
router.get("/party-support", async (req, res) => {
    try {
        const stats = await storage.getLatestPoliticalStats();
        if (!stats) return sendSuccess(res, []);

        const parties = stats.parties || {};
        const data = Object.entries(parties).map(([label, value]) => ({
            label,
            value
        }));

        return sendSuccess(res, data);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch party support");
    }
});

// 3. Candidate Support / Priorities
router.get("/candidate-support", async (req, res) => {
    try {
        const stats = await storage.getLatestPoliticalStats();
        if (!stats) return sendSuccess(res, []);

        const priorities = stats.priorities || {};
        const data = Object.entries(priorities).map(([label, value]) => ({
            label,
            value
        }));

        return sendSuccess(res, data);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch candidate support");
    }
});

// 4. Current Stats (Combined)
router.get("/current-stats", async (req, res) => {
    try {
        const stats = await storage.getLatestPoliticalStats();
        if (!stats) return sendSuccess(res, {});
        return sendSuccess(res, stats);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch current stats");
    }
});

// 5. Weekly Trends
router.get("/weekly-trends", async (req, res) => {
    try {
        const trends = await storage.getWeeklyTrends(12);

        // Transform to format expected by AreaCharts
        const presidential = trends.map(t => ({
            week: t.weekLabel,
            "긍정": t.presidential.positive,
            "부정": t.presidential.negative,
            "중립": t.presidential.neutral,
            "참여자": t.totalParticipants,
            raw: t // Keep raw data for detailed analysis view
        }));

        const party = trends.map(t => ({
            week: t.weekLabel,
            ...t.parties,
            "참여자": t.totalParticipants,
            raw: t
        }));

        const priority = trends.map(t => ({
            week: t.weekLabel,
            ...t.priorities,
            "참여자": t.totalParticipants,
            raw: t
        }));

        return sendSuccess(res, { presidential, party, priority });
    } catch (error) {
        return sendError(res, 500, "Failed to fetch weekly trends");
    }
});

// 6. Political Surveys (Legacy Path Support)
router.get("/surveys", async (req, res) => {
    try {
        const result = await storage.getPoliticalSurveys();
        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch political surveys");
    }
});

// Results for specific survey
router.get("/survey-results/:id", async (req, res) => {
    try {
        const surveyId = parseInt(req.params.id);
        const survey = await storage.getSurveyWithQuestions(surveyId);
        if (!survey) return sendError(res, 404, "Survey not found");

        const responses = await storage.getSurveyResponses(surveyId);
        const totalParticipants = new Set(responses.map(r => r.userId)).size;

        const questionResults = survey.questions.map(q => {
            const qResponses = responses.filter(r => r.questionId === q.id);
            const totalResponses = qResponses.length;

            // Calculate stats based on options
            const options = (q.options as string[]) || [];
            const optionStats = options.map(opt => {
                const count = qResponses.filter(r => {
                    const ans = r.answer;
                    if (typeof ans === 'object' && ans !== null) {
                        return (ans as any).choice === opt || (ans as any).text === opt;
                    }
                    return ans === opt;
                }).length;
                return {
                    option: opt,
                    count,
                    percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
                };
            });

            return {
                questionId: q.id,
                question: q.question,
                type: q.type,
                totalResponses,
                optionStats
            };
        });

        return sendSuccess(res, {
            survey,
            totalParticipants,
            questionResults
        });
    } catch (error) {
        console.error("Error fetching survey results:", error);
        return sendError(res, 500, "Failed to fetch survey results");
    }
});

export default router;
