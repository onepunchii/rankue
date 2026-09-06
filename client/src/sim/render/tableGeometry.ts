/**
 * 테이블 letterbox 배치 계산. 순수 함수 — DOM 없음, 렌더러(2D/three)와 오버레이가 공유한다.
 *
 * 컨테이너(CSS px)와 세이프 에어리어 인셋을 받아, 긴 변을 세로로 둔 테이블(레일 포함)을
 * 여백 ≥ MIN_MARGIN_PX 를 지키며 가장 크게 가운데에 놓는다. 어떤 화면비에서도 플레이 면은 잘리지 않는다.
 *
 * 화면 좌표: 마운트 요소 좌상단 원점, y 아래로 증가. 테이블 좌표: 헤드 레일 y=0 이 화면 아래.
 *   px = originX + x·scale,  py = originY − y·scale
 */
import type { TableSpec } from "@shared/sim/params";
import { diamondMarks } from "../aim";
import type { SafeInsets } from "./Renderer";

/** 레일 폭(시각용, m). 실제 대대 레일은 약 5.5–6.5 cm. */
export const RAIL_WIDTH_M = 0.06;
/** 인셋 안쪽에서 추가로 지키는 최소 여백(px). */
export const MIN_MARGIN_PX = 12;

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface Size {
    readonly width: number;
    readonly height: number;
}

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

export interface DiamondScreen {
    /** 화면 px (레일 중앙선 위) */
    readonly sx: number;
    readonly sy: number;
    readonly rail: "left" | "right" | "bottom" | "top";
    readonly index: number;
}

export interface TableLayout {
    readonly table: TableSpec;
    readonly container: Size;
    readonly insets: SafeInsets;
    /** px / m */
    readonly scale: number;
    /** 레일 폭 px */
    readonly railPx: number;
    /** 플레이 면(라사) 화면 사각형 */
    readonly play: Rect;
    /** 레일 포함 바깥 사각형 */
    readonly outer: Rect;
    /** 테이블 원점(헤드 레일 왼쪽 모서리)의 화면 px */
    readonly originX: number;
    readonly originY: number;
    readonly diamonds: readonly DiamondScreen[];
}

/**
 * 배치 계산. 컨테이너가 0 이하이거나 인셋이 화면을 다 먹어도 scale 은 항상 양수다(그릴 수 없을 만큼 작을 뿐).
 */
export function computeLayout(container: Size, table: TableSpec, insets: SafeInsets = NO_INSETS): TableLayout {
    const availX = insets.left + MIN_MARGIN_PX;
    const availY = insets.top + MIN_MARGIN_PX;
    const availW = Math.max(1, container.width - insets.left - insets.right - MIN_MARGIN_PX * 2);
    const availH = Math.max(1, container.height - insets.top - insets.bottom - MIN_MARGIN_PX * 2);

    const fullW = table.width + RAIL_WIDTH_M * 2;
    const fullL = table.length + RAIL_WIDTH_M * 2;
    const scale = Math.max(1e-6, Math.min(availW / fullW, availH / fullL));

    const railPx = RAIL_WIDTH_M * scale;
    const outerW = fullW * scale;
    const outerH = fullL * scale;
    const outerX = availX + (availW - outerW) / 2;
    const outerY = availY + (availH - outerH) / 2;

    const play: Rect = {
        x: outerX + railPx,
        y: outerY + railPx,
        w: table.width * scale,
        h: table.length * scale,
    };
    const outer: Rect = { x: outerX, y: outerY, w: outerW, h: outerH };
    const originX = play.x;
    const originY = play.y + play.h;

    const half = railPx / 2;
    const diamonds: DiamondScreen[] = diamondMarks(table).map((d) => {
        // 레일 중앙선으로 밀어낸다
        let sx = originX + d.x * scale;
        let sy = originY - d.y * scale;
        if (d.rail === "left") sx -= half;
        else if (d.rail === "right") sx += half;
        else if (d.rail === "bottom") sy += half;
        else sy -= half;
        return { sx, sy, rail: d.rail, index: d.index };
    });

    return { table, container, insets, scale, railPx, play, outer, originX, originY, diamonds };
}

export function worldToScreen(layout: TableLayout, x: number, y: number): [number, number] {
    return [layout.originX + x * layout.scale, layout.originY - y * layout.scale];
}

export function screenToWorld(layout: TableLayout, px: number, py: number): [number, number] {
    return [(px - layout.originX) / layout.scale, (layout.originY - py) / layout.scale];
}

/** 화면 점이 플레이 면(라사) 안인지. 입력 처리에서 "테이블 위 드래그" 판정용. */
export function isOnPlaySurface(layout: TableLayout, px: number, py: number): boolean {
    const p = layout.play;
    return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
}
