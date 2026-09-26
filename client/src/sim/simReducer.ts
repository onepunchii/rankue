/**
 * useSimulator 의 순수 상태 기계. React·DOM·시계·네트워크를 모르며, 훅은 이 reducer 를 작은 스토어에 얹어
 * 물리(simulateShot)·재생·서버 호출 같은 부수효과만 바깥에서 붙인다. 그래서 상태 전이는 전부 여기서 헤드리스로 검증한다.
 *
 * 단계(README "useSimulator 상태 기계"): setup → aim ⇄ shooting → finished. 입력은 aim 에서만 받는다.
 *  - shoot: 로컬 판정 결과(final·session·outcome)를 즉시 반영하고 shooting 으로. 연습(record=false)이면 되돌리기 스냅샷을 쌓는다.
 *  - playbackEnd: 재생 중 도착한 서버 미스매치 스냅(pendingSnap)이 있으면 그것으로 갈아탄 뒤 aim/finished.
 *  - serverAck/serverFail: 서버 응답. 실패는 재전송 큐(idx 순)에 넣고 MAX_RETRIES 뒤에 포기(offline).
 *  - undo/placeBall: 연습 모드 + aim 에서만.
 * 모든 전이는 새 객체를 돌려주고, 바뀐 게 없으면 같은 참조를 돌려준다(React 재렌더 억제).
 *
 * 네트워크 대전(mode="match", README "네트워크 대전 A"): 같은 기계에 waiting 단계와 대전 메타(match)가 붙는다.
 *  - startMatch: 서버 대전 행(state·balls)으로 시작. 내 차례면 aim, 아니면 waiting(입력 잠금).
 *  - replayShot: 놓친(상대) 샷을 로컬 재시뮬로 따라잡는 재생. waiting/aim → shooting(replayOf = 친 선수), playbackEnd 가 다시 aim/waiting/finished.
 *  - matchSync: 폴링·응답의 메타(차례·상태·claimableAt). 서버가 끝냈으면(기권·무응답 승리) 세션도 finished 로 표시한다.
 *  - matchSnap: 서버 정본으로 통째로 갈아타기(공·세션·샷 수). 큐·pendingSnap 을 버린다.
 *  - matchShotAck / matchShotFail: 내 샷 응답. 실패는 큐에 남기고 MAX_RETRIES 뒤 offline — 단 항목은 버리지 않는다(다음 폴링 성공 때 다시 보낸다).
 *  - 되돌리기·자유 배치·다시하기는 대전에 없다. record 는 항상 true.
 */
