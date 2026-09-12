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

/**
 * 카메라 뷰. "top" = 오소그래픽 탑다운(기본, Canvas2D 와 px 동일). "player" = 큐볼 뒤 선수 시점(원근, ThreeRenderer 만).
 * setView 를 구현하지 않는 렌더러는 항상 top 이다.
 */
export type RendererView = "top" | "player";

/**
 * 핀치 확대·축소 범위(player 뷰). 1 = 기본 시야각(45°).
 * 0.45 = 많이 축소(시야각 85° — 테이블이 거의 다 들어온다), 2 = 확대(시야각 23°).
 * 2026-09-12 오너: "축소율과 확대 가능하게, 손가락 놓더라도 내가 맞춘 크기가 고정으로" — 그 전에는 0.7~1 이었고
 * 손을 떼면 1 로 되돌아갔다.
 */
export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 2;

/** 선수 시점 카메라의 목표. 없으면 카메라는 마지막 자리에 머문다(공 옮기기·상대 차례 대기). */
export interface ViewFrame {
    readonly cueBallId: string;
    /** 조준 방향(rad). follow 에서 카메라는 큐볼 뒤(−phi)에 서서 +phi 쪽을 본다. */
    readonly phi: number;
    /**
     * "follow"(기본): 큐볼 뒤 선수 시점. "overview": 재생 중 부감 — 테이블 전체가 뷰에 들어오는 높이로 감쇠 비행해 올라가
     * 공이 어디로 가든 보이게 하고(움직이는 공을 쫓으면 3쿠션마다 화면이 돈다), 조준으로 돌아오면 다시 큐볼 뒤로 내려온다.
     */
    readonly mode?: "follow" | "overview";
}

export interface RenderFrame {
    readonly balls: readonly BallState[];
    readonly cue?: CueFrame;
    /** 초록 링으로 강조할 공(보통 현재 큐볼). */
    readonly highlightBallId?: string;
    /** 선수 시점 카메라 대상(player 뷰에서만 의미). 조준 단계에서 페이지가 매 프레임 넘긴다. */
    readonly view?: ViewFrame;
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
    /** 현재 뷰포트 정보(마운트 전이면 null). player 뷰에서도 scale 은 top 배치 기준이다(오버레이는 project 로 잰다). */
    viewport(): Viewport | null;
    /** 캔버스 제거·옵저버 해제. 이후 draw 는 무시된다. */
    dispose(): void;
    /**
     * 카메라 뷰 전환(선택). 구현하지 않으면 항상 top — 페이지는 이 메서드의 유무로 "3D 보기" 토글을 보인다.
     * project/unproject 는 전환 직후부터 새 카메라를 따른다.
     */
    setView?(view: RendererView): void;
    getView?(): RendererView;
    /** 카메라가 아직 움직이는 중이면 true — 페이지 rAF 루프가 dirty 가 아니어도 draw 를 한 번 더 부른다(선택). */
    needsFrame?(): boolean;
    /**
     * 확대·축소(선택, player 뷰만). 1 = 기본, ZOOM_MIN = 넓게(멀리까지 보인다), ZOOM_MAX = 좁게(확대). 감쇠로 따라가며
     * project/unproject 도 같은 시야각을 쓴다. 두 손가락 핀치가 정하고, **손을 떼도 그 값이 남는다**(2026-09-12 오너).
     * 구현하지 않는 렌더러(Canvas2D)는 없음 — 페이지는 이 메서드가 있을 때만 핀치를 시작한다.
     */
    setZoom?(zoom: number): void;
}
