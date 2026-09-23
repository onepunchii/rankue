/**
 * 시뮬레이터 네트워크 대전 A — 비동기 2인 대전(폴링). 서버가 모든 샷을 재시뮬해 정본을 만든다.
 * 흐름: 호스트가 만들기(코드) → 게스트가 코드로 참가(다마수 선택) → 차례대로 샷 → 목표/이닝/기권/무응답으로 종료.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 여기서 절대 참조하지 않는다(sim.guard.test.ts).
 */
import { Router } from "express";
import { PLACEMENT_MATCHES } from "../../../shared/sim/rank.js";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../../storage/index.js";
import { notificationService } from "../../services/notificationService.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { msg, tr, memberLocale, type I18nText } from "../../lib/i18n.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
    simulateShot, TABLES, DEFAULT_CUE, ENGINE_VERSION, paramsHash,
    type SimParams, type BallState, type ShotInput,
} from "../../../shared/sim/index.js";
import {
    createSession, applyShot, currentPlayer, evaluateShot, isOpeningShot, shotInning, timeoutOutcome, SHOT_CLOCK_S, SHOT_CLOCK_GRACE_S,
    SHOT_CLOCK_STRIKES, PRESENCE_MS, ABSENT_GRACE_MS, AIM_FRESH_MS,
    DEFAULT_3C_RULES, DEFAULT_4C_RULES, type Rules, type SessionState,
} from "../../../shared/sim/rules/index.js";
import { openingLayout } from "../../../shared/sim/layouts.js";
import {
    CHAT_CODES, CHAT_COOLDOWN_MS, CHAT_FROM_WATCHER, CHAT_MAX_CHARS, CHAT_MAX_PER_MATCH, CHAT_PAGE_MAX, CHAT_WATCH_CODES,
    chatLength, isChatCode, normalizeChatText,
} from "../../../shared/sim/chat.js";
import { checkContent, maskContacts } from "../../utils/contentFilter.js";
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
/** 만들기 본문. 채팅 카드(chatCards.ts)가 같은 기본값으로 방을 만들 수 있게 내보낸다 — `.parse` 로 기본값이 채워진다. */
export const createSchema = z.object({
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

/**
 * 푸시 문구용 종목·테이블 키 꼬리("3cDaedae" 등). 사전 자리표시자는 값을 그대로 끼우기만 하므로 "3쿠션 · 대대" 같은
 * 번역이 필요한 조각은 받는 사람 언어를 알 때만 tr 로 풀고(초대), 모르면(방 방송) 조합별 키를 쓴다.
 */
function gameKey(m: { gameType: "3c" | "4c"; tableId: "DAEDAE" | "JUNGDAE_KR" }): "3cDaedae" | "3cJungdae" | "4cDaedae" | "4cJungdae" {
    return `${m.gameType}${m.tableId === "DAEDAE" ? "Daedae" : "Jungdae"}`;
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

/**
 * 채팅을 **읽을** 수 있는 사람 — 두 선수 + 관전 가능한 대전의 관전자(2026-09-21 오너: "관전 시에도 채팅을 하게 해 달라").
 *
 * 관전자에게 열리는 것은 읽기와 **고정 문구**뿐이다(canWriteChatText 가 자유 입력을 선수로 묶는다).
 * 9/16 에 "신고·차단은 유저가 많아지면"이라고 정했을 때의 전제가 "사람이 쓴 글을 읽는 사람이 둘뿐"이었는데,
 * 고정 문구만 열면 관전자가 만들 수 있는 말이 우리가 고른 목록으로 한정돼 그 전제가 깨지지 않는다.
 * 관전 자체가 비밀번호 없는 공개 대전에만 열리므로(isWatchable), 비공개 방의 대화는 그대로 둘만의 것이다.
 */
export function canReadChat(m: { hostId: string; guestId: string | null; isPublic?: boolean; passwordHash?: string | null; status?: string }, viewerId: string): boolean {
    if (m.hostId === viewerId || m.guestId === viewerId) return true;
    return isWatchable({ isPublic: m.isPublic === true, passwordHash: m.passwordHash ?? null, status: m.status ?? "" });
}

/** 자유 입력은 두 선수만 — 관전자는 고정 문구만 보낸다(shared/sim/chat chatReject 가 서버에서 다시 막는다). */
export function canWriteChatText(m: { hostId: string; guestId: string | null }, viewerId: string): boolean {
    return m.hostId === viewerId || m.guestId === viewerId;
}

/**
 * 클라이언트에 주는 채팅 한 줄. **id 를 반드시 싣는다** — 파서가 필수로 보고, 나중에 신고를 붙일 때 대상 키다.
 * sender_id 는 내보내지 않는다(이 파일의 규칙: 상대 회원 id 는 필요 없으니 이름만).
 */
/** 관전자가 보낸 줄은 이름을 싣지 않는다 — 화면은 "관전"으로만 그린다(누가 봤는지 남기지 않는다). */
function chatLine(c: { id: string; seq: number; senderIndex: number; kind: string; text: string; createdAt: Date }) {
    return { id: c.id, seq: c.seq, from: c.senderIndex, kind: c.kind, text: c.text, at: c.createdAt };
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
        /** 헤더 국기용(2026-09-16). ISO 3166-1 alpha-2, 가입할 때 IP 로 자동 — 없는 사람이 더 많다. */
        hostCountry: m.hostCountry ?? null, guestCountry: m.guestCountry ?? null,
        myIndex, turn: m.turn, shots: m.shots, version: m.version,
        state: m.state as SessionState | null, balls: m.balls as BallState[] | null,
        winnerIndex: m.winnerId === null ? null : m.winnerId === m.hostId ? 0 : 1,
        endReason: m.endReason, engineVersion: m.engineVersion, paramsHash: m.paramsHash,
        createdAt: m.createdAt, startedAt: m.startedAt, lastShotAt: m.lastShotAt, finishedAt: m.finishedAt,
        // 40초 룰: 시계 기준 시각과 서버 시각(클라이언트 시계 보정용)
        turnSeenAt: m.turnSeenAt, serverNow: new Date(),
        /**
         * 상대 조준(2026-09-16 오너: "멀티가 너무 정적이다"). 지금 치는 사람이 겨누는 방향 — 기다리는 쪽 화면이
         * 큐대를 그린다. 내 차례면 볼 것이 없고, 낡은 값(AIM_FRESH_MS)은 아예 안 보낸다(상대가 앱을 닫은 경우).
         * 예상 경로는 주지 않는다 — 그건 가락 미리보기 제한을 무의미하게 만든다.
         */
        opponentAim: m.status === "playing" && m.turn !== myIndex && m.aimPhi != null && m.aimAt
            && Date.now() - m.aimAt.getTime() <= AIM_FRESH_MS
            ? { phi: m.aimPhi, at: m.aimAt }
            : null,
        /**
         * 오간 채팅 줄 수(2026-09-16). **숫자 하나만** 싣는다 — 클라이언트는 이 값이 늘었을 때만 /chats 를 부르므로
         * 추가 폴링이 0이고, 아무도 말하지 않는 대전의 응답 크기는 사실상 그대로다.
         * 본문을 여기 실으면 이모지와 같은 유실(둘이 같은 폴링 창에 보내면 앞말이 덮인다)이 표시 경로에서 되살아난다.
         * 관전자(myIndex < 0)에게는 늘 0 — 채팅은 두 선수만 읽고 쓴다(canReadChat).
         */
        // 관전자도 대화를 읽으므로 카운터를 준다 — 늘었을 때만 /chats 를 부르는 규약은 선수와 같다.
        chatSeq: myIndex >= 0 || isWatchable(m) ? m.chatSeq : 0,
        // 상대가 지금 화면을 보고 있나 — 자리를 비우면 시계가 늦게(ABSENT_GRACE_MS) 시작하므로,
        // 그 사이 남은 사람 화면이 멈춘 것처럼 보이지 않게 이유를 알려 준다(2026-09-15).
        opponentAway: m.status === "playing" && (() => {
            const seen = myIndex === 0 ? m.guestSeenAt : m.hostSeenAt;
            return !seen || Date.now() - seen.getTime() > PRESENCE_MS;
        })(),
        // 지금 보고 있는 관전자 수(선수 제외). 폴링마다 갱신되는 값이라 숫자만 싣는다 — 누가 보는지는 담지 않는다.
        watchers: countWatchers(m.watchers, Date.now()),
        // 쓰리아웃 표시용 [호스트, 게스트] 시간 초과 횟수
        timeouts: [m.hostTimeouts, m.guestTimeouts] as const,
        // 이모지 인사(마지막 하나) — 폴링에 실려 간다. 보낸 지 오래된 건 화면이 알아서 안 띄운다.
        claimableAt: m.status === "playing" ? new Date((m.lastShotAt ?? m.startedAt ?? m.createdAt).getTime() + CLAIM_AFTER_MS) : null,
        // "한 판 더"(2026-09-15): 끝난 대전에서만 뜻이 있다. matchId 가 채워지면 양쪽이 그 방으로 옮겨 간다.
        rematch: m.status === "finished" ? (() => {
            const by = (m.rematchBy as Record<string, string> | null) ?? {};
            const meId = myIndex === 0 ? m.hostId : m.guestId;
            const otherId = myIndex === 0 ? m.guestId : m.hostId;
            return { mine: !!(meId && by[meId]), theirs: !!(otherId && by[otherId]), matchId: m.rematchId ?? null };
        })() : null,
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

async function broadcastRoomOpened(hostId: string, hostName: string, m: { id: string; gameType: "3c" | "4c"; tableId: "DAEDAE" | "JUNGDAE_KR"; hostTarget: number }): Promise<number> {
    const title = msg("notif.sim.roomOpened.title");
    // 도배 방지는 **방장 기준**이다(2026-09-21 오너: "푸시가 갈 때도 있고 안 갈 때도 있다").
    // 예전엔 제목만 보고 전체 기준으로 막아서, 남이 25분 전에 방을 열었으면 내 방은 알림이 통째로 안 나갔다.
    // 사람이 적은 지금은 서로 다른 사람이 열 때마다 알리는 편이 맞다 — 한 사람이 연달아 여는 것만 막는다.
    if (await storage.simMatch.recentPublicRoomsByHost(hostId, ROOM_BROADCAST_QUIET_MIN, m.id) > 0) return 0;
    const targets = await storage.notifs.listPushableMembers([hostId], ROOM_BROADCAST_LIMIT);
    // 받는 사람이 수백 명이라 종목·테이블은 조합별 키(body3cDaedae …)로 — 서비스가 각자 언어로 푼다.
    const body = msg(`notif.sim.roomOpened.body${gameKey(m)}`, { name: hostName, target: m.hostTarget });
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

// ⚠️ 두 함수 모두 **await 해서 부른다** — 서버리스는 응답을 보내면 실행을 얼려, 기다리지 않은 알림은 푸시도 알림함 기록도
// 통째로 사라진다(위 방송 주석과 같은 이유). 2026-09-22 리뷰 전까지 1:1 대전 알림(초대·내 차례·종료)이 전부 이 상태였다.
async function notify(memberId: string | null | undefined, title: string | I18nText, body: string | I18nText, matchId: string): Promise<void> {
    await notifyUrl(memberId, title, body, `/online-game?match=${matchId}`);
}
/**
 * 샷·시간초과처럼 **판이 도는 길목**에서 쓰는 상한 — 클라이언트는 이 응답들을 한 줄(serial)로 기다리며 그동안 폴링도 멈춘다.
 * 푸시 서버가 늘어지면(상한 8초) 판이 통째로 멈추므로 1.5초만 기다린다. 알림함 기록은 sendAndSaveNotification 안에서
 * 푸시보다 먼저 저장되므로 남고, 잃을 수 있는 것은 느린 푸시 한 건뿐이다.
 */
function capped(work: Promise<unknown>, ms = 1500): Promise<void> {
    return Promise.race([work.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
}
async function notifyUrl(memberId: string | null | undefined, title: string | I18nText, body: string | I18nText, url: string): Promise<void> {
    if (!memberId) return;
    await notificationService.sendAndSaveNotification({
        memberId, title, body, category: "BILLIARDS", type: "MATCH",
        pref: "sim",        // 내가 뛰는 대전 — 방 방송(rooms)과 따로 끈다
        params: { url },
    }).catch((e) => console.error("[SimMatchNotify]", e));
}

/**
 * 호스트 방 만들기의 본체 — 행 만들기 + 내 다른 대기 방 접기(초대받은 사람에게 닫힘 알림). 라우트와 채팅 카드
 * (chatCards.ts 의 SIM_INVITE)가 같은 규칙으로 방을 만들도록 여기 하나로 둔다. 공개 방 방송은 라우트 몫.
 * rules 가 종목과 안 맞으면 null(라우트는 400).
 */
export async function createHostMatch(hostId: string, b: z.infer<typeof createSchema>): Promise<{ full: MatchWithNames; closed: number } | null> {
    const rules: Rules = b.rules ?? (b.gameType === "3c" ? DEFAULT_3C_RULES : DEFAULT_4C_RULES);
    if (rules.gameType !== b.gameType) return null;
    const params = paramsFor({ tableId: b.tableId, cushionModel: b.cushionModel, condition: b.condition });
    const row = await storage.simMatch.create({
        hostId, gameType: b.gameType, tableId: b.tableId, cushionModel: b.cushionModel, condition: b.condition,
        aimAssist: b.aimAssist, fullPreview: b.fullPreview, handicap: b.handicap, rules, finishType: b.finishType, hostTarget: b.target, inningCap: b.inningCap,
        isPublic: b.isPublic, passwordHash: b.password ? hashRoomPassword(b.password) : null,
        engineVersion: ENGINE_VERSION, paramsHash: paramsHash(params),
    });
    // 방은 한 번에 하나 — 새로 만들면 내가 열어 둔 다른 대기 방은 접는다(2026-09-08 오너: "중복방 제거").
    // 시작된 대전은 그대로 둔다. 초대를 보냈던 방이면 그 사람에게 방이 닫혔다고 알린다.
    const closed = await storage.simMatch.cancelOtherWaiting(hostId, row.id);
    for (const c of closed) {
        if (c.invitedId) await notify(c.invitedId, "notif.sim.inviteClosed.title", "notif.sim.inviteClosed.body", row.id);
    }
    const full = await storage.simMatch.get(row.id);
    return { full: full!, closed: closed.length };
}

// POST /sim/matches — 대전 만들기(호스트)
router.post("/sim/matches", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "err.sim.badInput");
    const b = parsed.data;
    const made = await createHostMatch(req.userId!, b);
    if (!made) return sendError(res, 400, "err.sim.rulesMismatch");
    const { full, closed } = made;
    // 멀티방(공개)이면 알림을 받을 수 있는 회원에게 방이 열렸다고 알린다. 응답을 기다리게 하지 않는다.
    if (b.isPublic && full) {
        await broadcastRoomOpened(req.userId!, full.hostName, full).catch((e) => console.error("[RoomBroadcast]", e));
    }
    return sendSuccess(res, { ...publicMatch(full!, req.userId!), closedRooms: closed }, 201);
}));

// GET /sim/matches — 내 대전 목록
router.get("/sim/matches", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = await storage.simMatch.listMine(req.userId!);
    return sendSuccess(res, rows.map((m) => publicMatch(m, req.userId!)));
}));

// GET /sim/matches/code/:code — 코드 조회(참가 화면). /:id 보다 위.
router.get("/sim/matches/code/:code", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.findLiveByCode(String(req.params.code).trim());
    if (!m) return sendError(res, 404, "err.sim.codeNotFound");
    // 이미 시작된 대전은 참가자에게만 보여 준다 — 코드를 찍어 본 남에게 공 배치·이름을 주지 않는다
    if (m.status === "playing" && m.hostId !== req.userId && m.guestId !== req.userId) {
        return sendError(res, 409, "err.sim.alreadyStarted");
    }
    return sendSuccess(res, publicMatch(m, req.userId!));
}));