import type { BallState, ShotInput } from "@shared/sim/types";
import { DEFAULT_CUE, TABLES, type SimParams, type TableSpec } from "@shared/sim/params";
import { currentPlayer, isOpeningShot, opponentCueBall, type GameType, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import { isValidLayout } from "@shared/sim/layouts";
import type { SimSetupConfig } from "./setupPresets";
import type { MatchEndReason, MatchPublic, MatchStatus, PlayerIndex } from "./matchApi";
import { angleBetween, nearestObjectBall, normalizeAngle, phiForThickness, type XY } from "./aim";
import { cuePhiForAim, squirtFor } from "./aimAssist";

/** waiting = 네트워크 대전에서 상대 차례(입력 잠금, 폴링 중). */
export type Phase = "setup" | "aim" | "waiting" | "shooting" | "finished";
export type SimMode = "solo" | "match";

/** 큐 입력. cueBallId 는 세션의 현재 선수에서 나오므로 여기 없다. */
export interface CueInput {
    readonly phi: number;
    readonly V0: number;
    readonly a: number;
    readonly b: number;
    readonly theta: number;
}

/**
 * 두 조준 입력이 같은가 — 길 찾기로 넣은 입력에서 벗어났는지 볼 때 쓴다(2026-09-16 오너:
 * "길을 눌렀는데 방향을 바꾸면 해제되어야 한다"). 후보 값을 반올림 없이 그대로 넣으므로 정확히 비교한다.
 */
export function sameCueInput(a: CueInput, b: CueInput): boolean {
    return a.phi === b.phi && a.V0 === b.V0 && a.a === b.a && a.b === b.b && a.theta === b.theta;
}

export const V0_DEFAULT = 2.5;
export const V0_MIN = 0.2;
/**
 * 화면에서 낼 수 있는 큐 최대 속도(m/s) = 세기 100 %. 2026-09-12 에 9 → 6.5 로 낮췄다가, 오너가 쳐 보고
 * "살짝 약하다" 해서 7.5 로 올렸다(공 9.4 m/s).
 * 타격 모델(resolve/stickBall)은 큐 속도를 공 속도로 약 1.25배 한다(캐롬 공 210 g, 큐 520 g, 팁 효율 0.88):
 *   9 m/s → 공 11.3 m/s — 포켓볼 브레이크 수준이라 3쿠션에서는 쓰지 않는 세기였다.
 *   7.5 m/s → 공 9.4 m/s — 대회전(공 5~7 m/s)은 70~85 % 에서 나오고, 100 % 는 그보다 세지만 브레이크에는 못 미친다.
 * 옛 기록·공유 링크에는 이보다 큰 값이 남아 있을 수 있어 clampPower 는 V0_LEGACY_MAX 까지 받아 준다
 * (그대로 재생돼야 해시가 맞는다). 화면 눈금은 controlsMath 의 퍼센트 변환이 V0_MAX 로 묶는다.
 */
// 한도 값은 shared/sim/shotLimits.ts 가 정본이다 — 서버 검증과 같은 값을 쓴다.
export { V0_MAX, V0_LEGACY_MAX, THETA_MAX } from "@shared/sim/shotLimits";
import { V0_MAX, V0_LEGACY_MAX, THETA_MAX } from "@shared/sim/shotLimits";
/** 샷 재전송 시도 상한. 넘으면 이 세션은 더 기록하지 않는다(offline). 대전에선 다음 폴링 성공 때 다시 시도한다. */
export const MAX_RETRIES = 3;
/** 미스큐 경계 안쪽 여유. strike 는 a²+b² ≤ max² 를 요구하므로 스케일링 반올림이 경계를 넘지 않게 한다. */
const SPIN_EPS = 1e-9;

/* ------------------------------------------------------------------ 순수 헬퍼 */

export function paramsFromConfig(config: SimSetupConfig): SimParams {
    return {
        table: TABLES[config.tableId],
        cue: DEFAULT_CUE,
        cushionModel: config.cushionModel,
        condition: config.condition,
    };
}

export function clampPower(V0: number): number {
    if (!Number.isFinite(V0)) return V0_DEFAULT;
    // 상한은 옛 값 기준이다 — 옛 기록·공유 링크를 그대로 재생해야 해시가 맞는다. 새로 만드는 값은 퍼센트 변환이 V0_MAX 로 묶는다.
    return Math.min(V0_LEGACY_MAX, Math.max(V0_MIN, V0));
}

export function clampElevation(theta: number): number {
    if (!Number.isFinite(theta)) return 0;
    return Math.min(THETA_MAX, Math.max(0, theta));
}

/** 당점을 미스큐 링(maxOffset·R) 안으로. 밖이면 같은 방향으로 링 위까지 당긴다. */
export function clampSpin(a: number, b: number, maxOffset: number = DEFAULT_CUE.maxOffset): { a: number; b: number } {
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    const max = maxOffset - SPIN_EPS;
    const len = Math.sqrt(a * a + b * b);
    if (len <= max) return { a, b };
    const f = max / len;
    return { a: a * f, b: b * f };
}

export function cueBallIdOf(session: SessionState | null): "white" | "yellow" {
    return session ? currentPlayer(session).cueBallId : "white";
}

/**
 * 조준 기준 적구: 가장 가까운 적구. 4구는 상대 큐볼을 제외한다(맞히면 파울).
 * 개시 샷(opening, 3쿠션 개시 배치의 첫 샷)은 규칙대로 빨간 공 — 첫 접촉이 빨간 공이 아니면 파울이라 기본 조준·두께 버튼도 빨간 공 기준.
 */
export function objectTargetFor(balls: readonly BallState[], cueBallId: string, gameType: GameType, opening = false): BallState | null {
    const cue = balls.find((b) => b.id === cueBallId);
    if (!cue) return null;
    if (opening) {
        const red = balls.find((b) => b.id === "red");
        if (red) return red;
    }
    const exclude = gameType === "4c" ? [opponentCueBall(cueBallId)] : [];
    return nearestObjectBall(cue, balls, exclude);
}

/** 세션·배치로 개시 샷인지(없는 세션은 false). */
export function openingFor(session: SessionState | null, balls: readonly BallState[]): boolean {
    return session ? isOpeningShot(session, balls) : false;
}

/** 기본 조준: 기준 적구 중심(objectTargetFor). 적구가 없으면 테이블 위쪽(+y). */
export function defaultPhi(balls: readonly BallState[], cueBallId: string, gameType: GameType, opening = false): number {
    const cue = balls.find((b) => b.id === cueBallId);
    const target = objectTargetFor(balls, cueBallId, gameType, opening);
    if (!cue || !target) return Math.PI / 2;
    return normalizeAngle(angleBetween([cue.r[0], cue.r[1]], [target.r[0], target.r[1]]));
}

/** 두께 단계 → phi. 적구가 없으면 null. */
export function thicknessPhi(
    balls: readonly BallState[], cueBallId: string, gameType: GameType,
    thickness: number, side: "left" | "right", R: number, opening = false,
): number | null {
    const cue = balls.find((b) => b.id === cueBallId);
    const target = objectTargetFor(balls, cueBallId, gameType, opening);
    if (!cue || !target) return null;
    const c: XY = [cue.r[0], cue.r[1]];
    const t: XY = [target.r[0], target.r[1]];
    return phiForThickness(c, t, thickness, side, R);
}

export function initialInput(balls: readonly BallState[], cueBallId: string, gameType: GameType, opening = false): CueInput {
    return { phi: defaultPhi(balls, cueBallId, gameType, opening), V0: V0_DEFAULT, a: 0, b: 0, theta: 0 };
}

/** 두 배치가 같은가(id 순서·위치). 서버 정본과 로컬 결과를 견줄 때. */
export function sameBalls(a: readonly BallState[], b: readonly BallState[], eps = 1e-9): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (x.id !== y.id) return false;
        if (Math.abs(x.r[0] - y.r[0]) > eps || Math.abs(x.r[1] - y.r[1]) > eps) return false;
    }
    return true;
}

