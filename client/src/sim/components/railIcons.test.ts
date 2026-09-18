import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 길 칩 바탕색(2026-09-18 오너: "길4·길5 는 공 모양이 투명이라서 안 보인다").
 * --surface-line 계열은 투명도 9~12 % 짜리 구분선 색이다 — 칩을 칠하면 원이 사라진다.
 * PATH_CHIP 배열 안에서 그 토큰을 **바탕(bg-)으로** 쓰지 않는지 소스로 본다(테두리 border- 는 괜찮다).
 */
describe("길 칩은 모두 불투명한 원이다", () => {
    it("PATH_CHIP 에 bg-surface-line 바탕이 없다", () => {
        const src = readFileSync(path.resolve(process.cwd(), "client/src/sim/components/railIcons.tsx"), "utf8");
        const i = src.indexOf("const PATH_CHIP = [");
        expect(i).toBeGreaterThan(-1);
        const block = src.slice(i, src.indexOf("] as const;", i));
        expect(block).not.toMatch(/\bbg-surface-line/);
        // 다섯 순위가 전부 있다(4·5 를 지워서 통과하는 것을 막는다)
        expect(block.split("\n").filter((l) => /^\s+("|PATH_CHIP_GRAY)/.test(l))).toHaveLength(5);
    });
});