/** 게스트 참가 → 시작. 코드 참가와 멀티방(id) 참가가 같은 길을 쓴다. 비밀번호 방이면 맞아야 한다(403 BAD_PASSWORD). */
async function joinAndStart(m: MatchWithNames, req: AuthRequest, res: any, body: z.infer<typeof joinSchema>) {
    if (m.hostId === req.userId) return sendError(res, 400, "err.sim.joinOwn");
    if (m.status === "playing") {
        if (m.guestId === req.userId) return sendSuccess(res, publicMatch(m, req.userId!));
        return sendError(res, 409, "err.sim.alreadyStarted");
    }
    if (m.status !== "waiting") return sendError(res, 409, "err.sim.notJoinable");
    if (!checkRoomPassword(m.passwordHash, body.password)) return sendError(res, 403, "err.sim.badPassword", "BAD_PASSWORD");
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
    if (!started) return sendError(res, 409, "err.sim.startedOrNotJoinable");
    const guest = await storage.getMemberById(req.userId!);
    await notify(m.hostId, "notif.sim.started.title", msg("notif.sim.started.body", { name: guest?.name ?? "상대" }), m.id);
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

/**
 * GET /sim/opponents — 초대 목록(2026-09-23 오너: "친구 목록에 3쿠션·4구 온라인게임 핸디가 안 나온다").
 *
 * 왜 실전 상대 목록(/opponents)을 그대로 안 쓰나: 거기 실린 다마수 칸은 **자기가 적는 실전 값**이라
 * 회원 107명 중 2명·6명만 값이 있다(실측) — 목록이 거의 전부 "–" 가 된다. 게다가 온라인 대전은 기본이 핸디전이라
 * 실제로 쓰는 값은 **온라인 기록으로 매긴 다마수**다. 그래서 여기서 그 값을 계산해 함께 준다.
 * 이름·id 만 읽는 가벼운 질의를 쓴다 — 시뮬레이터는 실전 성적을 읽지도 쓰지도 않는다(sim.guard.test).
 * 라이벌(친구)을 앞에 두고 같은 매장 회원을 뒤에 붙인다 — 화면 이름이 '친구에게 보내기' 다.
 */
router.get("/sim/opponents", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const me = await storage.getMemberById(req.userId!);
    if (!me) return sendError(res, 404, "err.member.notFound");
    const [friendIds, mates] = await Promise.all([
        storage.listFriendIds(req.userId!, "BILLIARDS"),
        storage.listStoreMemberNames(me.storeId, me.id),
    ]);
    const isFriend = new Set(friendIds);
    // 라이벌이 위로 — 화면 이름이 '친구에게 보내기' 다. 그 안에서는 매장 목록 순서(최근 방문)를 지킨다.
    const rows = mates
        .filter((m) => m.id !== req.userId)
        .map((m) => ({ id: m.id, name: m.name, friend: isFriend.has(m.id) }))
        .sort((a, b) => Number(b.friend) - Number(a.friend));
    const ids = rows.slice(0, 100).map((r) => r.id);   // 한 번에 보여 줄 만큼만 계산한다
    const [rec3, rec4, rank3, rank4] = await Promise.all([
        storage.simMatch.recentMatchRecords(ids, "3c", RECENT_MATCHES),
        storage.simMatch.recentMatchRecords(ids, "4c", RECENT_MATCHES),
        storage.sim.ranksFor(ids, "3c", PLACEMENT_MATCHES),
        storage.sim.ranksFor(ids, "4c", PLACEMENT_MATCHES),
    ]);
    const board = (
        id: string, gameType: "3c" | "4c",
        rec: Map<string, { score: number; innings: number; matches: number }>,
        rk: Map<string, { rank: number; total: number; matches: number }>,
    ) => {
        const record = rec.get(id) ?? { score: 0, innings: 0, matches: 0 };
        const pointUnit = pointUnitOf(gameType === "4c" ? DEFAULT_4C_RULES : DEFAULT_3C_RULES);
        const avg = playerAverage({ gameType, pointUnit, record });
        const r = rk.get(id);
        return {
            // 오너가 보고 싶어 한 값(2026-09-23): 핸디전의 근거인 **에버리지**와 **랭킹**. target 은 참고로 함께.
            avg: Math.round(avg * 1000) / 1000,
            target: targetFor(avg, gameType, pointUnit),
            matches: record.matches,
            fromRecord: hasEnoughRecord(record),
            // 배치(3판) 전이면 사다리에 없다 — null 이면 화면이 순위를 안 그린다.
            rank: r?.rank ?? null, rankTotal: r?.total ?? null,
        };
    };
    return sendSuccess(res, rows.slice(0, 100).map((r) => ({
        id: r.id, name: r.name, friend: r.friend,
        b3c: board(r.id, "3c", rec3, rank3), b4c: board(r.id, "4c", rec4, rank4),
    })));
}));

