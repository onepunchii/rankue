/**
 * RP 증감식. 경기 종료가 더한 값을 어드민 삭제가 그대로 빼야 하므로(adminDeleteFinishedGame),
 * 두 곳이 같은 함수를 쓰는지와 구간 경계를 못박아 둔다. 임계값은 HANDICAP_MAP 의 스케일과 한 몸이다.
 */
import { describe, it, expect } from "vitest";
import { rpDeltaFor } from "./game.repo.js";

describe("rpDeltaFor", () => {
    it("승리는 종목·핸디와 무관하게 +30", () => {
        expect(rpDeltaFor("4c", true, 0)).toBe(30);
        expect(rpDeltaFor("3c", true, 50)).toBe(30);
    });

    it("4구 패배: 12 미만 면제, 25 미만 -5, 그 위 -15", () => {
        expect(rpDeltaFor("4c", false, 10)).toBe(0);
        expect(rpDeltaFor("4c", false, 12)).toBe(-5);
        expect(rpDeltaFor("4c", false, 20)).toBe(-5);
        expect(rpDeltaFor("4c", false, 25)).toBe(-15);
        expect(rpDeltaFor("4c", false, 50)).toBe(-15);
    });

    it("3쿠션 패배: 16 미만 면제, 22 미만 -5, 그 위 -15", () => {
        expect(rpDeltaFor("3c", false, 15)).toBe(0);
        expect(rpDeltaFor("3c", false, 18)).toBe(-5);
        expect(rpDeltaFor("3c", false, 23)).toBe(-15);
    });

    it("되돌리기는 더한 값을 그대로 뺀다 — 같은 핸디면 합이 0", () => {
        for (const handi of [0, 12, 20, 25, 30]) {
            for (const win of [true, false]) {
                const applied = rpDeltaFor("4c", win, handi);
                expect(applied + -applied).toBe(0);
            }
        }
    });
});
