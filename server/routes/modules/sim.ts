/**
 * 시뮬레이터 v2 API. 서버가 같은 엔진(shared/sim)으로 모든 샷을 다시 시뮬레이션해 정본 결과를 만든다.
 * 클라이언트 해시와 다르면 mismatches 를 올리고(결정론 텔레메트리) 서버 결과를 돌려준다.
 *
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 여기서 절대 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { V0_MAX, THETA_MAX, SHOT_LIMIT_EPS } from "../../../shared/sim/shotLimits.js";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { msg } from "../../lib/i18n.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION, paramsHash,
    type SimParams, type BallState, type ShotInput,
    weekIdFor, kstWeekIdFor, PLACEMENT_MATCHES,
} from "../../../shared/sim/index.js";
import {
    createSession, applyShot, currentPlayer, evaluateShot, isOpeningShot,
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
        V0: z.number().gt(0).max(V0_MAX + SHOT_LIMIT_EPS),
        a: z.number().min(-0.5).max(0.5),
        b: z.number().min(-0.5).max(0.5),
        theta: z.number().min(0).max(THETA_MAX + SHOT_LIMIT_EPS),
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
    if (!parsed.success) return sendError(res, 400, "err.sim.badInput");
    const b = parsed.data;
    const rules: Rules = b.rules ?? (b.gameType === "3c" ? DEFAULT_3C_RULES : DEFAULT_4C_RULES);
    if (rules.gameType !== b.gameType) return sendError(res, 400, "err.sim.rulesMismatch");

    const table = TABLES[b.tableId];
    const players = b.players ?? [{ id: req.userId!, target: b.target }];
    const state = createSession({ rules, finishType: b.finishType, inningCap: b.inningCap, players });

    const balls: readonly BallState[] = b.balls ?? openingLayout(b.gameType, table, "white");
    if (!isValidLayout(balls, table)) return sendError(res, 400, "err.sim.badLayout");
    const need = b.gameType === "3c" ? ["white", "yellow", "red"] : ["white", "yellow", "red1", "red2"];
    if (need.some((id) => !balls.some((x) => x.id === id)) || balls.length !== need.length) {
        return sendError(res, 400, "err.sim.badBallSet");
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

// 연습 에버리지 랭킹(GET /sim/ladder)은 2026-09-12 에 없앴다 — 오너: "연습은 다 빼자, 공식 멀티경기만 적용".
// 연습은 되돌리기로 이닝을 지울 수 있어 순위를 매길 수 없다. 화면에서 쓰던 곳은 없었다.

// GET /sim/ratings/me — 내 시뮬 성적 요약(종목·테이블별). 실전 성적과 무관한 별도 집계.
router.get("/sim/ratings/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.sim.myRatings(req.userId!);
    return sendSuccess(res, rows);
}));

// GET /sim/stats/me — 대시보드 한 번에: 성적 행·세션 요약(최근 100, jsonb 없음)·연습 래더 순위·드릴 주별 집계.
// 대전 목록은 /sim/matches 를 그대로 쓴다(목록 화면과 캐시 공유). 실전 성적(RP·에버리지)은 절대 섞지 않는다.
router.get("/sim/stats/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const memberId = req.userId!;
    const [ratings, matchRatings, matchRecords, sessions, ranks, drillWeeks] = await Promise.all([
        storage.sim.myRatings(memberId),
        storage.sim.myMatchRatings(memberId),      // 공식 기록(대전) — 2026-09-12 부터 대시보드는 이쪽을 본다
        // 종목·테이블별 승패(상한 없음). 대전 목록(최근 20)으로 세던 것을 대체한다 — 2026-09-16 테스터 제보.
        storage.simMatch.myRecords(memberId),
        storage.sim.listSessionSummaries(memberId, 100),
        storage.sim.myRanks(memberId),
        storage.simDrill.myWeeks(memberId, 12),
    ]);
    return sendSuccess(res, { ratings, matchRatings, matchRecords, sessions, ranks, drillWeeks, currentWeekId: kstWeekIdFor(Date.now()) });
}));

// GET /sim/rank?gameType&tableId&country=KR|all — 온라인 대전 랭킹(배치 3판 뒤). country 없음/all = 전체, 있으면 그 나라(순위 번호는 전역).
router.get("/sim/rank", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const gameType = req.query.gameType === "4c" ? "4c" : "3c";
    // 2026-09-12: 대대·중대를 합쳤다(오너). 옛 앱이 보내는 tableId 는 그냥 무시한다 — 400 을 내면 옛 화면이 깨진다.
    const raw = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "";
    const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
    return sendSuccess(res, await storage.sim.rankLadder(req.userId!, gameType, country, limit, PLACEMENT_MATCHES));
}));

// GET /sim/rank/me — 네 판의 내 대전 순위(진입 화면 '랭킹' 줄). 랭킹 화면을 네 번 부르지 않으려고 따로 둔다.
router.get("/sim/rank/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const boards = await storage.sim.myMatchRanks(req.userId!, PLACEMENT_MATCHES);
    return sendSuccess(res, { placement: PLACEMENT_MATCHES, boards });
}));

// GET /sim/sessions/:id — 상세(샷 로그 포함, 리플레이용)
router.get("/sim/sessions/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const s = await storage.sim.getSession(req.params.id);
    if (!s || s.memberId !== req.userId) return sendError(res, 404, "err.sim.sessionNotFound");
    const shots = await storage.sim.getShots(s.id);
    return sendSuccess(res, { session: s, shots });
}));

// POST /sim/sessions/:id/shots — 샷 제출 → 서버 재시뮬 → 판정 → 기록
router.post("/sim/sessions/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "err.sim.badShot");
    const { idx, input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "err.sim.miscue");

    const s = await storage.sim.getSession(req.params.id);
    if (!s || s.memberId !== req.userId) return sendError(res, 404, "err.sim.sessionNotFound");
    if (s.status !== "playing") return sendError(res, 409, "err.sim.sessionEnded");
    if (idx !== s.shots) return sendError(res, 409, msg("err.sim.idxMismatch", { n: s.shots }), "IDX_MISMATCH");

    const state = s.state as SessionState;
    const me = currentPlayer(state);
    if (input.cueBallId !== me.cueBallId) return sendError(res, 400, "err.sim.wrongCueBall");

    const preState = s.balls as BallState[];
    const params = paramsFor(s);
    const result = simulateShot(preState, input as ShotInput, params);
    const outcome = evaluateShot(result.events, input.cueBallId, state.rules, result.truncated, { opening: isOpeningShot(state, preState) });
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
    if (!row) return sendError(res, 404, "err.sim.sessionNotFound");
    return sendSuccess(res, row);
}));

export default router;
