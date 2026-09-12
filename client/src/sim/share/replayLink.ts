/**
 * 리플레이 링크 — 샷 하나(샷 직전 배치 + 큐 입력 + 결과 해시)를 `/online-game?replay=<base64url JSON>` 한 줄로 옮긴다.
 *
 * 결정론 전제(shared/sim README): 같은 엔진 버전·같은 파라미터(테이블·쿠션 모델·컨디션)·같은 배치·같은 입력이면
 * 이벤트 열과 최종 상태가 비트 단위로 같고 해시도 같다. 그래서 숫자는 절대 반올림하지 않는다 — JSON 의 최단 왕복
 * 표현(shortest round-trip)이 double 을 그대로 되살린다. 1e-6 반올림은 시뮬레이션을 아주 조금 바꿔 해시 검사를
 * 깨뜨린다. 대신 0 인 값(당점·큐 각·정지 속도·각속도)과 z(= 공 반지름)는 생략해 짧게 만든다.
 *
 * 디코딩은 신뢰하지 않는 입력이다: 필드마다 검사하고(테이블·모델·컨디션 격자·공 id 집합·isValidLayout·입력 범위)
 * 하나라도 어긋나면 null. 입력 범위는 useSimulator 의 setInput 클램프와 같은 경계다 — 클램프가 값을 바꾸면
 * 재생이 원본과 달라지므로 그런 링크는 처음부터 거부한다.
 *
 * 순수 함수만. URL·DOM 은 페이지가 읽어서 넘긴다(currentOrigin 만 location 을 선택적으로 본다).
 */
import type { BallState, ShotInput, SimResult } from "@shared/sim/types";
import { TABLES, type CushionModelId, type TableSpec } from "@shared/sim/params";
import { isValidLayout } from "@shared/sim/layouts";
import type { GameType } from "@shared/sim/rules/types";
import { buildConfig, clampCondition, CONDITION_MAX, CONDITION_MIN, type SimSetupConfig, type TableId } from "../setupPresets";
import { clampSpin, THETA_MAX, V0_LEGACY_MAX, V0_MIN } from "../simReducer";
import { TWO_PI } from "../aim";

export const REPLAY_PARAM = "replay";
export const REPLAY_VERSION = 1;
/** 리플레이 세션의 다마수. 한 샷으로 끝나지 않을 만큼 크게(드릴 세션과 같은 값). */
export const REPLAY_TARGET = 100;
/** 링크의 기본 오리진. 웹에서 https 오리진 위에 있으면 그 오리진(프리뷰 배포 포함)을 쓴다 — currentOrigin. */
export const SITE_ORIGIN = "https://www.rankue.co.kr";
export const REPLAY_BASE_PATH = "/online-game";

const TABLE_IDS: readonly TableId[] = ["DAEDAE", "JUNGDAE_KR"];
const CUSHION_MODELS: readonly CushionModelId[] = ["han2005", "sphereHalfSpace", "mathavan2010"];
/** 종목별 공 id 집합(shared/sim/layouts.openingLayout 과 같다). 공 수가 종목을 정한다. */
const BALL_SETS: Readonly<Record<GameType, readonly string[]>> = {
    "3c": ["white", "yellow", "red"],
    "4c": ["white", "yellow", "red1", "red2"],
};
/** hash.ts: FNV-1a 64 → 16자리 소문자 16진수 */
const HASH_RE = /^[0-9a-f]{16}$/;
const VERSION_MAX_LEN = 32;

/** 디코딩된 리플레이(검증 완료). */
export interface ReplayPayload {
    readonly v: 1;
    readonly table: TableId;
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    /** 공 수로 정한 종목(3개 = 3쿠션, 4개 = 4구). */
    readonly gameType: GameType;
    /** 샷 직전 배치. 전부 정지(v = w = 0, state stationary). */
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
    readonly engineVersion: string;
    readonly hash: string;
}

/** 인코딩 입력. replaySource(result, config) 가 만든다. */
export interface ReplaySource {
    readonly table: TableId;
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
    readonly engineVersion: string;
    readonly hash: string;
}

/* ------------------------------------------------------------------ base64url (pageConfig 와 같은 규약) */

