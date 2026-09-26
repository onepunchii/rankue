import { describe, it, expect } from "vitest";
import { ratingEligibility, ratingDelta, ELO_K, MIN_SHOTS_EACH } from "./rating";

describe("온라인 대전 레이팅 규칙", () => {
    it("다마수 수동 방(맞대결)은 반영하지 않는다", () => {
        expect(ratingEligibility({ handicap: false, hasGuest: true, shots: [30, 30] })).toEqual({ rated: false, reason: "manual" });
    });
    it("핸디전이라도 한쪽이 거의 안 쳤으면 반영하지 않는다(들어오자마자 기권)", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [MIN_SHOTS_EACH, MIN_SHOTS_EACH - 1] }))
            .toEqual({ rated: false, reason: "tooShort" });
    });
    it("핸디전이고 둘 다 충분히 쳤으면 반영한다", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [MIN_SHOTS_EACH, MIN_SHOTS_EACH] })).toEqual({ rated: true });
    });
    it("기대 승률 50:50 — 이기면 +K/2, 지면 -K/2, 무승부 0", () => {
        expect(ratingDelta(0)).toBe(ELO_K / 2);
        expect(ratingDelta(1)).toBe(-ELO_K / 2);
        expect(ratingDelta(null)).toBe(0);
    });
    it("같은 상대와 연달아 치면 폭이 줄어든다", () => {
        expect(ratingDelta(0, 1)).toBe(Math.round(ELO_K / 4));
        expect(ratingDelta(0, 3)).toBe(Math.round(ELO_K / 8));
    });
});
