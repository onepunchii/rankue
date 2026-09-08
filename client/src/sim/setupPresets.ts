/**
 * 세션 설정 프리셋 — 순수 데이터와 순수 함수만. React·DOM 의존 없음.
 * SimSetupDialog 가 화면을 그리고, useSimulator 가 여기서 만든 SimSetupConfig 로 세션을 연다.
 *
 * 다마수 규약은 점수판 앱과 같다: 3쿠션은 득점 1점 단위, 4구는 10점 단위(pointUnit)라
 * "80다마" 는 목표 80점(= 8 득점). 서버 createSchema(server/routes/modules/sim.ts)와 같은 범위를 쓴다.
 */
import type { CushionModelId, TableSpec } from "@shared/sim/params";
import type { GameType, Rules, ThreeCushionRuleSet } from "@shared/sim/rules/types";
import { DEFAULT_3C_RULES, DEFAULT_4C_RULES, type FinishType } from "@shared/sim/rules";

export type TableId = TableSpec["id"];

/**
 * 플레이 모드(2026-09-07 오너). normal = 일반: 조준 보정(스쿼트 자동) 켜짐, 한 2005, 컨디션 보통.
 * reality = 리얼리티: 조준선이 큐 방향 그대로(보정은 선수 몫), 마타반 2010, 대회 테이블(1.10). 물리값은 세부 설정에서 바꿀 수 있다.
 */
export type SimMode = "normal" | "reality";
export const SIM_MODES: readonly SimMode[] = ["normal", "reality"];

/** 모드가 채우는 물리 기본값. */
export function modePreset(mode: SimMode): { readonly cushionModel: CushionModelId; readonly condition: number } {
    return mode === "reality" ? { cushionModel: "mathavan2010", condition: 1.1 } : { cushionModel: "han2005", condition: 1 };
}

/** 조준 보정(스쿼트 자동 보정): 일반 모드만. */
export function aimAssistFor(mode: SimMode): boolean {
    return mode === "normal";
}

/** 다이얼로그가 onStart 로 내보내는 세션 설정. 서버 POST /sim/sessions 본문과 필드가 같다. */
export interface SimSetupConfig {
    readonly gameType: GameType;
    readonly tableId: TableId;
    /** 목표 점수(다마수). 1~999 */
    readonly target: number;
    readonly rules: Rules;
    readonly finishType: FinishType;
    /** 이닝 상한. 0 = 없음 */
    readonly inningCap: number;
    readonly cushionModel: CushionModelId;
    /** 테이블 컨디션 스칼라. 0.8(느림) ~ 1.2(빠름) */
    readonly condition: number;
    /** 플레이 모드. 화면 조준 보정만 좌우하고 서버 재판정엔 관여하지 않는다(대전은 방장 설정을 둘 다 따른다). */
    readonly mode: SimMode;
    /** 대전 미리보기 범위(대전에서만 뜻이 있다). short = 첫 접촉 + 꺾임 꼬리까지(기본), full = 연습처럼 전체 경로. 방장 설정을 둘 다 따른다. */
    readonly matchPreview: "short" | "full";
}

/** 규칙 빌더 옵션. 종목에 맞지 않는 항목은 무시한다. */
export interface RuleOptions {
    /** 3쿠션: UMB(모든 득점 1점) / PBA(뱅크샷 2점). 기본 umb */
    readonly ruleSet?: ThreeCushionRuleSet;
    /** 4구: 3쿠션 이상 득점 2배. 기본 false */
    readonly threeCushionDouble?: boolean;
    /** 4구: 적구에 밀려 상대 공에 닿아도 파울. 기본 false */
    readonly passiveOpponentContactIsFoul?: boolean;
}

export const TARGET_MIN = 1;
export const TARGET_MAX = 999;

/** 다마수 빠른 선택 칩. 4구는 10점 단위 다마수. */
export const TARGET_CHIPS: Record<GameType, readonly number[]> = {
    "3c": [10, 15, 20, 25, 30],
    "4c": [30, 50, 80, 100, 150],
};

/** 회원 핸디가 없을 때의 다마수 기본값 */
export const TARGET_FALLBACK: Record<GameType, number> = {
    "3c": 15,
    "4c": 80,
};

/** 이닝 제한 선택지. 0 = 없음 */
export const INNING_CAPS: readonly number[] = [0, 10, 15, 20, 30];

/** 고급 설정에 노출하는 쿠션 모델. sphereHalfSpace 는 엔진 내부 비교용이라 화면에 내지 않는다. */
export const CUSHION_MODELS: readonly Extract<CushionModelId, "han2005" | "mathavan2010">[] = ["han2005", "mathavan2010"];