function utf8ToBase64Url(s: string): string {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(s: string): string | null {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    try {
        const bin = atob(b64 + pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ 결과 → 소스 */

/**
 * 샷 직전 배치. history[0] 은 타격 직후(t = 0) 스냅샷이라 위치는 샷 직전과 비트 단위로 같고(strike 는 속도만 바꾼다),
 * 큐볼만 속도를 가진다 → 모든 공을 정지 상태로 되돌리면 샷 직전 배치가 된다. history 가 비었으면 빈 배열.
 */
export function preShotBalls(result: Pick<SimResult, "history">): readonly BallState[] {
    const first = result.history[0];
    if (!first) return [];
    return first.balls.map((b) => ({ id: b.id, r: [b.r[0], b.r[1], b.r[2]], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" }));
}

/** 결과 + 세션 설정 → 인코딩 소스. 입력 객체와 해시는 결과의 것을 그대로 쓴다(반올림 없음). */
export function replaySource(result: SimResult, config: Pick<SimSetupConfig, "tableId" | "cushionModel" | "condition">): ReplaySource {
    return {
        table: config.tableId,
        cushionModel: config.cushionModel,
        condition: config.condition,
        balls: preShotBalls(result),
        input: result.input,
        engineVersion: result.engineVersion,
        hash: result.hash,
    };
}

/* ------------------------------------------------------------------ 인코딩 */

/**
 * 압축 규약(v1): 컨디션 1 은 생략, 공은 [id, x, y] (z 가 공 반지름과 다를 때만 [id, x, y, z]),
 * 입력은 a·b·theta 가 0 이면 생략. 숫자는 JSON 그대로(반올림 없음).
 */
export function encodeReplay(src: ReplaySource): string {
    const R = TABLES[src.table].ball.R;
    const input: Record<string, unknown> = { cueBallId: src.input.cueBallId, phi: src.input.phi, V0: src.input.V0 };
    if (src.input.a !== 0) input.a = src.input.a;
    if (src.input.b !== 0) input.b = src.input.b;
    if (src.input.theta !== 0) input.theta = src.input.theta;
    const wire: Record<string, unknown> = {
        v: REPLAY_VERSION,
        table: src.table,
        cushionModel: src.cushionModel,
    };
    if (src.condition !== 1) wire.condition = src.condition;
    wire.balls = src.balls.map((b) => (b.r[2] === R ? [b.id, b.r[0], b.r[1]] : [b.id, b.r[0], b.r[1], b.r[2]]));
    wire.input = input;
    wire.engineVersion = src.engineVersion;
    wire.hash = src.hash;
    return utf8ToBase64Url(JSON.stringify(wire));
}

/* ------------------------------------------------------------------ 디코딩(신뢰하지 않는 입력) */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function pick<T extends string>(allowed: readonly T[], v: unknown): T | null {
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function sameIdSet(ids: readonly string[], expected: readonly string[]): boolean {
    if (ids.length !== expected.length) return false;
    const seen = new Set(ids);
    if (seen.size !== ids.length) return false;
    return expected.every((id) => seen.has(id));
}

function parseBalls(raw: unknown, table: TableSpec): readonly BallState[] | null {
    if (!Array.isArray(raw)) return null;
    const gameType: GameType | null = raw.length === 3 ? "3c" : raw.length === 4 ? "4c" : null;
    if (!gameType) return null;
    const R = table.ball.R;
    const balls: BallState[] = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length < 3 || item.length > 4) return null;
        const [id, x, y, z] = item as unknown[];
        if (typeof id !== "string" || !isNum(x) || !isNum(y)) return null;
        if (z !== undefined && !isNum(z)) return null;
        balls.push({ id, r: [x, y, z === undefined ? R : z], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });
    }
    if (!sameIdSet(balls.map((b) => b.id), BALL_SETS[gameType])) return null;
    if (!isValidLayout(balls, table)) return null;
    return balls;
}

function parseInput(raw: unknown, balls: readonly BallState[]): ShotInput | null {
    if (!isRecord(raw)) return null;
    const cueBallId = raw.cueBallId;
    if (cueBallId !== "white" && cueBallId !== "yellow") return null;
    if (!balls.some((b) => b.id === cueBallId)) return null;
    const { phi, V0 } = raw;
    const a = raw.a === undefined ? 0 : raw.a;
    const b = raw.b === undefined ? 0 : raw.b;
    const theta = raw.theta === undefined ? 0 : raw.theta;
    if (!isNum(phi) || phi < 0 || phi > TWO_PI) return null;
    // 상한을 낮추기 전(2026-09-12 이전)에 만든 링크도 열려야 한다 — 화면 상한이 아니라 엔진 상한으로 본다.
    if (!isNum(V0) || V0 < V0_MIN || V0 > V0_LEGACY_MAX) return null;
    if (!isNum(theta) || theta < 0 || theta > THETA_MAX) return null;
    if (!isNum(a) || !isNum(b)) return null;
    // 미스큐 링 밖이면 setInput 이 값을 바꾼다 → 원본과 다른 재생이 되므로 거부
    const c = clampSpin(a, b);
    if (c.a !== a || c.b !== b) return null;
    return { cueBallId, phi, V0, a, b, theta };
}

/** 디코딩된 JSON(신뢰 불가) → ReplayPayload. 어느 필드든 어긋나면 null. */
export function parseReplay(raw: unknown): ReplayPayload | null {
    if (!isRecord(raw)) return null;
    if (raw.v !== REPLAY_VERSION) return null;
    const table = pick(TABLE_IDS, raw.table);
    if (!table) return null;
    const cushionModel = pick(CUSHION_MODELS, raw.cushionModel);
    if (!cushionModel) return null;
    const condition = raw.condition === undefined ? 1 : raw.condition;
    // 격자(0.05) 밖 값은 buildConfig 가 바꿔 버리므로(파라미터 해시가 달라진다) 거부
    if (!isNum(condition) || condition < CONDITION_MIN || condition > CONDITION_MAX || clampCondition(condition) !== condition) return null;
    const spec = TABLES[table];
    const balls = parseBalls(raw.balls, spec);
    if (!balls) return null;
    const gameType: GameType = balls.length === 4 ? "4c" : "3c";
    const input = parseInput(raw.input, balls);
    if (!input) return null;
    const engineVersion = raw.engineVersion;
    if (typeof engineVersion !== "string" || engineVersion.length === 0 || engineVersion.length > VERSION_MAX_LEN) return null;
    const hash = raw.hash;
    if (typeof hash !== "string" || !HASH_RE.test(hash)) return null;
    return { v: 1, table, cushionModel, condition, gameType, balls, input, engineVersion, hash };
}

/** `replay` 파라미터 값 → ReplayPayload. 깨진 base64·JSON·내용은 전부 null(페이지가 설정 창으로 떨어진다). */
export function decodeReplay(param: string | null | undefined): ReplayPayload | null {
    if (!param) return null;
    const json = base64UrlToUtf8(param);
    if (json === null) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    return parseReplay(raw);
}

/* ------------------------------------------------------------------ 세션으로 */

/** 리플레이를 열 세션 설정. 규칙은 종목 기본값(3쿠션 UMB / 4구 기본), 기록 없음은 페이지가 record:false 로 준다. */
export function toReplayConfig(p: ReplayPayload): SimSetupConfig {
    return buildConfig({
        gameType: p.gameType, tableId: p.table, target: REPLAY_TARGET,
        cushionModel: p.cushionModel, condition: p.condition,
    });
}

export interface SoloReplay {
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
    /** true 면 재생 해시를 원본과 비교할 수 있다. 큐볼을 바꿔치기했으면(아래) false. */
    readonly verifiable: boolean;
}

/**
 * 1인 연습 세션의 큐볼은 항상 흰 공이다(createSession). 원본이 노란 공 샷이면 흰↔노란 id 를 맞바꿔 같은 물리로
 * 재생한다 — 이벤트의 id 가 달라져 해시는 비교할 수 없다(verifiable=false). 페이지가 만드는 링크는 늘 흰 공이라
 * 손으로 만든 링크에서만 이 경로를 탄다.
 */
export function forSoloSession(p: ReplayPayload): SoloReplay {
    if (p.input.cueBallId === "white") return { balls: p.balls, input: p.input, verifiable: true };
    const swap = (id: string): string => (id === "white" ? "yellow" : id === "yellow" ? "white" : id);
    return {
        balls: p.balls.map((b) => ({ ...b, id: swap(b.id) })),
        input: { ...p.input, cueBallId: "white" },
        verifiable: false,
    };
}

/* ------------------------------------------------------------------ URL */

/** 쿼리 문자열(`?a=b` 또는 `a=b`)에서 replay 값. 없으면 null. */
export function readReplayParam(search: string | null | undefined): string | null {
    if (!search) return null;
    try {
        const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(REPLAY_PARAM);
        return v && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}

export function replayPath(param: string, base: string = REPLAY_BASE_PATH): string {
    return `${base}?${REPLAY_PARAM}=${param}`;
}

/**
 * 링크 오리진. https 위의 실제 배포(프로덕션·프리뷰)면 그 오리진, 개발 서버(localhost)·네이티브(capacitor://)면 SITE_ORIGIN.
 * loc 는 테스트 주입용(기본 globalThis.location).
 */
export function currentOrigin(loc?: { readonly origin?: string; readonly hostname?: string } | null): string {
    const l = loc === undefined ? (typeof location !== "undefined" ? location : null) : loc;
    const origin = l?.origin ?? "";
    const host = l?.hostname ?? "";
    if (/^https:\/\//.test(origin) && host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(host)) return origin;
    return SITE_ORIGIN;
}

export function replayUrl(param: string, origin: string = currentOrigin()): string {
    return `${origin}${replayPath(param)}`;
}
