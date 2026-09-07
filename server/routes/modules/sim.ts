/**
 * 시뮬레이터 v2 API. 서버가 같은 엔진(shared/sim)으로 모든 샷을 다시 시뮬레이션해 정본 결과를 만든다.
 * 클라이언트 해시와 다르면 mismatches 를 올리고(결정론 텔레메트리) 서버 결과를 돌려준다.
 *
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 여기서 절대 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION, paramsHash,
    type SimParams, type BallState, type ShotInput,
} from "../../../shared/sim/index.js";
import {
    createSession, applyShot, currentPlayer, evaluateShot,
    DEFAULT_3C_RULES, DEFAULT_4C_RULES, type Rules, type SessionState,
} from "../../../shared/sim/rules/index.js";
import { openingLayout, isValidLayout } from "../../../shared/sim/layouts.js";

const router = Router();

const ballStateSchema = z.object({
    id: z.string().min(1).max(16),
    r: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    v: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    w: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    state: z.enum(["stationary", "spinning", "rolling", "sliding", "airborne"]),
});

const rules3c = z.object({ gameType: z.literal("3c"), ruleSet: z.enum(["umb", "pba"]), bankShotPoint: z.number().int().min(1).max(5) });
const rules4c = z.object({
    gameType: z.literal("4c"), pointUnit: z.number().int().min(1).max(10),
    threeCushionDouble: z.boolean(), passiveOpponentContactIsFoul: z.boolean(), foulPenaltyUnits: z.number().int().min(0).max(3),
});

const createSchema = z.object({
    gameType: z.enum(["3c", "4c"]),
    tableId: z.enum(["DAEDAE", "JUNGDAE_KR"]),
    cushionModel: z.enum(["han2005", "sphereHalfSpace", "mathavan2010"]).default("han2005"),
    condition: z.number().min(0.7).max(1.3).default(1),
    rules: z.union([rules3c, rules4c]).optional(),
    finishType: z.enum(["none", "3c", "bank"]).default("none"),
    target: z.number().int().min(1).max(999),
    inningCap: z.number().int().min(0).max(200).default(0),
    /** 2인 로컬 대전이면 둘 다. 서버 기록은 세션 소유자(요청자) 기준. */
    players: z.array(z.object({ id: z.string().max(40), target: z.number().int().min(1).max(999) })).min(1).max(2).optional(),
    balls: z.array(ballStateSchema).min(3).max(4).optional(),
});

const shotSchema = z.object({
    idx: z.number().int().min(0),
    input: z.object({
        cueBallId: z.enum(["white", "yellow"]),
        phi: z.number().finite(),
        V0: z.number().gt(0).max(12),
        a: z.number().min(-0.5).max(0.5),
        b: z.number().min(-0.5).max(0.5),
        theta: z.number().min(0).max(1.2),
    }),
    clientHash: z.string().length(16).optional(),
});

function paramsFor(s: { tableId: "DAEDAE" | "JUNGDAE_KR"; cushionModel: string; condition: number }): SimParams {
    return {
        table: TABLES[s.tableId],
        cue: DEFAULT_CUE,
        cushionModel: s.cushionModel as SimParams["cushionModel"],
        condition: s.condition,
    };
}

// POST /sim/sessions — 세션 개설
router.post("/sim/sessions", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const b = parsed.data;
    const rules: Rules = b.rules ?? (b.gameType === "3c" ? DEFAULT_3C_RULES : DEFAULT_4C_RULES);
    if (rules.gameType !== b.gameType) return sendError(res, 400, "규칙과 종목이 다릅니다");

    const table = TABLES[b.tableId];
    const players = b.players ?? [{ id: req.userId!, target: b.target }];
    const state = createSession({ rules, finishType: b.finishType, inningCap: b.inningCap, players });

    const balls: readonly BallState[] = b.balls ?? openingLayout(b.gameType, table, "white");
    if (!isValidLayout(balls, table)) return sendError(res, 400, "공 배치가 올바르지 않습니다");
    const need = b.gameType === "3c" ? ["white", "yellow", "red"] : ["white", "yellow", "red1", "red2"];
    if (need.some((id) => !balls.some((x) => x.id === id)) || balls.length !== need.length) {
        return sendError(res, 400, "공 구성이 올바르지 않습니다");
    }

    const params = paramsFor({ tableId: b.tableId, cushionModel: b.cushionModel, condition: b.condition });
    const row = await storage.sim.createSession({
        memberId: req.userId!,
        kind: "solo",
        gameType: b.gameType,
        tableId: b.tableId,
        cushionModel: b.cushionModel,
        condition: b.condition,
        rules,
        finishType: b.finishType,
        targetScore: b.target,
        inningCap: b.inningCap,
        state,
        balls,
        engineVersion: ENGINE_VERSION,
        paramsHash: paramsHash(params),
    });
    return sendSuccess(res, { session: row, state, balls }, 201);
}));