// POST /sim/matches/code/:code/join — 게스트 참가 → 시작
router.post("/sim/matches/code/:code/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = joinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.sim.badInput");
    const m = await storage.simMatch.findLiveByCode(String(req.params.code).trim());
    if (!m) return sendError(res, 404, "err.sim.codeNotFound");
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
    if (!parsed.success) return sendError(res, 400, "err.sim.badInput");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || m.status === "canceled" || m.status === "finished") return sendError(res, 404, "err.sim.roomNotFound");
    if (!m.isPublic && m.guestId !== req.userId && m.invitedId !== req.userId) return sendError(res, 404, "err.sim.roomNotFound");
    return joinAndStart(m, req, res, parsed.data);
}));

// POST /sim/matches/:id/invite — 호스트가 친구에게 푸시 초대. 받은 쪽이 누르면 ?join=<code>&auto=1 로 바로 참가한다.
router.post("/sim/matches/:id/invite", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = inviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.sim.badInput");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || m.hostId !== req.userId) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "waiting") return sendError(res, 409, "err.sim.notWaiting");
    if (parsed.data.memberId === req.userId) return sendError(res, 400, "err.sim.inviteSelf");
    const target = await storage.getMemberById(parsed.data.memberId);
    if (!target) return sendError(res, 404, "err.sim.memberNotFound");
    await storage.simMatch.setInvited(m.id, target.id);
    // 받는 사람이 한 명이라 종목·테이블·비밀번호 조각은 그 사람 언어로 먼저 풀어 끼운다.
    const loc = memberLocale(target);
    await notifyUrl(
        target.id,
        msg("notif.sim.invite.title", { name: m.hostName }),
        msg("notif.sim.invite.body", { game: tr(loc, `notif.sim.game.${gameKey(m)}`), target: m.hostTarget, pw: m.passwordHash ? tr(loc, "notif.sim.pwRoom") : "" }),
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
    if (!m || (!isPlayer && !isWatchable(m))) return sendError(res, 404, "err.sim.matchNotFound");
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
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "playing") return sendError(res, 409, "err.sim.notPlaying");
    if (!m.turnSeenAt) return sendError(res, 409, "err.sim.clockNotStarted", "TOO_EARLY");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    await storage.simMatch.touchSeen(m.id, myIndex);
    // 시계는 한 번 시작하면 자리를 비워도 계속 돈다 — 자리를 비우는 것 자체가 패널티다(2026-09-08 오너 결정).
    // 아예 앱을 안 연 사람은 시계가 시작되지 않으므로 48시간 무응답 승리 주장으로 처리된다.
    const elapsed = Date.now() - m.turnSeenAt.getTime();
    const needMs = (m.turn === myIndex ? SHOT_CLOCK_S : SHOT_CLOCK_S + SHOT_CLOCK_GRACE_S) * 1000 - 1500;   // 네트워크 지연 여유 1.5 s
    if (elapsed < needMs) return sendError(res, 409, "err.sim.tooEarly", "TOO_EARLY");
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
    if (!row) return sendError(res, 409, "err.sim.stale", "STALE");
    const timedOutId = m.turn === 0 ? m.hostId : m.guestId;
    const otherId = m.turn === 0 ? m.guestId : m.hostId;
    if (out) {
        await capped(Promise.all([
            notify(otherId, "notif.sim.finished.title", msg("notif.sim.finished.opponentOut", { n: SHOT_CLOCK_STRIKES }), m.id),
            notify(timedOutId, "notif.sim.disqualified.title", msg("notif.sim.disqualified.body", { n: SHOT_CLOCK_STRIKES }), m.id),
        ]));
    } else if (finished) await capped(notify(otherId, "notif.sim.finished.title", "notif.sim.finished.checkResult", m.id));
    else if (m.turn === myIndex) await capped(notify(otherId, "notif.sim.yourTurn.title", msg("notif.sim.yourTurn.opponentTimeout", { strikes, max: SHOT_CLOCK_STRIKES }), m.id));
    else await capped(notify(timedOutId, "notif.sim.timeout.title", msg("notif.sim.timeout.body", { strikes, max: SHOT_CLOCK_STRIKES }), m.id));
    const full = await storage.simMatch.get(m.id);
    return sendSuccess(res, publicMatch(full!, req.userId!));
}));

