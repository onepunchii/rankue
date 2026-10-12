/** 장식장 응답 읽기 · 주소 · '새로 받은 것' 기억(2026-10-12). */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { SHELF_SEEN_KEY, createShelfApi, isShelfNew, parseShelf, readShelfSeen, shelfPath, shelfUrl, writeShelfSeen } from "./shelfApi";

const memory = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, dump: () => Object.fromEntries(m) };
};

describe("장식장 응답 읽기", () => {
    const raw = {
        member: { id: "m1", name: "최정환", country: "KR", mine: true },
        tier: { gameType: "3c", tier: "gold", rating: 1160 },
        awards: [
            { month: "2026-10", kind: "month_rank", gameType: "3c", rank: 2, tier: null, points: 22, matches: 7, wins: 5, rating: 1116 },
            { month: "2026-10", kind: "month_tier", gameType: "3c", rank: null, tier: "silver", points: 22, matches: 7, wins: 5, rating: 1116 },
        ],
        current: { month: "2026-11", daysLeft: 12, minMatches: 5, boards: [{ gameType: "4c", points: -12, matches: 5, wins: 2, rank: 3, total: 3, medal: null, tier: "bronze" }] },
        since: "2026-10", closedThrough: "2026-10",
    };

    it("받은 것 · 이번 달 · 지금 등급을 그대로 읽는다", () => {
        const s = parseShelf(raw);
        expect(s.member).toEqual({ id: "m1", name: "최정환", country: "KR", mine: true });
        expect(s.tier).toEqual({ gameType: "3c", tier: "gold", rating: 1160 });
        expect(s.awards.map((a) => `${a.month}:${a.kind}:${a.rank ?? a.tier}`)).toEqual(["2026-10:month_rank:2", "2026-10:month_tier:silver"]);
        expect(s.current.boards[0]).toEqual({ gameType: "4c", points: -12, matches: 5, wins: 2, rank: 3, total: 3, medal: null, tier: "bronze" });
        expect([s.since, s.closedThrough]).toEqual(["2026-10", "2026-10"]);
    });

    it("종류와 값이 맞지 않는 줄은 버린다 — 빈 그림을 그리지 않는다", () => {
        const s = parseShelf({ ...raw, awards: [
            { month: "2026-10", kind: "month_rank", gameType: "3c", rank: 4 },          // 메달인데 4등
            { month: "2026-10", kind: "month_tier", gameType: "3c", tier: "legend" },   // 없는 등급
            { month: "10월", kind: "month_tier", gameType: "3c", tier: "gold" },         // 달 표기가 틀렸다
            { month: "2026-10", kind: "trophy", gameType: "3c", rank: 1 },              // 모르는 종류(나중에 생길 것 — 옛 화면이 깨지지 않게 버린다)
            { month: "2026-10", kind: "cup", gameType: "3c", rank: 6 },                 // 월대회 메달인데 6등(메달은 1~5)
            { month: "2026-09", kind: "month_tier", gameType: "4c", tier: "iron" },
        ] });
        expect(s.awards.map((a) => `${a.month}:${a.tier}`)).toEqual(["2026-09:iron"]);
    });

    it("월대회 메달(cup)은 1~5 — 우승 · 준우승 · 3위 · 4위 · 8강", () => {
        const s = parseShelf({ ...raw, awards: [
            { month: "2026-10", kind: "cup", gameType: "3c", rank: 1, tier: null },
            { month: "2026-10", kind: "cup", gameType: "3c", rank: 5 },
            { month: "2026-10", kind: "month_rank", gameType: "3c", rank: 5 },   // 이달의 랭킹 메달은 1~3 뿐이다
        ] });
        expect(s.awards.map((a) => `${a.kind}:${a.rank}`)).toEqual(["cup:1", "cup:5"]);
    });

    it("빈 답 · 깨진 답에도 화면이 그릴 모양을 준다 — 배치 전이면 등급이 없다", () => {
        for (const bad of [null, undefined, "x", {}, { awards: "no", current: 3, tier: { tier: "none" } }]) {
            const s = parseShelf(bad);
            expect(s.tier).toBeNull();
            expect(s.awards).toEqual([]);
            expect(s.current.boards).toEqual([]);
            expect(s.closedThrough).toBeNull();
            expect(s.member.mine).toBe(false);
        }
    });

    it("주소: 내 것은 id 없이, 남의 것은 그 회원 id 로", async () => {
        expect(shelfUrl()).toBe("/api/hiq/sim/shelf");
        expect(shelfUrl("abc-1")).toBe("/api/hiq/sim/shelf?memberId=abc-1");
        expect(shelfPath()).toBe("/online-game?shelf=1");
        expect(shelfPath("abc-1")).toBe("/online-game?shelf=1&m=abc-1");
        const request = vi.fn(async () => raw);
        const s = await createShelfApi(request).get("abc-1");
        expect(request).toHaveBeenCalledWith("/api/hiq/sim/shelf?memberId=abc-1");
        expect(s.awards).toHaveLength(2);
    });
});

describe("새로 받은 것 — 이 기기에서 마지막으로 본 달", () => {
    it("받은 달이 본 달보다 뒤면 새것이다 — 받은 것이 없으면 새것도 없다", () => {
        expect(isShelfNew("2026-11", "2026-10")).toBe(true);
        expect(isShelfNew("2026-10", "2026-10")).toBe(false);
        expect(isShelfNew("2026-10", "")).toBe(true);
        expect(isShelfNew(null, "")).toBe(false);
        expect(isShelfNew(undefined, "2026-10")).toBe(false);
        expect(isShelfNew("어제", "")).toBe(false);
    });

    it("본 달은 뒤로만 간다 — 옛 달을 다시 적어도 줄지 않는다", () => {
        const store = memory();
        expect(readShelfSeen(store)).toBe("");
        writeShelfSeen("2026-11", store);
        writeShelfSeen("2026-10", store);
        writeShelfSeen("엉뚱한 값", store);
        expect(store.dump()).toEqual({ [SHELF_SEEN_KEY]: "2026-11" });
        expect(readShelfSeen(store)).toBe("2026-11");
        // 저장소에 엉뚱한 값이 있으면 못 본 것으로 친다
        expect(readShelfSeen(memory({ [SHELF_SEEN_KEY]: "x" }))).toBe("");
    });

    it("저장소를 못 쓰는 기기에서도 터지지 않는다", () => {
        const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
        expect(readShelfSeen(broken)).toBe("");
        expect(() => writeShelfSeen("2026-11", broken)).not.toThrow();
        expect(readShelfSeen(null)).toBe("");
        expect(() => writeShelfSeen("2026-11", null)).not.toThrow();
    });
});
