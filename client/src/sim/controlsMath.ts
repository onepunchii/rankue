/**
 * 조작 패널의 순수 수학: 두께 단계 활성 판정, 세기 표시·미세 조절, 당점 패드 좌표 변환, 큐 당김 표시.
 * React·DOM 무관, 테스트 동반. 클램프는 simReducer 의 것을 그대로 써서 훅과 어긋나지 않는다.
 */
import type { BallState } from "@shared/sim/types";
import type { GameType } from "@shared/sim/rules/types";
import { thicknessFor } from "./aim";
import { clampPower, clampSpin, objectTargetFor, V0_MAX, V0_MIN } from "./simReducer";

/* ------------------------------------------------------------------ 두께 */

/** 화면에 내는 두께 단계: 정면 · ½ · ⅓ · ¼ · ⅛ (aim.THICKNESS_STEPS 의 부분집합). */
export const THICKNESS_UI_STEPS = [1, 0.5, 0.333, 0.25, 0.125] as const;
export type ThicknessStep = (typeof THICKNESS_UI_STEPS)[number];

const STEP_TEXT: Readonly<Record<ThicknessStep, string>> = { 1: "", 0.5: "½", 0.333: "⅓", 0.25: "¼", 0.125: "⅛" };

/** 단계 라벨. 정면은 i18n(`sim.aim.fullBall`)이라 fullLabel 로 받는다. */
export function thicknessStepLabel(step: ThicknessStep, fullLabel: string): string {
    return step === 1 ? fullLabel : STEP_TEXT[step];
}

/** 어느 단계에 가까우면 그 단계로 본다(overlay/paths.thicknessLabel 과 같은 폭). */
export const STEP_TOLERANCE = 0.035;

export interface ActiveThickness {
    readonly thickness: number;
    readonly side: "left" | "right" | "center";
    /** 허용 오차 안의 단계. 없으면 null. */
    readonly step: ThicknessStep | null;
}

/** 현재 조준(phi)이 가장 가까운 적구에 대해 어떤 두께인지. 적구가 없거나 광선이 빗나가면 null. */
export function activeThickness(
    balls: readonly BallState[], cueBallId: string, gameType: GameType, phi: number, R: number,
): ActiveThickness | null {
    const cue = balls.find((b) => b.id === cueBallId);
    const target = objectTargetFor(balls, cueBallId, gameType);
    if (!cue || !target) return null;
    const th = thicknessFor([cue.r[0], cue.r[1]], phi, [target.r[0], target.r[1]], R);
    if (th.thickness <= 0) return null;
    return { thickness: th.thickness, side: th.side, step: nearestStep(th.thickness) };
}

export function nearestStep(thickness: number, tolerance = STEP_TOLERANCE): ThicknessStep | null {
    for (const s of THICKNESS_UI_STEPS) if (Math.abs(thickness - s) <= tolerance) return s;
    return null;
}

/** 미세 조절 한 눈금 (0.1°). */
export const FINE_STEP_RAD = (0.1 * Math.PI) / 180;

/* ------------------------------------------------------------------ 세기 */

export const POWER_FINE_STEP = 0.05;

/** 세기 % — 상한 9 m/s 기준. 2.5 m/s → 28 %. */
export function powerPercent(V0: number): number {
    return Math.round((clampPower(V0) / V0_MAX) * 100);
}

/** m/s 표시: 소수 둘째 자리까지, 뒤 0 은 뗀다(2.5, 2.55). */
export function formatSpeed(V0: number): string {
    const v = Math.round(clampPower(V0) * 100) / 100;
    return v.toFixed(2).replace(/\.?0+$/, "");
}

/** "2.5 m/s · 28%" */
export function formatPower(V0: number): string {
    return `${formatSpeed(V0)} m/s · ${powerPercent(V0)}%`;
}

/** ±0.05 m/s 눈금으로 옮기고 격자에 맞춘다(부동소수 찌꺼기 없이). */
export function stepPower(V0: number, dir: -1 | 1): number {
    const n = Math.round(clampPower(V0) / POWER_FINE_STEP) + dir;
    return clampPower(Math.round(n * POWER_FINE_STEP * 100) / 100);
}

/** 슬라이더 값(0..1) ↔ m/s. */
export function powerFromSlider(x: number): number {
    return clampPower(V0_MIN + Math.max(0, Math.min(1, x)) * (V0_MAX - V0_MIN));
}

/** 렌더러 cue.pullback(0..1): 세기에 비례해 큐를 뒤로 당긴 모습. */
export function pullbackFor(V0: number): number {
    return (clampPower(V0) - V0_MIN) / (V0_MAX - V0_MIN);
}

/* ------------------------------------------------------------------ 당점 */

/**
 * 패드 중심 기준 포인터 오프셋(px, 화면 y 아래 양수) → (a, b) R 비율. 패드의 공 반지름 radiusPx 가 1R.
 * 0.5R(미스큐 링) 밖은 simReducer.clampSpin 과 같은 방식으로 링 위까지 당긴다.
 */
export function spinFromPad(dx: number, dy: number, radiusPx: number): { a: number; b: number } {
    if (!(radiusPx > 0)) return { a: 0, b: 0 };
    // -0 이 새지 않게(dy = 0 → b = 0)
    return clampSpin(dx === 0 ? 0 : dx / radiusPx, dy === 0 ? 0 : -dy / radiusPx);
}

/** (a, b) → 패드 중심 기준 px 오프셋. */
export function padOffsetFor(a: number, b: number, radiusPx: number): { x: number; y: number } {
    return { x: a * radiusPx, y: -b * radiusPx };
}

/** 당점 라벨 "a +0.20 · b −0.10". 0 은 부호 없이. */
export function formatSpin(a: number, b: number): string {
    const f = (v: number) => {
        const r = Math.round(v * 100) / 100;
        if (r === 0) return "0.00";
        return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}`;
    };
    return `a ${f(a)} · b ${f(b)}`;
}
