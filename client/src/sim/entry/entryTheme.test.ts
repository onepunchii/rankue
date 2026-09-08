import { describe, it, expect } from "vitest";
import { ENTRY_STYLE } from "./entryTheme";

describe("진입 화면 배색(검정)", () => {
    it("모든 자리가 채워져 있다", () => {
        for (const [k, v] of Object.entries(ENTRY_STYLE)) expect(v, k).toBeTruthy();
    });
    it("테이블 자리는 불투명 배경이어야 한다(렌더러 레터박스가 회색으로 뜨지 않게)", () => {
        expect(ENTRY_STYLE.showcase).toMatch(/bg-\[#[0-9A-Fa-f]{6}\]/);
        expect(ENTRY_STYLE.showcase).not.toMatch(/bg-(black|white)\//);
    });
});
