
import { Router } from "express";
import { storage } from "../storage.js";
import { db } from "../db.js";
import { surveyResponses, surveyQuestions, surveys, profiles } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth.js";
import { analyzeUserPersonality } from "../ai.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

const ANALYSIS_THRESHOLD = 3;

router.get("/eligibility", requireAuth, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const participations = await storage.getUserParticipations(userId);
        const count = participations.length;

        return sendSuccess(res, {
            eligible: count >= ANALYSIS_THRESHOLD,
            currentCount: count,
            threshold: ANALYSIS_THRESHOLD,
            needed: Math.max(0, ANALYSIS_THRESHOLD - count)
        });
    } catch (error) {
        return sendError(res, 500, "Failed to check eligibility");
    }
});

router.get("/analysis", requireAuth, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);

        if (profile?.aiPersona && Object.keys(profile.aiPersona).length > 0 && req.query.refresh !== 'true') {
            return sendSuccess(res, profile.aiPersona);
        }

        const participations = await storage.getUserParticipations(userId);
        if (participations.length < ANALYSIS_THRESHOLD) {
            return sendError(res, 403, `At least ${ANALYSIS_THRESHOLD} participations required`);
        }

        const responses = await db.select({
            surveyId: surveyResponses.surveyId,
            questionId: surveyResponses.questionId,
            answer: surveyResponses.answer,
            question: surveyQuestions.question,
            category: surveys.category
        })
            .from(surveyResponses)
            .innerJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
            .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
            .where(eq(surveyResponses.userId, userId));

        const analysis = await analyzeUserPersonality([], responses, participations);

        await db.update(profiles)
            .set({
                aiPersona: analysis,
                personaStatus: 'generated',
                updatedAt: new Date()
            })
            .where(eq(profiles.id, userId));

        return sendSuccess(res, analysis, "AI 성향 분석이 완료되었습니다!");
    } catch (error) {
        console.error("Personality analysis error:", error);
        return sendError(res, 500, "성향 분석 중 오류가 발생했습니다.");
    }
});

export default router;