export const CONDITION_MIN = 0.8;
export const CONDITION_MAX = 1.2;
export const CONDITION_STEP = 0.05;
export const CONDITION_DEFAULT = 1.0;

/** 종목별 기본 테이블. 3쿠션은 국제 규격 대대, 4구는 국내 관행 중대. */
export function defaultTableFor(gameType: GameType): TableId {
    return gameType === "3c" ? "DAEDAE" : "JUNGDAE_KR";
}

export function isValidTarget(n: unknown): n is number {
    return typeof n === "number" && Number.isInteger(n) && n >= TARGET_MIN && n <= TARGET_MAX;
}

/** 범위 밖 값은 경계로 당기고, 정수가 아니면 반올림. NaN 은 종목 기본값. */
export function clampTarget(n: number, gameType: GameType): number {
    if (!Number.isFinite(n)) return TARGET_FALLBACK[gameType];
    return Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(n)));
}

/**
 * 다마수 기본값. 회원의 핸디(handi3c/handi4c)가 유효 범위면 그 값, 아니면 종목 폴백.
 * 핸디는 읽기만 한다 — 이 화면은 절대 핸디를 쓰지 않는다(짠다마 방지 설계).
 */
export function defaultTarget(gameType: GameType, handicap?: number | null): number {
    return isValidTarget(handicap) ? handicap : TARGET_FALLBACK[gameType];
}

/** 컨디션 값 → 라벨 단계. 1 ± 0.05 는 보통. */
export type ConditionLabel = "slow" | "normal" | "fast";
export function conditionLabel(condition: number): ConditionLabel {
    if (condition < CONDITION_DEFAULT - CONDITION_STEP / 2) return "slow";
    if (condition > CONDITION_DEFAULT + CONDITION_STEP / 2) return "fast";
    return "normal";
}

/** 슬라이더 값 정리: 범위로 자르고 step 격자에 맞춘 뒤 부동소수 찌꺼기를 없앤다(0.8500000001 방지). */
export function clampCondition(v: number): number {
    if (!Number.isFinite(v)) return CONDITION_DEFAULT;
    const c = Math.min(CONDITION_MAX, Math.max(CONDITION_MIN, v));
    // step 배수로 맞춘 뒤 소수 둘째 자리로 고정 — 0.85 가 0.8500000000000001 로 새는 것을 막는다
    return Math.round(Math.round(c / CONDITION_STEP) * CONDITION_STEP * 100) / 100;
}

/** 종목 + 옵션 → shared/sim/rules 의 Rules. 기본값은 엔진의 DEFAULT_*_RULES 를 그대로 잇는다. */
export function buildRules(gameType: GameType, options: RuleOptions = {}): Rules {
    if (gameType === "3c") {
        const base = DEFAULT_3C_RULES as Extract<Rules, { gameType: "3c" }>;
        return { ...base, ruleSet: options.ruleSet ?? base.ruleSet };
    }
    const base = DEFAULT_4C_RULES as Extract<Rules, { gameType: "4c" }>;
    return {
        ...base,
        threeCushionDouble: options.threeCushionDouble ?? base.threeCushionDouble,
        passiveOpponentContactIsFoul: options.passiveOpponentContactIsFoul ?? base.passiveOpponentContactIsFoul,
    };
}

export interface BuildConfigInput {
    readonly gameType: GameType;
    readonly tableId?: TableId;
    readonly target: number;
    readonly rules?: RuleOptions;
    readonly inningCap?: number;
    readonly cushionModel?: CushionModelId;
    readonly condition?: number;
    /** 기본 normal. 쿠션 모델·컨디션을 주지 않으면 모드 프리셋으로 채운다. */
    readonly mode?: SimMode;
    /** 대전 미리보기. 기본 short. */
    readonly matchPreview?: "short" | "full";
}

/** 폼 상태 → 세션 설정. 범위를 벗어난 값은 여기서 한 번 더 정리해 서버 400 을 막는다. */
export function buildConfig(i: BuildConfigInput): SimSetupConfig {
    const mode: SimMode = i.mode ?? "normal";
    const preset = modePreset(mode);
    return {
        gameType: i.gameType,
        tableId: i.tableId ?? defaultTableFor(i.gameType),
        target: clampTarget(i.target, i.gameType),
        rules: buildRules(i.gameType, i.rules),
        finishType: "none",
        inningCap: INNING_CAPS.includes(i.inningCap ?? 0) ? (i.inningCap ?? 0) : 0,
        cushionModel: i.cushionModel ?? preset.cushionModel,
        condition: clampCondition(i.condition ?? preset.condition),
        mode,
        matchPreview: i.matchPreview === "full" ? "full" : "short",
    };
}
