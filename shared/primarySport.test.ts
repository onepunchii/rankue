import { describe, it, expect } from "vitest";
import { isPrimarySport, suggestPrimarySport } from "./primarySport.js";

describe("주 종목(2026-10-01)", () => {
    it("당구·골프만 받는다", () => {
        expect(isPrimarySport("GOLF")).toBe(true);
        expect(isPrimarySport("BILLIARDS")).toBe(true);
        for (const v of ["golf", "TENNIS", "", null, undefined, 1]) expect(isPrimarySport(v)).toBe(false);
    });
    it("골프 흔적(라운드·글·신청)이 하나라도 있으면 골프, 없으면 당구가 처음 선택", () => {
        expect(suggestPrimarySport({ golfRounds: 0, golfPosts: 0, golfRequests: 0 })).toBe("BILLIARDS");
        expect(suggestPrimarySport({ golfRounds: 1, golfPosts: 0, golfRequests: 0 })).toBe("GOLF");
        expect(suggestPrimarySport({ golfRounds: 0, golfPosts: 0, golfRequests: 2 })).toBe("GOLF");
    });
});
