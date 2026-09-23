import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { NOTIF_GROUPS, type NotifGroup } from "../../../shared/notificationGroup.js";

const router = Router();

const sportOf = (req: AuthRequest) => ((req.query.sport as string) === "GOLF" ? "GOLF" : "BILLIARDS") as "BILLIARDS" | "GOLF";

/** ?group= 은 넷 중 하나이거나 없음(전체). 모르는 값은 조용히 무시한다 — 칩이 늘어도 옛 앱이 깨지지 않게. */
function groupOf(raw: unknown): NotifGroup | undefined {
    const g = typeof raw === "string" ? raw.trim() : "";
    return (NOTIF_GROUPS as readonly string[]).includes(g) ? (g as NotifGroup) : undefined;
}

/**
 * ?before= 는 저장소가 만들어 준 커서를 **그대로** 되돌려받는 자리다(뜯어보지 않는다).
 * 모양 검사와 해석은 저장소의 parseNotifCursor 한 곳에만 둔다 — 여기서 Date 로 한 번 옮기면
 * 마이크로초가 잘려 그 폭 안의 행이 사라진다(그래서 옛 ISO 커서를 버렸다).
 */
function beforeOf(raw: unknown): string | undefined {
    return typeof raw === "string" && raw ? raw : undefined;
}

// GET /notifications - 내 알림 한 페이지.
// 2026-09-23 이전엔 조건 없이 **전부** 보냈다 — 오너 계정은 893행 330KB 가 한 번에 왔고 패널을 열 때마다 57ms 가 멎었다.
// 이제 기본 30건 + 커서(nextBefore)다. 응답 모양이 배열에서 { items, nextBefore } 로 바뀌었다.
router.get("/notifications", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const page = await storage.getNotifications(req.userId!, sportOf(req), {
        group: groupOf(req.query.group),
        before: beforeOf(req.query.before),
        // 문자열이 이상하면 NaN 이 되고, 저장소가 기본 30으로 되돌린다(상한 50).
        limit: Number(req.query.limit),
    });
    return sendSuccess(res, page);
}));

// GET /notifications/unread-count - 배지 전용. 목록을 받지 않고 숫자만 — 홈 헤더 배지와 칩 배지가 쓴다.
// ⚠️ /:id/read 보다 **위**에 둬야 한다(아래 read-all 주석과 같은 이유).
router.get("/notifications/unread-count", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const counts = await storage.countUnreadNotifications(req.userId!, sportOf(req));
    return sendSuccess(res, counts);
}));

// PATCH /notifications/read-all - 모두 읽음 (오너 요청 2026-09-04: 하나씩 누르기 힘들다)
// ⚠️ /:id/read 보다 위에 둬야 한다 — 아래면 Express 가 "read-all" 을 알림 id 로 받는다.
// 종목을 넘긴다: 당구 알림함에서 눌렀는데 골프 알림까지 읽히던 버그(2026-09-23).
router.patch("/notifications/read-all", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const count = await storage.markAllNotificationsAsRead(req.userId!, sportOf(req));
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

// POST /test-notification 은 2026-09-23 에 없앴다 — 로그인만 하면 누구나 자기에게(그리고 아무 type 으로)
// 알림을 만들 수 있었고, 운영 알림함에 버튼까지 노출돼 있었다. 발송 시험은 크론·서버 로그로 한다.

export default router;
