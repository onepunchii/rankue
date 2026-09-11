import { describe, it, expect } from "vitest";
import {
    resolvePars, sanitizeScores, isCompleteRound, roundTotals, formatRelative,
    isDoubleHole, holeTransactions, settleMatch, minimalTransfers, rulesFor, DEFAULT_PAR, rankRound,
} from "./golfMatch";

const FRONT = [4, 4, 3, 5, 4, 4, 3, 5, 4];
const BACK = [4, 3, 4, 5, 4, 4, 3, 4, 5];
const skins = rulesFor("skins", { stake: 1000, useDouble: true, doublingMode: "next", birdieAmount: 5000, eagleAmount: 10000 });

function blank(): number[] { return new Array(18).fill(0); }
function player(id: string, holes: Record<number, number>) {
    const scores = blank();
    for (const [h, s] of Object.entries(holes)) scores[Number(h)] = s;
    return { memberId: id, name: id.toUpperCase(), scores };
}

describe("resolvePars", () => {
    it("전반·후반을 각각 받는다", () => {
        const cp = resolvePars(FRONT, BACK);
        expect(cp.pars).toEqual([...FRONT, ...BACK]);
        expect(cp.known.every(Boolean)).toBe(true);
    });
    it("한쪽이 비어도 다른 쪽 실제 파는 버리지 않는다 (예전엔 18홀 전부 가짜 파)", () => {
        const cp = resolvePars(FRONT, []);
        expect(cp.pars.slice(0, 9)).toEqual(FRONT);
        expect(cp.known.slice(0, 9).every(Boolean)).toBe(true);
        expect(cp.known.slice(9).some(Boolean)).toBe(false);
        expect(cp.pars.slice(9)).toEqual(DEFAULT_PAR.slice(9));
    });
    it("둘 다 모르면 전부 known=false", () => {
        const cp = resolvePars(undefined, null);
        expect(cp.known.some(Boolean)).toBe(false);
    });
    it("이상한 값이 섞이면 그 반쪽은 모르는 것으로 본다", () => {
        expect(resolvePars([4, 4, 3, 5, 4, 4, 3, 5, 9], BACK).known[0]).toBe(false);
    });
});

describe("sanitizeScores", () => {
    it("18칸 정수 0~15 만 통과", () => {
        expect(sanitizeScores(blank())).toEqual(blank());
        expect(sanitizeScores([...blank().slice(0, 17), 16])).toBeNull();
        expect(sanitizeScores([...blank().slice(0, 17), -1])).toBeNull();
        expect(sanitizeScores(blank().slice(0, 17))).toBeNull();
        expect(sanitizeScores("5")).toBeNull();
    });
    it("문자열 숫자는 숫자로 바꾼다 (예전엔 합계가 문자열로 이어붙었다)", () => {
        const s = sanitizeScores(new Array(18).fill("5"));
        expect(s).toEqual(new Array(18).fill(5));
        expect(roundTotals(s, [...FRONT, ...BACK]).strokes).toBe(90);
    });
});

describe("라운드 합계", () => {
    it("다 친 라운드만 complete", () => {
        expect(isCompleteRound(new Array(18).fill(4))).toBe(true);
        const s = new Array(18).fill(4); s[17] = 0;
        expect(isCompleteRound(s)).toBe(false);
    });
    it("안 친 홀은 파에 넣지 않는다", () => {
        const t = roundTotals([5, 5, 0, ...new Array(15).fill(0)], [...FRONT, ...BACK]);
        expect(t).toEqual({ strokes: 10, holesPlayed: 2, parPlayed: 8, relative: 2 });
    });
    it("formatRelative", () => {
        expect(formatRelative(0)).toBe("E");
        expect(formatRelative(3)).toBe("+3");
        expect(formatRelative(-2)).toBe("−2");
    });
});

