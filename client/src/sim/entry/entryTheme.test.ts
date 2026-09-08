import { describe, it, expect } from "vitest";
import { entryStyle, readEntryTheme, ENTRY_THEMES } from "./entryTheme";

describe("진입 화면 배경 샘플", () => {
    it("?bg= 를 읽고, 모르는 값·없음은 기본(clean)", () => {
        expect(readEntryTheme("?bg=arena")).toBe("arena");
        expect(readEntryTheme("bg=board")).toBe("board");
        expect(readEntryTheme("?bg=none")).toBe("clean");
        expect(readEntryTheme("")).toBe("clean");
    });
    it("모든 샘플이 같은 자리를 채운다(빈 클래스 없음)", () => {
        for (const th of ENTRY_THEMES) {
            const s = entryStyle(th);
            for (const [k, v] of Object.entries(s)) expect(v, `${th}.${k}`).toBeTruthy();
        }
    });
});
