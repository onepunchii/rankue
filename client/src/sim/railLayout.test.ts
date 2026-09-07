import { describe, it, expect } from "vitest";
import { RAIL_MD, RAIL_SM, railFitsMd, railHeight } from "./railLayout";

describe("railHeight — 버튼 수 × 크기 + 묶음 안·사이 간격", () => {
    it("빈 툴바는 0, 버튼 하나는 버튼 한 변", () => {
        expect(railHeight([], RAIL_MD)).toBe(0);
        expect(railHeight([0, 0], RAIL_MD)).toBe(0);
        expect(railHeight([1], RAIL_MD)).toBe(44);
        expect(railHeight([1], RAIL_SM)).toBe(40);
    });

    it("빈 묶음은 간격을 만들지 않는다", () => {
        expect(railHeight([2, 0, 1], RAIL_MD)).toBe(railHeight([2, 1], RAIL_MD));
        // 2 + 1 = 3 버튼(132) + 묶음 안 1 간격(8) + 묶음 사이 1 간격(12)
        expect(railHeight([2, 1], RAIL_MD)).toBe(132 + 8 + 12);
    });

    it("375×812 연습(3쿠션·three): 당점·큐 각·해법 / 다이아·3D·소리·이닝 / 나가기 = 8 버튼", () => {
        expect(railHeight([3, 4, 1], RAIL_MD)).toBe(8 * 44 + 5 * 8 + 2 * 12);
        expect(railHeight([3, 4, 1], RAIL_SM)).toBe(8 * 40 + 5 * 6 + 2 * 8);
    });
});

describe("railFitsMd — 열 높이에 md 툴바 + 고정 높이가 들어가는가", () => {
    const FIXED = 330;
    it("측정 전(0)엔 들어간다고 본다", () => {
        expect(railFitsMd(0, [3, 4, 1], FIXED)).toBe(true);
    });
    it("375×812(열 752): 8 버튼은 들어가고 9 버튼(드릴 다시 배치)은 안 들어간다", () => {
        expect(railFitsMd(752, [3, 4, 1], FIXED)).toBe(true);
        expect(railFitsMd(752, [3, 5, 1], FIXED)).toBe(false);
    });
    it("경계: 정확히 맞으면 들어간다", () => {
        const need = railHeight([3, 4, 1], RAIL_MD) + FIXED;
        expect(railFitsMd(need, [3, 4, 1], FIXED)).toBe(true);
        expect(railFitsMd(need - 1, [3, 4, 1], FIXED)).toBe(false);
    });
});
