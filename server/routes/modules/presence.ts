import { Router } from "express";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { getPresencePrefs, listArrivals, setPresencePrefs } from "../../storage/presence.repo.js";

/**
 * 친구·크루 접속 알림(2026-10-01 오너 "응 진행해") — 앱 안 배너용. 푸시는 보내지 않는다(shared/presence.ts).
 *   GET   /presence/arrivals?since=ISO   since 뒤에 새로 들어와 지금 앱에 있는 내 사람들. since 가 없으면 지금 시각만 준다
 *   GET   /presence/settings             { share, receive }
 *   PATCH /presence/settings             { share?, receive? }
 */
const router = Router();

router.get("/arrivals", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    const now = new Date();
    const raw = typeof req.query.since === "string" ? Date.parse(req.query.since) : NaN;
    // 처음 부를 때(since 없음)는 서버 시각만 — 내가 앱에 오기 전부터 있던 사람은 '들어왔다'가 아니다
    if (!Number.isFinite(raw)) return sendSuccess(res, { now: now.toISOString(), arrivals: [] });
    const since = new Date(Math.max(raw, now.getTime() - 15 * 60 * 1000));
    const arrivals = await listArrivals(req.userId!, since);
    return sendSuccess(res, { now: now.toISOString(), arrivals });
}));

router.get("/settings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await getPresencePrefs(req.userId!));
}));

router.patch("/settings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const patch: { share?: boolean; receive?: boolean } = {};
    if (typeof req.body?.share === "boolean") patch.share = req.body.share;
    if (typeof req.body?.receive === "boolean") patch.receive = req.body.receive;
    if (patch.share === undefined && patch.receive === undefined) return sendError(res, 400, "err.member.noPrefsToChange");
    return sendSuccess(res, await setPresencePrefs(req.userId!, patch));
}));

export default router;
