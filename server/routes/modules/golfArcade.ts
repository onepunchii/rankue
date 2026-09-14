import { Router } from "express";
import type { Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { courseById } from "../../../shared/golf/courses.js";
import { MAX_STROKES } from "../../../shared/golf/physics.js";

/**
 * 골프 온라인게임(미니골프 대전) 방 API(2026-09-14). 전부 로그인 필요. 골프 접근 통제(공개)는 index.ts 의 마운트가 건다.
 * 흐름: POST /rooms(방장) → 코드 공유 → POST /rooms/join → 방장 POST /rooms/:id/start → 각자 홀 끝날 때마다 POST /rooms/:id/hole → 전원 끝나면 finished.
 */
const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function displayName(memberId: string): Promise<string> {
    const m = await storage.getMemberById(memberId) as { nickname?: string | null; name?: string | null } | undefined;
    return (m?.nickname || m?.name || "골퍼").slice(0, 20);
}

router.post("/rooms", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const courseId = typeof req.body?.courseId === "string" && courseById(req.body.courseId) ? req.body.courseId : "rankue-park";
    const view = await storage.golfArcade.createRoom(req.userId!, await displayName(req.userId!), courseId);
    return sendSuccess(res, view);
}));

router.get("/rooms/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    return sendSuccess(res, await storage.golfArcade.myOpenRoom(req.userId!));
}));

router.post("/rooms/join", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const code = String(req.body?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return sendError(res, 400, "6자리 코드를 입력하세요");
    const r = await storage.golfArcade.joinByCode(code, req.userId!, await displayName(req.userId!));
    if ("error" in r) return sendError(res, 404, r.error);
    return sendSuccess(res, r.view);
}));

router.get("/rooms/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "방을 찾을 수 없습니다");
    const view = await storage.golfArcade.getRoom(req.params.id);
    if (!view) return sendError(res, 404, "방을 찾을 수 없습니다");
    // 참가자만 본다(코드를 모르는 사람이 id 로 엿보지 않게)
    if (!view.players.some((p) => p.memberId === req.userId)) return sendError(res, 403, "이 방의 참가자가 아닙니다");
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, view);
}));

router.post("/rooms/:id/start", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "방을 찾을 수 없습니다");
    const ok = await storage.golfArcade.start(req.params.id, req.userId!);
    if (!ok) return sendError(res, 400, "방장만 시작할 수 있어요(또는 이미 시작)");
    return sendSuccess(res, await storage.golfArcade.getRoom(req.params.id));
}));

router.post("/rooms/:id/hole", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "방을 찾을 수 없습니다");
    const hole = Number(req.body?.hole), strokes = Number(req.body?.strokes);
    const view0 = await storage.golfArcade.getRoom(req.params.id);
    if (!view0) return sendError(res, 404, "방을 찾을 수 없습니다");
    const course = courseById(view0.room.courseId);
    if (!course) return sendError(res, 500, "코스 없음");
    if (!Number.isInteger(hole) || hole < 0 || hole >= course.holes.length) return sendError(res, 400, "잘못된 홀");
    if (!Number.isInteger(strokes) || strokes < 1 || strokes > MAX_STROKES + 1) return sendError(res, 400, "잘못된 타수");
    if (view0.room.status !== "playing") return sendError(res, 400, "진행 중인 방이 아닙니다");
    const view = await storage.golfArcade.reportHole(req.params.id, req.userId!, hole, strokes, course.holes.length);
    if (!view) return sendError(res, 403, "이 방의 참가자가 아닙니다");
    return sendSuccess(res, view);
}));

router.post("/rooms/:id/leave", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "방을 찾을 수 없습니다");
    await storage.golfArcade.leave(req.params.id, req.userId!);
    return sendSuccess(res, { left: true });
}));

export default router;
