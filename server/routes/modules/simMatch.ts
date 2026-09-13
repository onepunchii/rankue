/**
 * 시뮬레이터 네트워크 대전 A — 비동기 2인 대전(폴링). 서버가 모든 샷을 재시뮬해 정본을 만든다.
 * 흐름: 호스트가 만들기(코드) → 게스트가 코드로 참가(다마수 선택) → 차례대로 샷 → 목표/이닝/기권/무응답으로 종료.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 여기서 절대 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { createHash, randomBytes } from "crypto";
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
    SHOT_CLOCK_STRIKES, EMOJI_COOLDOWN_MS, EMOJI_MAX_PER_MATCH, isMatchEmoji,
    DEFAULT_3C_RULES, DEFAULT_4C_RULES, type Rules, type SessionState,
} from "../../../shared/sim/rules/index.js";
import { openingLayout } from "../../../shared/sim/layouts.js";
import { handicapPair, hasEnoughRecord, MIN_INNINGS, playerAverage, RECENT_MATCHES, TARGET_INNINGS, targetFor } from "../../../shared/sim/handicap.js";
import { countWatchers } from "../../../shared/sim/watchers.js";
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
    /** 핸디전(기본): 참가 시 서버가 두 사람의 온라인 에버리지로 각자 목표를 정한다. */
    handicap: z.boolean().default(true),
    /** 멀티방(공개 방): 목록에 떠서 누구나 참가. */
    isPublic: z.boolean().default(false),
    /** 방 비밀번호(선택, 4~20자). 있으면 참가할 때 맞아야 한다. */
    password: z.string().min(4).max(20).optional(),
});
const joinSchema = z.object({ target: z.number().int().min(1).max(999).optional(), password: z.string().max(40).optional() });
const inviteSchema = z.object({ memberId: z.string().uuid() });

/** 방 비밀번호: "salt:sha256(salt+pw)". 값이 작은 비밀(방 PIN)이라 sha256 이면 충분하고, salt 로 같은 PIN 의 해시가 겹치지 않게 한다. */
export function hashRoomPassword(pw: string): string {
    const salt = randomBytes(6).toString("hex");
    return `${salt}:${createHash("sha256").update(salt + pw).digest("hex")}`;
}
export function checkRoomPassword(hash: string | null | undefined, pw: string | undefined): boolean {
    if (!hash) return true;
    if (!pw) return false;
    const [salt, digest] = hash.split(":");
    return createHash("sha256").update(salt + pw).digest("hex") === digest;
}

/** 멀티방 목록에 남는 기간 — 이보다 오래된 대기 방은 목록에서 빠진다(취소는 호스트가). */
const ROOM_LIST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 푸시 문구용 종목·테이블(한국어 — 푸시는 지금 전부 한국어). */
function gameText(m: { gameType: "3c" | "4c"; tableId: "DAEDAE" | "JUNGDAE_KR" }): string {
    return `${m.gameType === "3c" ? "3쿠션" : "4구"} · ${m.tableId === "DAEDAE" ? "대대" : "중대"}`;
}
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
/** 관전 가능: 공개 방이고 비밀번호가 없으며, 진행 중이거나 끝난 대전. 비밀번호 방은 그들끼리 치겠다는 뜻이라 막는다. */
export function isWatchable(m: { isPublic: boolean; passwordHash: string | null; status: string }): boolean {
    return m.isPublic && !m.passwordHash && (m.status === "playing" || m.status === "finished");
}