// GET /sim/sessions — 내 세션 목록
router.get("/sim/sessions", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.sim.listSessions(req.userId!);
    return sendSuccess(res, rows);
}));

// GET /sim/ladder — 연습 에버리지 랭킹 (세션 목록보다 위: /:id 에 먹히지 않게)
router.get("/sim/ladder", asyncHandler(async (req: any, res: any) => {
    const gameType = req.query.gameType === "4c" ? "4c" : "3c";
    const tableId = req.query.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" : "DAEDAE";
    const rows = await storage.sim.ladder(gameType, tableId);
    return sendSuccess(res, rows);
}));

// GET /sim/ratings/me — 내 시뮬 성적 요약(종목·테이블별). 실전 성적과 무관한 별도 집계.
router.get("/sim/ratings/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.sim.myRatings(req.userId!);
    return sendSuccess(res, rows);
}));

// GET /sim/sessions/:id — 상세(샷 로그 포함, 리플레이용)
router.get("/sim/sessions/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const s = await storage.sim.getSession(req.params.id);
    if (!s || s.memberId !== req.userId) return sendError(res, 404, "세션이 없습니다");
    const shots = await storage.sim.getShots(s.id);
    return sendSuccess(res, { session: s, shots });
}));

// POST /sim/sessions/:id/shots — 샷 제출 → 서버 재시뮬 → 판정 → 기록
router.post("/sim/sessions/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "샷 입력이 올바르지 않습니다");
    const { idx, input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "미스큐 범위입니다");

    const s = await storage.sim.getSession(req.params.id);
    if (!s || s.memberId !== req.userId) return sendError(res, 404, "세션이 없습니다");
    if (s.status !== "playing") return sendError(res, 409, "끝난 세션입니다");
    if (idx !== s.shots) return sendError(res, 409, `샷 순서가 맞지 않습니다 (서버 ${s.shots})`, "IDX_MISMATCH");

    const state = s.state as SessionState;
    const me = currentPlayer(state);
    if (input.cueBallId !== me.cueBallId) return sendError(res, 400, "이 차례의 큐볼이 아닙니다");

    const preState = s.balls as BallState[];
    const params = paramsFor(s);
    const result = simulateShot(preState, input as ShotInput, params);
    const outcome = evaluateShot(result.events, input.cueBallId, state.rules, result.truncated);
    const applied = applyShot(state, outcome);
    const meAfter = applied.session.players[state.turn];

    const { shot, duplicate } = await storage.sim.recordShot({
        sessionId: s.id, idx, playerIndex: state.turn,
        preState, input, hash: result.hash, clientHash: clientHash ?? null,
        eventCount: result.events.length,
        outcomeCode: applied.outcome.code, points: applied.outcome.points, cushions: applied.outcome.cushionsBeforeSecond,
        newState: applied.session, newBalls: result.final,
        score: meAfter.score, innings: meAfter.innings, highRun: meAfter.highRun,
        finished: applied.session.status === "finished",
    });
    const mismatch = clientHash !== undefined && clientHash !== result.hash;
    return sendSuccess(res, {
        shot, duplicate, mismatch,
        hash: result.hash,
        events: result.events,
        final: result.final,
        duration: result.duration,
        truncated: result.truncated,
        // 클라이언트가 어긋났을 때만 전체 궤적을 보내 스냅하게 한다
        history: mismatch ? result.history : undefined,
        outcome: applied.outcome,
        state: applied.session,
    });
}));

// POST /sim/sessions/:id/close — 마감(finished: 성적 반영 / abandoned: 미반영)
router.post("/sim/sessions/:id/close", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const status = req.body?.status === "finished" ? "finished" : "abandoned";
    const row = await storage.sim.closeSession(req.params.id, req.userId!, status);
    if (!row) return sendError(res, 404, "세션이 없습니다");
    return sendSuccess(res, row);
}));

export default router;