// GET /sim/matches/:id/shots?from=N — 놓친 샷 따라잡기(preState+input 으로 로컬 재시뮬)
router.get("/sim/matches/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    // 관전·다시보기도 같은 경로로 샷을 받아 로컬에서 재시뮬한다(관전 규칙은 isWatchable).
    if (!m || !(m.hostId === req.userId || m.guestId === req.userId || isWatchable(m))) return sendError(res, 404, "err.sim.matchNotFound");
    const from = Math.max(0, parseInt(String(req.query.from ?? "0"), 10) || 0);
    const shots = await storage.simMatch.getShots(m.id, from);
    return sendSuccess(res, shots.map((s) => ({
        idx: s.idx, playerIndex: s.playerIndex, preState: s.preState, input: s.input, hash: s.hash,
        outcomeCode: s.outcomeCode, points: s.points, cushions: s.cushions, inning: s.inning ?? null, createdAt: s.createdAt,
    })));
}));

// GET /sim/matches/:id/chats?from=N — 놓친 채팅 따라잡기. 샷과 같은 커서 규약.
router.get("/sim/matches/:id/chats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    // 두 선수 + 관전자(공개·비밀번호 없는 대전). 쓰기는 아래 POST 가 따로 가른다.
    if (!m || !canReadChat(m, req.userId!)) return sendError(res, 404, "err.sim.matchNotFound");
    const from = Math.max(0, parseInt(String(req.query.from ?? "0"), 10) || 0);
    const rows = await storage.simMatch.getChats(m.id, from, CHAT_PAGE_MAX);
    return sendSuccess(res, rows.map(chatLine));
}));

