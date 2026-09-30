import { describe, expect, it } from "vitest";
import type { MapBox } from "@shared/golfDotMap";
import { IDENTITY, ZOOM_MAX, clampView, mixView, panView, pinchView, project, visibleBox, zoomAt } from "./mapZoom";

const BOX: MapBox = [10, 20, 200, 244];
const inside = (v: { k: number; tx: number; ty: number }) => {
    // 확대한 지도가 틀을 늘 덮는가
    const [x0, y0, w, h] = BOX;
    return v.k * x0 + v.tx <= x0 + 1e-6 && v.k * (x0 + w) + v.tx >= x0 + w - 1e-6
        && v.k * y0 + v.ty <= y0 + 1e-6 && v.k * (y0 + h) + v.ty >= y0 + h - 1e-6;
};

describe("mapZoom", () => {
    it("1배에서는 움직이지 않는다(페이지 스크롤을 뺏지 않는 기준)", () => {
        expect(clampView({ k: 1, tx: 30, ty: -9 }, BOX)).toEqual(IDENTITY);
        expect(panView(IDENTITY, 40, 40, BOX)).toEqual(IDENTITY);
    });

    it("배율은 1~4 로 묶인다", () => {
        expect(zoomAt(IDENTITY, 9, { x: 50, y: 50 }, BOX).k).toBe(ZOOM_MAX);
        expect(zoomAt(IDENTITY, 0.2, { x: 50, y: 50 }, BOX).k).toBe(1);
    });

    it("두드린 점은 확대해도 제자리(틀 안쪽이면)", () => {
        const p = { x: 110, y: 142 }; // 틀 가운데
        const v = zoomAt(IDENTITY, 2, p, BOX);
        const w = { x: (p.x - IDENTITY.tx) / IDENTITY.k, y: (p.y - IDENTITY.ty) / IDENTITY.k };
        expect(project(v, w).x).toBeCloseTo(p.x, 6);
        expect(project(v, w).y).toBeCloseTo(p.y, 6);
    });

    it("가장자리를 확대해도 틀 밖 빈 곳이 보이지 않는다", () => {
        const v = zoomAt(IDENTITY, 3, { x: 12, y: 22 }, BOX); // 왼쪽 위 모서리
        expect(inside(v)).toBe(true);
        const far = panView(v, 999, -999, BOX);
        expect(inside(far)).toBe(true);
    });

    it("두 손가락 — 벌리면 커지고, 가운데 지도 점이 손가락을 따라온다", () => {
        const m0 = { x: 100, y: 140 };
        const v = pinchView(IDENTITY, m0, 50, { x: 110, y: 150 }, 100, BOX);
        expect(v.k).toBeCloseTo(2, 6);
        const w = { x: m0.x, y: m0.y }; // 1배에서 m0 밑의 지도 점
        expect(project(v, w).x).toBeCloseTo(110, 6);
        expect(project(v, w).y).toBeCloseTo(150, 6);
    });

    it("보이는 영역 — 2배면 틀의 절반", () => {
        const v = zoomAt(IDENTITY, 2, { x: 110, y: 142 }, BOX);
        const vb = visibleBox(v, BOX);
        expect(vb[2]).toBeCloseTo(100, 6);
        expect(vb[3]).toBeCloseTo(122, 6);
    });

    it("섞기 — 양 끝은 그 보기, 가운데는 배율이 기하평균", () => {
        const b = zoomAt(IDENTITY, 4, { x: 60, y: 80 }, BOX);
        expect(mixView(IDENTITY, b, 0, BOX).k).toBeCloseTo(1, 6);
        const end = mixView(IDENTITY, b, 1, BOX);
        expect(end.k).toBeCloseTo(4, 6);
        expect(end.tx).toBeCloseTo(b.tx, 6);
        expect(mixView(IDENTITY, b, 0.5, BOX).k).toBeCloseTo(2, 6);
    });
});