/** 관전 목록에 들어갈 한 줄. 관전은 목록에서 고르는 화면이라 점수·차례까지만 담고 공 배치는 싣지 않는다. */
function watchCard(m: MatchWithNames) {
    const st = m.state as SessionState | null;
    const scores = st ? st.players.map((p) => p.score) : [0, 0];
    const innings = st ? Math.max(...st.players.map((p) => p.innings)) : 0;
    return {
        id: m.id, status: m.status, gameType: m.gameType, tableId: m.tableId,
        hostName: m.hostName, guestName: m.guestName,
        targets: [m.hostTarget, m.guestTarget ?? m.hostTarget] as const,
        scores, innings, turn: m.turn, shots: m.shots,
        // 다시보기 목록의 정렬·표시에 쓴다(하이런·에버, 2026-09-13 오너). 단위는 점수 그대로 — 화면이 캐롬으로 읽는다.
        highRuns: st ? st.players.map((p) => p.highRun) : [0, 0],
        watchers: countWatchers(m.watchers, Date.now()),
        winnerIndex: m.winnerId === null ? null : m.winnerId === m.hostId ? 0 : 1,
        startedAt: m.startedAt, finishedAt: m.finishedAt, lastShotAt: m.lastShotAt,
    };
}

function publicMatch(m: MatchWithNames, viewerId: string) {
    const myIndex = m.hostId === viewerId ? 0 : m.guestId === viewerId ? 1 : -1;
    return {
        id: m.id, code: m.code, status: m.status,
        gameType: m.gameType, tableId: m.tableId, cushionModel: m.cushionModel, condition: m.condition, aimAssist: m.aimAssist, fullPreview: m.fullPreview,
        isPublic: m.isPublic, hasPassword: !!m.passwordHash, handicap: m.handicap,
        rules: m.rules, finishType: m.finishType, inningCap: m.inningCap,
        hostName: m.hostName, guestName: m.guestName, hostTarget: m.hostTarget, guestTarget: m.guestTarget,
        myIndex, turn: m.turn, shots: m.shots, version: m.version,
        state: m.state as SessionState | null, balls: m.balls as BallState[] | null,
        winnerIndex: m.winnerId === null ? null : m.winnerId === m.hostId ? 0 : 1,
        endReason: m.endReason, engineVersion: m.engineVersion, paramsHash: m.paramsHash,
        createdAt: m.createdAt, startedAt: m.startedAt, lastShotAt: m.lastShotAt, finishedAt: m.finishedAt,
        // 40초 룰: 시계 기준 시각과 서버 시각(클라이언트 시계 보정용)
        turnSeenAt: m.turnSeenAt, serverNow: new Date(),
        // 지금 보고 있는 관전자 수(선수 제외). 폴링마다 갱신되는 값이라 숫자만 싣는다 — 누가 보는지는 담지 않는다.
        watchers: countWatchers(m.watchers, Date.now()),
        // 쓰리아웃 표시용 [호스트, 게스트] 시간 초과 횟수
        timeouts: [m.hostTimeouts, m.guestTimeouts] as const,
        // 이모지 인사(마지막 하나) — 폴링에 실려 간다. 보낸 지 오래된 건 화면이 알아서 안 띄운다.
        emoji: m.emojiCode && m.emojiAt ? { code: m.emojiCode, from: m.emojiFrom ?? 0, at: m.emojiAt } : null,
        claimableAt: m.status === "playing" ? new Date((m.lastShotAt ?? m.startedAt ?? m.createdAt).getTime() + CLAIM_AFTER_MS) : null,
    };
}

/**
 * 멀티방을 열면 기기 알림을 받을 수 있는 회원 모두에게 "방이 열렸다"고 알린다(2026-09-09 오너: 아직 사람이 적어 모여야 한다).
 * 도배 방지: 같은 제목이 최근 ROOM_BROADCAST_QUIET_MIN 분 안에 있으면 건너뛴다(방을 연속으로 열어도 한 번만).
 * 토큰이 없는 회원은 제외한다 — 알림함에만 쌓여 방이 닫힌 뒤에 읽히면 안내가 아니라 소음이다.
 */
/** 관전 목록에 띄우는 범위: 진행 중은 하루 안에 시작한 대전, 다시보기는 최근 7일. */
const WATCH_LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WATCH_REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ROOM_BROADCAST_QUIET_MIN = 30;
const ROOM_BROADCAST_LIMIT = 300;
/** 방송을 기다려 주는 상한(ms) — 넘으면 남은 건 다음 요청 없이 그대로 끝난다. */
const ROOM_BROADCAST_WAIT_MS = 6000;

