import { Router } from "express";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { storage } from "../../../storage/index.js";
import { readParWatch, revertParChange, setParLock } from "../../../storage/adminGolfPars.js";
import { cleanReason } from "../../../../shared/golfScanAudit.js";

/**
 * 골프 관리 — 파 자동 반영 감시 · 잠금(2026-10-17 어드민 전수 조사 골프 ②, shared/golfParWatch 머리말).
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/pars 로 붙인다.
 *
 *   GET  /                          바뀐 기록 200 · 카드가 본 코스 300 · 잠근 코스
 *   POST /courses/:id/lock          { reason } 카드가 이 코스의 파를 바꾸지 못하게
 *   POST /courses/:id/unlock        { reason }
 *   POST /changes/:id/revert        { reason } 카드가 바꾼 파를 바꾸기 전 값으로 + 잠금(지금 명부가 바뀐 값 그대로일 때만)
 */
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const adminNameOf = async (req: any) => String(((await storage.getProfile(req.adminProfileId).catch(() => null)) as any)?.nickname ?? "관리자").slice(0, 40);

router.get("/", asyncHandler(async (_req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await readParWatch());
}));

for (const on of [true, false]) {
    router.post(`/courses/:id/${on ? "lock" : "unlock"}`, asyncHandler(async (req: any, res: any) => {
        if (!UUID.test(req.params.id)) return sendError(res, 404, "코스를 찾을 수 없습니다");
        const reason = cleanReason(req.body?.reason);
        if (!reason) return sendError(res, 400, "까닭을 적어 주세요");
        const by = await adminNameOf(req);
        const r = await setParLock(req.params.id, on ? { at: new Date().toISOString(), by, reason } : null);
        if (!r) return sendError(res, 404, "코스를 찾을 수 없습니다");
        if (!r.ok) return sendError(res, 409, on ? "이미 잠긴 코스입니다" : "잠기지 않은 코스입니다");
        adminLog(req, on ? "golf.pars.lock" : "golf.pars.unlock", { courseId: req.params.id, name: r.course.name, reason });
        return sendSuccess(res, { courseId: req.params.id, locked: on });
    }));
}

router.post("/changes/:id/revert", asyncHandler(async (req: any, res: any) => {
    const reason = cleanReason(req.body?.reason);
    if (!reason) return sendError(res, 400, "까닭을 적어 주세요");
    const r = await revertParChange(String(req.params.id), { by: await adminNameOf(req), reason });
    if (!r.ok) {
        if (r.reason === "gone") return sendError(res, 404, "기록이나 코스를 찾을 수 없습니다");
        if (r.reason === "not-fixed") return sendError(res, 409, "카드가 바꾼 파만 되돌릴 수 있습니다");
        return sendError(res, 409, "그 뒤에 파가 또 바뀌었습니다 — '골프장 데이터'에서 직접 고치세요");
    }
    adminLog(req, "golf.pars.revert", { changeId: req.params.id, name: r.courseName, from: r.from.join(""), to: r.to.join(""), reason });
    return sendSuccess(res, r);
}));

export default router;
