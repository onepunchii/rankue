/**
 * 테이블 위 포인터 제스처의 순수 상태 기계. 페이지가 pointerdown/move/up 에서 부르고, 여기서는 좌표(테이블 m)만
 * 다룬다 — DOM·React 없음, 테스트 동반.
 *
 *  - aim:   조준 드래그. 큐볼 중심 기준 각 변화량을 phi 에 더한다(aim.phiFromDrag — 멀수록 정밀).
 *  - place: 연습 모드에서 공을 눌러 끌어 옮긴다. 잡은 지점의 오프셋을 유지해 공이 손가락 아래로 튀지 않게 한다.
 *  - hold:  재생 중 길게 누르기(4× 빨리감기). 타이머는 페이지가 돈다.
 * 화면 좌표는 y 가 뒤집혀 있으므로 반드시 테이블 좌표로 unproject 한 뒤 넘긴다(각 부호가 맞는다).
 */
import type { BallState } from "@shared/sim/types";
import { phiFromDrag, type XY } from "./aim";
import type { Phase } from "./simReducer";

export type Gesture =
    | { readonly kind: "aim"; readonly cue: XY; readonly prev: XY; readonly moved: boolean }
    | { readonly kind: "place"; readonly id: string; readonly grab: XY; readonly moved: boolean }
    | { readonly kind: "hold" };

export interface GestureEnv {
    readonly phase: Phase;
    /** 연습 모드 + aim: 공을 끌어 옮길 수 있다. */
    readonly canPlace: boolean;
    readonly balls: readonly BallState[];
    readonly cueBallId: string;
    /** 공 반지름 (m) */
    readonly R: number;
}

/** 손가락으로 잡기 쉽게 공 반지름의 배수만큼 넉넉히 잡는다. */
export const HIT_SLOP = 1.8;

/** 점(테이블 m)에 가장 가까운 공. slop·R 안에 없으면 null. */
export function hitBall(balls: readonly BallState[], p: XY, R: number, slop = HIT_SLOP): BallState | null {
    let best: BallState | null = null;
    let bestD = Infinity;
    const limit = R * slop;
    for (const b of balls) {
        const dx = b.r[0] - p[0], dy = b.r[1] - p[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= limit && d < bestD) { bestD = d; best = b; }
    }
    return best;
}

/** pointerdown. 시작할 제스처가 없으면 null(setup·finished 에서 테이블은 반응하지 않는다). */
export function beginGesture(env: GestureEnv, p: XY): Gesture | null {
    if (env.phase === "shooting") return { kind: "hold" };
    if (env.phase !== "aim") return null;
    if (env.canPlace) {
        const hit = hitBall(env.balls, p, env.R);
        if (hit) return { kind: "place", id: hit.id, grab: [p[0] - hit.r[0], p[1] - hit.r[1]], moved: false };
    }
    const cue = env.balls.find((b) => b.id === env.cueBallId);
    if (!cue) return null;
    return { kind: "aim", cue: [cue.r[0], cue.r[1]], prev: p, moved: false };
}

export interface GestureMove {
    readonly gesture: Gesture;
    /** aim 드래그면 새 phi */
    readonly phi?: number;
    /** place 드래그면 공의 새 중심 */
    readonly place?: { readonly id: string; readonly x: number; readonly y: number };
}

/** pointermove. 큐볼 중심을 정확히 누른 상태(각을 정의할 수 없음)에서는 phi 를 바꾸지 않는다. */
export function moveGesture(g: Gesture, p: XY, phi: number): GestureMove {
    if (g.kind === "hold") return { gesture: g };
    if (g.kind === "place") {
        return { gesture: { ...g, moved: true }, place: { id: g.id, x: p[0] - g.grab[0], y: p[1] - g.grab[1] } };
    }
    const dPrev = Math.hypot(g.prev[0] - g.cue[0], g.prev[1] - g.cue[1]);
    const dNext = Math.hypot(p[0] - g.cue[0], p[1] - g.cue[1]);
    const next: Gesture = { ...g, prev: p, moved: true };
    if (dPrev < 1e-6 || dNext < 1e-6) return { gesture: next };
    return { gesture: next, phi: phiFromDrag(g.cue, g.prev, p, phi) };
}