async function broadcastRoomOpened(hostId: string, hostName: string, m: { gameType: "3c" | "4c"; tableId: "DAEDAE" | "JUNGDAE_KR"; hostTarget: number }): Promise<number> {
    const title = "멀티방이 열렸어요";
    if (await storage.notifs.hasRecentTitle(title, ROOM_BROADCAST_QUIET_MIN)) return 0;
    const targets = await storage.notifs.listPushableMembers([hostId], ROOM_BROADCAST_LIMIT);
    const body = `${hostName}님이 ${gameText(m)} ${m.hostTarget}점 방을 열었어요. 지금 들어가면 바로 대전`;
    // 서버리스는 응답을 보내면 함수를 얼려 버린다 — 응답 뒤에 남겨 두면 한 건도 안 나간다(실측: 로컬 16명 → 프로덕션 0명).
    // 그래서 여기서 기다린다. 다만 상대 푸시 서버가 늘어져도 방 만들기가 인질이 되지 않게 상한을 둔다.
    const sends = targets.map((memberId) => notificationService.sendAndSaveNotification({
        memberId, title, body, category: "BILLIARDS", type: "MATCH",
        // 전체 방송이라 '멀티방 열림' 묶음이다 — 내 대전 알림(sim)과 따로 끌 수 있어야 한다(2026-09-13 오너)
        pref: "rooms",
        params: { url: "/online-game?rooms=1" },
    }).catch((e) => { console.error("[RoomBroadcast]", e); }));
    await Promise.race([
        Promise.allSettled(sends),
        new Promise((r) => setTimeout(r, ROOM_BROADCAST_WAIT_MS)),
    ]);
    return targets.length;
}

function notify(memberId: string | null | undefined, title: string, body: string, matchId: string) {
    notifyUrl(memberId, title, body, `/online-game?match=${matchId}`);
}
function notifyUrl(memberId: string | null | undefined, title: string, body: string, url: string) {
    if (!memberId) return;
    notificationService.sendAndSaveNotification({
        memberId, title, body, category: "BILLIARDS", type: "MATCH",
        pref: "sim",        // 내가 뛰는 대전 — 방 방송(rooms)과 따로 끈다
        params: { url },
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
        aimAssist: b.aimAssist, fullPreview: b.fullPreview, handicap: b.handicap, rules, finishType: b.finishType, hostTarget: b.target, inningCap: b.inningCap,
        isPublic: b.isPublic, passwordHash: b.password ? hashRoomPassword(b.password) : null,
        engineVersion: ENGINE_VERSION, paramsHash: paramsHash(params),
    });
    // 방은 한 번에 하나 — 새로 만들면 내가 열어 둔 다른 대기 방은 접는다(2026-09-08 오너: "중복방 제거").
    // 시작된 대전은 그대로 둔다. 초대를 보냈던 방이면 그 사람에게 방이 닫혔다고 알린다.
    const closed = await storage.simMatch.cancelOtherWaiting(req.userId!, row.id);
    for (const c of closed) {
        if (c.invitedId) notify(c.invitedId, "대전 초대가 닫혔어요", "상대가 새 방을 열었어요. 새 초대를 기다려 주세요.", row.id);
    }
    const full = await storage.simMatch.get(row.id);
    // 멀티방(공개)이면 알림을 받을 수 있는 회원에게 방이 열렸다고 알린다. 응답을 기다리게 하지 않는다.
    if (b.isPublic && full) {
        await broadcastRoomOpened(req.userId!, full.hostName, full).catch((e) => console.error("[RoomBroadcast]", e));
    }
    return sendSuccess(res, { ...publicMatch(full!, req.userId!), closedRooms: closed.length }, 201);
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
    // 이미 시작된 대전은 참가자에게만 보여 준다 — 코드를 찍어 본 남에게 공 배치·이름을 주지 않는다
    if (m.status === "playing" && m.hostId !== req.userId && m.guestId !== req.userId) {
        return sendError(res, 409, "이미 시작된 대전입니다");
    }
    return sendSuccess(res, publicMatch(m, req.userId!));
}));

