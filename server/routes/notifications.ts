
import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateUser } from "../auth.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

router.get("/", authenticateUser, async (req: any, res) => {
    try {
        const notifications = await storage.getNotifications(req.user.id);
        return sendSuccess(res, notifications);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch notifications");
    }
});

router.post("/:id/read", authenticateUser, async (req, res) => {
    try {
        await storage.markNotificationAsRead(parseInt(req.params.id));
        return sendSuccess(res, null, "Notification marked as read");
    } catch (error) {
        return sendError(res, 500, "Failed to mark notification as read");
    }
});

router.post("/read-all", authenticateUser, async (req: any, res) => {
    try {
        await storage.markAllNotificationsAsRead(req.user.id);
        return sendSuccess(res, null, "All notifications marked as read");
    } catch (error) {
        return sendError(res, 500, "Failed to mark all as read");
    }
});

router.get("/unread-count", authenticateUser, async (req: any, res) => {
    try {
        const count = await storage.getUnreadNotificationCount(req.user.id);
        return sendSuccess(res, { count });
    } catch (error) {
        return sendError(res, 500, "Failed to fetch unread count");
    }
});

export default router;
