
import { Router } from "express";
import { storage } from "../storage.js";
import { insertSurveyResponseSchema } from "../../shared/schema.js";
import { authenticateUser } from "../auth.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

// Get paginated surveys
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const sortBy = (req.query.sortBy as string) || 'recent';

        const result = await storage.getSurveysPaginated(page, limit, sortBy);
        return sendSuccess(res, result.surveys, undefined, {
            total: result.total,
            page,
            limit,
            hasMore: result.total > (page * limit)
        });
    } catch (error) {
        return sendError(res, 500, "Failed to fetch surveys");
    }
});

router.get("/paginated", async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const sortBy = (req.query.sortBy as string) || 'recent';

        const result = await storage.getSurveysPaginated(page, limit, sortBy);
        return sendSuccess(res, {
            surveys: result.surveys,
            total: result.total,
            page,
            limit,
            hasMore: result.total > (page * limit)
        });
    } catch (error) {
        console.error("[SurveyRoute] Paginated Error:", error);
        return sendError(res, 500, "Failed to fetch paginated surveys");
    }
});

router.get("/popular", async (req, res) => {
    try {
        const surveys = await storage.getPopularSurveys(5);
        return sendSuccess(res, surveys);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch popular surveys");
    }
});

router.get("/category-counts", async (req, res) => {
    try {
        const counts = await storage.getCategoryCounts();
        return sendSuccess(res, counts);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch categories");
    }
});

router.get("/quick-poll/latest", async (req, res) => {
    try {
        const poll = await storage.getLatestQuickPoll();
        if (!poll) return sendError(res, 404, "No quick poll found");
        return sendSuccess(res, poll);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch quick poll");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const survey = await storage.getSurveyWithQuestions(parseInt(req.params.id));
        if (!survey) return sendError(res, 404, "Survey not found");
        return sendSuccess(res, survey);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch survey");
    }
});

router.post("/:id/responses", authenticateUser, async (req: any, res) => {
    try {
        const surveyId = parseInt(req.params.id);
        const result = insertSurveyResponseSchema.safeParse({
            ...req.body,
            userId: req.user.id,
            surveyId
        });

        if (!result.success) {
            return sendError(res, 400, "Invalid response data", "INVALID_INPUT", result.error.format());
        }

        const response = await storage.createSurveyResponse(result.data);
        return sendSuccess(res, response, "Response recorded");
    } catch (error: any) {
        return sendError(res, 500, error.message);
    }
});

router.get("/:id/participation", authenticateUser, async (req: any, res) => {
    try {
        const participation = await storage.getUserParticipation(req.user.id, parseInt(req.params.id));
        return sendSuccess(res, participation || null);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch participation status");
    }
});

export default router;
