/**
 * 테이블 위 포인터 제스처의 순수 상태 기계. 페이지가 pointerdown/move/up 에서 부르고, 여기서는 좌표(테이블 m)만
 * 다룬다 — DOM·React 없음, 테스트 동반.
 *
 *  - aim:   조준 드래그. 큐볼 중심 기준 각 변화량을 phi 에 더한다(aim.phiFromDrag — 멀수록 정밀).
 *  - place: 연습 모드에서 공을 눌러 끌어 옮긴다. 잡은 지점의 오프셋을 유지해 공이 손가락 아래로 튀지 않게 한다.
 *  - hold:  재생 중 길게 누르기(4× 빨리감기). 타이머는 페이지가 돈다.
 * 화면 좌표는 y 가 뒤집혀 있으므로 반드시 테이블 좌표로 unproject 한 뒤 넘긴다(각 부호가 맞는다).
 *
 * 아래쪽 "조준 기록 정리"는 제스처 기록이 굳지 않게 하는 판단(2026-09-11 먹통 수정). 페이지는 ref 를 스냅샷으로 넘기고
 * planGestureReset 이 돌려준 계획대로 부수효과(캡처 해제·타이머·속도·줌·표시 상태)만 실행한다.
 */
import type { BallState } from "@shared/sim/types";
import { phiFromDrag, type XY } from "./aim";
import type { Phase } from "./simReducer";
import { ZOOM_MAX, ZOOM_MIN, type RendererView } from "./render/Renderer";

export type Gesture =
    /** dead: 큐볼 중심에서 이 거리(m) 안의 손가락 움직임은 조준을 바꾸지 않는다 — 공 바로 옆에선 몇 픽셀에 수십 도가 돌았다 */
    | { readonly kind: "aim"; readonly cue: XY; readonly prev: XY; readonly moved: boolean; readonly dead?: number }
    /** start·slop: 누른 곳에서 slop(m) 넘게 움직여야 공이 옮겨진다 — 누르기만 해도 손 떨림으로 공이 움직이던 것(2026-09-26 검토) */
    | { readonly kind: "place"; readonly id: string; readonly grab: XY; readonly moved: boolean; readonly start?: XY; readonly slop?: number }
    | { readonly kind: "hold" };

/** 공 옮기기 시작 거리(공 반지름 배수) */
export const PLACE_START_R = 0.8;
/** 조준 드래그를 무시하는 큐볼 둘레(공 반지름 배수) */
export const AIM_DEAD_R = 1.5;

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
        if (hit) return { kind: "place", id: hit.id, grab: [p[0] - hit.r[0], p[1] - hit.r[1]], moved: false, start: p, slop: env.R * PLACE_START_R };
    }
    const cue = env.balls.find((b) => b.id === env.cueBallId);
    if (!cue) return null;
    return { kind: "aim", cue: [cue.r[0], cue.r[1]], prev: p, moved: false, dead: env.R * AIM_DEAD_R };
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
        if (!g.moved && g.start && g.slop && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < g.slop) return { gesture: g };
        return { gesture: { ...g, moved: true }, place: { id: g.id, x: p[0] - g.grab[0], y: p[1] - g.grab[1] } };
    }
    const dPrev = Math.hypot(g.prev[0] - g.cue[0], g.prev[1] - g.cue[1]);
    const dNext = Math.hypot(p[0] - g.cue[0], p[1] - g.cue[1]);
    const next: Gesture = { ...g, prev: p, moved: true };
    const dead = Math.max(1e-6, g.dead ?? 0);
    if (dPrev < dead || dNext < dead) return { gesture: next };
    return { gesture: next, phi: phiFromDrag(g.cue, g.prev, p, phi) };
}

// ── 조준 기록 정리(2026-09-11 먹통 수정) ─────────────────────────────────────
// 예전엔 조준 기록이 "같은 손가락의 pointerup/cancel 이 테이블에 닿을 때"에만 풀렸다. 그 신호 하나가 빠지면(OS 의 복사하기 메뉴가
// 터치를 가로채는 등) 기록이 그 판 내내 남아, 새 터치는 전부 '두 번째 손가락'으로 무시되고 dragging 이 굳어 예측 경로 대신 직선만
// 보였다 — ± 버튼만 먹는 증상. 그래서 정리를 한 곳으로 모으고, 뗌 신호 말고도 여러 길에서 부른다.

