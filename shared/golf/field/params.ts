/**
 * 물리 상수(세션 조사 §1·3·6·7 — 문헌 구조 + 격자 피팅, TrackMan 14클럽 캐리 ±3.3 %).
 * 바꾸면 version.ts 의 FIELD_ENGINE_VERSION 을 올린다.
 */
import type { Surface } from "./types.js";

export const DT = 1 / 120;
export const G = 9.81;
export const BALL_M = 0.04593;           // kg
export const BALL_R = 0.02135;           // m
export const BALL_I = 0.4 * BALL_M * BALL_R * BALL_R;
/** ½ρA/M (해면 15 °C). 공기밀도가 바뀌면 이것만 바뀐다 */
export const K_AERO = 0.01910;
/** 스핀 감쇠 스텝당 상수 = exp(−0.04·DT) — 4 %/s. 런타임 exp 없음 */
export const K_SPIN = 0.99966672;
export const RPM_TO_RAD = 0.10471975511965977;   // 2π/60
export const DEG = 0.017453292519943295;         // π/180

/** 항력·양력 계수(스핀비 S = Rω/V 의 함수) */
export function cdOf(S: number, V: number): number {
    const lowF = Math.min(1, Math.max(0, (32 - V) / 32));
    const hiF = Math.min(1, Math.max(0, (V - 52) / 30));
    // 스핀 항은 S ≈ 0.40 에서 평탄(Bearman & Harvey 1976) — 웨지처럼 스핀비가 큰 공의 항력이 과해지지 않게
    return 0.25 + 0.20 * Math.min(S, 0.40) + 0.07 * lowF - 0.10 * hiF;
}
export function clOf(S: number): number {
    return Math.min(0.31, 0.06 + 1.10 * S);
}

/** 바람 높이 프로파일 f(h) — 개활지 α 0.14 지수식을 표로(pow 회피) */
export const WIND_PROFILE_H: readonly number[] = [0.5, 1, 2, 5, 10, 20, 30, 40];
export const WIND_PROFILE_F: readonly number[] = [0.66, 0.72, 0.80, 0.91, 1.00, 1.10, 1.17, 1.21];
export const GUST_AMPLITUDE = 0.15;
export const GUST_PERIOD_S = 6;

/** 컵 */
export const CUP_RH = 0.054;             // 컵 반지름(지름 108 mm)
export const CUP_CAPTURE_K = 15.16;      // √(g/2R)
export const LIP_E = 0.3;
export const LIP_DAMP = 0.8;

/** 구름 공기항력 계수 = K_AERO·0.24 */
export const ROLL_AIR_K = 0.0046;
export const ROLL_STOP_SPEED = 0.02;
/** 되튐이 이보다 작으면 구름으로 */
export const BOUNCE_TO_ROLL_VN = 0.8;
export const MAX_AIR_STEPS = 120 * 15;
export const MAX_ROLL_STEPS = 120 * 40;

export interface SurfaceParams {
    readonly eScale: number;   // COR 배율
    readonly mu: number;       // 접선 마찰
    readonly kc: number;       // Penner 유효경사 °/(m/s)
    readonly aRoll: number;    // 구름 감속 m/s² (그린은 스팀프로 덮어쓴다)
}
export const SURFACE: Readonly<Record<Surface, SurfaceParams>> = {
    tee: { eScale: 1.0, mu: 0.40, kc: 0.45, aRoll: 4.0 },
    fairway: { eScale: 1.0, mu: 0.40, kc: 0.45, aRoll: 4.0 },
    fringe: { eScale: 0.9, mu: 0.45, kc: 0.7, aRoll: 2.0 },
    green: { eScale: 0.85, mu: 0.50, kc: 1.0, aRoll: 0.55 },
    rough: { eScale: 0.6, mu: 0.55, kc: 0.6, aRoll: 8.0 },
    deeprough: { eScale: 0.5, mu: 0.60, kc: 0.8, aRoll: 12.0 },
    bunker: { eScale: 0.3, mu: 0.70, kc: 1.2, aRoll: 15.0 },
    water: { eScale: 0, mu: 1, kc: 0, aRoll: 100 },
    ob: { eScale: 1.0, mu: 0.40, kc: 0.45, aRoll: 4.0 },
};
/** 스팀프(ft) → 그린 감속 m/s² (스팀프미터 출구 1.83 m/s) */
export function greenRollDecel(stimpFt: number): number {
    return 5.49 / Math.max(6, Math.min(15, stimpFt));
}

/** 코스·공기 컨디션(방 옵션). 전부 선택, 기본은 해면 15 °C·보통 단단함·마름 */
export interface Conditions {
    readonly altitudeM?: number;   // 0..3000
    readonly tempC?: number;       // −10..45
    /** 단단함 0.6(부드러움)..1.4(단단함). 1 = 보통. 되튐 배율이고 구름 감속은 역수 */
    readonly firmness?: number;
    /** 젖음 0..1 — 되튐·구름이 죽고 그린이 느려진다 */
    readonly wet?: number;
}
export const NO_CONDITIONS: Conditions = {};

/** 공기 밀도비 ρ/ρ₀(해면 15 °C). 고도는 exp(−h/8435) 를 3차까지(3000 m 에서 오차 0.1 %), 기온은 이상기체 1/T. pow·exp 없음 */
export function airDensityRatio(c: Conditions): number {
    const h = Math.max(0, Math.min(3000, c.altitudeM ?? 0));
    const x = h / 8435;
    const alt = 1 - x + (x * x) / 2 - (x * x * x) / 6;
    const T = Math.max(-10, Math.min(45, c.tempC ?? 15));
    return alt * (288.15 / (273.15 + T));
}

/** 표면 상수에 컨디션 적용 */
export function surfaceParamsFor(base: SurfaceParams, c: Conditions): SurfaceParams {
    const firm = Math.max(0.6, Math.min(1.4, c.firmness ?? 1));
    const wet = Math.max(0, Math.min(1, c.wet ?? 0));
    return {
        eScale: base.eScale * firm * (1 - 0.4 * wet),
        mu: Math.min(1, base.mu * (1 + 0.2 * wet)),
        kc: base.kc,
        aRoll: (base.aRoll / firm) * (1 + 0.8 * wet),
    };
}
/** 젖은 그린은 느리다(스팀프 −15 % 까지) */
export function stimpFor(stimpFt: number, c: Conditions): number {
    return stimpFt * (1 - 0.15 * Math.max(0, Math.min(1, c.wet ?? 0)));
}