// POST /sim/matches/:id/shots — 내 차례 샷
router.post("/sim/matches/:id/shots", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "err.sim.badShot");
    const { idx, input, clientHash } = parsed.data;
    if (input.a * input.a + input.b * input.b > 0.25 + 1e-12) return sendError(res, 400, "err.sim.miscue");

    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "playing") return sendError(res, 409, "err.sim.notPlaying");
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
        return sendError(res, 409, msg("err.sim.idxMismatch", { n: m.shots }), "IDX_MISMATCH");
    }
    if (m.turn !== myIndex) return sendError(res, 409, "err.sim.notYourTurn", "NOT_YOUR_TURN");
    if (idx !== m.shots) return sendError(res, 409, msg("err.sim.idxMismatch", { n: m.shots }), "IDX_MISMATCH");

    const state = m.state as SessionState;
    const me = currentPlayer(state);
    if (input.cueBallId !== me.cueBallId) return sendError(res, 400, "err.sim.wrongCueBall");

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
            inning: shotInning(applied.outcome, applied.session.players[myIndex]),
            newState: applied.session, newBalls: result.final, newTurn: applied.session.turn,
            finished, winnerIndex: applied.session.winnerIndex, endReason,
        });
    } catch (e: any) {
        return sendError(res, 409, e?.message ?? "err.sim.recordFailed", "RECORD_CONFLICT");
    }

    const opponentId = myIndex === 0 ? m.guestId : m.hostId;
    const meName = (myIndex === 0 ? m.hostName : m.guestName) ?? "상대";
    if (finished) {
        const winnerIdx = applied.session.winnerIndex;
        const iWon = winnerIdx === myIndex;
        await capped(notify(opponentId, "notif.sim.finished.title", iWon ? msg("notif.sim.finished.lost", { name: meName }) : "notif.sim.finished.won", m.id));
    } else if (applied.session.turn !== myIndex) {
        await capped(notify(opponentId, "notif.sim.yourTurn.title", msg("notif.sim.yourTurn.body", { name: meName }), m.id));
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

/**
 * POST /sim/matches/:id/chat — 상대에게 한마디(2026-09-16 오너: "일단 자유로운 챗이 가능하게").
 *
 * 자유 입력(text)은 **상대 차례에만** 보낼 수 있고, 그 판정은 대전 행을 잠근 뒤 서버가 한다(repo.sendChat → chatReject).
 * 화면 배치가 아니라 서버가 들고 있어야 나중에 누가 UI 를 건드려도 40초 시계 중에 키보드가 올라오는 회귀가 안 난다.
 * 고정 인사(code)는 키보드가 없으므로 차례를 가리지 않는다.
 *
 * 필터: 기존 한국어 checkContent 를 **크루 완화 맥락 없이** 태운다 — 대전에서 "게임비 만원"을 면제할 이유가 없다.
 * 걸리면 저장 자체가 없고 상대에겐 아무것도 안 뜬다. 통과분은 maskContacts 로 번호·링크를 가려 저장한다.
 * es/tr/vi 는 이 필터가 한국어 정규식뿐이라 사실상 무필터다 — 오너가 알고 미뤘다(유저 많아지면 다국어 필터).
 */
router.post("/sim/matches/:id/chat", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const body = (req.body ?? {}) as { text?: unknown; code?: unknown; clientKey?: unknown };
    const clientKey = typeof body.clientKey === "string" && body.clientKey.length <= 64 ? body.clientKey : null;
    const m = await storage.simMatch.get(req.params.id);
    if (!m || !canReadChat(m, req.userId!)) return sendError(res, 404, "err.sim.matchNotFound");
    const myIndex = m.hostId === req.userId ? 0 : m.guestId === req.userId ? 1 : CHAT_FROM_WATCHER;
    const watcher = myIndex === CHAT_FROM_WATCHER;

    let kind: "text" | "code";
    let text: string;
    if (typeof body.code === "string") {
        // 관전자는 응원 목록만 — 선수용 문구(잠깐만요 등)를 관전자가 보내면 대화가 엉킨다.
        if (!isChatCode(body.code, watcher ? CHAT_WATCH_CODES : CHAT_CODES)) return sendError(res, 400, "err.sim.badChatCode");
        kind = "code";
        text = body.code;
    } else if (typeof body.text === "string") {
        if (!canWriteChatText(m, req.userId!)) return sendError(res, 403, "err.sim.watcherText", "WATCHER_TEXT");
        // 원문 방어값(정규화 전). 이걸 넘기면 정규화·필터에 긴 문자열을 태울 이유가 없다.
        if (body.text.length > 400) return sendError(res, 400, msg("err.sim.chatTooLong", { n: CHAT_MAX_CHARS }));
        const t = normalizeChatText(body.text);
        if (!t) return sendError(res, 400, "err.sim.chatEmpty");
        if (chatLength(t) > CHAT_MAX_CHARS) return sendError(res, 400, msg("err.sim.chatTooLong", { n: CHAT_MAX_CHARS }));
        const check = checkContent(t);
        if (check.blocked) return sendError(res, 400, check.reason ?? "err.sim.chatFiltered", "FILTERED");
        kind = "text";
        text = maskContacts(t);
    } else {
        return sendError(res, 400, "err.sim.chatEmpty");
    }

    const r = await storage.simMatch.sendChat({
        matchId: m.id, from: myIndex, senderId: req.userId!, kind, text, clientKey,
        cooldownMs: CHAT_COOLDOWN_MS, maxPerMatch: CHAT_MAX_PER_MATCH,
    });
    if (!r.ok) {
        if (r.reason === "gone") return sendError(res, 409, "err.sim.notPlaying");
        if (r.reason === "your-turn") return sendError(res, 409, "err.sim.chatYourTurn", "YOUR_TURN");
        if (r.reason === "watcher-text") return sendError(res, 403, "err.sim.watcherText", "WATCHER_TEXT");
        if (r.reason === "cooldown") return sendError(res, 429, "err.sim.chatCooldown", "TOO_FAST");
        return sendError(res, 429, "err.sim.chatLimit", "LIMIT");
    }
    return sendSuccess(res, { line: chatLine(r.row), chatSeq: r.chatSeq });
}));