/**
 * 조준 기록을 비우는 사유.
 *  - 정상: end(같은 손가락 뗌) · pinch-end · second-finger(top 뷰의 진짜 두 번째 손가락) · phase(샷·차례·나가기) · unmount
 *  - 비정상(현장 계측 대상): lostcapture(추적 중인 손가락의 캡처가 뗌 없이 풀림) · stale-pointerdown(옛 손가락 기록 위에 새 터치) ·
 *    blur/hidden/pagehide 가 제스처 도중에 옴
 * 서버(server/routes/modules/errors.ts 의 SIM_REASONS)는 비정상 사유만 받는다 — 비정상 사유를 늘리면 거기도 늘린다.
 */
export type GestureResetReason =
    | "end" | "pinch-end" | "second-finger" | "phase" | "unmount"
    | "lostcapture" | "stale-pointerdown" | "blur" | "hidden" | "pagehide";

export interface StalePointerInput {
    readonly view: RendererView;
    /** 새 pointerdown 의 isPrimary — 다른 손가락이 눌려 있지 않으면 true(= 브라우저는 옛 손가락이 이미 떨어진 줄 안다). */
    readonly isPrimary: boolean;
    /** 테이블이 아직 옛 포인터를 붙잡고 있나(element.hasPointerCapture(oldId)). 조회가 안 되면 false 로 넘긴다. */
    readonly hasCapture: boolean;
    /** 옛 기록의 제스처 종류. 모르면 생략(= hold 가 아닌 것으로 본다). */
    readonly gesture?: Gesture["kind"] | null;
}

/**
 * 옛 추적 포인터가 남은 채 새 pointerdown 이 왔을 때 무엇으로 정리할지. null 이면 그대로 둔다(선수 시점의 진짜 두 번째 손가락 → 핀치).
 *  - 옛 손가락이 살아 있다는 증거(isPrimary false + 캡처 유지)가 없으면 뗌 신호를 놓친 것 → stale-pointerdown(어느 뷰든).
 *  - top 뷰엔 두 손가락 기능이 없다 — 살아 있는 두 번째 손가락이어도 옛 기록을 버리고 새 손가락으로 조준을 새로 시작한다.
 *    단 재생 중 길게 누르기(hold)는 예전처럼 두 번째 손가락을 무시한다 — 버리면 켜진 4× 가 1× 로 떨어지고, 새 손가락을 떼는 순간
 *    첫 손가락이 아직 누르고 있어도 1× 가 됐다(2026-09-11 검토). hold 는 재생 단계에만 있고 샷이 끝나면 단계 전환이 기록을 비우므로
 *    여기서 두어도 판 내내 굳는 일은 없다. 공 옮기기(place)는 조준 단계라 그런 끝이 없어 버린다.
 */
export function staleResetReason(s: StalePointerInput): "stale-pointerdown" | "second-finger" | null {
    if (s.isPrimary || !s.hasCapture) return "stale-pointerdown";
    if (s.view !== "top" || s.gesture === "hold") return null;
    return "second-finger";
}

/** 옛 기록을 버리고 새 손가락으로 시작해야 하나. */
export function shouldDropStale(s: StalePointerInput): boolean {
    return staleResetReason(s) !== null;
}

