/**
 * 시뮬레이터 네트워크 대전 A — 비동기 2인 대전(폴링). 서버가 모든 샷을 재시뮬해 정본을 만든다.
 * 흐름: 호스트가 만들기(코드) → 게스트가 코드로 참가(다마수 선택) → 차례대로 샷 → 목표/이닝/기권/무응답으로 종료.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 여기서 절대 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { notificationService } from "../../services/notificationService.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION, paramsHash,
    type SimParams, type BallState, type ShotInput,
} from "../../../shared/sim/index.js";
import {
    createSession, applyShot, currentPlayer, evaluateShot, isOpeningShot, timeoutOutcome, SHOT_CLOCK_S, SHOT_CLOCK_GRACE_S,
    DEFAULT_3C_RULES, DEFAULT_4C_RULES, type Rules, type SessionState,
} from "../../../shared/sim/rules/index.js";
import { openingLayout } from "../../../shared/sim/layouts.js";
import type { MatchWithNames } from "../../storage/simMatch.repo.js";

const router = Router();

/** 상대가 이 시간 넘게 안 치면 상대방이 승리를 주장할 수 있다. */
export const CLAIM_AFTER_MS = 48 * 60 * 60 * 1000;

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
    /** 조준 보정(일반 모드 true, 리얼리티 false). 화면 조준선만 좌우하고 판정엔 무관 — 게스트도 같은 모드로 치게 저장한다. */
    aimAssist: z.boolean().default(true),
    /** 미리보기 전체(연습처럼). 기본 false = 첫 접촉 + 꼬리까지만 — 대전은 쿠션 뒤 진로를 스스로 읽는다. */
    fullPreview: z.boolean().default(false),
});
const joinSchema = z.object({ target: z.number().int().min(1).max(999).optional() });
const shotSchema = z.object({
    idx: z.number().int().min(0),
    input: z.object({
        cueBallId: z.enum(["white", "yellow"]),
        phi: z.number().finite(), V0: z.number().gt(0).max(12),
        a: z.number().min(-0.5).max(0.5), b: z.number().min(-0.5).max(0.5), theta: z.number().min(0).max(1.2),
    }),
    clientHash: z.string().length(16).optional(),
});

function paramsFor(m: { tableId: "DAEDAE" | "JUNGDAE_KR"; cushionModel: string; condition: number }): SimParams {
    return { table: TABLES[m.tableId], cue: DEFAULT_CUE, cushionModel: m.cushionModel as SimParams["cushionModel"], condition: m.condition };
}

/** 클라이언트에 주는 모양. 상대 회원 id 는 필요 없으니 이름만. */
function publicMatch(m: MatchWithNames, viewerId: string) {
    const myIndex = m.hostId === viewerId ? 0 : m.guestId === viewerId ? 1 : -1;
    return {
        id: m.id, code: m.code, status: m.status,
        gameType: m.gameType, tableId: m.tableId, cushionModel: m.cushionModel, condition: m.condition, aimAssist: m.aimAssist, fullPreview: m.fullPreview,
        rules: m.rules, finishType: m.finishType, inningCap: m.inningCap,
        hostName: m.hostName, guestName: m.guestName, hostTarget: m.hostTarget, guestTarget: m.guestTarget,
        myIndex, turn: m.turn, shots: m.shots, version: m.version,
        state: m.state as SessionState | null, balls: m.balls as BallState[] | null,
        winnerIndex: m.winnerId === null ? null : m.winnerId === m.hostId ? 0 : 1,
        endReason: m.endReason, engineVersion: m.engineVersion, paramsHash: m.paramsHash,
        createdAt: m.createdAt, startedAt: m.startedAt, lastShotAt: m.lastShotAt, finishedAt: m.finishedAt,
        // 40초 룰: 시계 기준 시각과 서버 시각(클라이언트 시계 보정용)
        turnSeenAt: m.turnSeenAt, serverNow: new Date(),
        claimableAt: m.status === "playing" ? new Date((m.lastShotAt ?? m.startedAt ?? m.createdAt).getTime() + CLAIM_AFTER_MS) : null,
    };
}

