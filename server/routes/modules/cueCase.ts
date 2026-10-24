/**
 * 큐 케이스(2026-10-16, 기획 docs/01-plan/features/billiards-cue-case.md) — 당구의 수집. 목록 shared/cueCase · 판정 shared/cueCaseRules · 저장소 storage.cueCase.
 *
 * GET  /cue-case?memberId=   한 사람의 큐 케이스(안 주면 내 것). 열 때 새로 채운 것을 받은 기록에 더한다.
 * GET  /cue-case/summary     홈 입구 띠 — 받은 수 · 대표 큐.
 * GET  /cue-case/crew/:id    크루 큐 랙 — 당구 크루 홈 벽.
 * POST /cue-case/hero        { itemId, kind? } 대표 큐 · 입은 상대 · 공 고르기 — 받은 것만. 상대 · 공은 itemId 'none' + kind 로 기본.
 * POST /cue-case/invite-pick { itemId } 친구 30명마다 한정 큐 한 자루 고르기(디자인마다 10자루 · 선착순 번호).
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

/** GET /cue-case/crew/:crewId — 크루 큐 랙(당구 크루 홈). 크루원 이름 · 대표 큐 · 모은 큐 수와 크루가 모은 서로 다른 큐 수 */
router.get("/cue-case/crew/:crewId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.crewId)) return sendError(res, 404, "err.cueCase.notFound");
    const rack = await storage.cueCase.crewRack(req.params.crewId);
    if (!rack) return sendError(res, 404, "err.cueCase.notFound");
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, rack);
}));

const heroBody = z.object({ itemId: z.string().min(1).max(64), kind: z.enum(["shaft", "ball"]).optional() });
router.post("/cue-case/hero", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const body = heroBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, "err.cueCase.notOwned");
    const ok = await storage.cueCase.setHero(req.userId!, body.data.itemId, body.data.kind);
    if (!ok) return sendError(res, 403, "err.cueCase.notOwned");
    return sendSuccess(res, { hero: body.data.itemId });
}));

const PICK_ERR = { item: [400, "err.cueCase.notOwned"], none: [403, "err.cueCase.pickNone"], have: [409, "err.cueCase.pickHave"], soldOut: [409, "err.cueCase.soldOut"] } as const;
router.post("/cue-case/invite-pick", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const body = heroBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, "err.cueCase.notOwned");
    const out = await storage.cueCase.pickInvite(req.userId!, body.data.itemId, Date.now());
    if (!out.ok) { const [status, key] = PICK_ERR[out.reason]; return sendError(res, status, key); }
    return sendSuccess(res, { itemId: body.data.itemId, serial: out.serial });
}));

export default router;
