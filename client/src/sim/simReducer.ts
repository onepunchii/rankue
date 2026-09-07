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
 */
import type { BallState, ShotInput } from "@shared/sim/types";
import { DEFAULT_CUE, TABLES, type SimParams, type TableSpec } from "@shared/sim/params";
import { currentPlayer, opponentCueBall, type GameType, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import { isValidLayout } from "@shared/sim/layouts";
import type { SimSetupConfig } from "./setupPresets";
import { angleBetween, nearestObjectBall, normalizeAngle, phiForThickness, type XY } from "./aim";

export type Phase = "setup" | "aim" | "shooting" | "finished";

/** 큐 입력. cueBallId 는 세션의 현재 선수에서 나오므로 여기 없다. */
export interface CueInput {
    readonly phi: number;
    readonly V0: number;
    readonly a: number;
    readonly b: number;
    readonly theta: number;
}

export const V0_DEFAULT = 2.5;
export const V0_MIN = 0.2;
export const V0_MAX = 9;
/** 큐 들림각 상한 (rad). README: v2.0 은 고급 패널에서 0~20°. */
export const THETA_MAX = (20 * Math.PI) / 180;
/** 샷 재전송 시도 상한. 넘으면 이 세션은 더 기록하지 않는다(offline). */
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
    return Math.min(V0_MAX, Math.max(V0_MIN, V0));
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

/** 조준 기준 적구: 가장 가까운 적구. 4구는 상대 큐볼을 제외한다(맞히면 파울). */
export function objectTargetFor(balls: readonly BallState[], cueBallId: string, gameType: GameType): BallState | null {
    const cue = balls.find((b) => b.id === cueBallId);
    if (!cue) return null;
    const exclude = gameType === "4c" ? [opponentCueBall(cueBallId)] : [];
    return nearestObjectBall(cue, balls, exclude);
}

/** 기본 조준: 가장 가까운 적구 중심. 적구가 없으면 테이블 위쪽(+y). */
export function defaultPhi(balls: readonly BallState[], cueBallId: string, gameType: GameType): number {
    const cue = balls.find((b) => b.id === cueBallId);
    const target = objectTargetFor(balls, cueBallId, gameType);
    if (!cue || !target) return Math.PI / 2;
    return normalizeAngle(angleBetween([cue.r[0], cue.r[1]], [target.r[0], target.r[1]]));
}

/** 두께 단계 → phi. 적구가 없으면 null. */
export function thicknessPhi(
    balls: readonly BallState[], cueBallId: string, gameType: GameType,
    thickness: number, side: "left" | "right", R: number,
): number | null {
    const cue = balls.find((b) => b.id === cueBallId);
    const target = objectTargetFor(balls, cueBallId, gameType);
    if (!cue || !target) return null;
    const c: XY = [cue.r[0], cue.r[1]];
    const t: XY = [target.r[0], target.r[1]];
    return phiForThickness(c, t, thickness, side, R);
}

export function initialInput(balls: readonly BallState[], cueBallId: string, gameType: GameType): CueInput {
    return { phi: defaultPhi(balls, cueBallId, gameType), V0: V0_DEFAULT, a: 0, b: 0, theta: 0 };
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
    readonly input: CueInput;
}

/** 서버가 정본이라 재생이 끝난 뒤 갈아탈 상태. */
export interface ServerSnap {
    readonly balls: readonly BallState[];
    readonly session: SessionState;
    /** 서버 판정. 없으면 로컬 판정을 유지한다. */
    readonly outcome?: ShotOutcome;
}

export interface SimCoreState {
    readonly phase: Phase;
    /** 서버 기록 여부. false = 연습(되돌리기·자유 배치 허용, 서버 호출 없음). */
    readonly record: boolean;
    readonly session: SessionState | null;
    readonly balls: readonly BallState[];
    readonly input: CueInput;
    /** 다음 샷 idx. 서버 세션의 shots 와 같아야 한다. */
    readonly shotIdx: number;
    readonly serverSessionId: string | null;
    readonly outcomeLast: ShotOutcome | null;
    /** 서버 해시와 어긋난 샷 수(이 세션) */
    readonly mismatches: number;
    /** 서버 기록을 포기했다(재전송 상한·거부·세션 개설 실패). 로컬 플레이는 계속된다. */
    readonly offline: boolean;
    /** 재전송 대기 샷(idx 오름차순) */
    readonly queue: readonly PendingShot[];
    readonly undo: readonly UndoEntry[];
    readonly pendingSnap: ServerSnap | null;
}

const NO_INPUT: CueInput = { phi: Math.PI / 2, V0: V0_DEFAULT, a: 0, b: 0, theta: 0 };

export const INITIAL_STATE: SimCoreState = {
    phase: "setup",
    record: true,
    session: null,
    balls: [],
    input: NO_INPUT,
    shotIdx: 0,
    serverSessionId: null,
    outcomeLast: null,
    mismatches: 0,
    offline: false,
    queue: [],
    undo: [],
    pendingSnap: null,
};

/* ------------------------------------------------------------------ 액션 */

export type SimAction =
    | { readonly type: "start"; readonly session: SessionState; readonly balls: readonly BallState[]; readonly record: boolean }
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
    /** 서버 세션이 아직 없을 때(개설 응답 대기) 친 샷. 시도 횟수 0 으로 큐에 넣는다. */
    | { readonly type: "queueShot"; readonly idx: number; readonly input: ShotInput; readonly clientHash: string }
    /** 재전송했더니 이미 기록돼 있었다(IDX_MISMATCH 인데 서버 shots === idx+1). 큐에서만 뺀다. */
    | { readonly type: "serverLanded"; readonly idx: number }
    | { readonly type: "serverFail"; readonly idx: number; readonly input: ShotInput; readonly clientHash: string; readonly retryable: boolean }
    | { readonly type: "undo" }
    | { readonly type: "placeBall"; readonly id: string; readonly x: number; readonly y: number; readonly table: TableSpec }
    | { readonly type: "restart"; readonly session: SessionState; readonly balls: readonly BallState[] }
    | { readonly type: "exit" };

function gameTypeOf(s: SimCoreState): GameType {
    return s.session ? s.session.rules.gameType : "3c";
}

function phaseFor(session: SessionState): Phase {
    return session.status === "finished" ? "finished" : "aim";
}

function reAim(s: SimCoreState, balls: readonly BallState[], session: SessionState): CueInput {
    return { ...s.input, phi: defaultPhi(balls, cueBallIdOf(session), session.rules.gameType) };
}

function withoutIdx(queue: readonly PendingShot[], idx: number): readonly PendingShot[] {
    return queue.some((q) => q.idx === idx) ? queue.filter((q) => q.idx !== idx) : queue;
}

/** 서버 상태로 즉시 갈아탄다(aim/finished 에서). */
function snapNow(s: SimCoreState, snap: ServerSnap): SimCoreState {
    return {
        ...s,
        balls: snap.balls,
        session: snap.session,
        phase: phaseFor(snap.session),
        input: reAim(s, snap.balls, snap.session),
        outcomeLast: snap.outcome ?? s.outcomeLast,
        pendingSnap: null,
    };
}

function enqueue(queue: readonly PendingShot[], entry: PendingShot): readonly PendingShot[] {
    const exists = queue.some((q) => q.idx === entry.idx);
    const next = exists ? queue.map((q) => (q.idx === entry.idx ? entry : q)) : [...queue, entry];
    return next.slice().sort((x, y) => x.idx - y.idx);
}

export function simReducer(s: SimCoreState, a: SimAction): SimCoreState {
    switch (a.type) {
        case "start": {
            const cueBallId = cueBallIdOf(a.session);
            return {
                ...INITIAL_STATE,
                phase: phaseFor(a.session),
                record: a.record,
                session: a.session,
                balls: a.balls,
                input: initialInput(a.balls, cueBallId, a.session.rules.gameType),
            };
        }

        case "restart": {
            if (s.phase === "setup") return s;
            const cueBallId = cueBallIdOf(a.session);
            return {
                ...INITIAL_STATE,
                phase: phaseFor(a.session),
                record: s.record,
                session: a.session,
                balls: a.balls,
                input: { ...initialInput(a.balls, cueBallId, a.session.rules.gameType), V0: s.input.V0 },
            };
        }

        case "exit":
            return s === INITIAL_STATE ? s : INITIAL_STATE;

        case "serverSession": {
            if (s.phase === "setup" || !s.record) return s;
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
            return s.phase === "setup" || s.offline ? s : { ...s, offline: true };

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
                : [...s.undo, { balls: s.balls, session: s.session, shotIdx: s.shotIdx, outcomeLast: s.outcomeLast, input: s.input }];
            return {
                ...s,
                phase: "shooting",
                balls: a.final,
                session: a.session,
                outcomeLast: a.outcome,
                shotIdx: s.shotIdx + 1,
                undo,
                pendingSnap: null,
            };
        }

        case "playbackEnd": {
            if (s.phase !== "shooting" || !s.session) return s;
            if (s.pendingSnap) return snapNow(s, s.pendingSnap);
            return {
                ...s,
                phase: phaseFor(s.session),
                input: reAim(s, s.balls, s.session),
            };
        }

        case "serverAck": {
            if (s.phase === "setup") return s;
            const queue = withoutIdx(s.queue, a.idx);
            if (!a.mismatch) return queue === s.queue ? s : { ...s, queue };
            const base = { ...s, queue, mismatches: s.mismatches + 1 };
            const snap: ServerSnap = { balls: a.final, session: a.session, ...(a.outcome ? { outcome: a.outcome } : {}) };
            // 지금 재생 중인 샷이면 재생이 끝난 뒤에 갈아탄다(공이 갑자기 순간이동하지 않게).
            if (s.phase === "shooting") return { ...base, pendingSnap: snap };
            return snapNow(base, snap);
        }

        case "queueShot": {
            if (s.phase === "setup" || s.offline || s.queue.some((q) => q.idx === a.idx)) return s;
            return { ...s, queue: enqueue(s.queue, { idx: a.idx, input: a.input, clientHash: a.clientHash, tries: 0 }) };
        }

        case "serverLanded": {
            const queue = withoutIdx(s.queue, a.idx);
            return queue === s.queue ? s : { ...s, queue };
        }

        case "serverFail": {
            if (s.phase === "setup" || s.offline) return s;
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
            const input = a.id === cueBallId ? { ...s.input, phi: defaultPhi(balls, cueBallId, gameTypeOf(s)) } : s.input;
            return { ...s, balls, input };
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
