import { describe, it, expect } from "vitest";
import { splitAmount, computeTransfers, checkSettlementRound } from "./crewSettlement.js";

describe("splitAmount — 1원 단위 정확히, 나머지는 계산한 사람", () => {
    it("30,000원 7명: 4,285원씩, 나머지 5원은 계산한 사람", () => {
        const ids = ["a", "b", "c", "d", "e", "f", "g"];
        const r = splitAmount(30000, ids, "a");
        expect(r.base).toBe(4285);
        expect(r.remainder).toBe(5);
        expect(r.shares.a).toBe(4290);
        expect(Object.values(r.shares).reduce((s, v) => s + v, 0)).toBe(30000);
    });
    it("계산한 사람이 참석자가 아니면 앞에서부터 1원씩", () => {
        const r = splitAmount(10, ["a", "b", "c"], "z");
        expect(r.shares).toEqual({ a: 4, b: 3, c: 3 });
    });
    it("참석자 0명", () => {
        expect(splitAmount(1000, [], "a")).toEqual({ base: 0, remainder: 0, shares: {} });
    });
});

describe("computeTransfers — 받는 사람은 각 차수의 계산한 사람", () => {
    it("두 차수, 계산한 사람이 다르면 각자에게 보낸다", () => {
        const { transfers, balances } = computeTransfers([
            { amount: 30000, payerId: "a", participants: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }] },
            { amount: 20000, payerId: "b", participants: [{ memberId: "b" }, { memberId: "c" }] },
        ]);
        // a: +30000 - 10000 = 20000, b: +20000 - 10000 - 10000 = 0, c: -20000
        expect(balances).toEqual({ a: 20000, b: 0, c: -20000 });
        expect(transfers).toEqual([{ fromId: "c", toId: "a", amount: 20000 }]);
    });
    it("송금 합 = 받을 돈 합(나머지 원 단위 손실 없음)", () => {
        const { transfers, balances } = computeTransfers([
            { amount: 30001, payerId: "a", participants: ["a", "b", "c", "d", "e", "f", "g"].map((memberId) => ({ memberId })) },
        ]);
        const sent = transfers.reduce((s, t) => s + t.amount, 0);
        expect(sent).toBe(balances.a);
        expect(transfers.every((t) => t.toId === "a")).toBe(true);
    });
});

describe("checkSettlementRound", () => {
    it("빈 금액·0원·소수는 amount", () => {
        expect(checkSettlementRound({ amount: "", payerId: "a", participants: ["a"] })).toBe("amount");
        expect(checkSettlementRound({ amount: 0, payerId: "a", participants: ["a"] })).toBe("amount");
        expect(checkSettlementRound({ amount: 10.5, payerId: "a", participants: ["a"] })).toBe("amount");
    });
    it("참석자 없음·계산한 사람 없음/참석자 밖", () => {
        expect(checkSettlementRound({ amount: 1000, payerId: "a", participants: [] })).toBe("participants");
        expect(checkSettlementRound({ amount: 1000, payerId: "", participants: ["a"] })).toBe("payer");
        expect(checkSettlementRound({ amount: 1000, payerId: "z", participants: ["a"] })).toBe("payer");
        expect(checkSettlementRound({ amount: "1000", payerId: "a", participants: ["a"] })).toBeNull();
    });
});