/* ------------------------------------------------------------------ 대전 메타 */

/** 네트워크 대전 메타. 공·세션은 SimCoreState.balls/session 이 그대로 맡고, 여기엔 서버 대전 행의 나머지만 둔다. */
export interface MatchState {
    readonly matchId: string;
    /** 내 자리. 0 = 호스트(흰 공), 1 = 게스트(노란 공) */
    readonly myIndex: PlayerIndex;
    readonly version: number;
    readonly opponentName: string;
    readonly myName: string;
    /** 서버가 아는 차례(세션 turn 과 같아야 한다 — 어긋나면 컨트롤러가 스냅한다) */
    readonly turn: number;
    readonly status: MatchStatus;
    /** ISO. 이 시각부터 (상대 차례일 때) 승리 주장 가능 */
    readonly claimableAt: string | null;
    /** 40초 룰 시계 기준(ISO). 없으면 시계 없음. */
    readonly turnSeenAt: string | null;
    readonly endReason: MatchEndReason | null;
    readonly winnerIndex: PlayerIndex | null;
    /** 쓰리아웃: [호스트, 게스트] 시간 초과 횟수 */
    readonly timeouts: readonly [number, number];
    /** 지금 이 대전을 보고 있는 관전자 수(2026-09-12). 폴링마다 바뀌는 표시용 값이라 판정에는 쓰지 않는다. */
    readonly watchers: number;
    /** 상대가 자리를 비웠나(2026-09-15). 시계가 늦게 시작하는 동안 이유를 보여 주는 표시용 값. */
    readonly opponentAway: boolean;
    /** 핸디전인가 — 시작 인사 화면이 "다마수는 두 사람 에버리지로 정해졌다"를 설명할 때 쓴다. */
    readonly handicap: boolean;
    /** 상대가 지금 겨누는 방향(2026-09-16). 기다리는 동안 큐대를 그린다. */
    readonly opponentAim: { readonly phi: number; readonly at: string } | null;
    /**
     * 오간 채팅 줄 수. 본문이 아니라 카운터만 둔다 — 늘어난 걸 보고 컨트롤러가 /chats 를 부른다.
     * 이 값이 **sameMatchMeta 에 들어가야** 상대가 말만 한 폴링(다른 건 하나도 안 바뀐 순간)이 버려지지 않는다.
     */
    readonly chatSeq: number;
    /** 두 자리의 국가(ISO alpha-2, 없으면 null). 대전 중에 바뀌지 않아 메타 비교에는 넣지 않는다. */
    readonly countries: readonly [string | null, string | null];
}

/** 서버 대전 행 → 메타. myIndex 는 시작할 때 정한 값(행의 myIndex 가 -1 이면 안 된다). */
export function matchStateFrom(m: MatchPublic, myIndex: PlayerIndex): MatchState {
    const host = m.hostName;
    const guest = m.guestName ?? "";
    return {
        matchId: m.id,
        myIndex,
        version: m.version,
        myName: myIndex === 0 ? host : guest,
        opponentName: myIndex === 0 ? guest : host,
        turn: m.turn,
        status: m.status,
        timeouts: m.timeouts ?? [0, 0],
        watchers: m.watchers ?? 0,
        opponentAway: m.opponentAway === true,
        handicap: m.handicap === true,
        opponentAim: m.opponentAim ?? null,
        chatSeq: m.chatSeq ?? 0,
        countries: [m.hostCountry ?? null, m.guestCountry ?? null] as const,
        claimableAt: m.claimableAt,
        turnSeenAt: m.turnSeenAt ?? null,
        endReason: m.endReason,
        winnerIndex: m.winnerIndex,
    };
}

