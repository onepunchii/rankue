/**
 * 골프 관리 — 라운드 사진(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/photos 로 붙인다.
 *
 * 왜: 공개 라운드 사진은 사전 승인 없이 바로 골프장 페이지에 뜬다(2026-09-30 오너 결정). 그동안 운영자가 볼 곳은
 * 신고가 들어온 사진(신고 큐)뿐이었고, 그마저 이의제기를 판정할 버튼이 없었다(감사 4.1). 여기서 전부 보고 가리고·지우고·판정한다.
 *
 *   GET    /                 목록 ?filter=public|hidden|appealed|all &course= &days= &offset= &limit=(기본 48)
 *   POST   /:id/hide         { hidden: boolean } 가리기·다시 보이기
 *   POST   /:id/appeal       { decision: "approve"|"reject", note? } 이의제기 받아들이기(가림 풀기)·거절하기(가림 유지)
 *   DELETE /:id              지우기 — 행과 원본·썸네일 파일까지(되돌릴 수 없다)
 *
 * 쓰기는 전부 신고 큐와 **같은 길**(services/moderation applyModerationAction)로 간다: 할 수 있는 조치를 최신 상태로 다시 대조하고,
 * 열린 신고를 닫고, hiq_moderation_actions 에 한 줄 남기고, 올린 사람에게 골프 알림함으로 결과를 알린다(문구는 받는 사람 언어).
 * 그래서 이 화면에서 한 일이 신고 큐의 처리 기록에 그대로 보이고, 큐의 '판단 필요'도 함께 닫힌다.
 */
import { Router } from "express";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { applyModerationAction } from "../../../services/moderation.js";
import { storage } from "../../../storage/index.js";
import { listAdminGolfPhotos, parsePhotoListQuery } from "../../../storage/adminGolfPhotos.js";
import type { ModerationAction } from "../../../lib/reportQueue.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "사진을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.";

// 목록 — 사진 주소·올린 사람 이름·이의제기 글이 실리니 캐시에 남기지 않는다
router.get("/", asyncHandler(async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await listAdminGolfPhotos(parsePhotoListQuery(req.query ?? {})));
}));

/** 조치 하나 — 신고 큐와 같은 실행기. 신고가 없는 사진에도 한다(allowUnreported) */
async function act(req: any, res: any, action: ModerationAction, logName: string, note: string | null = null) {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, NOT_FOUND);
    // 다른 운영자가 방금 지웠으면 '할 수 없는 조치'(409)가 아니라 '없음'으로 — 신고가 남아 있으면 큐 항목은 그대로 있어서 409 가 난다
    if (!(await storage.golfPhotos.get(id))) return sendError(res, 404, NOT_FOUND);
    const result = await applyModerationAction({
        targetType: "golf_photo",
        targetId: id,
        action,
        adminProfileId: req.signedCookies?.hiq_partner_auth ?? null,
        allowUnreported: true,
        note,
    });
    if (!result.ok) return sendError(res, result.status, result.status === 404 ? NOT_FOUND : result.message);
    adminLog(req, logName, { id, action, closedReports: result.closed, ...(note ? { note } : {}) });
    return sendSuccess(res, { id, action, closedReports: result.closed });
}

router.post("/:id/hide", asyncHandler(async (req: any, res: any) => {
    const hidden = req.body?.hidden;
    if (typeof hidden !== "boolean") return sendError(res, 400, "가릴지 다시 보일지 골라 주세요");
    // 이의제기가 열려 있으면 '보이기'는 받지 않는다 — 풀기는 '받아들이기'로만(작성자가 받는 안내가 엇갈리지 않게, lib/reportQueue availableActions)
    return act(req, res, hidden ? "blind" : "unblind", hidden ? "golf_photo_hide" : "golf_photo_unhide");
}));

router.post("/:id/appeal", asyncHandler(async (req: any, res: any) => {
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") return sendError(res, 400, "받아들일지 거절할지 골라 주세요");
    const raw = req.body?.note;
    if (raw != null && typeof raw !== "string") return sendError(res, 400, "메모는 글로 적어 주세요");
    const note = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
    return act(req, res, decision === "approve" ? "appeal_approve" : "appeal_reject", `golf_photo_appeal_${decision}`, note);
}));

// 지우기 — 행과 Blob(원본·썸네일)을 함께(services/moderation deleteReportedContent 의 golf_photo 길, 작성자 본인 삭제와 같은 저장소 함수)
router.delete("/:id", asyncHandler(async (req: any, res: any) => act(req, res, "delete", "golf_photo_delete")));

export default router;
