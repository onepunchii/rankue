/**
 * server/routes/modules/sim.ts 의 타입 클라이언트. 요청·응답 모양은 서버 파일이 정본이며 여기서는 그것을 그대로 옮긴다.
 *
 *  - 순수 부분(테스트 대상): URL, 요청 본문 매핑, 응답 검증, 오류 분류.
 *  - 네트워크: createSimApi(request) 에 주입한다. 기본 인스턴스 simApi 는 @/lib/queryClient 의 apiRequest 를 쓴다
 *    (쿠키 인증·{success,data} 언랩·JSON 직렬화는 apiRequest 가 맡는다).
 *  - 결정론: 샷 입력은 숫자를 손대지 않고 그대로 보낸다. JSON 의 double 직렬화는 최단 왕복 표현이라 서버가 같은 비트를 받는다.
 *
 * 실전 경기 API(/api/hiq/game/*)는 절대 부르지 않는다 — 시뮬레이터는 RP 와 분리돼 있다.
 */
import type { BallState, ShotInput, SimEvent, Snapshot } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import type { FinishType, GameType, Rules, SessionState, ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { apiRequest } from "@/lib/queryClient";

export const SIM_API_BASE = "/api/hiq/sim";

export function sessionsUrl(): string {
    return `${SIM_API_BASE}/sessions`;
}
export function shotsUrl(sessionId: string): string {
    return `${SIM_API_BASE}/sessions/${encodeURIComponent(sessionId)}/shots`;
}
export function closeUrl(sessionId: string): string {
    return `${SIM_API_BASE}/sessions/${encodeURIComponent(sessionId)}/close`;
}

/* ------------------------------------------------------------------ 행 타입 (hiq_sim_sessions / hiq_sim_shots, JSON 직렬화 후) */

export type SessionRowStatus = "playing" | "finished" | "abandoned";

export interface SimSessionRow {
    readonly id: string;
    readonly memberId: string;
    readonly kind: "solo" | "drill" | "match";
    readonly gameType: GameType;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: string;
    readonly condition: number;
    readonly rules: Rules;
    readonly finishType: FinishType;
    readonly targetScore: number;
    readonly inningCap: number;
    readonly state: SessionState;
    readonly balls: readonly BallState[];
    readonly score: number;
    readonly innings: number;
    readonly highRun: number;
    readonly shots: number;
    readonly status: SessionRowStatus;
    readonly engineVersion: string;
    readonly paramsHash: string;
    readonly mismatches: number;
    /** ISO 문자열(JSON) */
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly lastShotAt: string | null;
}

export interface SimShotRow {
    readonly id: string;
    readonly sessionId: string;
    readonly idx: number;
    readonly playerIndex: number;
    readonly preState: readonly BallState[];
    readonly input: ShotInput;
    readonly hash: string;
    readonly clientHash: string | null;
    readonly eventCount: number;
    readonly outcomeCode: string;
    readonly points: number;
    readonly cushions: number;
    readonly createdAt: string;
}

/* ------------------------------------------------------------------ 요청·응답 */

export interface SessionPlayer {
    readonly id: string;
    readonly target: number;
}

/** POST /sim/sessions 본문. 서버 createSchema 와 필드가 같다. */
export interface CreateSessionBody {
    readonly gameType: GameType;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: SimSetupConfig["cushionModel"];
    readonly condition: number;
    readonly rules: Rules;
    readonly finishType: FinishType;
    readonly target: number;
    readonly inningCap: number;
    /** 2인 로컬 대전일 때만. 없으면 서버가 요청자 1인으로 만든다. */
    readonly players?: readonly SessionPlayer[];
    /** 자유 배치. 없으면 서버가 개시 배치를 쓴다. */
    readonly balls?: readonly BallState[];
}

export interface CreateSessionResult {
    readonly session: SimSessionRow;
    readonly state: SessionState;
    readonly balls: readonly BallState[];
}

export interface ShotRequest {
    readonly idx: number;
    readonly input: ShotInput;
    readonly clientHash: string;
}

export interface ShotResponse {
    readonly shot: SimShotRow;
    readonly duplicate: boolean;
    /** clientHash 와 서버 재시뮬 해시가 다름 → final/state 로 스냅해야 한다. */
    readonly mismatch: boolean;
    readonly hash: string;
    readonly events: readonly SimEvent[];
    readonly final: readonly BallState[];
    readonly duration: number;
    readonly truncated: boolean;
    /** mismatch 일 때만 온다(전체 궤적). */
    readonly history?: readonly Snapshot[];
    readonly outcome: ShotOutcome;
    /** 정본 세션 상태. */
    readonly state: SessionState;
}

export type CloseStatus = "finished" | "abandoned";

/** 설정 + 배치 + (선택) 선수 목록 → 요청 본문. 알려진 필드만 옮기고 나머지는 새지 않는다. */
export function toCreateSessionBody(
    config: SimSetupConfig,
    balls?: readonly BallState[],
    players?: readonly SessionPlayer[],
): CreateSessionBody {
    const body: CreateSessionBody = {
        gameType: config.gameType,
        tableId: config.tableId,
        cushionModel: config.cushionModel,
        condition: config.condition,
        rules: config.rules,
        finishType: config.finishType,
        target: config.target,
        inningCap: config.inningCap,
        ...(players && players.length > 0 ? { players: players.map((p) => ({ id: p.id, target: p.target })) } : {}),
        ...(balls ? { balls } : {}),
    };
    return body;
}

/**
 * 샷 요청 본문. 입력 숫자는 그대로(반올림 금지 — 로컬 시뮬과 같은 비트여야 해시가 맞는다).
 * 유한하지 않은 값이 섞이면 서버가 400 을 주기 전에 여기서 RangeError.
 */
export function toShotBody(req: ShotRequest): { idx: number; input: ShotInput; clientHash: string } {
    const i = req.input;
    const nums = [i.phi, i.V0, i.a, i.b, i.theta];
    if (!Number.isInteger(req.idx) || req.idx < 0) throw new RangeError("shot idx must be a non-negative integer");
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) throw new RangeError("shot input must be finite");
    return {
        idx: req.idx,
        input: { cueBallId: i.cueBallId, phi: i.phi, V0: i.V0, a: i.a, b: i.b, theta: i.theta },
        clientHash: req.clientHash,
    };
}