export function sameMatchMeta(a: MatchState, b: MatchState): boolean {
    return a.matchId === b.matchId && a.myIndex === b.myIndex && a.version === b.version && a.turn === b.turn
        && a.status === b.status && a.claimableAt === b.claimableAt && a.turnSeenAt === b.turnSeenAt && a.endReason === b.endReason
        && a.winnerIndex === b.winnerIndex && a.myName === b.myName && a.opponentName === b.opponentName
        && a.timeouts[0] === b.timeouts[0] && a.timeouts[1] === b.timeouts[1]
        && a.opponentAway === b.opponentAway
        // 상대가 말만 한 순간은 다른 필드가 하나도 안 바뀐다 — 이게 빠지면 matchSync 의 조기 반환이
        // 그 응답을 통째로 버려 채팅이 화면에 영영 안 닿는다(2026-09-16 상대 조준과 똑같은 함정).
        && a.chatSeq === b.chatSeq
        // 관전자 수(2026-09-21 오너: "관전자 숫자 표시가 안 나온다"). 관전자가 들어오거나 나가는 순간도 다른 필드는 그대로라
        // 여기 없으면 그 응답이 버려져 👀 가 영영 0 이었다 — 채팅 카운터와 똑같은 함정을 세 번째로 밟았다.
        && a.watchers === b.watchers;
        // 상대 조준은 여기 없다 — 자주 바뀌는 표시용 값이라 따로 본다(sameOpponentAim).
        // 국가(countries)도 없다 — 대전 중에 바뀌지 않는다.
}

/**
 * 상대가 겨누는 각도가 그대로인가. sameMatchMeta 와 나눠 둔 이유는 성격이 달라서다 — 차례·점수는 "바뀌면 큰일"이고
 * 조준은 폴링마다 조금씩 바뀌는 그림값이다. 다만 **matchSync 는 이것도 봐야 한다**: 상대가 조준만 하고 있는
 * 바로 그 순간엔 다른 게 하나도 안 바뀌어서, 안 보면 새 각도가 화면에 영영 도달하지 못한다(초기 구현의 버그).
 * 스냅(서버 정본으로 되돌리기) 판단에는 영향이 없다 — 그건 컨트롤러가 샷 수·공 위치로만 정한다.
 */
export function sameOpponentAim(a: MatchState, b: MatchState): boolean {
    return (a.opponentAim?.phi ?? null) === (b.opponentAim?.phi ?? null);
}

/** 서버가 끝냈는데(기권·무응답 승리) 세션은 아직 playing 이면 세션에도 종료를 표시한다. */
function sessionForMatch(session: SessionState, match: MatchState): SessionState {
    if (match.status === "finished" && session.status !== "finished") {
        return { ...session, status: "finished", winnerIndex: match.winnerIndex };
    }
    return session;
}

/* ------------------------------------------------------------------ 상태 */

export interface PendingShot {
    readonly idx: number;
    readonly input: ShotInput;
    readonly clientHash: string;
    /** 지금까지 실패한 횟수 */
    readonly tries: number;
}

export interface UndoEntry {
    readonly balls: readonly BallState[];
    readonly session: SessionState;
    readonly shotIdx: number;
    readonly outcomeLast: ShotOutcome | null;
    /** 그 샷을 친 사람의 자리. 후구(2026-09-12)에서는 득점 샷도 턴을 넘기므로 끝난 상태만으로는 알 수 없다. */
    readonly shooterLast: number;
    readonly input: CueInput;
}

/** 서버가 정본이라 재생이 끝난 뒤 갈아탈 상태. */
export interface ServerSnap {
    readonly balls: readonly BallState[];
    readonly session: SessionState;
    /** 서버 판정. 없으면 로컬 판정을 유지한다. */
    readonly outcome?: ShotOutcome;
    /** 그 샷을 친 사람의 자리(있으면). 후구에서 턴만으로는 알 수 없다. */
    readonly shooter?: number;
}

export interface SimCoreState {
    readonly phase: Phase;
    readonly mode: SimMode;
    /** 네트워크 대전 메타(mode="match" 에서만). */
    readonly match: MatchState | null;
    /** 따라잡기 재생 중이면 그 샷을 친 선수 인덱스. 이 기기에서 친 샷의 재생은 null. */
    readonly replayOf: number | null;
    /** 서버 기록 여부. false = 연습(되돌리기·자유 배치 허용, 서버 호출 없음). 대전은 항상 true. */
    readonly record: boolean;
    /** 조준 보정(스쿼트 자동 보정): 일반 모드 true, 리얼리티 false. 저장된 phi 는 늘 큐 방향이고, 화면 조준·두께·당점 변경에서만 변환한다. */
    readonly aimAssist: boolean;
    readonly session: SessionState | null;
    readonly balls: readonly BallState[];
    readonly input: CueInput;
    /** 다음 샷 idx. 서버 세션(또는 대전)의 shots 와 같아야 한다. */
    readonly shotIdx: number;
    readonly serverSessionId: string | null;
    readonly outcomeLast: ShotOutcome | null;
    /** 그 샷을 친 사람의 자리. 후구(2026-09-12)에서는 득점 샷도 턴을 넘기므로 끝난 상태만으로는 알 수 없다. */
    readonly shooterLast: number;
    /** 서버 해시와 어긋난 샷 수(이 세션) */
    readonly mismatches: number;
    /** 서버 기록을 포기했다(재전송 상한·거부·세션 개설 실패). 로컬 플레이는 계속된다. 대전에선 "지금 연결이 끊김"(폴링 성공 시 풀린다). */
    readonly offline: boolean;
    /** 재전송 대기 샷(idx 오름차순) */
    readonly queue: readonly PendingShot[];
    readonly undo: readonly UndoEntry[];
    readonly pendingSnap: ServerSnap | null;
}

