/**
 * 렌더러 계약. 물리는 모른다 — `RenderFrame` 하나를 받아 그리고, 화면↔테이블 좌표 변환만 제공한다.
 * Canvas2DRenderer(1차)와 ThreeRenderer(2차)가 같은 인터페이스를 구현해 SimulatorPage 가 갈아끼운다.
 *
 * 좌표 규약: 테이블 좌표는 m(x 짧은 변, y 긴 변, 헤드 레일 y=0). 화면은 세로 고정이며 y 가 화면 위쪽으로 증가한다
 * (헤드 레일이 화면 아래). 화면 좌표는 마운트 요소 기준 CSS px.
 */
import type { BallState } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";

/** 큐 표시. `ballId` 가 없으면 highlightBallId → 첫 번째 공 순으로 큐볼을 고른다. */
export interface CueFrame {
    /** 큐가 향하는 방향(rad, +x 기준 반시계). 큐대는 공 뒤쪽(−phi)에 놓인다. */
    readonly phi: number;
    /** 뒤로 당긴 정도 0..1 → 0..0.25 m */
    readonly pullback: number;
    readonly visible: boolean;
    readonly ballId?: string;
}

export interface RenderFrame {
    readonly balls: readonly BallState[];
    readonly cue?: CueFrame;
    /** 초록 링으로 강조할 공(보통 현재 큐볼). */
    readonly highlightBallId?: string;
}

/** 세이프 에어리어 인셋(CSS px). 테이블은 이 안쪽에 letterbox 된다. */
export interface SafeInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

/** 렌더러가 현재 차지한 화면 정보. 오버레이가 같은 캔버스 크기로 맞출 때 쓴다. */
export interface Viewport {
    /** 마운트 요소 크기 (CSS px) */
    readonly width: number;
    readonly height: number;
    /** 실제 적용된 devicePixelRatio (최대 2) */
    readonly dpr: number;
    readonly insets: SafeInsets;
    /** px / m */
    readonly scale: number;
}

export interface Renderer {
    /** 캔버스를 el 안에 만들고 크기를 맞춘다. 두 번 부르면 이전 것을 정리한다. */
    mount(el: HTMLElement, table: TableSpec): void;
    /** 테이블을 바꾼다(정적 층 재생성). */
    setTable(table: TableSpec): void;
    /** 컨테이너 크기를 다시 재고 정적 층을 다시 그린다. ResizeObserver 가 자동으로 부르지만 수동 호출도 가능. */
    resize(): void;
    /** 프레임 하나를 그린다. 매 rAF 마다 호출되므로 할당을 만들지 않는다. */
    draw(frame: RenderFrame): void;
    /** 테이블 (m) → 화면 (CSS px) */
    project(x: number, y: number): [number, number];
    /** 화면 (CSS px) → 테이블 (m) */
    unproject(px: number, py: number): [number, number];
    /** 현재 화면의 PNG. 지원되지 않으면 null. */
    screenshot(): Promise<Blob | null>;
    /** 현재 뷰포트 정보(마운트 전이면 null). */
    viewport(): Viewport | null;
    /** 캔버스 제거·옵저버 해제. 이후 draw 는 무시된다. */
    dispose(): void;
}
