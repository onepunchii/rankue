import { describe, it, expect } from "vitest";
import { GUEST_PATH_FREE, guestPathLeft, isPromoSrc, isPromoStep, safeReturnPath } from "./promoFunnel";

describe("promoFunnel", () => {
    it("비회원 무료 길 찾기 — 3번, 0 아래로 안 내려간다", () => {
        expect(GUEST_PATH_FREE).toBe(3);
        expect(guestPathLeft(0)).toBe(3);
        expect(guestPathLeft(2)).toBe(1);
        expect(guestPathLeft(5)).toBe(0);
        expect(guestPathLeft(NaN)).toBe(3);
        expect(guestPathLeft(-4)).toBe(3);
    });
    it("출처·단계는 정해진 값만", () => {
        expect(isPromoSrc("store")).toBe(true);
        expect(isPromoSrc("x")).toBe(false);
        expect(isPromoStep("signup")).toBe(true);
        expect(isPromoStep("drop table")).toBe(false);
    });
    it("safeReturnPath — 우리 경로만(다른 도메인·스킴 막기)", () => {
        expect(safeReturnPath("/online-game?path=1")).toBe("/online-game?path=1");
        expect(safeReturnPath("//evil.com")).toBeNull();
        expect(safeReturnPath("/\\evil.com")).toBeNull();
        expect(safeReturnPath("https://evil.com")).toBeNull();
        expect(safeReturnPath(undefined)).toBeNull();
    });
});