const NO_INPUT: CueInput = { phi: Math.PI / 2, V0: V0_DEFAULT, a: 0, b: 0, theta: 0 };

export const INITIAL_STATE: SimCoreState = {
    phase: "setup",
    mode: "solo",
    match: null,
    replayOf: null,
    record: true,
    aimAssist: true,
    session: null,
    balls: [],
    input: NO_INPUT,
    shotIdx: 0,
    serverSessionId: null,
    outcomeLast: null,
    shooterLast: 0,
    mismatches: 0,
    offline: false,
    queue: [],
    undo: [],
    pendingSnap: null,
};

/* ------------------------------------------------------------------ 액션 */

export type SimAction =
    | { readonly type: "start"; readonly session: SessionState; readonly balls: readonly BallState[]; readonly record: boolean; readonly aimAssist?: boolean }
    /** 서버 세션 개설 응답. shotIdx 0 이면 서버 state(선수 id 가 회원 id)를 정본으로 받아들인다. */
    | { readonly type: "serverSession"; readonly id: string; readonly session?: SessionState }
    | { readonly type: "serverUnavailable" }
    | { readonly type: "setInput"; readonly patch: Partial<CueInput> }
    | {
        readonly type: "shoot";
        readonly input: ShotInput;
        readonly final: readonly BallState[];
        readonly clientHash: string;
        /** applyShot 결과 */
        readonly session: SessionState;
        readonly outcome: ShotOutcome;
    }
    | { readonly type: "playbackEnd" }
    | {
        readonly type: "serverAck";
        readonly idx: number;
        readonly mismatch: boolean;
        readonly final: readonly BallState[];
        readonly session: SessionState;
        readonly outcome?: ShotOutcome;
    }
    /** 서버 세션이 아직 없을 때(개설 응답 대기) 친 샷, 또는 앞 샷이 큐에 있어 뒤에 붙는 샷. 시도 횟수 0 으로 큐에 넣는다. */
    | { readonly type: "queueShot"; readonly idx: number; readonly input: ShotInput; readonly clientHash: string }
    /** 재전송했더니 이미 기록돼 있었다(IDX_MISMATCH 인데 서버 shots === idx+1). 큐에서만 뺀다. */
    | { readonly type: "serverLanded"; readonly idx: number }
    | { readonly type: "serverFail"; readonly idx: number; readonly input: ShotInput; readonly clientHash: string; readonly retryable: boolean }
    | { readonly type: "undo" }
    | { readonly type: "placeBall"; readonly id: string; readonly x: number; readonly y: number; readonly table: TableSpec }
    | { readonly type: "restart"; readonly session: SessionState; readonly balls: readonly BallState[]; readonly aimAssist?: boolean }
    | { readonly type: "exit" }
    /* ---- 네트워크 대전 ---- */
    /** 서버 대전 행으로 시작. shots = 서버 샷 수(다음 idx). */
    | { readonly type: "startMatch"; readonly match: MatchState; readonly session: SessionState; readonly balls: readonly BallState[]; readonly shots: number; readonly aimAssist?: boolean }
    /** 폴링·응답의 메타. 연결이 살아 있다는 뜻이므로 offline 을 풀고 큐의 시도 횟수를 0 으로 돌린다. */
    | { readonly type: "matchSync"; readonly match: MatchState }
    /** 서버 정본으로 통째로 갈아타기. mismatch 면 누적 카운트 +1. 큐·pendingSnap 은 버린다. */
    | { readonly type: "matchSnap"; readonly match: MatchState; readonly session: SessionState; readonly balls: readonly BallState[]; readonly shots: number; readonly mismatch: boolean }
    /** 놓친 샷 따라잡기 재생 시작(로컬 재시뮬 결과). mismatch = 로컬 해시가 서버 해시와 다름(또는 preState 가 로컬 배치와 다름). */
    | {
        readonly type: "replayShot";
        readonly input: ShotInput;
        readonly final: readonly BallState[];
        readonly session: SessionState;
        readonly outcome: ShotOutcome;
        readonly playerIndex: number;
        readonly mismatch: boolean;
    }
    /** 내 샷의 서버 응답. mismatch 면 final/session 으로 스냅(재생 중이면 끝난 뒤). duplicate(final 없음)면 메타만. */
    | {
        readonly type: "matchShotAck";
        readonly idx: number;
        readonly match: MatchState;
        readonly mismatch: boolean;
        readonly final: readonly BallState[] | null;
        readonly session: SessionState | null;
        readonly outcome?: ShotOutcome;
    }
    /** 내 샷 전송의 네트워크 실패. tries+1 로 큐에 두고 MAX_RETRIES 면 offline(항목은 남는다). */
    | { readonly type: "matchShotFail"; readonly idx: number; readonly input: ShotInput; readonly clientHash: string };