/** 페이지가 ref·상태로 들고 있는 테이블 제스처 전부 — 정리할 때 이 모양 그대로 비운다. */
export interface TableGestureState {
    gesture: Gesture | null;
    /** 조준 기록의 주인 손가락 */
    pointerId: number | null;
    /** 직전 포인터의 화면 px(선수 시점 조준 드래그용) */
    lastScreen: [number, number] | null;
    /** 눌린 포인터 전부의 화면 px(핀치 판정 size===2) */
    pointers: Map<number, [number, number]>;
    /** 핀치 중이면 시작 거리(d0)와 시작 배율(z0). 배율은 페이지가 들고 있고 여기선 "핀치 중인가"만 본다. */
    pinch: { d0: number; z0: number } | null;
    /** 길게 누르기 타이머가 걸려 있다(아직 4× 전) */
    holdPending: boolean;
    /** 길게 누르기로 4× 가 켜졌다 — 정리할 때 1× 로 되돌린다 */
    holdFast: boolean;
    /** 조준 드래그 표시(true 면 오버레이가 예측 경로 대신 직선) */
    dragging: boolean;
    /** 연습 모드에서 옮기는 중인 공 */
    placing: string | null;
}

export function idleGestureState(): TableGestureState {
    return {
        gesture: null, pointerId: null, lastScreen: null, pointers: new Map(), pinch: null,
        holdPending: false, holdFast: false, dragging: false, placing: null,
    };
}

/** 정리 직전 무엇이든 진행 중(또는 표시가 남아 있음)이었나. */
export function gestureActive(s: TableGestureState): boolean {
    return s.gesture !== null || s.pointerId !== null || s.pinch !== null || s.holdPending || s.holdFast || s.dragging || s.placing !== null;
}

/** 계측할 비정상 복구인가. 캡처 상실·앱 가려짐은 제스처가 걸려 있었을 때만 비정상이다(평소 blur 는 셀 이유가 없다). */
export function isAbnormalReset(reason: GestureResetReason, wasActive: boolean): boolean {
    switch (reason) {
        case "stale-pointerdown": return true;
        case "lostcapture": case "blur": case "hidden": case "pagehide": return wasActive;
        default: return false;
    }
}

/**
 * 핀치 배율(2026-09-12 오너: "축소율과 확대 가능하게, 손가락 놓더라도 고정"). 시작 배율 × (지금 거리 / 시작 거리).
 * 손을 뗀 값에서 이어지므로 여러 번 나눠 오므리면 계속 작아진다 — 한 번에 얼마나 벌렸는지가 아니라 누적이 기준이다.
 * 시작 거리가 0 이하(손가락이 겹친 이상한 입력)면 배율을 바꾸지 않는다.
 */
export function pinchZoom(z0: number, d0: number, d: number): number {
    if (!(d0 > 0) || !(d >= 0) || !Number.isFinite(z0)) return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z0) ? z0 : 1));
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * (d / d0)));
}

export interface GestureResetPlan {
    /** 정리 뒤 상태(늘 빈 상태 — 핀치의 남은 손가락 항목까지 지운다) */
    readonly next: TableGestureState;
    /** 캡처를 놓을 옛 추적 포인터. 없으면 null. 이미 풀렸으면 브라우저가 예외를 내므로 페이지가 삼킨다. */
    readonly releasePointerId: number | null;
    readonly clearHoldTimer: boolean;
    /** 길게 누르기가 켠 4× 를 1× 로 */
    readonly restoreSpeed: boolean;
    /** 핀치 축소를 원래 크기로 */
    /** @deprecated 2026-09-12 부터 배율은 되돌리지 않는다(오너: 맞춘 크기가 남는다). 옛 이름은 계획 모양을 지키려고 남겨 둔다. */
    readonly restoreZoom: boolean;
    /** dragging·placing 표시를 끈다 */
    readonly clearDisplay: boolean;
    readonly wasActive: boolean;
    readonly abnormal: boolean;
}

/**
 * 조준 기록 정리 계획(순수). 언마운트면 기록·타이머·캡처만 비우고 컨트롤러·렌더러·React 상태는 건드리지 않는다(곧 함께 사라진다).
 */
export function planGestureReset(s: TableGestureState, reason: GestureResetReason): GestureResetPlan {
    const live = reason !== "unmount";
    const wasActive = gestureActive(s);
    return {
        next: idleGestureState(),
        releasePointerId: s.pointerId,
        clearHoldTimer: s.holdPending,
        restoreSpeed: live && s.holdFast,
        restoreZoom: live && s.pinch !== null,
        clearDisplay: live,
        wasActive,
        abnormal: isAbnormalReset(reason, wasActive),
    };
}