/** 게스트 참가 → 시작. 코드 참가와 멀티방(id) 참가가 같은 길을 쓴다. 비밀번호 방이면 맞아야 한다(403 BAD_PASSWORD). */
async function joinAndStart(m: MatchWithNames, req: AuthRequest, res: any, body: z.infer<typeof joinSchema>) {
    if (m.hostId === req.userId) return sendError(res, 400, "내가 만든 대전에는 참가할 수 없습니다");
    if (m.status === "playing") {
        if (m.guestId === req.userId) return sendSuccess(res, publicMatch(m, req.userId!));
        return sendError(res, 409, "이미 시작된 대전입니다");
    }
    if (m.status !== "waiting") return sendError(res, 409, "참가할 수 없는 대전입니다");
    if (!checkRoomPassword(m.passwordHash, body.password)) return sendError(res, 403, "비밀번호가 맞지 않습니다", "BAD_PASSWORD");
    const rules = m.rules as Rules;
    // 핸디전(2026-09-12 오너): 참가하는 순간 두 사람의 온라인 에버리지로 각자 목표를 정한다.
    // 비율(실력 차)은 그대로, 길이는 기준 이닝으로 고정된다 — 다마수를 그대로 옮기면 고수 판이 300이닝씩 간다.
    // 게스트가 보낸 target 은 핸디전에서 무시한다(짠다마 방지 — 자기신고를 안 받는 건 실전 핸디와 같은 설계).
    const targets = m.handicap
        ? await handicapTargets(m, req.userId!, pointUnitOf(rules))
        : [m.hostTarget, body.target ?? m.hostTarget] as [number, number];
    const [hostTarget, guestTarget] = targets;
    const state = createSession({
        rules, finishType: m.finishType, inningCap: m.inningCap,
        players: [
            { id: m.hostId, target: hostTarget, cueBallId: "white" },
            { id: req.userId!, target: guestTarget, cueBallId: "yellow" },
        ],
    });
    const balls = openingLayout(m.gameType, TABLES[m.tableId], "white");
    const started = await storage.simMatch.start(m.id, req.userId!, guestTarget, state, balls, hostTarget);
    if (!started) return sendError(res, 409, "이미 시작됐거나 참가할 수 없는 대전입니다");
    const guest = await storage.getMemberById(req.userId!);
    notify(m.hostId, "온라인게임 대전 시작", `${guest?.name ?? "상대"}님이 들어왔어요. 첫 샷은 당신 차례입니다.`, m.id);
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
}

/** 4구는 1캐롬 = pointUnit 점(관행 10), 3쿠션은 1점. 에버리지는 언제나 캐롬/이닝으로 센다. */
function pointUnitOf(rules: Rules): number {
    return rules.gameType === "4c" ? rules.pointUnit : 1;
}

/**
 * 한 사람의 온라인 에버리지. **온라인 대전 기록만** 본다 — 시뮬레이터는 실전 성적(RP·에버리지·핸디)을
 * 읽지도 쓰지도 않는다(sim.guard.test 가 막는다, 2026-08-30 오염 사고). 기록이 모자라면 종목 기본값이다.
 */
async function simAverage(memberId: string, gameType: "3c" | "4c", pointUnit: number): Promise<{ avg: number; record: { score: number; innings: number; matches: number } }> {
    const record = await storage.simMatch.recentMatchRecord(memberId, gameType, RECENT_MATCHES);
    return { avg: playerAverage({ gameType, pointUnit, record }), record };
}

/** 핸디전 목표 두 개. [방장, 게스트]. */
async function handicapTargets(m: MatchWithNames, guestId: string, pointUnit: number): Promise<[number, number]> {
    const [host, guest] = await Promise.all([
        simAverage(m.hostId, m.gameType, pointUnit),
        simAverage(guestId, m.gameType, pointUnit),
    ]);
    return handicapPair(host.avg, guest.avg, m.gameType, pointUnit);
}

