import { describe, expect, it } from "vitest";
import { relaxPins, type PinBox } from "./mapPins";

/** 지도 번호표 비켜 놓기(2026-10-19) — 유럽처럼 몰린 표가 겹치지 않고, 판 안에, 같은 입력엔 같은 자리 */
const overlaps = (a: PinBox, b: PinBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

describe("번호표 비켜 놓기", () => {
    // 폰 폭 280px 지도의 유럽 — 포르투 · 그라디냥(8·9) · 블루아 · 리르가 십몇 px 안
    const europe: PinBox[] = [
        { x: 97, y: 33, w: 18, h: 18 },
        { x: 104, y: 29, w: 30, h: 18 },
        { x: 106, y: 26, w: 22, h: 26 },
        { x: 110, y: 22, w: 18, h: 18 },
        { x: 138, y: 34, w: 18, h: 18 },
    ];
    it("겹치지 않는다", () => {
        const out = relaxPins(europe, 280, 114);
        const boxes = out.map((p, i) => ({ ...europe[i], ...p }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i}-${j}`).toBe(false);
    });
    it("판 밖으로 나가지 않는다", () => {
        const out = relaxPins([{ x: 2, y: 2, w: 30, h: 18 }, { x: 4, y: 3, w: 18, h: 18 }], 280, 114);
        for (const p of out) { expect(p.x).toBeGreaterThanOrEqual(9); expect(p.y).toBeGreaterThanOrEqual(9); }
    });
    it("홀로 있는 표는 제자리, 같은 입력엔 같은 자리", () => {
        expect(relaxPins([{ x: 200, y: 60, w: 18, h: 18 }], 280, 114)).toEqual([{ x: 200, y: 60 }]);
        expect(relaxPins(europe, 280, 114)).toEqual(relaxPins(europe, 280, 114));
    });
});