function gameTypeOf(s: SimCoreState): GameType {
    return s.session ? s.session.rules.gameType : "3c";
}

/** 세션(그리고 대전이면 차례)에서 정지 단계를 정한다. */
function phaseFor(s: Pick<SimCoreState, "mode" | "match">, session: SessionState): Phase {
    if (session.status === "finished") return "finished";
    if (s.mode === "match" && s.match) {
        if (s.match.status !== "playing") return "finished";
        return session.turn === s.match.myIndex ? "aim" : "waiting";
    }
    return "aim";
}

function reAim(s: SimCoreState, balls: readonly BallState[], session: SessionState): CueInput {
    const aim = defaultPhi(balls, cueBallIdOf(session), session.rules.gameType, isOpeningShot(session, balls));
    return { ...s.input, phi: cuePhiForAim(aim, s.input.a, s.aimAssist) };
}

function withoutIdx(queue: readonly PendingShot[], idx: number): readonly PendingShot[] {
    return queue.some((q) => q.idx === idx) ? queue.filter((q) => q.idx !== idx) : queue;
}

/** 서버 상태로 즉시 갈아탄다(aim/waiting/finished 에서). */
function snapNow(s: SimCoreState, snap: ServerSnap): SimCoreState {
    const session = s.match ? sessionForMatch(snap.session, s.match) : snap.session;
    return {
        ...s,
        balls: snap.balls,
        session,
        phase: phaseFor(s, session),
        input: reAim(s, snap.balls, session),
        outcomeLast: snap.outcome ?? s.outcomeLast,
        shooterLast: snap.shooter ?? s.shooterLast,
        pendingSnap: null,
    };
}

function enqueue(queue: readonly PendingShot[], entry: PendingShot): readonly PendingShot[] {
    const exists = queue.some((q) => q.idx === entry.idx);
    const next = exists ? queue.map((q) => (q.idx === entry.idx ? entry : q)) : [...queue, entry];
    return next.slice().sort((x, y) => x.idx - y.idx);
}

function resetTries(queue: readonly PendingShot[]): readonly PendingShot[] {
    return queue.some((q) => q.tries !== 0) ? queue.map((q) => (q.tries === 0 ? q : { ...q, tries: 0 })) : queue;
}

/** 정지 단계라면 대전 메타에 맞춰 단계를 다시 정한다(재생 중엔 playbackEnd 가 맡는다). */
function rephase(s: SimCoreState): SimCoreState {
    if (s.phase === "setup" || s.phase === "shooting" || !s.session) return s;
    const phase = phaseFor(s, s.session);
    if (phase === s.phase) return s;
    return { ...s, phase, input: phase === "aim" ? reAim(s, s.balls, s.session) : s.input };
}

