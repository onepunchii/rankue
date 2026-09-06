/**
 * 조준 수학. 순수 함수, 렌더러·React 무관. 물리 엔진의 결정론 규칙은 여기 적용되지 않는다(입력을 만드는 쪽이지
 * 결과를 만드는 쪽이 아니다) — Math.* 를 자유롭게 쓴다.
 *
 * 규약: 좌표 m, x 짧은 변, y 긴 변. phi 는 +x 축 기준 반시계(rad). 두께(thickness) 1 = 정면, 0.5 = 반두께, 0 = 스침.
 */
import type { BallState } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";

export type XY = readonly [number, number];

export const TWO_PI = Math.PI * 2;

export function normalizeAngle(phi: number): number {
    let a = phi % TWO_PI;
    if (a < 0) a += TWO_PI;
    return a;
}

export function angleBetween(from: XY, to: XY): number {
    return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

/** 포인터 위치로 조준: 큐볼에서 포인터를 향하는 방향. */
export function phiFromPointer(cue: XY, pointer: XY): number {
    return normalizeAngle(angleBetween(cue, pointer));
}

/**
 * 드래그로 회전: 이전 포인터 → 현재 포인터의 각 변화량을 phi 에 더한다.
 * 큐볼에서 멀수록 같은 픽셀 이동이 작은 각이 되어 자연히 정밀해진다.
 */
export function phiFromDrag(cue: XY, prev: XY, next: XY, phi: number): number {
    const d = angleBetween(cue, next) - angleBetween(cue, prev);
    let dd = d;
    if (dd > Math.PI) dd -= TWO_PI;
    if (dd < -Math.PI) dd += TWO_PI;
    return normalizeAngle(phi + dd);
}

/**
 * 직선 광선(phi 방향)이 공 target 과 만나는 큐볼 중심 이동 거리 s (m). 안 만나면 null.
 * |cue + s·d − target| = 2R 의 최소 양근.
 */
export function rayBallDistance(cue: XY, phi: number, target: XY, R: number): number | null {
    const dx = Math.cos(phi), dy = Math.sin(phi);
    const fx = cue[0] - target[0], fy = cue[1] - target[1];
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - 4 * R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const s1 = (-b - sq) / 2;
    const s2 = (-b + sq) / 2;
    if (s1 > 1e-9) return s1;
    if (s2 > 1e-9) return s2;
    return null;
}

/** 광선이 쿠션 코 라인(공 중심 기준 R 안쪽)에 닿는 거리와 면. */
export function rayCushionDistance(cue: XY, phi: number, table: TableSpec): { s: number; cushion: "left" | "right" | "bottom" | "top" } | null {
    const R = table.ball.R;
    const dx = Math.cos(phi), dy = Math.sin(phi);
    let best: { s: number; cushion: "left" | "right" | "bottom" | "top" } | null = null;
    const consider = (s: number, cushion: "left" | "right" | "bottom" | "top") => {
        if (s > 1e-9 && (!best || s < best.s)) best = { s, cushion };
    };
    if (dx < 0) consider((R - cue[0]) / dx, "left");
    if (dx > 0) consider((table.width - R - cue[0]) / dx, "right");
    if (dy < 0) consider((R - cue[1]) / dy, "bottom");
    if (dy > 0) consider((table.length - R - cue[1]) / dy, "top");
    return best;
}

export type FirstContact =
    | { kind: "ball"; id: string; s: number; ghost: XY; thickness: number; side: "left" | "right" | "center" }
    | { kind: "cushion"; cushion: "left" | "right" | "bottom" | "top"; s: number; ghost: XY };

/** 직선 조준선의 첫 접촉(빠른 조준 안내용). 정확한 예측은 simulateShot 이 맡는다. */
export function firstContact(cueBall: BallState, balls: readonly BallState[], phi: number, table: TableSpec): FirstContact | null {
    const R = table.ball.R;
    const cue: XY = [cueBall.r[0], cueBall.r[1]];
    let best: FirstContact | null = null;
    for (const b of balls) {
        if (b.id === cueBall.id) continue;
        const s = rayBallDistance(cue, phi, [b.r[0], b.r[1]], R);
        if (s === null) continue;
        if (!best || s < best.s) {
            const ghost: XY = [cue[0] + Math.cos(phi) * s, cue[1] + Math.sin(phi) * s];
            const th = thicknessFor(cue, phi, [b.r[0], b.r[1]], R);
            best = { kind: "ball", id: b.id, s, ghost, thickness: th.thickness, side: th.side };
        }
    }
    const c = rayCushionDistance(cue, phi, table);
    if (c && (!best || c.s < best.s)) {
        best = { kind: "cushion", cushion: c.cushion, s: c.s, ghost: [cue[0] + Math.cos(phi) * c.s, cue[1] + Math.sin(phi) * c.s] };
    }
    return best;
}

/**
 * 두께: 조준선과 적구 중심의 수직 거리 p 로 정의. thickness = 1 − p/(2R) ∈ [0,1].
 * side: 적구 중심이 조준선의 왼쪽(진행 방향 기준)이면 "left" — 큐볼이 적구의 오른쪽을 맞힌다는 뜻.
 */
export function thicknessFor(cue: XY, phi: number, target: XY, R: number): { thickness: number; side: "left" | "right" | "center"; cutAngle: number } {
    const dx = Math.cos(phi), dy = Math.sin(phi);
    const tx = target[0] - cue[0], ty = target[1] - cue[1];
    const cross = dx * ty - dy * tx; // 양수면 적구가 왼쪽
    const p = Math.abs(cross);
    const thickness = Math.max(0, Math.min(1, 1 - p / (2 * R)));
    const ratio = Math.min(1, p / (2 * R));
    return {
        thickness,
        side: p < 1e-9 ? "center" : cross > 0 ? "left" : "right",
        cutAngle: Math.asin(ratio),
    };
}

/**
 * 원하는 두께로 phi 계산. side 는 적구 중심이 조준선의 어느 쪽에 오게 할지("left" = 적구의 오른쪽을 맞힘).
 * p = (1 − thickness)·2R, δ = asin(p / dist). 적구가 2R 보다 가까우면 중심선 그대로.
 */
export function phiForThickness(cue: XY, target: XY, thickness: number, side: "left" | "right", R: number): number {
    const base = angleBetween(cue, target);
    const dist = Math.hypot(target[0] - cue[0], target[1] - cue[1]);
    const p = Math.max(0, Math.min(1, 1 - thickness)) * 2 * R;
    if (dist <= 1e-9 || p >= dist) return normalizeAngle(base);
    const delta = Math.asin(p / dist);
    // 적구가 왼쪽에 오려면 조준선을 오른쪽(시계)으로 돌린다
    return normalizeAngle(side === "left" ? base - delta : base + delta);
}

/** 두께 단계. 캐롬 선수가 말하는 ½·⅓·¼·⅛ 두께와 정면. */
export const THICKNESS_STEPS = [1, 0.75, 0.5, 0.333, 0.25, 0.125] as const;

/** 가장 가까운 적구(큐볼 제외, 옵션으로 상대 큐볼 제외). */
export function nearestObjectBall(cueBall: BallState, balls: readonly BallState[], exclude: readonly string[] = []): BallState | null {
    let best: BallState | null = null;
    let bestD = Infinity;
    for (const b of balls) {
        if (b.id === cueBall.id || exclude.includes(b.id)) continue;
        const d = Math.hypot(b.r[0] - cueBall.r[0], b.r[1] - cueBall.r[1]);
        if (d < bestD) { bestD = d; best = b; }
    }
    return best;
}

/** 다이아몬드 위치(레일 위 표시용). 긴 변 8칸, 짧은 변 4칸. 코너 제외. */
export function diamondMarks(table: TableSpec): readonly { x: number; y: number; rail: "left" | "right" | "bottom" | "top"; index: number }[] {
    const out: { x: number; y: number; rail: "left" | "right" | "bottom" | "top"; index: number }[] = [];
    for (let i = 1; i < 8; i++) {
        const y = (table.length * i) / 8;
        out.push({ x: 0, y, rail: "left", index: i });
        out.push({ x: table.width, y, rail: "right", index: i });
    }
    for (let i = 1; i < 4; i++) {
        const x = (table.width * i) / 4;
        out.push({ x, y: 0, rail: "bottom", index: i });
        out.push({ x, y: table.length, rail: "top", index: i });
    }
    return out;
}
