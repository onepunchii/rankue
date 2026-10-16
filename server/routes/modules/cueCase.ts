/**
 * 큐 케이스(2026-10-16, 기획 docs/01-plan/features/billiards-cue-case.md) — 당구의 수집. 목록 shared/cueCase · 판정 shared/cueCaseRules · 저장소 storage.cueCase.
 *
 * GET  /cue-case?memberId=   한 사람의 큐 케이스(안 주면 내 것). 열 때 새로 채운 것을 받은 기록에 더한다.
 * GET  /cue-case/summary     홈 입구 띠 — 받은 수 · 대표 큐.
 * POST /cue-case/hero        { itemId } 대표 큐 고르기 — 받은 큐만.
 * 남의 것도 볼 수 있다(랭킹 · 프로필이 보여 주는 이름 · 전적에서 나온 것). 탈퇴했거나 아무 기록도 없는 회원은 404.
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/cue-case", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const raw = typeof req.query.memberId === "string" ? req.query.memberId : "";
    if (raw !== "" && !UUID.test(raw)) return sendError(res, 404, "err.cueCase.notFound");
    const view = await storage.cueCase.view(req.userId!, raw || req.userId!, Date.now());
    if (!view) return sendError(res, 404, "err.cueCase.notFound");
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, view);
}));

/** GET /cue-case/summary — 홈 입구 띠: 받은 수 · 대표 큐(받은 기록만 읽는다) */
router.get("/cue-case/summary", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, await storage.cueCase.summary(req.userId!));
}));

const heroBody = z.object({ itemId: z.string().min(1).max(64) });
router.post("/cue-case/hero", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const body = heroBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, "err.cueCase.notOwned");
    const ok = await storage.cueCase.setHero(req.userId!, body.data.itemId);
    if (!ok) return sendError(res, 403, "err.cueCase.notOwned");
    return sendSuccess(res, { hero: body.data.itemId });
}));

export default router;