// POST /sim/matches/:id/resign — 기권
router.post("/sim/matches/:id/resign", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status === "waiting" && m.hostId === req.userId) {
        await storage.simMatch.cancel(m.id, req.userId!);
        return sendSuccess(res, { status: "canceled" });
    }
    if (m.status !== "playing") return sendError(res, 409, "err.sim.notPlaying");
    const winnerId = m.hostId === req.userId ? m.guestId : m.hostId;
    const row = await storage.simMatch.finish(m.id, winnerId ?? null, "resign");
    if (!row) return sendError(res, 409, "err.sim.alreadyFinished");
    const meName = (m.hostId === req.userId ? m.hostName : m.guestName) ?? "상대";
    await notify(winnerId, "notif.sim.finished.title", msg("notif.sim.finished.resigned", { name: meName }), m.id);
    return sendSuccess(res, { status: "finished", winnerIndex: winnerId === m.hostId ? 0 : 1 });
}));

// POST /sim/matches/:id/claim — 상대가 48시간 넘게 안 치면 승리 주장
router.post("/sim/matches/:id/claim", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "playing") return sendError(res, 409, "err.sim.notPlaying");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    if (m.turn === myIndex) return sendError(res, 409, "err.sim.claimOnMyTurn");
    const since = (m.lastShotAt ?? m.startedAt ?? m.createdAt).getTime();
    if (Date.now() - since < CLAIM_AFTER_MS) return sendError(res, 409, "err.sim.tooEarly", "TOO_EARLY");
    const row = await storage.simMatch.finish(m.id, req.userId!, "claim");
    if (!row) return sendError(res, 409, "err.sim.alreadyFinished");
    await notify(myIndex === 0 ? m.guestId : m.hostId, "notif.sim.finished.title", "notif.sim.finished.claimed", m.id);
    return sendSuccess(res, { status: "finished", winnerIndex: myIndex });
}));

