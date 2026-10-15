import { describe, it, expect } from "vitest";
import { cleanMark, MARK_KINDS, MARK_LABEL } from "./hikingMarks";

describe("내 표시 지점", () => {
    it("산 · 종류 · 한국 안의 자리는 꼭, 메모는 120자까지", () => {
        const r = cleanMark({ mountainId: "bukhansan", kind: "water", lat: 37.658912, lng: 126.977812, note: `  물  맛있음 ${"x".repeat(200)}` });
        expect(r.ok).toBe(true);
        if (r.ok) { expect(r.value.lat).toBe(37.65891); expect(r.value.note!.startsWith("물 맛있음")).toBe(true); expect(r.value.note!.length).toBe(120); }
        expect(cleanMark({ mountainId: "x", kind: "shop", lat: 37, lng: 127 }).ok).toBe(false);
        expect(cleanMark({ mountainId: "x", kind: "view", lat: 51, lng: 0 }).ok).toBe(false);
        expect(cleanMark({ mountainId: "../x", kind: "view", lat: 37, lng: 127 }).ok).toBe(false);
    });
    it("종류마다 이름이 있다", () => {
        for (const k of MARK_KINDS) expect(MARK_LABEL[k]).toBeTruthy();
    });
});
