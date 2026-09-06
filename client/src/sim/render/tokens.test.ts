import { describe, it, expect } from "vitest";
import { DEFAULT_PALETTE, parseColor, readPalette, rgba, scaleColor } from "./tokens";

describe("tokens", () => {
    it("readPalette: 문서가 없거나 getComputedStyle 이 없으면 기본 팔레트", () => {
        expect(readPalette(null)).toBe(DEFAULT_PALETTE);
        expect(readPalette(undefined)).toBe(DEFAULT_PALETTE);
        expect(readPalette({ documentElement: {} } as unknown as Document)).toBe(DEFAULT_PALETTE);
    });

    it("readPalette: :root 토큰을 읽고, 못 읽는 항목만 기본값으로 채운다", () => {
        const g = globalThis as unknown as { getComputedStyle?: unknown };
        const saved = g.getComputedStyle;
        g.getComputedStyle = () => ({
            getPropertyValue: (name: string) =>
                name === "--brand" ? " 10 20 30 " : name === "--ball-red" ? "#C8442E" : name === "--ink-1" ? "nonsense" : "",
        });
        try {
            const p = readPalette({ documentElement: {} } as unknown as Document);
            expect(p.brand).toEqual([10, 20, 30, 1]);
            expect(p.ballRed).toEqual([200, 68, 46, 1]);
            expect(p.ink1).toBe(DEFAULT_PALETTE.ink1);
            expect(p.surface1).toBe(DEFAULT_PALETTE.surface1);
        } finally {
            g.getComputedStyle = saved;
        }
    });

    it("기본 팔레트는 index.css 의 공·브랜드 토큰과 같다", () => {
        expect(rgba(DEFAULT_PALETTE.brand)).toBe("rgba(0,98,65,1)");
        expect(parseColor("#E8B325")).toEqual(DEFAULT_PALETTE.ballYellow);
        expect(parseColor("#C8442E")).toEqual(DEFAULT_PALETTE.ballRed);
        expect(parseColor("#F7F4ED")).toEqual(DEFAULT_PALETTE.ballWhite);
    });

    it("scaleColor 는 채널만 곱하고 알파는 두며 255 에서 자른다", () => {
        expect(scaleColor([200, 100, 50, 0.5], 0.5)).toEqual([100, 50, 25, 0.5]);
        expect(scaleColor([200, 100, 50, 1], 2)).toEqual([255, 200, 100, 1]);
        expect(scaleColor([10, 10, 10, 1], -1)).toEqual([0, 0, 0, 1]);
    });
});