// GET /sim/handicap — 내 온라인 다마수(종목별). 방 만들기·참가 화면이 "내 다마 80" 을 보여줄 때 쓴다.
router.get("/sim/handicap", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const out = await Promise.all((["3c", "4c"] as const).map(async (gameType) => {
        const pointUnit = pointUnitOf(gameType === "4c" ? DEFAULT_4C_RULES : DEFAULT_3C_RULES);
        const { avg, record } = await simAverage(req.userId!, gameType, pointUnit);
        return {
            gameType, avg: Math.round(avg * 1000) / 1000,
            target: targetFor(avg, gameType, pointUnit),
            matches: record.matches, innings: record.innings,
            /** 온라인 기록으로 매긴 값인가(아니면 아직 기본값에서 시작 중인가) */
            fromRecord: hasEnoughRecord(record),
        };
    }));
    return sendSuccess(res, { minInnings: MIN_INNINGS, innings: TARGET_INNINGS, boards: out });
}));

// POST /sim/matches/code/:code/join — 게스트 참가 → 시작
router.post("/sim/matches/code/:code/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = joinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const m = await storage.simMatch.findLiveByCode(String(req.params.code).trim());
    if (!m) return sendError(res, 404, "코드를 찾을 수 없습니다");
    return joinAndStart(m, req, res, parsed.data);
}));

// GET /sim/rooms — 멀티방 목록(공개·대기 중·내 방 아님·24시간 이내). 코드는 숨긴다(비밀번호 방을 코드로 우회하지 못하게).
router.get("/sim/rooms", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.simMatch.listPublicWaiting(req.userId!, Date.now() - ROOM_LIST_WINDOW_MS);
    return sendSuccess(res, rows.map((m) => ({ ...publicMatch(m, req.userId!), code: "" })));
}));

// GET /sim/watch — 관전 목록. live = 지금 치고 있는 공개 대전, replays = 최근에 끝난 공개 대전(다시보기).
// 오너(2026-09-12): "게임 시작하면 방이 사라지는데, 관전으로 들어가면 그 경기를 볼 수 있게".
router.get("/sim/watch", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const [live, replays] = await Promise.all([
        storage.simMatch.listWatchable(req.userId!, "playing", Date.now() - WATCH_LIVE_WINDOW_MS, 20),
        // 다시보기는 정렬(하이런·명경기)을 화면에서 하므로 후보를 넉넉히 내려 준다(2026-09-13 오너)
        storage.simMatch.listWatchable(req.userId!, "finished", Date.now() - WATCH_REPLAY_WINDOW_MS, 60),
    ]);
    return sendSuccess(res, {
        live: live.map((m) => watchCard(m)),
        replays: replays.map((m) => watchCard(m)),
    });
}));

// POST /sim/matches/:id/join — 멀티방 참가(목록에서). 비밀번호 방이면 body.password.
router.post("/sim/matches/:id/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = joinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || m.status === "canceled" || m.status === "finished") return sendError(res, 404, "방을 찾을 수 없습니다");
    if (!m.isPublic && m.guestId !== req.userId && m.invitedId !== req.userId) return sendError(res, 404, "방을 찾을 수 없습니다");
    return joinAndStart(m, req, res, parsed.data);
}));

// POST /sim/matches/:id/invite — 호스트가 친구에게 푸시 초대. 받은 쪽이 누르면 ?join=<code>&auto=1 로 바로 참가한다.
router.post("/sim/matches/:id/invite", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = inviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "입력이 올바르지 않습니다");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || m.hostId !== req.userId) return sendError(res, 404, "대전이 없습니다");
    if (m.status !== "waiting") return sendError(res, 409, "대기 중인 대전이 아닙니다");
    if (parsed.data.memberId === req.userId) return sendError(res, 400, "나에게는 보낼 수 없습니다");
    const target = await storage.getMemberById(parsed.data.memberId);
    if (!target) return sendError(res, 404, "회원을 찾을 수 없습니다");
    await storage.simMatch.setInvited(m.id, target.id);
    notifyUrl(
        target.id,
        `${m.hostName}님의 온라인게임 대전 초대`,
        `${gameText(m)} · ${m.hostTarget}점${m.passwordHash ? " · 비밀번호 방" : ""} — 누르면 바로 시작돼요`,
        `/online-game?join=${m.code}&auto=1`,
    );
    return sendSuccess(res, { invited: true, name: target.name });
}));

