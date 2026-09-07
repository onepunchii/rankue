/**
 * 시뮬레이터 페이지의 설정 전달 규약. `/online-game?cfg=<base64url JSON>` 한 줄로 대시보드(QuickActions)에서
 * 세션 설정을 넘긴다. JSON 은 SimSetupDialog 가 만드는 SimSetupConfig 에 `record`(기록 여부)를 더한 것.
 *
 * 순수 함수만 — URL·DOM 은 페이지가 읽어서 넘긴다. 디코딩은 신뢰하지 않는 입력이므로 필드마다 검사하고,
 * 마지막에 buildConfig 로 다시 정규화해 서버 400 을 막는다(범위 밖 값은 경계로, 모르는 필드는 버린다).
 */
import type { CushionModelId } from "@shared/sim/params";
import type { FinishType } from "@shared/sim/rules";
import { buildConfig, isValidTarget, type SimMode, type SimSetupConfig, type TableId } from "./setupPresets";

export interface PageConfig {
    readonly config: SimSetupConfig;
    /** false = 연습(서버 기록 없음, 되돌리기·배치 허용). 생략 시 true. */
    readonly record: boolean;
}

export const CFG_PARAM = "cfg";

const TABLE_IDS: readonly TableId[] = ["DAEDAE", "JUNGDAE_KR"];
const CUSHION_MODELS: readonly CushionModelId[] = ["han2005", "sphereHalfSpace", "mathavan2010"];
const FINISH_TYPES: readonly FinishType[] = ["none", "3c", "bank"];

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

export function encodePageConfig(pc: PageConfig): string {
    return utf8ToBase64Url(JSON.stringify({ ...pc.config, record: pc.record }));
}

/** `?cfg=` 값 하나로 페이지 URL 을 만든다. */
export function simulatorPath(pc: PageConfig, base = "/online-game"): string {
    return `${base}?${CFG_PARAM}=${encodePageConfig(pc)}`;
}

/** 쿼리 문자열(`?a=b` 또는 `a=b`)에서 cfg 값. 없으면 null. */
export function readCfgParam(search: string | null | undefined): string | null {
    if (!search) return null;
    try {
        const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(CFG_PARAM);
        return v && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 디코딩된 JSON(신뢰 불가) → PageConfig. 종목·규칙이 맞지 않거나 다마수가 범위 밖이면 null. */
export function parsePageConfig(raw: unknown): PageConfig | null {
    if (!isRecord(raw)) return null;
    const gameType = raw.gameType;
    if (gameType !== "3c" && gameType !== "4c") return null;
    if (!isValidTarget(raw.target)) return null;

    const tableId = TABLE_IDS.includes(raw.tableId as TableId) ? (raw.tableId as TableId) : undefined;
    const cushionModel = CUSHION_MODELS.includes(raw.cushionModel as CushionModelId) ? (raw.cushionModel as CushionModelId) : undefined;
    const condition = typeof raw.condition === "number" && Number.isFinite(raw.condition) ? raw.condition : undefined;
    const inningCap = typeof raw.inningCap === "number" && Number.isFinite(raw.inningCap) ? raw.inningCap : undefined;
    const finishType = FINISH_TYPES.includes(raw.finishType as FinishType) ? (raw.finishType as FinishType) : "none";
    // 플레이 모드(조준 보정). 모르는 값은 일반. 모드 프리셋보다 명시한 쿠션 모델·컨디션이 우선(buildConfig 규약).
    const mode: SimMode = raw.mode === "reality" ? "reality" : "normal";

    const rules = isRecord(raw.rules) ? raw.rules : {};
    // 규칙 객체가 있으면 종목과 맞아야 한다(3쿠션 설정에 4구 규칙이 실려 오면 거부).
    if ("gameType" in rules && rules.gameType !== gameType) return null;

    const built = buildConfig({
        gameType, tableId, target: raw.target, inningCap, cushionModel, condition, mode,
        rules: gameType === "3c"
            ? { ruleSet: rules.ruleSet === "pba" ? "pba" : "umb" }
            : {
                threeCushionDouble: rules.threeCushionDouble === true,
                passiveOpponentContactIsFoul: rules.passiveOpponentContactIsFoul === true,
            },
    });
    return { config: { ...built, finishType }, record: raw.record !== false };
}

/** `cfg` 파라미터 값 → PageConfig. 깨진 base64·JSON·내용은 전부 null(페이지가 설정 창을 연다). */
export function decodePageConfig(param: string | null | undefined): PageConfig | null {
    if (!param) return null;
    const json = base64UrlToUtf8(param);
    if (json === null) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    return parsePageConfig(raw);
}
