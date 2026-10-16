/**
 * 어드민 · 낚시(2026-10-17 어드민 전수 조사 → 오너가 정한 순서의 '낚시' — 공개 전). 지금은 '조과 검수'.
 *
 * GET /admin/fishing/catches?filter=public|hidden|appealed|all&course=&days=   남이 볼 수 있었던 조과 전부(storage/adminFishingCatches — 라운드 사진과 같은 모양)
 * POST /admin/fishing/catches/:id/hide { hidden } · /:id/appeal { decision, note } · DELETE /:id     신고 큐와 같은 실행기(targetType 'fishing_catch')
 * 까닭 · 처리는 신고 큐의 처리 기록에 쌓이고, 올린 사람에게 낚시 알림함으로 결과가 간다(services/moderation).
 */
import { Router } from "express";
import { checkSuperAdmin, adminLog } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { applyModerationAction } from "../../services/moderation.js";
import { listAdminFishingCatches } from "../../storage/adminFishingCatches.js";
import { parsePhotoListQuery } from "../../storage/adminGolfPhotos.js";
import { get as getCatch } from "../../storage/fishingCatches.js";
import type { ModerationAction } from "../../lib/reportQueue.js";

const router = Router();
router.use(checkSuperAdmin);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GONE = "기록을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.";

router.get("/catches", asyncHandler(async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await listAdminFishingCatches(parsePhotoListQuery(req.query ?? {})));
}));

async function act(req: any, res: any, action: ModerationAction, logName: string, note: string | null = null) {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, GONE);
    if (!(await getCatch(id))) return sendError(res, 404, GONE);
    const result = await applyModerationAction({ targetType: "fishing_catch", targetId: id, action, adminProfileId: req.signedCookies?.hiq_partner_auth ?? null, allowUnreported: true, note });
    if (!result.ok) return sendError(res, result.status, result.status === 404 ? GONE : result.message);
    adminLog(req, logName, { id, action, closedReports: result.closed, ...(note ? { note } : {}) });
    return sendSuccess(res, { id, action, closedReports: result.closed });
}

router.post("/catches/:id/hide", asyncHandler(async (req: any, res: any) => {
    const hidden = req.body?.hidden;
    if (typeof hidden !== "boolean") return sendError(res, 400, "가릴지 다시 보일지 골라 주세요");
    return act(req, res, hidden ? "blind" : "unblind", hidden ? "fishing_catch_hide" : "fishing_catch_unhide");
}));

router.post("/catches/:id/appeal", asyncHandler(async (req: any, res: any) => {
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") return sendError(res, 400, "받아들일지 거절할지 골라 주세요");
    const raw = req.body?.note;
    if (raw != null && typeof raw !== "string") return sendError(res, 400, "메모는 글로 적어 주세요");
    const note = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
    return act(req, res, decision === "approve" ? "appeal_approve" : "appeal_reject", `fishing_catch_appeal_${decision}`, note);
}));

router.delete("/catches/:id", asyncHandler(async (req: any, res: any) => act(req, res, "delete", "fishing_catch_delete")));

export default router;
