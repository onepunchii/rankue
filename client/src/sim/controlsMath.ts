/**
 * 조작 패널의 순수 수학: 두께 단계 활성 판정, 세기 표시·미세 조절, 당점 패드 좌표 변환, 큐 당김 표시.
 * React·DOM 무관, 테스트 동반. 클램프는 simReducer 의 것을 그대로 써서 훅과 어긋나지 않는다.
 */
import type { BallState } from "@shared/sim/types";
import type { GameType } from "@shared/sim/rules/types";
import { thicknessFor } from "./aim";
import { DEFAULT_CUE } from "@shared/sim/params";
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

/** 슬라이더·± 눈금 단위(%) — 화면은 세기를 % 로만 읽어 준다(2026-09-07 오너). */
export const POWER_PERCENT_STEP = 1;
/** @deprecated 옛 이름(슬라이더가 m/s 로 움직이던 시절). 퍼센트 눈금은 POWER_PERCENT_STEP. */
export const POWER_FINE_STEP = POWER_PERCENT_STEP;

/**
 * 세기 눈금의 휨 정도(2026-09-12). 퍼센트 → 속도가 x^GAMMA 라 낮은 쪽이 촘촘해진다.
 *
 * 왜: 3쿠션에서 실제로 쓰는 세기는 공 1.5~4 m/s(큐 1.2~3.2 m/s)에 몰려 있다. 선형 눈금에서는 그 구간이
 * 전체의 15~48 % 밖에 안 돼 한 칸(1 %)이 너무 굵었고, 위쪽 절반은 거의 쓰지 않는 세기였다.
 * 1.6 으로 시작했다가 오너가 쳐 보고 "살짝 약하다" 해서 1.45 로 폈다 — 아래쪽 촘촘함은 남기고 중간이 덜 눌린다
 * (50 % 에서 공 2.9 → 3.6 m/s).
 */
export const POWER_GAMMA = 1.45;

/** 세기 %(0~100) → 큐 속도(m/s). 0 % = V0_MIN, 100 % = V0_MAX. */
export function powerFromPercent(pct: number): number {
    const x = Math.max(0, Math.min(1, (Number.isFinite(pct) ? pct : 0) / 100));
    return clampPower(V0_MIN + (V0_MAX - V0_MIN) * Math.pow(x, POWER_GAMMA));
}