function notify(memberId: string | null | undefined, title: string, body: string, matchId: string) {
    if (!memberId) return;
    notificationService.sendAndSaveNotification({
        memberId, title, body, category: "BILLIARDS", type: "MATCH",
        params: { url: `/online-game?match=${matchId}` },
    }).catch((e) => console.error("[SimMatchNotify]", e));
}

// POST /sim/matches — 대전 만들기(호스트)
router.post("/sim/matches", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const b = parsed.data;
    const rules: Rules = b.rules ?? (b.gameType === "3c" ? DEFAULT_3C_RULES : DEFAULT_4C_RULES);
    if (rules.gameType !== b.gameType) return sendError(res, 400, "규칙과 종목이 다릅니다");
    const params = paramsFor({ tableId: b.tableId, cushionModel: b.cushionModel, condition: b.condition });
    const row = await storage.simMatch.create({
        hostId: req.userId!, gameType: b.gameType, tableId: b.tableId, cushionModel: b.cushionModel, condition: b.condition,
        aimAssist: b.aimAssist, fullPreview: b.fullPreview, rules, finishType: b.finishType, hostTarget: b.target, inningCap: b.inningCap,
        engineVersion: ENGINE_VERSION, paramsHash: paramsHash(params),
    });
    const full = await storage.simMatch.get(row.id);
    return sendSuccess(res, publicMatch(full!, req.userId!), 201);
}));

// GET /sim/matches — 내 대전 목록
router.get("/sim/matches", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.simMatch.listMine(req.userId!);
    return sendSuccess(res, rows.map((m) => publicMatch(m, req.userId!)));
}));

// GET /sim/matches/code/:code — 코드 조회(참가 화면). /:id 보다 위.
router.get("/sim/matches/code/:code", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.findLiveByCode(String(req.params.code).trim());
    if (!m) return sendError(res, 404, "코드를 찾을 수 없습니다");
    return sendSuccess(res, publicMatch(m, req.userId!));
}));

// POST /sim/matches/code/:code/join — 게스트 참가 → 시작
router.post("/sim/matches/code/:code/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = joinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const m = await storage.simMatch.findLiveByCode(String(req.params.code).trim());
    if (!m) return sendError(res, 404, "코드를 찾을 수 없습니다");
    if (m.hostId === req.userId) return sendError(res, 400, "내가 만든 대전에는 참가할 수 없습니다");
    if (m.status === "playing") {
        if (m.guestId === req.userId) return sendSuccess(res, publicMatch(m, req.userId!));
        return sendError(res, 409, "이미 시작된 대전입니다");
    }
    const guestTarget = parsed.data.target ?? m.hostTarget;
    const rules = m.rules as Rules;
    const state = createSession({
        rules, finishType: m.finishType, inningCap: m.inningCap,
        players: [
            { id: m.hostId, target: m.hostTarget, cueBallId: "white" },
            { id: req.userId!, target: guestTarget, cueBallId: "yellow" },
        ],
    });
    const balls = openingLayout(m.gameType, TABLES[m.tableId], "white");
    const started = await storage.simMatch.start(m.id, req.userId!, guestTarget, state, balls);
    if (!started) return sendError(res, 409, "이미 시작됐거나 참가할 수 없는 대전입니다");
    const guest = await storage.getMemberById(req.userId!);
    notify(m.hostId, "시뮬레이터 대전 시작", `${guest?.name ?? "상대"}님이 들어왔어요. 첫 샷은 당신 차례입니다.`, m.id);
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
}));

// GET /sim/matches/:id — 상태(폴링용)
router.get("/sim/matches/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    let m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    // ?ack=1: 차례인 사람이 조준 화면에 들어왔다 → 40초 시계 시작(한 번만). 상대·재생 중 폴링은 ack 없이 온다.
    if (req.query.ack === "1" && m.status === "playing" && !m.turnSeenAt) {
        const myIndex = m.hostId === req.userId ? 0 : 1;
        if (m.turn === myIndex) {
            const row = await storage.simMatch.markTurnSeen(m.id, myIndex);
            if (row) m = { ...m, turnSeenAt: row.turnSeenAt };
        }
    }
    return sendSuccess(res, publicMatch(m, req.userId!));
}));

