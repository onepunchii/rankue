
import { Router } from "express";
import { storage } from "../storage.js";
import { insertBalanceGameVoteSchema, insertBalanceGameCommentSchema } from "../../shared/schema.js";
import { generateBalanceGame } from "../ai.js";
import { authenticateUser } from "../auth.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const status = req.query.status as string;
        const category = req.query.category as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const games = await storage.getBalanceGames(status, limit, category);
        return sendSuccess(res, games);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch balance games");
    }
});

router.get("/votes/me", authenticateUser, async (req, res) => {
    try {
        const votes = await storage.getUserBalanceGameVotes(req.user!.id);
        return sendSuccess(res, votes);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch user votes");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const game = await storage.getBalanceGame(parseInt(req.params.id));
        if (!game) return sendError(res, 404, "Game not found");
        return sendSuccess(res, game);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch balance game");
    }
});

router.post("/:id/vote", async (req: any, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const result = insertBalanceGameVoteSchema.safeParse({
            ...req.body,
            gameId
        });

        if (!result.success) {
            return sendError(res, 400, "Invalid vote data", "INVALID_INPUT", result.error.format());
        }

        const vote = await storage.voteBalanceGame(result.data);
        return sendSuccess(res, vote, "Vote recorded");
    } catch (error: any) {
        return sendError(res, 400, error.message);
    }
});

router.get("/:id/stats", async (req, res) => {
    try {
        const stats = await storage.getBalanceGameStats(parseInt(req.params.id));
        return sendSuccess(res, stats);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch stats");
    }
});

router.get("/:id/comments", async (req, res) => {
    try {
        const comments = await storage.getBalanceGameComments(parseInt(req.params.id));
        return sendSuccess(res, comments);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch comments");
    }
});

router.post("/:id/comments", authenticateUser, async (req: any, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const userId = req.user.id;
        const result = insertBalanceGameCommentSchema.safeParse({
            ...req.body,
            gameId,
            userId
        });

        if (!result.success) {
            return sendError(res, 400, "Invalid comment data", "INVALID_INPUT", result.error.format());
        }

        const comment = await storage.createBalanceGameComment(result.data);
        return sendSuccess(res, comment, "Comment added");
    } catch (error: any) {
        return sendError(res, 500, error.message);
    }
});

router.post("/generate", async (req, res) => {
    try {
        const topic = req.body.topic;
        const gameData = await generateBalanceGame(topic);
        const game = await storage.createBalanceGame({
            ...gameData,
            status: 'ACTIVE'
        });
        return sendSuccess(res, game, "Balance game generated successfully");
    } catch (error: any) {
        return sendError(res, 500, "Failed to generate balance game: " + error.message);
    }
});

export default router;