/**
 * POST /sim/matches/:id/aim — 내가 겨누는 방향을 알린다(2026-09-16). 기다리는 상대 화면에 큐대로 그려진다.
 *
 * 아주 가볍게 둔다: 대전 행을 돌려주지 않고(응답을 읽을 이유가 없다), version 도 올리지 않는다
 * (올리면 상대가 매번 "다시 맞췄다"로 스냅한다). 내 차례가 아니면 조용히 무시한다 — 경쟁 상태라 에러가 아니다.
 * 클라이언트가 간격·각도 변화로 눌러 보내므로(AIM_REPORT_MS·AIM_EPS_RAD) 가만히 있으면 요청이 아예 없다.
 */
router.post("/sim/matches/:id/aim", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const phi = Number((req.body ?? {}).phi);
    if (!Number.isFinite(phi)) return sendError(res, 400, "err.sim.badAim");
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "playing") return sendSuccess(res, { ok: true });
    await storage.simMatch.setAim(m.id, m.hostId === req.userId ? 0 : 1, phi);
    return sendSuccess(res, { ok: true });
}));

/**
 * GET /sim/matches/:id/rapport — 끝난 대전 화면에 붙는 "상대가 누구였나" 한 묶음(2026-09-15 오너: 라포).
 * 상대전적(이 둘의 온라인 대전만) · 이미 라이벌인지 · 상대 회원 id(라이벌 추가 버튼이 쓴다).
 * 폴링이 아니라 한 번만 부르는 값이라 대전 폴링에 얹지 않고 따로 둔다.
 */
