import { Router } from "express";
import { storage } from "../../storage/index.js";
import { notificationService } from "../../services/notificationService.js";
import { sendSuccess } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// GET /notifications - 내 알림 목록
router.get("/notifications", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const sport = (req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS";
    const notifications = await storage.getNotifications(req.userId!, sport);
    return sendSuccess(res, notifications);
}));

// PATCH /notifications/read-all - 모두 읽음 (오너 요청 2026-09-04: 하나씩 누르기 힘들다)
// ⚠️ /:id/read 보다 위에 둬야 한다 — 아래면 Express 가 "read-all" 을 알림 id 로 받는다.
router.patch("/notifications/read-all", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const count = await storage.markAllNotificationsAsRead(req.userId!);
    return sendSuccess(res, { count });
}));

// PATCH /notifications/:id/read - 읽음 처리
router.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    await storage.markNotificationAsRead(req.params.id, req.userId!);
    return sendSuccess(res, { success: true });
}));

// DELETE /notifications/:id - 삭제
router.delete("/notifications/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    await storage.deleteNotification(req.params.id, req.userId!);
    return sendSuccess(res, { success: true });
}));

// POST /test-notification - 테스트 발송
router.post("/test-notification", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { title, body, category, type, params } = req.body;

    await notificationService.sendAndSaveNotification({
        memberId: req.userId!,
        title: title || "notif.chat.test.title",
        body: body || "notif.chat.test.body",
        category: category || "GOLF",
        type: type || "NOTICE",
        params: params || {}
    });

    return sendSuccess(res, { success: true, message: "알림 발송 완료" });
}));

export default router;
