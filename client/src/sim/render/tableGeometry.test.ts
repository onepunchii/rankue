import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { computeLayout, worldToScreen, screenToWorld, isOnPlaySurface, MIN_MARGIN_PX, RAIL_WIDTH_M } from "./tableGeometry";

const VIEWPORTS = [
    { name: "폰 390×844", width: 390, height: 844 },
    { name: "태블릿 768×1024", width: 768, height: 1024 },
    { name: "소형 360×640", width: 360, height: 640 },
    { name: "가로 1024×600", width: 1024, height: 600 },
    { name: "정사각 500×500", width: 500, height: 500 },
];
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

describe("computeLayout — 어떤 화면비에서도 플레이 면이 잘리지 않는다", () => {
    for (const table of Object.values(TABLES)) {
        for (const vp of VIEWPORTS) {
            for (const insets of [undefined, INSETS]) {
                it(`${table.name} / ${vp.name} / 인셋 ${insets ? "있음" : "없음"}`, () => {
                    const L = computeLayout(vp, table, insets);
                    const ins = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
                    // 바깥(레일 포함) 사각형이 인셋+여백 안에 든다
                    expect(L.outer.x).toBeGreaterThanOrEqual(ins.left + MIN_MARGIN_PX - 1e-9);
                    expect(L.outer.y).toBeGreaterThanOrEqual(ins.top + MIN_MARGIN_PX - 1e-9);
                    expect(L.outer.x + L.outer.w).toBeLessThanOrEqual(vp.width - ins.right - MIN_MARGIN_PX + 1e-9);
                    expect(L.outer.y + L.outer.h).toBeLessThanOrEqual(vp.height - ins.bottom - MIN_MARGIN_PX + 1e-9);
                    // 플레이 면은 레일 안쪽
                    expect(L.play.x).toBeCloseTo(L.outer.x + L.railPx, 9);
                    expect(L.play.y).toBeCloseTo(L.outer.y + L.railPx, 9);
                    expect(L.play.w + 2 * L.railPx).toBeCloseTo(L.outer.w, 9);
                    expect(L.play.h + 2 * L.railPx).toBeCloseTo(L.outer.h, 9);
                    // 비율 유지(긴 변 세로)
                    expect(L.play.h / L.play.w).toBeCloseTo(table.length / table.width, 9);
                    expect(L.railPx).toBeCloseTo(RAIL_WIDTH_M * L.scale, 9);
                    // 가운데 정렬
                    const availCx = ins.left + (vp.width - ins.left - ins.right) / 2;
                    const availCy = ins.top + (vp.height - ins.top - ins.bottom) / 2;
                    expect(L.outer.x + L.outer.w / 2).toBeCloseTo(availCx, 9);
                    expect(L.outer.y + L.outer.h / 2).toBeCloseTo(availCy, 9);
                    // 한 축은 꽉 찬다(최대 크기)
                    const availW = vp.width - ins.left - ins.right - 2 * MIN_MARGIN_PX;
                    const availH = vp.height - ins.top - ins.bottom - 2 * MIN_MARGIN_PX;
                    const fillsW = Math.abs(L.outer.w - availW) < 1e-6;
                    const fillsH = Math.abs(L.outer.h - availH) < 1e-6;
                    expect(fillsW || fillsH).toBe(true);
                });
            }
        }
    }

    it("폰 세로에서는 가로가, 가로 화면에서는 세로가 제한 축", () => {
        const phone = computeLayout({ width: 390, height: 844 }, TABLES.DAEDAE);
        expect(phone.outer.w).toBeCloseTo(390 - 2 * MIN_MARGIN_PX, 9);
        const wide = computeLayout({ width: 1024, height: 600 }, TABLES.DAEDAE);
        expect(wide.outer.h).toBeCloseTo(600 - 2 * MIN_MARGIN_PX, 9);
    });

    it("컨테이너가 0 이어도 scale 은 양수", () => {
        const L = computeLayout({ width: 0, height: 0 }, TABLES.DAEDAE);
        expect(L.scale).toBeGreaterThan(0);
        expect(Number.isFinite(L.originX)).toBe(true);
    });
});

