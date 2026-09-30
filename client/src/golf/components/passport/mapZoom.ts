/**
 * 발자국 지도 확대·이동의 셈(2026-09-30 오너: "발자국 지도 축소 확대 가능하게"). 화면(FootprintMap)은 손가락만 읽고
 * 좌표 계산은 전부 여기 — 순수 함수라 테스트로 못 박는다(mapZoom.test.ts).
 *
 * 보기(view) = 지도 좌표 → 지도 칸(viewBox) 좌표의 닮음 변환  P = k·W + t.  k=1, t=0 이 처음 그림(틀 전체).
 * 틀(box)은 FootprintMap 의 viewBox 그대로다. 확대해도 틀 밖의 빈 곳이 보이지 않게 t 를 묶는다.
 */
import type { MapBox } from "@shared/golfDotMap";

export interface ZoomView { k: number; tx: number; ty: number }
export interface Pt { x: number; y: number }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** + · − 한 번에 이만큼 */
export const ZOOM_STEP = 1.75;
export const IDENTITY: ZoomView = { k: 1, tx: 0, ty: 0 };

const clampK = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(k) ? k : 1));

/**
 * 배율을 범위(1~4) 안으로, 이동은 틀을 벗어나지 않게.
 * 확대된 지도 [k·x0+tx, k·x1+tx] 가 틀 [x0, x1] 을 늘 덮어야 한다 → tx ∈ [x1(1-k), x0(1-k)].
 */
export function clampView(v: ZoomView, box: MapBox): ZoomView {
    const k = clampK(v.k);
    const [x0, y0, w, h] = box;
    const x1 = x0 + w, y1 = y0 + h;
    const tx = Math.min(x0 * (1 - k), Math.max(x1 * (1 - k), v.tx));
    const ty = Math.min(y0 * (1 - k), Math.max(y1 * (1 - k), v.ty));
    return { k, tx: k === 1 ? 0 : tx, ty: k === 1 ? 0 : ty };
}

/** 지도 칸의 한 점 p 를 제자리에 둔 채 배율을 k 로 — 두 번 두드리기·버튼·키보드·트랙패드 */
export function zoomAt(v: ZoomView, k: number, p: Pt, box: MapBox): ZoomView {
    const kk = clampK(k);
    const wx = (p.x - v.tx) / v.k, wy = (p.y - v.ty) / v.k; // p 밑의 지도 좌표
    return clampView({ k: kk, tx: p.x - kk * wx, ty: p.y - kk * wy }, box);
}

/**
 * 두 손가락 — 시작할 때의 보기(v0)·두 손가락 가운데(m0)·거리(d0) 에서 지금 가운데(m)·거리(d) 로.
 * 손가락 사이의 지도 점이 손가락을 따라온다(벌리면 그 자리가 커지고, 같이 밀면 지도가 따라 움직인다).
 */
export function pinchView(v0: ZoomView, m0: Pt, d0: number, m: Pt, d: number, box: MapBox): ZoomView {
    const k = clampK(v0.k * (d / Math.max(1, d0)));
    const wx = (m0.x - v0.tx) / v0.k, wy = (m0.y - v0.ty) / v0.k;
    return clampView({ k, tx: m.x - k * wx, ty: m.y - k * wy }, box);
}

/** 한 손가락 끌기(확대했을 때만) — dx·dy 는 지도 칸 좌표 */
export function panView(v: ZoomView, dx: number, dy: number, box: MapBox): ZoomView {
    return clampView({ k: v.k, tx: v.tx + dx, ty: v.ty + dy }, box);
}

/** 지금 보이는 지도 영역(지도 좌표) — 지역 이름 고르기·말풍선 자리 */
export function visibleBox(v: ZoomView, box: MapBox): MapBox {
    return [(box[0] - v.tx) / v.k, (box[1] - v.ty) / v.k, box[2] / v.k, box[3] / v.k];
}

/** 지도 좌표 → 지도 칸 좌표 */
export const project = (v: ZoomView, p: Pt): Pt => ({ x: v.k * p.x + v.tx, y: v.k * p.y + v.ty });

/**
 * 두 보기 사이 t(0~1). 틀 가운데의 지도 점과 배율(로그)을 섞는다 — tx 를 그냥 섞으면 확대하는 동안 가운데가 옆으로 샌다.
 */
export function mixView(a: ZoomView, b: ZoomView, t: number, box: MapBox): ZoomView {
    const c = { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
    const wa = { x: (c.x - a.tx) / a.k, y: (c.y - a.ty) / a.k };
    const wb = { x: (c.x - b.tx) / b.k, y: (c.y - b.ty) / b.k };
    const k = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * t);
    const w = { x: wa.x + (wb.x - wa.x) * t, y: wa.y + (wb.y - wa.y) * t };
    return { k, tx: c.x - k * w.x, ty: c.y - k * w.y };
}

export const sameView = (a: ZoomView, b: ZoomView) => Math.abs(a.k - b.k) < 1e-3 && Math.abs(a.tx - b.tx) < 1e-2 && Math.abs(a.ty - b.ty) < 1e-2;