router.get("/sim/matches/:id/rapport", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    const myIndex = m.hostId === req.userId ? 0 : 1;
    const otherId = myIndex === 0 ? m.guestId : m.hostId;
    const otherName = (myIndex === 0 ? m.guestName : m.hostName) ?? null;
    if (!otherId) return sendSuccess(res, { opponentId: null, opponentName: null, headToHead: null, isRival: false });
    // 라이벌 여부는 실전과 같은 관계(친구)를 쓴다 — 새 개념을 만들지 않는다.
    const [isRival, headToHead] = await Promise.all([
        storage.isFriend(req.userId!, otherId, "BILLIARDS").catch(() => false),
        storage.simMatch.headToHead(req.userId!, otherId),
    ]);
    return sendSuccess(res, { opponentId: otherId, opponentName: otherName, headToHead, isRival });
}));

/**
 * POST /sim/matches/:id/rematch — "한 판 더". 한 번 누르면 의사 표시만 하고, 둘 다 누르면 새 대전이 열린다.
 *
 * 새 방은 같은 설정에 **자리를 바꿔서** 만든다 — 먼저 치는 이점이 한쪽에 몰리지 않게(당구장에서 번갈아 깨는 것과 같다).
 * 다마수는 사람을 따라간다: 새 방장(= 옛 게스트)의 목표는 옛 게스트 목표 그대로다.
 * 공개 방이었으면 공개로 둔다 — 보던 관전자가 이어서 볼 수 있다.
 */
router.post("/sim/matches/:id/rematch", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await storage.simMatch.get(req.params.id);
    if (!m || (m.hostId !== req.userId && m.guestId !== req.userId)) return sendError(res, 404, "err.sim.matchNotFound");
    if (m.status !== "finished") return sendError(res, 409, "err.sim.notFinished");
    if (!m.guestId) return sendError(res, 409, "err.sim.noOpponent");

    const asked = await storage.simMatch.requestRematch(m.id, req.userId!);
    if (!asked) return sendError(res, 409, "err.sim.rematchUnavailable");
    if (asked.rematchId) return sendSuccess(res, { matchId: asked.rematchId, waiting: false });

    const otherId = m.hostId === req.userId ? m.guestId : m.hostId;
    if (!asked.by[otherId]) {
        await notify(otherId, "notif.sim.rematchAsk.title", msg("notif.sim.rematchAsk.body", { name: (m.hostId === req.userId ? m.hostName : m.guestName) ?? "상대" }), m.id);
        return sendSuccess(res, { matchId: null, waiting: true });
    }

    // 둘 다 눌렀다 → 새 방을 연다. 자리를 바꾼다: 옛 게스트가 방장이 되어 먼저 친다.
    const newHostId = m.guestId, newGuestId = m.hostId;
    const newHostTarget = m.guestTarget ?? m.hostTarget;
    const newGuestTarget = m.hostTarget;
    const rules = m.rules as Rules;
    const state = createSession({
        rules, finishType: m.finishType, inningCap: m.inningCap,
        players: [
            { id: newHostId, target: newHostTarget, cueBallId: "white" },
            { id: newGuestId, target: newGuestTarget, cueBallId: "yellow" },
        ],
    });
    const created = await storage.simMatch.create({
        hostId: newHostId, guestId: newGuestId,
        gameType: m.gameType, tableId: m.tableId, cushionModel: m.cushionModel, condition: m.condition,
        aimAssist: m.aimAssist, fullPreview: m.fullPreview, isPublic: m.isPublic, handicap: m.handicap,
        rules: m.rules, finishType: m.finishType, inningCap: m.inningCap,
        hostTarget: newHostTarget, guestTarget: newGuestTarget,
        state, balls: openingLayout(m.gameType, TABLES[m.tableId], "white"),
        status: "playing", turn: 0, startedAt: new Date(),
        // 상대가 알림을 보고 돌아올 시간만큼 봐주고 40초 룰이 돈다(자리 비움 유예와 같은 규칙).
        turnSeenAt: new Date(Date.now() + ABSENT_GRACE_MS),
        engineVersion: ENGINE_VERSION, paramsHash: paramsHash(paramsFor(m)),
    });
    // 둘이 동시에 눌렀으면 먼저 적은 쪽이 정본 — 진 쪽이 만든 빈 방은 버린다.
    const winnerId = await storage.simMatch.linkRematch(m.id, created.id);
    if (winnerId !== created.id) await storage.simMatch.discardMatch(created.id);
    await notify(otherId, "notif.sim.rematchStart.title", "notif.sim.rematchStart.body", winnerId);
    return sendSuccess(res, { matchId: winnerId, waiting: false });
}));

export default router;