// POST /sim/matches/:id/timeout — 40초 룰 시간 초과: 차례인 사람은 40초, 상대는 50초(유예 10초) 뒤부터. 서버 시계가 판정한다.
// 샷 없이 이닝을 넘기고(foul-timeout) 차례를 바꾼다. 클라이언트는 응답의 대전 행으로 스냅한다.
router.post("/sim/matches/:id/timeout", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    if (m.status !== "playing") return sendError(res, 409, "진행 중인 대전이 아닙니다");
    if (!m.turnSeenAt) return sendError(res, 409, "아직 시계가 시작되지 않았습니다", "TOO_EARLY");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    const elapsed = Date.now() - m.turnSeenAt.getTime();
    const needMs = (m.turn === myIndex ? SHOT_CLOCK_S : SHOT_CLOCK_S + SHOT_CLOCK_GRACE_S) * 1000 - 1500;   // 네트워크 지연 여유 1.5 s
    if (elapsed < needMs) return sendError(res, 409, "아직 기다려야 합니다", "TOO_EARLY");
    const state = m.state as SessionState;
    const applied = applyShot(state, timeoutOutcome());
    const finished = applied.session.status === "finished";
    const row = await storage.simMatch.passTurn({
        id: m.id, turn: m.turn, newState: applied.session, newTurn: applied.session.turn,
        finished, winnerIndex: applied.session.winnerIndex, endReason: finished ? "inningCap" : null,
    });
    if (!row) return sendError(res, 409, "이미 차례가 바뀌었습니다", "STALE");
    const timedOutId = m.turn === 0 ? m.hostId : m.guestId;
    const otherId = m.turn === 0 ? m.guestId : m.hostId;
    if (finished) notify(otherId, "시뮬레이터 대전 종료", "결과를 확인해 보세요.", m.id);
    else if (m.turn === myIndex) notify(otherId, "당신 차례예요", "상대가 40초를 넘겨 차례가 넘어왔어요.", m.id);
    else notify(timedOutId, "시간 초과", "40초를 넘겨 이닝이 넘어갔어요.", m.id);
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
}));

// GET /sim/matches/:id/shots?from=N — 놓친 샷 따라잡기(preState+input 으로 로컬 재시뮬)
router.get("/sim/matches/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    const from = Math.max(0, parseInt(String(req.query.from ?? "0"), 10) || 0);
    const shots = await storage.simMatch.getShots(m.id, from);
    return sendSuccess(res, shots.map((s) => ({
        idx: s.idx, playerIndex: s.playerIndex, preState: s.preState, input: s.input, hash: s.hash,
        outcomeCode: s.outcomeCode, points: s.points, cushions: s.cushions, createdAt: s.createdAt,
    })));
}));

