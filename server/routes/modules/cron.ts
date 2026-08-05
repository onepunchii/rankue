import { Router } from "express";
import { runReminders } from "../../services/notificationScheduler.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// Vercel Cron 전용 엔드포인트. 서버리스에는 상주 프로세스가 없어 node-cron이 돌지 않으므로
// vercel.json의 crons가 이 경로를 호출해 리마인더를 실행한다.
//
// 인증: Vercel Cron은 `Authorization: Bearer $CRON_SECRET` 헤더를 붙여 호출한다.
// CRON_SECRET이 설정돼 있으면 반드시 일치해야 하고, 미설정이면 외부 호출을 전부 거부한다
// (공개 엔드포인트로 방치되면 누구나 대량 푸시를 유발할 수 있다).
router.post("/reminders", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");

    const result = await runReminders();
    return sendSuccess(res, result);
}));

// Vercel Cron은 GET으로 호출한다(문서 기준). 동일 핸들러를 재사용.
router.get("/reminders", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");

    const result = await runReminders();
    return sendSuccess(res, result);
}));

// UMB 세계랭킹 일일 동기화 — 새 회차가 있으면 부문당 최대 2개 적재
async function handleUmbSync(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { syncUmbRankings } = await import("../../services/umbSync.js");
    const result = await syncUmbRankings();
    return sendSuccess(res, result);
}
router.get("/umb-sync", asyncHandler(handleUmbSync));
router.post("/umb-sync", asyncHandler(handleUmbSync));

export default router;