/* ------------------------------------------------------------------ 응답 검증 */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 서버 SessionState 모양 검사. matchApi 도 같은 검사를 쓴다. */
export function isSessionState(v: unknown): v is SessionState {
    return isRecord(v) && Array.isArray(v.players) && typeof v.turn === "number"
        && (v.status === "playing" || v.status === "finished") && isRecord(v.rules);
}

export function isBallArray(v: unknown): v is BallState[] {
    return Array.isArray(v) && v.every((b) => isRecord(b) && typeof b.id === "string" && Array.isArray(b.r));
}

export function parseSessionRow(raw: unknown): SimSessionRow {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.status !== "string") {
        throw new TypeError("sim api: malformed session row");
    }
    return raw as unknown as SimSessionRow;
}

export function parseCreateSessionResponse(raw: unknown): CreateSessionResult {
    if (!isRecord(raw)) throw new TypeError("sim api: malformed create response");
    const session = parseSessionRow(raw.session);
    if (!isSessionState(raw.state)) throw new TypeError("sim api: malformed session state");
    if (!isBallArray(raw.balls)) throw new TypeError("sim api: malformed balls");
    return { session, state: raw.state, balls: raw.balls };
}

export function parseShotResponse(raw: unknown): ShotResponse {
    if (!isRecord(raw)) throw new TypeError("sim api: malformed shot response");
    if (typeof raw.mismatch !== "boolean" || typeof raw.hash !== "string") throw new TypeError("sim api: malformed shot response");
    if (!isBallArray(raw.final)) throw new TypeError("sim api: malformed final state");
    if (!isSessionState(raw.state)) throw new TypeError("sim api: malformed session state");
    if (!isRecord(raw.outcome) || typeof raw.outcome.code !== "string") throw new TypeError("sim api: malformed outcome");
    return {
        shot: raw.shot as SimShotRow,
        duplicate: raw.duplicate === true,
        mismatch: raw.mismatch,
        hash: raw.hash,
        events: Array.isArray(raw.events) ? (raw.events as SimEvent[]) : [],
        final: raw.final,
        duration: typeof raw.duration === "number" ? raw.duration : 0,
        truncated: raw.truncated === true,
        ...(Array.isArray(raw.history) ? { history: raw.history as Snapshot[] } : {}),
        outcome: raw.outcome as unknown as ShotOutcome,
        state: raw.state,
    };
}