describe("정산", () => {
    it("스트로크 모드는 판돈이 0이다 (숨은 1타 1만원이 붙던 문제)", () => {
        const r = rulesFor("stroke", { stake: 10000, useDouble: true, doublingMode: "next", birdieAmount: 10000 });
        expect(r).toEqual({ stake: 0, useDouble: false, doublingMode: "none", birdieAmount: 0, eagleAmount: 0 });
        const cp = resolvePars(FRONT, BACK);
        const s = settleMatch([player("a", { 0: 3 }), player("b", { 0: 6 })], cp, r);
        expect(s.transactions).toHaveLength(0);
    });
    it("rulesFor 는 음수·과대 금액을 자른다", () => {
        const r = rulesFor("skins", { stake: -5, birdieAmount: 9_999_999 });
        expect(r.stake).toBe(0);
        expect(r.birdieAmount).toBe(100_000);
    });
    it("전원 합은 0 (제로섬)", () => {
        const cp = resolvePars(FRONT, BACK);
        const ps = [
            player("a", { 0: 3, 1: 5, 2: 3, 3: 4 }),
            player("b", { 0: 4, 1: 4, 2: 5, 3: 6 }),
            player("c", { 0: 6, 1: 4, 2: 3, 3: 5 }),
            player("d", { 0: 4, 1: 8, 2: 2, 3: 5 }),
        ];
        const s = settleMatch(ps, cp, skins);
        expect(Object.values(s.totals).reduce((a, b) => a + b, 0)).toBe(0);
    });
    it("파를 모르는 홀에서는 버디 상금도 배판도 없다", () => {
        const cp = resolvePars(null, null); // 전부 모름
        const ps = [player("a", { 4: 4 }), player("b", { 4: 5 })]; // DEFAULT_PAR[4]=5 → 예전엔 a 버디
        const t = holeTransactions(4, ps, cp, skins);
        expect(t).toHaveLength(1);
        expect(t[0].amount).toBe(1000); // 1타 차이만
        expect(isDoubleHole(5, ps, cp, skins)).toBe(false);
    });
    it("파를 아는 홀의 버디는 상금 + 다음 홀 배판", () => {
        const cp = resolvePars(FRONT, BACK);
        const ps = [player("a", { 0: 3, 1: 4 }), player("b", { 0: 4, 1: 5 })];
        const h0 = holeTransactions(0, ps, cp, skins);
        expect(h0[0].amount).toBe(1000 + 5000);
        expect(isDoubleHole(1, ps, cp, skins)).toBe(true);
        expect(holeTransactions(1, ps, cp, skins)[0].amount).toBe(2000);
    });
    it("한 사람이라도 안 적은 홀은 그 쌍을 건너뛴다", () => {
        const cp = resolvePars(FRONT, BACK);
        expect(holeTransactions(0, [player("a", { 0: 3 }), player("b", {})], cp, skins)).toHaveLength(0);
    });
});

describe("minimalTransfers", () => {
    it("최소 건수로 줄인다", () => {
        const t = minimalTransfers({ a: 30000, b: -10000, c: -20000, d: 0 });
        expect(t).toEqual([
            { fromId: "c", toId: "a", amount: 20000 },
            { fromId: "b", toId: "a", amount: 10000 },
        ]);
    });
    it("정산 결과와 합이 맞는다", () => {
        const cp = resolvePars(FRONT, BACK);
        const ps = [player("a", { 0: 3, 1: 6 }), player("b", { 0: 5, 1: 4 }), player("c", { 0: 4, 1: 4 })];
        const s = settleMatch(ps, cp, skins);
        const t = minimalTransfers(s.totals);
        const net: Record<string, number> = { a: 0, b: 0, c: 0 };
        for (const x of t) { net[x.fromId] -= x.amount; net[x.toId] += x.amount; }
        expect(net).toEqual(s.totals);
    });
});

describe("rankRound", () => {
    const P = [...FRONT, ...BACK];
    const full = (delta: number) => P.map((p, i) => (i === 0 ? p + delta : p));
    it("친 홀이 많은 사람이 앞 — 9홀만 친 사람이 18홀 완주자를 앞서지 않는다", () => {
        const a = { memberId: "a", name: "A", scores: full(15) };
        const b = { memberId: "b", name: "B", scores: [...new Array(9).fill(0), ...BACK] };
        const r = rankRound([b, a], P);
        expect(r[0].player.memberId).toBe("a");
        expect(r[0].winner).toBe(true);
        expect(r[1].winner).toBe(false);
    });
    it("한 홀도 안 적은 사람은 1위가 아니다", () => {
        const r = rankRound([{ memberId: "g", name: "G", scores: blank() }, { memberId: "a", name: "A", scores: full(3) }], P);
        expect(r[0].player.memberId).toBe("a");
        expect(r.find((x) => x.player.memberId === "g")!.winner).toBe(false);
    });
    it("동타면 공동 1위, 혼자면 승자 없음", () => {
        const r = rankRound([{ memberId: "a", name: "A", scores: full(1) }, { memberId: "b", name: "B", scores: full(1) }], P);
        expect(r.map((x) => [x.rank, x.winner])).toEqual([[1, true], [1, true]]);
        expect(rankRound([{ memberId: "a", name: "A", scores: full(0) }], P)[0].winner).toBe(false);
    });
});