describe("좌표 변환", () => {
    const L = computeLayout({ width: 390, height: 844 }, TABLES.DAEDAE, INSETS);
    const T = TABLES.DAEDAE;

    it("헤드 레일(y=0)이 화면 아래, 풋 레일이 화면 위", () => {
        const [, headY] = worldToScreen(L, 0, 0);
        const [, footY] = worldToScreen(L, 0, T.length);
        expect(headY).toBeGreaterThan(footY);
        expect(headY).toBeCloseTo(L.play.y + L.play.h, 9);
        expect(footY).toBeCloseTo(L.play.y, 9);
    });

    it("x=0 이 플레이 면 왼쪽, x=width 가 오른쪽", () => {
        expect(worldToScreen(L, 0, 0)[0]).toBeCloseTo(L.play.x, 9);
        expect(worldToScreen(L, T.width, 0)[0]).toBeCloseTo(L.play.x + L.play.w, 9);
    });

    it("왕복 변환은 원래 값으로 돌아온다", () => {
        for (const [x, y] of [[0.3, 0.4], [T.width / 2, T.length / 2], [T.width, T.length], [0.031, 2.1]]) {
            const [px, py] = worldToScreen(L, x, y);
            const [bx, by] = screenToWorld(L, px, py);
            expect(bx).toBeCloseTo(x, 9);
            expect(by).toBeCloseTo(y, 9);
        }
    });

    it("scale 은 px/m", () => {
        const [ax] = worldToScreen(L, 0, 0);
        const [bx] = worldToScreen(L, 1, 0);
        expect(bx - ax).toBeCloseTo(L.scale, 9);
    });

    it("isOnPlaySurface", () => {
        const [cx, cy] = worldToScreen(L, T.width / 2, T.length / 2);
        expect(isOnPlaySurface(L, cx, cy)).toBe(true);
        expect(isOnPlaySurface(L, L.play.x - 1, cy)).toBe(false);
        expect(isOnPlaySurface(L, cx, L.play.y + L.play.h + 1)).toBe(false);
    });
});

describe("다이아몬드", () => {
    const L = computeLayout({ width: 768, height: 1024 }, TABLES.JUNGDAE_KR);

    it("20개, 레일 띠 안, 플레이 면 밖", () => {
        expect(L.diamonds).toHaveLength(20);
        for (const d of L.diamonds) {
            expect(isOnPlaySurface(L, d.sx, d.sy)).toBe(false);
            expect(d.sx).toBeGreaterThanOrEqual(L.outer.x);
            expect(d.sx).toBeLessThanOrEqual(L.outer.x + L.outer.w);
            expect(d.sy).toBeGreaterThanOrEqual(L.outer.y);
            expect(d.sy).toBeLessThanOrEqual(L.outer.y + L.outer.h);
        }
    });

    it("레일 중앙선 위에 놓이고 긴 변은 8등분, 짧은 변은 4등분", () => {
        const left = L.diamonds.filter((d) => d.rail === "left");
        expect(left).toHaveLength(7);
        for (const d of left) {
            expect(d.sx).toBeCloseTo(L.play.x - L.railPx / 2, 9);
            expect(d.sy).toBeCloseTo(L.play.y + L.play.h - (L.play.h * d.index) / 8, 9);
        }
        const bottom = L.diamonds.filter((d) => d.rail === "bottom");
        expect(bottom).toHaveLength(3);
        for (const d of bottom) {
            expect(d.sy).toBeCloseTo(L.play.y + L.play.h + L.railPx / 2, 9);
            expect(d.sx).toBeCloseTo(L.play.x + (L.play.w * d.index) / 4, 9);
        }
        const top = L.diamonds.filter((d) => d.rail === "top");
        for (const d of top) expect(d.sy).toBeCloseTo(L.play.y - L.railPx / 2, 9);
    });
});