/* ------------------------------------------------------------------ 오류 분류 */

/**
 * network      — 응답을 못 받음(fetch 실패·중단·5xx). 재시도 대상.
 * idx-mismatch — 409 IDX_MISMATCH: 서버 샷 수와 어긋남(보통 응답이 유실된 뒤 재전송).
 * session-closed — 404/409: 세션이 없거나 끝남.
 * unauthorized — 401/403.
 * rejected     — 400 등: 입력 거부. 재시도해도 같다.
 */
export type ApiFailure = "network" | "idx-mismatch" | "session-closed" | "unauthorized" | "rejected";

export function classifyApiError(err: unknown): ApiFailure {
    if (!isRecord(err)) return "network";
    const status = typeof err.status === "number" ? err.status : null;
    if (status === null) return "network";
    if (status >= 500) return "network";
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 409) {
        const data = isRecord(err.data) ? err.data : null;
        return data && data.code === "IDX_MISMATCH" ? "idx-mismatch" : "session-closed";
    }
    if (status === 404) return "session-closed";
    return "rejected";
}

export function isRetryable(kind: ApiFailure): boolean {
    return kind === "network";
}

/**
 * IDX_MISMATCH 메시지("샷 순서가 맞지 않습니다 (서버 N)")에서 서버의 샷 수 N. 없으면 null.
 * 응답이 유실된 재전송에서 N === idx + 1 이면 그 샷은 이미 기록된 것이다(멱등 처리 근거).
 */
export function serverShotsFromError(err: unknown): number | null {
    if (!isRecord(err)) return null;
    const data = isRecord(err.data) ? err.data : null;
    const msg = typeof err.message === "string" ? err.message : (data && typeof data.message === "string" ? data.message : "");
    const m = /(\d+)\s*\)?\s*$/.exec(msg);
    return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ 클라이언트 */

export type RequestFn = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export interface SimApi {
    createSession(config: SimSetupConfig, balls?: readonly BallState[], players?: readonly SessionPlayer[]): Promise<CreateSessionResult>;
    postShot(sessionId: string, req: ShotRequest): Promise<ShotResponse>;
    closeSession(sessionId: string, status: CloseStatus): Promise<SimSessionRow>;
}

/** request 를 주입해 만든다(테스트는 가짜 request). 응답은 {success,data} 가 이미 벗겨진 data 여야 한다. */
export function createSimApi(request: RequestFn): SimApi {
    return {
        async createSession(config, balls, players) {
            const raw = await request(sessionsUrl(), { method: "POST", body: toCreateSessionBody(config, balls, players) });
            return parseCreateSessionResponse(raw);
        },
        async postShot(sessionId, req) {
            const raw = await request(shotsUrl(sessionId), { method: "POST", body: toShotBody(req) });
            return parseShotResponse(raw);
        },
        async closeSession(sessionId, status) {
            const raw = await request(closeUrl(sessionId), { method: "POST", body: { status } });
            return parseSessionRow(raw);
        },
    };
}

/** 앱용 기본 인스턴스. */
export const simApi: SimApi = createSimApi((url, options) => apiRequest(url, options));
