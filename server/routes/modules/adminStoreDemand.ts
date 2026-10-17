import { Router } from "express";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { storeDemandList, storeReport } from "../../storage/storeDemand.js";
import { renderStoreReportPng } from "../../services/storeReportCard.js";
import { demandDaysOf } from "../../../shared/storeDemand.js";

/**
 * 관리자 콘솔 '손님이 찾는 매장'(2026-10-18 오너: 당구장 사장님 모집) — /api/hiq/admin/store-demand/*
 * 방문자 발자국을 매장 페이지별로 접은 목록과, 사장님께 보여 드릴 리포트 카드(PNG). 전부 GET — 보기 전용 관리자도 본다.
 * 카드는 어드민 쿠키로만 열린다(공개 /og 가 아니다 — 남의 매장 숫자를 아무나 받아 가지 않게). 캐시는 그 브라우저에만.
 */
const router = Router();
router.use(checkSuperAdmin);

router.get("/", asyncHandler(async (req: any, res: any) => {
    return sendSuccess(res, await storeDemandList(demandDaysOf(req.query.days)));
}));

router.get("/:code/report.png", asyncHandler(async (req: any, res: any) => {
    const code = String(req.params.code ?? "");
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return sendError(res, 404, "없는 매장이에요");
    const r = await storeReport(code, demandDaysOf(req.query.days));
    if (!r) return sendError(res, 404, "없는 매장이에요");
    const png = await renderStoreReportPng(r);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", `inline; filename="rankue-report-${code}.png"`);
    return res.send(png);
}));

export default router;
