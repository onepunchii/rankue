
import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateUser } from "../auth.js";
import { requireAuth } from "../auth.js";
import { lotteryService } from "../services/lotteryService.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

router.get("/today-draw", async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    try {
        const draw = await lotteryService.getOrCreateTodayDraw();
        return sendSuccess(res, draw);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch today's draw");
    }
});

router.get("/tickets", authenticateUser, async (req: any, res) => {
    try {
        const tickets = await storage.getUserLotteryTickets(req.user.id);
        return sendSuccess(res, tickets);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch tickets");
    }
});

router.get("/history", async (req, res) => {
    try {
        const history = await storage.getLotteryHistoryWithStats(30);
        return sendSuccess(res, history);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch history");
    }
});

router.post("/create-ticket", requireAuth, async (req: any, res) => {
    try {
        const { roundId, numbers } = req.body;
        if (!roundId || !numbers || !Array.isArray(numbers) || numbers.length !== 5) {
            return sendError(res, 400, "Invalid ticket data (need roundId and 5 numbers)", "INVALID_INPUT");
        }

        const ticket = await lotteryService.buyTicket(req.user!.id, roundId, numbers);
        return sendSuccess(res, ticket, "티켓 생성 완료!");
    } catch (error: any) {
        return sendError(res, 500, error.message || "티켓 생성 중 오류가 발생했습니다.");
    }
});

export default router;
