import { describe, it, expect } from "vitest";
import { ballThemeOf, breakerOf, canChooseBreaker, inningOf, nextSlot, playOrder, turnFromArrays } from "./scoreboardOrder";

describe("초구와 차례 순서", () => {
    it("저장된 초구 — 없거나 범위 밖이면 1(예전 경기는 늘 1번이 먼저였다)", () => {
        expect(breakerOf(undefined, 2)).toBe(1);
        expect(breakerOf(null, 2)).toBe(1);
        expect(breakerOf(2, 2)).toBe(2);
        expect(breakerOf(3, 2)).toBe(1);
        expect(breakerOf(4, 4)).toBe(4);
        expect(breakerOf("2", 3)).toBe(2);
    });
    it("차례는 자리 번호 순서로 돈다 — 초구는 시작점만 바꾼다", () => {
        expect(nextSlot(1, 2)).toBe(2);
        expect(nextSlot(2, 2)).toBe(1);
        expect(nextSlot(4, 4)).toBe(1);
        expect(playOrder(1, 2)).toEqual([1, 2]);
        expect(playOrder(2, 2)).toEqual([2, 1]);
        expect(playOrder(3, 4)).toEqual([3, 4, 1, 2]);
    });
    it("이닝 = 초구의 이닝 배열 길이 + (지금 초구 차례면 1)", () => {
        // 2번이 초구: 시작 → 1이닝, 2번이 마침 → 1번 차례 1이닝, 1번이 마침 → 2번 차례 2이닝
        expect(inningOf([[], []], 2, 2)).toBe(1);
        expect(inningOf([[], [4]], 2, 1)).toBe(1);
        expect(inningOf([[0], [4]], 2, 2)).toBe(2);
        // 1번이 초구(예전과 같다)
        expect(inningOf([[1, 2], [0]], 1, 2)).toBe(2);
        expect(inningOf([[1, 2], [0, 3]], 1, 1)).toBe(3);
        // 기록이 깨져도 1 아래로는 안 간다
        expect(inningOf([], 1, 2)).toBe(1);
    });
    it("새로고침 — 초구부터의 순서에서 이닝 배열이 가장 짧은 첫 사람의 차례", () => {
        expect(turnFromArrays([[], []], 2, 2)).toBe(2);
        expect(turnFromArrays([[], [4]], 2, 2)).toBe(1);
        expect(turnFromArrays([[0], [4]], 2, 2)).toBe(2);
        // 초구가 1이면 예전 규칙(가장 짧은 사람, 같으면 1번)과 같다
        expect(turnFromArrays([[1], [2]], 1, 2)).toBe(1);
        expect(turnFromArrays([[1], []], 1, 2)).toBe(2);
        // 4인 · 3번 초구: 3 → 4 → 1 → 2
        expect(turnFromArrays([[], [], [5], []], 3, 4)).toBe(4);
        expect(turnFromArrays([[2], [], [5], [1]], 3, 4)).toBe(2);
        expect(turnFromArrays([[2], [3], [5], [1]], 3, 4)).toBe(3);
    });
    it("공 색은 치는 순서 — 초구가 흰 공", () => {
        expect(ballThemeOf(1, 1, 2)).toBe("white");
        expect(ballThemeOf(2, 1, 2)).toBe("yellow");
        expect(ballThemeOf(2, 2, 2)).toBe("white");
        expect(ballThemeOf(1, 2, 2)).toBe("yellow");
        expect([1, 2, 3, 4].map((s) => ballThemeOf(s as 1, 3, 4))).toEqual(["red", "blue", "white", "yellow"]);
    });
    it("초구는 아무 일도 없던 판에서만 바꾼다", () => {
        const fresh = { p1Score: 0, p2Score: 0, p1Run: 0, p2Run: 0, p1FinishScore: 0, p2FinishScore: 0, p1Innings: [], p2Innings: [] };
        expect(canChooseBreaker(fresh, 2)).toBe(true);
        expect(canChooseBreaker({ ...fresh, p1Score: 1, p1Run: 1 }, 2)).toBe(false);
        expect(canChooseBreaker({ ...fresh, p2Innings: [0] }, 2)).toBe(false);
        expect(canChooseBreaker({ ...fresh, p1Score: -1 }, 2)).toBe(false);   // 파울 감점도 시작이다
        // 비어 있는 3 · 4번 자리는 보지 않는다
        expect(canChooseBreaker({ ...fresh, p3Score: 5 }, 2)).toBe(true);
    });
});