export function simReducer(s: SimCoreState, a: SimAction): SimCoreState {
    switch (a.type) {
        case "start": {
            const cueBallId = cueBallIdOf(a.session);
            return {
                ...INITIAL_STATE,
                phase: a.session.status === "finished" ? "finished" : "aim",
                record: a.record,
                aimAssist: a.aimAssist ?? true,
                session: a.session,
                balls: a.balls,
                input: initialInput(a.balls, cueBallId, a.session.rules.gameType, isOpeningShot(a.session, a.balls)),
            };
        }

        case "restart": {
            if (s.phase === "setup" || s.mode === "match") return s;
            const cueBallId = cueBallIdOf(a.session);
            return {
                ...INITIAL_STATE,
                phase: a.session.status === "finished" ? "finished" : "aim",
                record: s.record,
                aimAssist: a.aimAssist ?? s.aimAssist,
                session: a.session,
                balls: a.balls,
                input: { ...initialInput(a.balls, cueBallId, a.session.rules.gameType, isOpeningShot(a.session, a.balls)), V0: s.input.V0 },
            };
        }

        case "exit":
            return s === INITIAL_STATE ? s : INITIAL_STATE;

        case "serverSession": {
            if (s.phase === "setup" || !s.record || s.mode === "match") return s;
            const adopt = a.session !== undefined && s.shotIdx === 0 && s.phase === "aim" && s.session !== null
                && a.session.players.length === s.session.players.length;
            return {
                ...s,
                serverSessionId: a.id,
                offline: false,
                ...(adopt ? { session: a.session } : {}),
            };
        }

        case "serverUnavailable":
            return s.phase === "setup" || s.offline || s.mode === "match" ? s : { ...s, offline: true };

        case "setInput": {
            if (s.phase !== "aim") return s;
            const p = a.patch;
            const next: CueInput = { ...s.input };
            const out = next as { -readonly [K in keyof CueInput]: CueInput[K] };
            if (p.phi !== undefined && Number.isFinite(p.phi)) out.phi = normalizeAngle(p.phi);
            if (p.V0 !== undefined) out.V0 = clampPower(p.V0);
            if (p.theta !== undefined) out.theta = clampElevation(p.theta);
            if (p.a !== undefined || p.b !== undefined) {
                const c = clampSpin(p.a ?? s.input.a, p.b ?? s.input.b);
                // 보정 켜짐: 옆당점이 바뀌면 화면 조준(공 방향)은 그대로 두고 큐 방향을 스쿼트 차이만큼 돌린다.
                // phi 를 같이 주면(해법 적용·리플레이) 그 값이 큐 방향이므로 손대지 않는다.
                if (s.aimAssist && p.phi === undefined && c.a !== s.input.a) {
                    out.phi = normalizeAngle(out.phi + squirtFor(s.input.a) - squirtFor(c.a));
                }
                out.a = c.a;
                out.b = c.b;
            }
            const same = out.phi === s.input.phi && out.V0 === s.input.V0 && out.a === s.input.a
                && out.b === s.input.b && out.theta === s.input.theta;
            return same ? s : { ...s, input: next };
        }

        case "shoot": {
            if (s.phase !== "aim" || !s.session) return s;
            const undo = s.record
                ? s.undo
                : [...s.undo, { balls: s.balls, session: s.session, shotIdx: s.shotIdx, outcomeLast: s.outcomeLast, shooterLast: s.shooterLast, input: s.input }];
            return {
                ...s,
                phase: "shooting",
                replayOf: null,
                balls: a.final,
                session: a.session,
                outcomeLast: a.outcome,
                shooterLast: s.session.turn,
                shotIdx: s.shotIdx + 1,
                undo,
                pendingSnap: null,
            };
        }

        case "playbackEnd": {
            if (s.phase !== "shooting" || !s.session) return s;
            const base = s.replayOf === null ? s : { ...s, replayOf: null };
            if (base.pendingSnap) return snapNow(base, base.pendingSnap);
            const session = base.match ? sessionForMatch(base.session!, base.match) : base.session!;
            return {
                ...base,
                session,
                phase: phaseFor(base, session),
                input: reAim(base, base.balls, session),
            };
        }

        case "serverAck": {
            if (s.phase === "setup" || s.mode === "match") return s;
            const queue = withoutIdx(s.queue, a.idx);
            if (!a.mismatch) return queue === s.queue ? s : { ...s, queue };
            const base = { ...s, queue, mismatches: s.mismatches + 1 };
            const snap: ServerSnap = { balls: a.final, session: a.session, ...(a.outcome ? { outcome: a.outcome } : {}) };
            // 지금 재생 중인 샷이면 재생이 끝난 뒤에 갈아탄다(공이 갑자기 순간이동하지 않게).
            if (s.phase === "shooting") return { ...base, pendingSnap: snap };
            return snapNow(base, snap);
        }

        case "queueShot": {
            // 대전은 offline(일시적 끊김)이어도 큐에 넣는다 — 폴링이 성공하면 다시 보낸다.
            if (s.phase === "setup" || (s.mode === "solo" && s.offline) || s.queue.some((q) => q.idx === a.idx)) return s;
            return { ...s, queue: enqueue(s.queue, { idx: a.idx, input: a.input, clientHash: a.clientHash, tries: 0 }) };
        }

        case "serverLanded": {
            const queue = withoutIdx(s.queue, a.idx);
            return queue === s.queue ? s : { ...s, queue };
        }

        case "serverFail": {
            if (s.phase === "setup" || s.offline || s.mode === "match") return s;
            const existing = s.queue.find((q) => q.idx === a.idx);
            if (!a.retryable) return { ...s, queue: withoutIdx(s.queue, a.idx), offline: true };
            const tries = (existing ? existing.tries : 0) + 1;
            if (tries >= MAX_RETRIES) return { ...s, queue: [], offline: true };
            return { ...s, queue: enqueue(s.queue, { idx: a.idx, input: a.input, clientHash: a.clientHash, tries }) };
        }

        case "undo": {
            if (s.record || (s.phase !== "aim" && s.phase !== "finished") || s.undo.length === 0) return s;
            const e = s.undo[s.undo.length - 1];
            return {
                ...s,
                phase: "aim",
                balls: e.balls,
                session: e.session,
                shotIdx: e.shotIdx,
                outcomeLast: e.outcomeLast,
                shooterLast: e.shooterLast,
                input: e.input,
                undo: s.undo.slice(0, -1),
                pendingSnap: null,
            };
        }

        case "placeBall": {
            if (s.record || s.phase !== "aim" || !s.session) return s;
            const i = s.balls.findIndex((b) => b.id === a.id);
            if (i < 0) return s;
            const cur = s.balls[i];
            if (cur.r[0] === a.x && cur.r[1] === a.y) return s;
            const moved: BallState = { ...cur, r: [a.x, a.y, cur.r[2]], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
            const balls = s.balls.map((b, k) => (k === i ? moved : b));
            if (!isValidLayout(balls, a.table)) return s;
            const cueBallId = cueBallIdOf(s.session);
            const input = a.id === cueBallId
                ? { ...s.input, phi: cuePhiForAim(defaultPhi(balls, cueBallId, gameTypeOf(s), openingFor(s.session, balls)), s.input.a, s.aimAssist) }
                : s.input;
            return { ...s, balls, input };
        }

        /* ---------------------------------------------------------- 네트워크 대전 */

        case "startMatch": {
            const session = sessionForMatch(a.session, a.match);
            const base: SimCoreState = {
                ...INITIAL_STATE,
                mode: "match",
                match: a.match,
                record: true,
                aimAssist: a.aimAssist ?? true,
                session,
                balls: a.balls,
                shotIdx: a.shots,
            };
            return {
                ...base,
                phase: phaseFor(base, session),
                input: initialInput(a.balls, cueBallIdOf(session), session.rules.gameType, isOpeningShot(session, a.balls)),
            };
        }

        case "matchSync": {
            if (s.mode !== "match" || !s.match || !s.session || s.phase === "setup") return s;
            const session = sessionForMatch(s.session, a.match);
            const queue = resetTries(s.queue);
            if (sameMatchMeta(s.match, a.match) && sameOpponentAim(s.match, a.match) && session === s.session && !s.offline && queue === s.queue) return s;
            return rephase({ ...s, match: a.match, session, queue, offline: false });
        }

        case "matchSnap": {
            if (s.mode !== "match" || s.phase === "setup") return s;
            const session = sessionForMatch(a.session, a.match);
            const base: SimCoreState = {
                ...s,
                match: a.match,
                session,
                balls: a.balls,
                shotIdx: a.shots,
                queue: [],
                offline: false,
                pendingSnap: null,
                mismatches: s.mismatches + (a.mismatch ? 1 : 0),
            };
            // 재생 중엔 공을 바꿔도 화면은 재생(frameAt)을 그리고, playbackEnd 가 단계·조준을 다시 정한다.
            if (s.phase === "shooting") return base;
            return { ...base, replayOf: null, phase: phaseFor(base, session), input: reAim(base, a.balls, session) };
        }

        case "replayShot": {
            if (s.mode !== "match" || !s.match || !s.session || (s.phase !== "waiting" && s.phase !== "aim")) return s;
            return {
                ...s,
                phase: "shooting",
                replayOf: a.playerIndex,
                balls: a.final,
                session: a.session,
                outcomeLast: a.outcome,
                /*
                 * 친 사람도 같이 적는다(2026-09-18 버그). 빠져 있어서 상대 샷의 득점이 **직전에 친 사람(나)**에게 붙었다 —
                 * 세로 점수판과 이닝 시트에 두 사람 점수가 전부 내 칸으로 쌓였다. 재생이 끝나면 컨트롤러가
                 * onOutcome(outcomeLast, session, shooterLast) 로 이 값을 그대로 넘긴다.
                 */
                shooterLast: a.playerIndex,
                shotIdx: s.shotIdx + 1,
                mismatches: s.mismatches + (a.mismatch ? 1 : 0),
                pendingSnap: null,
            };
        }

        case "matchShotAck": {
            if (s.mode !== "match" || !s.match || !s.session || s.phase === "setup") return s;
            const queue = withoutIdx(s.queue, a.idx);
            if (!a.mismatch || !a.final || !a.session) {
                // 일치(또는 duplicate): 메타만. 컨트롤러가 duplicate 는 GET 으로 다시 확인한다.
                const session = sessionForMatch(s.session, a.match);
                return rephase({ ...s, match: a.match, queue, offline: false, session });
            }
            const base: SimCoreState = { ...s, match: a.match, queue, offline: false, mismatches: s.mismatches + 1 };
            const snap: ServerSnap = { balls: a.final, session: a.session, ...(a.outcome ? { outcome: a.outcome } : {}) };
            if (s.phase === "shooting") return { ...base, pendingSnap: snap };
            return snapNow(base, snap);
        }

        case "matchShotFail": {
            if (s.mode !== "match" || s.phase === "setup") return s;
            const existing = s.queue.find((q) => q.idx === a.idx);
            const tries = (existing ? existing.tries : 0) + 1;
            const queue = enqueue(s.queue, { idx: a.idx, input: a.input, clientHash: a.clientHash, tries });
            return { ...s, queue, offline: s.offline || tries >= MAX_RETRIES };
        }
    }
    return s;
}

/* ------------------------------------------------------------------ 스토어 */

export interface SimStore {
    get(): SimCoreState;
    dispatch(a: SimAction): void;
    /** 상태가 실제로 바뀐 뒤에만 부른다. 해제 함수를 돌려준다. */
    subscribe(cb: () => void): () => void;
}

export function createSimStore(initial: SimCoreState = INITIAL_STATE): SimStore {
    let state = initial;
    const subs = new Set<() => void>();
    return {
        get: () => state,
        dispatch(a) {
            const next = simReducer(state, a);
            if (next === state) return;
            state = next;
            for (const cb of Array.from(subs)) cb();
        },
        subscribe(cb) {
            subs.add(cb);
            return () => { subs.delete(cb); };
        },
    };
}