// GET /sim/matches/:id — 상태(폴링용)
router.get("/sim/matches/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    let m = await storage.simMatch.get(req.params.id);
    // 참가자가 아니어도 관전할 수 있다(공개 방·비밀번호 없음, 진행 중이거나 끝난 대전) — 2026-09-12.
    // 관전자는 읽기만 한다: 접속 표시(touchSeen)도, 40초 시계 시작(ack)도 건드리지 않는다.
    // 당구는 숨은 정보가 없어 관전이 판을 유리하게 만들지 않는다.
    const isPlayer = !!m && (m.hostId === req.userId || m.guestId === req.userId);
    if (!m || (!isPlayer && !isWatchable(m))) return sendError(res, 404, "대전이 없습니다");
    // 접속 표시: 대전 화면을 보고 있다(폴링). 차례가 넘어올 때 시계를 바로 돌릴지 여기서 판단한다(PRESENCE_MS).
    if (isPlayer && m.status === "playing") await storage.simMatch.touchSeen(m.id, m.hostId === req.userId ? 0 : 1);
    // 관전자 표시(2026-09-12): 보고 있는 사람 수를 선수와 다른 관전자에게 보여 주려고 폴링마다 시각을 적는다.
    else if (!isPlayer && m.status === "playing") {
        const now = Date.now();
        await storage.simMatch.touchWatcher(m.id, req.userId!, now);
        // 방금 적은 내 표시를 응답에도 반영한다 — 대전 행을 한 번 더 읽지 않으려고 여기서 합친다(4초마다 오는 요청이다).
        m = { ...m, watchers: { ...(m.watchers as Record<string, number> | null ?? {}), [req.userId!]: now } };
    }
    // ?ack=1: 차례인 사람이 조준 화면에 들어왔다 → 40초 시계 시작(한 번만, 서버가 이미 적었으면 그대로). 상대·재생 중 폴링은 ack 없이 온다.
    if (isPlayer && req.query.ack === "1" && m.status === "playing" && !m.turnSeenAt) {
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
    await storage.simMatch.touchSeen(m.id, myIndex);
    // 시계는 한 번 시작하면 자리를 비워도 계속 돈다 — 자리를 비우는 것 자체가 패널티다(2026-09-08 오너 결정).
    // 아예 앱을 안 연 사람은 시계가 시작되지 않으므로 48시간 무응답 승리 주장으로 처리된다.
    const elapsed = Date.now() - m.turnSeenAt.getTime();
    const needMs = (m.turn === myIndex ? SHOT_CLOCK_S : SHOT_CLOCK_S + SHOT_CLOCK_GRACE_S) * 1000 - 1500;   // 네트워크 지연 여유 1.5 s
    if (elapsed < needMs) return sendError(res, 409, "아직 기다려야 합니다", "TOO_EARLY");
    const state = m.state as SessionState;
    const applied = applyShot(state, timeoutOutcome());
    // 쓰리아웃: 이번이 그 사람의 SHOT_CLOCK_STRIKES 번째 시간 초과면 실격패(2026-09-08 오너)
    const strikes = (m.turn === 0 ? m.hostTimeouts : m.guestTimeouts) + 1;
    const out = strikes >= SHOT_CLOCK_STRIKES;
    const finished = out || applied.session.status === "finished";
    const winnerIndex = out ? (m.turn === 0 ? 1 : 0) : applied.session.winnerIndex;
    const newState = out ? { ...applied.session, status: "finished" as const, winnerIndex } : applied.session;
    const row = await storage.simMatch.passTurn({
        id: m.id, turn: m.turn, newState, newTurn: applied.session.turn,
        finished, winnerIndex, endReason: out ? "timeout" : finished ? "inningCap" : null,
        strikeIndex: m.turn === 0 ? 0 : 1,
    });
    if (!row) return sendError(res, 409, "이미 차례가 바뀌었습니다", "STALE");
    const timedOutId = m.turn === 0 ? m.hostId : m.guestId;
    const otherId = m.turn === 0 ? m.guestId : m.hostId;
    if (out) {
        notify(otherId, "온라인게임 대전 종료", `상대가 시간 초과 ${SHOT_CLOCK_STRIKES}번으로 실격했어요. 당신의 승리입니다.`, m.id);
        notify(timedOutId, "실격패", `시간 초과 ${SHOT_CLOCK_STRIKES}번으로 대전이 끝났어요.`, m.id);
    } else if (finished) notify(otherId, "온라인게임 대전 종료", "결과를 확인해 보세요.", m.id);
    else if (m.turn === myIndex) notify(otherId, "당신 차례예요", `상대가 40초를 넘겨 차례가 넘어왔어요. (시간 초과 ${strikes}/${SHOT_CLOCK_STRIKES})`, m.id);
    else notify(timedOutId, "시간 초과", `40초를 넘겨 이닝이 넘어갔어요. (${strikes}/${SHOT_CLOCK_STRIKES})`, m.id);
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
}));