// POST /sim/matches/:id/shots — 내 차례 샷
router.post("/sim/matches/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "샷 입력이 올바르지 않습니다");
    const { idx, input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "미스큐 범위입니다");

    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    if (m.status !== "playing") return sendError(res, 409, "진행 중인 대전이 아닙니다");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    // 응답을 못 받은 클라이언트의 재전송: 이미 기록된 내 샷이면 같은 결과를 다시 준다(멱등).
    if (idx < m.shots) {
        const [prev] = await storage.simMatch.getShots(m.id, idx);
        if (prev && prev.idx === idx && prev.memberId === req.userId) {
            return sendSuccess(res, {
                shot: prev, duplicate: true, mismatch: false, hash: prev.hash,
                state: m.state, turn: m.turn, version: m.version, status: m.status,
                winnerIndex: m.winnerId === null ? null : m.winnerId === m.hostId ? 0 : 1,
            });
        }
        return sendError(res, 409, `샷 순서가 맞지 않습니다 (서버 ${m.shots})`, "IDX_MISMATCH");
    }
    if (m.turn !== myIndex) return sendError(res, 409, "상대 차례입니다", "NOT_YOUR_TURN");
    if (idx !== m.shots) return sendError(res, 409, `샷 순서가 맞지 않습니다 (서버 ${m.shots})`, "IDX_MISMATCH");

    const state = m.state as SessionState;
    const me = currentPlayer(state);
    if (input.cueBallId !== me.cueBallId) return sendError(res, 400, "이 차례의 큐볼이 아닙니다");

    const preState = m.balls as BallState[];
    const result = simulateShot(preState, input as ShotInput, paramsFor(m));
    const outcome = evaluateShot(result.events, input.cueBallId, state.rules, result.truncated, { opening: isOpeningShot(state, preState) });
    const applied = applyShot(state, outcome);
    const finished = applied.session.status === "finished";
    const endReason = finished ? (applied.session.winnerIndex === null || applied.session.players.every((p) => p.innings >= state.inningCap && state.inningCap > 0) ? "inningCap" : "target") : null;

    let rec;
    try {
        rec = await storage.simMatch.recordShot({
            matchId: m.id, idx, playerIndex: myIndex, memberId: req.userId!,
            preState, input, hash: result.hash, clientHash: clientHash ?? null,
            eventCount: result.events.length,
            outcomeCode: applied.outcome.code, points: applied.outcome.points, cushions: applied.outcome.cushionsBeforeSecond,
            newState: applied.session, newBalls: result.final, newTurn: applied.session.turn,
            finished, winnerIndex: applied.session.winnerIndex, endReason,
        });
    } catch (e: any) {
        return sendError(res, 409, e?.message ?? "기록 실패", "RECORD_CONFLICT");
    }

    const opponentId = myIndex === 0 ? m.guestId : m.hostId;
    const meName = (myIndex === 0 ? m.hostName : m.guestName) ?? "상대";
    if (finished) {
        const winnerIdx = applied.session.winnerIndex;
        const iWon = winnerIdx === myIndex;
        notify(opponentId, "시뮬레이터 대전 종료", iWon ? `${meName}님이 이겼어요. 결과를 확인해 보세요.` : "당신이 이겼어요! 결과를 확인해 보세요.", m.id);
    } else if (applied.session.turn !== myIndex) {
        notify(opponentId, "당신 차례예요", `${meName}님이 쳤어요. 시뮬레이터 대전을 이어가세요.`, m.id);
    }

    const mismatch = clientHash !== undefined && clientHash !== result.hash;
    return sendSuccess(res, {
        shot: rec.shot, duplicate: rec.duplicate, mismatch,
        hash: result.hash, events: result.events, final: result.final, duration: result.duration, truncated: result.truncated,
        history: mismatch ? result.history : undefined,
        outcome: applied.outcome, state: applied.session,
        turn: rec.match.turn, version: rec.match.version, status: rec.match.status,
        winnerIndex: rec.match.winnerId === null ? null : rec.match.winnerId === m.hostId ? 0 : 1,
    });
}));

// POST /sim/matches/:id/resign — 기권
router.post("/sim/matches/:id/resign", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    if (m.status === "waiting" && m.hostId === req.userId) {
        await storage.simMatch.cancel(m.id, req.userId!);
        return sendSuccess(res, { status: "canceled" });
    }
    if (m.status !== "playing") return sendError(res, 409, "진행 중인 대전이 아닙니다");
    const winnerId = m.hostId === req.userId ? m.guestId : m.hostId;
    const row = await storage.simMatch.finish(m.id, winnerId ?? null, "resign");
    if (!row) return sendError(res, 409, "이미 끝난 대전입니다");
    const meName = (m.hostId === req.userId ? m.hostName : m.guestName) ?? "상대";
    notify(winnerId, "시뮬레이터 대전 종료", `${meName}님이 기권했어요. 당신의 승리입니다.`, m.id);
    return sendSuccess(res, { status: "finished", winnerIndex: winnerId === m.hostId ? 0 : 1 });
}));

// POST /sim/matches/:id/claim — 상대가 48시간 넘게 안 치면 승리 주장
router.post("/sim/matches/:id/claim", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    if (m.status !== "playing") return sendError(res, 409, "진행 중인 대전이 아닙니다");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    if (m.turn === myIndex) return sendError(res, 409, "지금은 내 차례입니다");
    const since = (m.lastShotAt ?? m.startedAt ?? m.createdAt).getTime();
    if (Date.now() - since < CLAIM_AFTER_MS) return sendError(res, 409, "아직 기다려야 합니다", "TOO_EARLY");
    const row = await storage.simMatch.finish(m.id, req.userId!, "claim");
    if (!row) return sendError(res, 409, "이미 끝난 대전입니다");
    notify(myIndex === 0 ? m.guestId : m.hostId, "시뮬레이터 대전 종료", "48시간 동안 응답이 없어 상대의 승리로 끝났어요.", m.id);
    return sendSuccess(res, { status: "finished", winnerIndex: myIndex });
}));

export default router;
