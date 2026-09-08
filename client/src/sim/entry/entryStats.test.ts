import { describe, it, expect } from "vitest";
import { entryOrder, formatAvg, matchRecord, practiceSummary } from "./entryStats";

describe("entryStats", () => {
    it("대전 전적: 끝난 것만 승·패, 승자 없음은 무효, 진행 중은 active·내 차례", () => {
        const r = matchRecord([
            { status: "finished", myIndex: 0, turn: 1, winnerIndex: 0 },
            { status: "finished", myIndex: 1, turn: 0, winnerIndex: 0 },
            { status: "finished", myIndex: 1, turn: 0, winnerIndex: null },
            { status: "playing", myIndex: 0, turn: 0, winnerIndex: null },
            { status: "playing", myIndex: 1, turn: 0, winnerIndex: null },
            { status: "waiting", myIndex: 0, turn: 0, winnerIndex: null },
            { status: "canceled", myIndex: 0, turn: 0, winnerIndex: null },
        ]);
        expect(r).toEqual({ wins: 1, losses: 1, myTurn: 1, active: 3 });
        expect(matchRecord([])).toEqual({ wins: 0, losses: 0, myTurn: 0, active: 0 });
    });
    it("연습 요약: 세션 합·최고 에버, 없으면 null", () => {
        expect(practiceSummary([{ sessions: 3, bestAvg: 0.5 }, { sessions: 2, bestAvg: 0.8 }])).toEqual({ sessions: 5, bestAvg: 0.8 });
        expect(practiceSummary([{ sessions: 0, bestAvg: 0 }])).toBeNull();
        expect(practiceSummary([])).toBeNull();
        expect(formatAvg(0.6234)).toBe("0.62");
        expect(formatAvg(Number.NaN)).toBe("0.00");
    });
    it("마지막에 고른 그룹이 위, 예전 저장값(single/multi/rooms/path)도 그룹으로 읽는다", () => {
        expect(entryOrder(null)).toEqual(["solo", "together"]);
        expect(entryOrder("together")).toEqual(["together", "solo"]);
        expect(entryOrder("solo")).toEqual(["solo", "together"]);
        expect(entryOrder("multi")).toEqual(["together", "solo"]);
        expect(entryOrder("rooms")).toEqual(["together", "solo"]);
        expect(entryOrder("path")).toEqual(["solo", "together"]);
        expect(entryOrder("garbage")).toEqual(["solo", "together"]);
    });
});