// GET /sim/matches/:id/shots?from=N — 놓친 샷 따라잡기(preState+input 으로 로컬 재시뮬)
router.get("/sim/matches/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    // 관전·다시보기도 같은 경로로 샷을 받아 로컬에서 재시뮬한다(관전 규칙은 isWatchable).
    if (!m || !(m.hostId === req.userId || m.guestId === req.userId || isWatchable(m))) return sendError(res, 404, "대전이 없습니다");
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
    // 치는 사람도 접속 중 — 득점으로 차례가 이어지면 재생 뒤 내 시계가 바로 돈다
    await storage.simMatch.touchSeen(m.id, myIndex);
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
        notify(opponentId, "온라인게임 대전 종료", iWon ? `${meName}님이 이겼어요. 결과를 확인해 보세요.` : "당신이 이겼어요! 결과를 확인해 보세요.", m.id);
    } else if (applied.session.turn !== myIndex) {
        notify(opponentId, "당신 차례예요", `${meName}님이 쳤어요. 온라인게임 대전을 이어가세요.`, m.id);
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

// POST /sim/matches/:id/emoji — 상대에게 이모지 인사. 고정 여섯 개만, 5초 간격·한 대전 10회 제한.
router.post("/sim/matches/:id/emoji", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const code = String(req.body?.code ?? "");
    if (!isMatchEmoji(code)) return sendError(res, 400, "보낼 수 없는 인사입니다");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "대전이 없습니다");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    const r = await storage.simMatch.sendEmoji(m.id, myIndex, code, EMOJI_COOLDOWN_MS, EMOJI_MAX_PER_MATCH);
    if (r === "gone") return sendError(res, 409, "진행 중인 대전이 아닙니다");
    if (r === "cooldown") return sendError(res, 429, "잠시 뒤에 보낼 수 있어요", "TOO_FAST");
    if (r === "limit") return sendError(res, 429, "이 대전에서 보낼 수 있는 횟수를 다 썼어요", "LIMIT");
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
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
    notify(winnerId, "온라인게임 대전 종료", `${meName}님이 기권했어요. 당신의 승리입니다.`, m.id);
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
    notify(myIndex === 0 ? m.guestId : m.hostId, "온라인게임 대전 종료", "48시간 동안 응답이 없어 상대의 승리로 끝났어요.", m.id);
    return sendSuccess(res, { status: "finished", winnerIndex: myIndex });
}));

export default router;