/** 큐 속도 → 세기 %(반올림). powerFromPercent 의 역함수 — V0_MAX 를 넘는 옛 값은 100 %. */
export function powerPercent(V0: number): number {
    const r = (clampPower(V0) - V0_MIN) / (V0_MAX - V0_MIN);
    if (r <= 0) return 0;
    if (r >= 1) return 100;
    return Math.round(100 * Math.pow(r, 1 / POWER_GAMMA));
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

/** ±1 % 눈금으로 옮긴다 — 퍼센트 격자 위에서 세므로 눌렀다 되돌리면 제자리다. */
export function stepPower(V0: number, dir: -1 | 1): number {
    return powerFromPercent(powerPercent(V0) + dir);
}

/** 슬라이더 값(0..1) → m/s. 퍼센트와 같은 휜 눈금을 쓴다. */
export function powerFromSlider(x: number): number {
    return powerFromPercent(Math.max(0, Math.min(1, x)) * 100);
}

/** 렌더러 cue.pullback(0..1): 화면에 보이는 세기(%)에 맞춰 큐를 당긴다 — 눈금이 휘어도 손맛이 따라간다. */
export function pullbackFor(V0: number): number {
    return powerPercent(V0) / 100;
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

/**
 * 당점 읽기(퍼센트, 100 % = 미스큐 링 maxOffset·R): "우 40% · 상 20%", 중앙이면 `sim.controls.spinCenter`.
 * 해법 시트(SolverSheet.spinText)와 같은 눈금이라 적용한 해법이 당점 시트에서 같은 숫자로 읽힌다. +a = 우, +b = 상.
 */
export function spinReadout(a: number, b: number, t: (key: string) => string, maxOffset: number = DEFAULT_CUE.maxOffset): string {
    const pct = (v: number) => String(Math.round((Math.abs(v) / maxOffset) * 100));
    const parts: string[] = [];
    if (Math.abs(a) >= 0.005) parts.push(t(a > 0 ? "sim.spin.right" : "sim.spin.left").replace("{n}", pct(a)));
    if (Math.abs(b) >= 0.005) parts.push(t(b > 0 ? "sim.spin.top" : "sim.spin.bottom").replace("{n}", pct(b)));
    return parts.length ? parts.join(" · ") : t("sim.controls.spinCenter");
}

/** 큐 각 단계(도). 당점 시트의 단계 칩·원호 드래그가 이 값에 스냅한다: 0 · 10 · 20 · 30 · 45 */
export const ELEVATION_STEPS_DEG = [0, 10, 20, 30, 45] as const;
/** 화면에서 고를 수 있는 큐 각 상한(도). 엔진 상한(simReducer.THETA_MAX 60°)보다 낮다 — 그 위는 점프 영역이라 화면에서 막는다. */
export const ELEVATION_MAX_DEG = 45;

/** 임의의 각(도)을 가장 가까운 단계로. 범위 밖은 양 끝 단계. */
export function snapElevationDeg(deg: number): number {
    if (!Number.isFinite(deg)) return ELEVATION_STEPS_DEG[0];
    let best: number = ELEVATION_STEPS_DEG[0];
    let bestD = Infinity;
    for (const d of ELEVATION_STEPS_DEG) {
        const x = Math.abs(d - deg);
        if (x < bestD) { bestD = x; best = d; }
    }
    return best;
}

/** 원호 위 포인터(피벗 기준 dx 오른쪽 +, dy 아래 +) → 큐 각(도, 0..ELEVATION_MAX_DEG). 피벗 왼쪽·아래는 0. */
export function elevationFromArc(dx: number, dy: number): number {
    if (dx <= 0 && -dy <= 0) return 0;
    const deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    return Math.max(0, Math.min(ELEVATION_MAX_DEG, deg));
}

export function elevationDeg(thetaRad: number): number {
    return Math.round((thetaRad * 180) / Math.PI);
}

export function nextElevationRad(thetaRad: number): number {
    const deg = elevationDeg(thetaRad);
    const i = ELEVATION_STEPS_DEG.findIndex((d) => d >= deg);
    const next = i < 0 || i === ELEVATION_STEPS_DEG.length - 1 ? ELEVATION_STEPS_DEG[0] : ELEVATION_STEPS_DEG[i + (ELEVATION_STEPS_DEG[i] === deg ? 1 : 0)];
    return (next * Math.PI) / 180;
}

/**
 * 당점 프리셋: **세로를 정확히 그 값으로** 두고, 옆당점만 미스큐 링 안으로 줄인다(2026-09-17 오너 제보).
 *
 * 왜 필요한가: clampSpin 은 링을 넘으면 a·b 를 **함께** 비례로 줄인다. 그래서 옆당점을 크게 준 뒤 아래 당점을
 * 누르면 b 가 -0.3 이 아니라 -0.26 쯤에 앉았고, 칩도 안 켜졌다 — 누른 대로 안 되는 것처럼 보였다.
 * 방금 누른 쪽이 이겨야 한다: b 는 그대로 두고 남는 폭(√(max² − b²))만큼만 a 를 허용한다.
 * 부호는 지킨다 — 우측 당점을 준 사람이 아래를 눌렀다고 좌측으로 넘어가면 안 된다.
 */
export function spinWithVertical(a: number, b: number, maxOffset: number = DEFAULT_CUE.maxOffset): { a: number; b: number } {
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    const max = Math.max(0, maxOffset - 1e-9);
    const vb = Math.max(-max, Math.min(max, b));
    const room = Math.sqrt(Math.max(0, max * max - vb * vb));
    return { a: Math.max(-room, Math.min(room, a)), b: vb };
}
