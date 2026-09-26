/**
 * 시뮬레이터 드릴 래더 — 주간 고정 5문제, 문제당 채점 시도 1회, 서버 재시뮬이 유일한 점수.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { V0_MAX, THETA_MAX, SHOT_LIMIT_EPS } from "../../../shared/sim/shotLimits.js";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION,
    drillsForWeek, findDrill, drillLayout, weekIdFor, readRoute, matchesPattern,
    type SimParams, type ShotInput, type SimEvent, type Drill,
} from "../../../shared/sim/index.js";
import { evaluateShot, DEFAULT_3C_RULES } from "../../../shared/sim/rules/index.js";

const router = Router();

/** 드릴은 대대·한 2005·컨디션 1 로 고정한다 — 래더가 비교 가능하려면 조건이 같아야 한다. */
const DRILL_TABLE = "DAEDAE" as const;
const DRILL_PARAMS: SimParams = { table: TABLES[DRILL_TABLE], cue: DEFAULT_CUE, cushionModel: "han2005", condition: 1 };

/**
 * 그 샷이 실제로 지나온 길. 채점(3쿠션 득점)은 그대로 두고 사실만 덧붙인다 — 빈쿠션으로 때웠는지,
 * 이름표대로 갔는지. 저장하지 않고 매번 다시 시뮬해서 만든다(입력이 남아 있어 결과가 같다).
 * 이름표 판별 규칙이 없는 패턴(역회전·긴각)만 null 이다 — 지어내지 않는다.
 */
export interface AttemptRoute {
    readonly bankFirst: number;
    readonly cushions: number;
    readonly named: boolean | null;
}

function routeOf(drill: Drill, events: readonly SimEvent[]): AttemptRoute {
    const route = readRoute(events, "white", ["red", "yellow"]);
    return { bankFirst: route.bankFirst, cushions: route.rails.length, named: matchesPattern(route, drill.pattern) };
}

/**
 * 저장된 입력으로 다시 시뮬해 길을 읽는다.
 * 채점 때 저장해 둔 해시와 대조해, 같은 샷일 때만 길을 낸다. 배치나 엔진이 바뀌면 재시뮬은 다른 샷이 되는데
 * 그 길을 '성공' 옆에 붙이면 거짓말이 된다(2026-09-09 검토). 해시는 그 샷의 지문이라 가장 확실하다.
 * 입력이 깨졌거나 미스큐 범위를 넘어 엔진이 던지는 경우도 조용히 생략한다.
 */
function routeOfStored(drill: Drill, input: unknown, hash: string): AttemptRoute | null {
    const p = attemptSchema.shape.input.safeParse(input);
    if (!p.success) return null;
    try {
        const balls = drillLayout(drill, TABLES[DRILL_TABLE]);
        const result = simulateShot(balls, p.data as ShotInput, DRILL_PARAMS);
        if (result.hash !== hash) return null;
        return routeOf(drill, result.events);
    } catch {
        return null;
    }
}

const attemptSchema = z.object({
    input: z.object({
        cueBallId: z.literal("white"),
        phi: z.number().finite(), V0: z.number().gt(0).max(V0_MAX + SHOT_LIMIT_EPS),
        a: z.number().min(-0.5).max(0.5), b: z.number().min(-0.5).max(0.5), theta: z.number().min(0).max(THETA_MAX + SHOT_LIMIT_EPS),
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
            attempt: (() => {
                const a = mine.find((x) => x.drillId === d.id);
                return a ? { ...a, route: a.success ? routeOfStored(d, a.input, a.hash) : null } : null;
            })(),
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
    if (!parsed.success) return sendError(res, 400, "err.sim.badShot");
    const { input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "err.sim.miscue");
    const weekId = currentWeekId();
    const drill = findDrill(req.params.drillId);
    if (!drill || !drillsForWeek(weekId).some((d) => d.id === drill.id)) return sendError(res, 404, "err.sim.drillNotThisWeek");

    const balls = drillLayout(drill, TABLES[DRILL_TABLE]);
    const result = simulateShot(balls, input as ShotInput, DRILL_PARAMS);
    const outcome = evaluateShot(result.events, "white", DEFAULT_3C_RULES, result.truncated);
    const row = await storage.simDrill.recordAttempt({
        memberId: req.userId!, weekId, drillId: drill.id, tableId: DRILL_TABLE,
        input, hash: result.hash, clientHash: clientHash ?? null,
        success: outcome.scored, cushions: outcome.cushionsBeforeSecond, outcomeCode: outcome.code,
        engineVersion: ENGINE_VERSION,
    });
    if (!row) return sendError(res, 409, "err.sim.drillAlreadyAttempted", "ALREADY_ATTEMPTED");
    return sendSuccess(res, {
        attempt: { ...row, route: outcome.scored ? routeOf(drill, result.events) : null },
        mismatch: clientHash !== undefined && clientHash !== result.hash,
        hash: result.hash, events: result.events, final: result.final, duration: result.duration, outcome,
    });
}));

export default router;
