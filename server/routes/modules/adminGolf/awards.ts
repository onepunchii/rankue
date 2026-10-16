import { Router } from "express";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { storage } from "../../../storage/index.js";
import { auditGolfAwards, sweepGolfAwards, takeBackGolfAwards } from "../../../storage/adminGolfAwards.js";
import { cleanReason } from "../../../../shared/golfScanAudit.js";

/**
 * 골프 관리 — 보상 맞춰 보기(2026-10-17 어드민 전수 조사 골프 ③, shared/golfAwardAudit 머리말).
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/awards 로 붙인다.
 *
 *   GET  /                        받은 사람마다 맞춰 보기(받쳐 주지 않는 줄이 많은 사람부터)
 *   GET  /:memberId               한 사람
 *   POST /:memberId/take-back     { ids, reason } 받쳐 주지 않는 줄만 거둔다(다시 판정해서 확인)
 */
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const due = (memberId: string) => storage.golf.golfAwardsDue(memberId);

router.get("/", asyncHandler(async (_req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await sweepGolfAwards(due));
}));

router.get("/:memberId", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.memberId)) return sendError(res, 404, "회원을 찾을 수 없어요");
    const a = await auditGolfAwards(req.params.memberId, due);
    if (!a) return sendError(res, 404, "회원을 찾을 수 없어요");
    return sendSuccess(res, a);
}));

router.post("/:memberId/take-back", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.memberId ?? "");
    if (!UUID.test(id)) return sendError(res, 404, "회원을 찾을 수 없어요");
    const reason = cleanReason(req.body?.reason);
    if (!reason) return sendError(res, 400, "거두는 까닭을 적어 주세요");
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === "string").slice(0, 200) : [];
    if (!ids.length) return sendError(res, 400, "거둘 것을 골라 주세요");
    const taken = await takeBackGolfAwards(id, ids, due);
    if (!taken.length) return sendError(res, 409, "거둘 수 있는 것이 없어요 — 지금 기록이 받쳐 주거나 증정한 것입니다");
    adminLog(req, "golf.awards.take-back", { memberId: id, taken, reason });
    return sendSuccess(res, { taken });
}));

export default router;
