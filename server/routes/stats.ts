
import { Router } from "express";
import { storage } from "../storage.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

router.get("/today-participants", async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
        const count = await storage.getTodayParticipantCount();
        return sendSuccess(res, { count });
    } catch (error) {
        return sendError(res, 500, "Failed to fetch stats");
    }
});

export default router;
