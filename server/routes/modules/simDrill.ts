/**
 * 시뮬레이터 드릴 래더 — 주간 고정 5문제, 문제당 채점 시도 1회, 서버 재시뮬이 유일한 점수.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION,
    drillsForWeek, findDrill, drillLayout, weekIdFor,
    type SimParams, type ShotInput,
} from "../../../shared/sim/index.js";
import { evaluateShot, DEFAULT_3C_RULES } from "../../../shared/sim/rules/index.js";

const router = Router();

/** 드릴은 대대·한 2005·컨디션 1 로 고정한다 — 래더가 비교 가능하려면 조건이 같아야 한다. */
const DRILL_TABLE = "DAEDAE" as const;
const DRILL_PARAMS: SimParams = { table: TABLES[DRILL_TABLE], cue: DEFAULT_CUE, cushionModel: "han2005", condition: 1 };

const attemptSchema = z.object({
    input: z.object({
        cueBallId: z.literal("white"),
        phi: z.number().finite(), V0: z.number().gt(0).max(12),
        a: z.number().min(-0.5).max(0.5), b: z.number().min(-0.5).max(0.5), theta: z.number().min(0).max(1.2),
    }),
    clientHash: z.string().length(16).optional(),
});

function currentWeekId(): string {
    return weekIdFor(Date.now());
}

// GET /sim/drills/week — 이번 주 드릴 5개 + 내 시도
router.get("/sim/drills/week", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const weekId = typeof req.query.weekId === "string" && /^\d{4}-W\d{2}$/.test(req.query.weekId) ? req.query.weekId : currentWeekId();
    const drills = drillsForWeek(weekId);
    const mine = await storage.simDrill.myAttempts(req.userId!, weekId);
    return sendSuccess(res, {
        weekId,
        tableId: DRILL_TABLE,
        drills: drills.map((d) => ({
            id: d.id, pattern: d.pattern, nameKey: d.nameKey, hintKey: d.hintKey,
            balls: drillLayout(d, TABLES[DRILL_TABLE]),
            attempt: mine.find((a) => a.drillId === d.id) ?? null,
        })),
    });
}));

// GET /sim/drills/ladder?weekId= — 주간 래더
router.get("/sim/drills/ladder", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const weekId = typeof req.query.weekId === "string" && /^\d{4}-W\d{2}$/.test(req.query.weekId) ? req.query.weekId : currentWeekId();
    const rows = await storage.simDrill.ladder(weekId);
    return sendSuccess(res, { weekId, rows });
}));

// POST /sim/drills/:drillId/attempt — 이번 주 채점 시도(1회). 서버가 고정 배치에서 재시뮬해 판정한다.
router.post("/sim/drills/:drillId/attempt", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = attemptSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "샷 입력이 올바르지 않습니다");
    const { input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "미스큐 범위입니다");
    const weekId = currentWeekId();
    const drill = findDrill(req.params.drillId);
    if (!drill || !drillsForWeek(weekId).some((d) => d.id === drill.id)) return sendError(res, 404, "이번 주 드릴이 아닙니다");

    const balls = drillLayout(drill, TABLES[DRILL_TABLE]);
    const result = simulateShot(balls, input as ShotInput, DRILL_PARAMS);
    const outcome = evaluateShot(result.events, "white", DEFAULT_3C_RULES, result.truncated);
    const row = await storage.simDrill.recordAttempt({
        memberId: req.userId!, weekId, drillId: drill.id, tableId: DRILL_TABLE,
        input, hash: result.hash, clientHash: clientHash ?? null,
        success: outcome.scored, cushions: outcome.cushionsBeforeSecond, outcomeCode: outcome.code,
        engineVersion: ENGINE_VERSION,
    });
    if (!row) return sendError(res, 409, "이번 주 이 드릴은 이미 채점했어요", "ALREADY_ATTEMPTED");
    return sendSuccess(res, {
        attempt: row, mismatch: clientHash !== undefined && clientHash !== result.hash,
        hash: result.hash, events: result.events, final: result.final, duration: result.duration, outcome,
    });
}));

export default router;
