import { describe, it, expect } from "vitest";
import { TRIP_POINTS, cleanTrip, seasonTable, tripBoard, type TripCatch } from "./fishingTrip";

const c = (memberId: string, species: string, over: Partial<TripCatch> = {}): TripCatch => ({ memberId, name: memberId.toUpperCase(), species, lengthCm: null, count: 1, ...over });

describe("정출판", () => {
    const list = [
        c("a", "감성돔", { lengthCm: 47 }), c("a", "볼락", { lengthCm: 22, count: 6 }),
        c("b", "감성돔", { lengthCm: 41 }), c("b", "주꾸미", { count: 30, lengthCm: 60 }), c("b", "노래미", { lengthCm: 28 }),
        c("d", "우럭", { count: 2 }),
    ];
    const board = tripBoard(list);
    it("최대어는 길이 어종만 — 주꾸미에 길이를 적어도 최대어가 되지 않는다", () => {
        expect(board.awards.biggest).toEqual(["a"]);
        expect(board.members.find((m) => m.memberId === "b")!.best).toEqual({ species: "감성돔", lengthCm: 41 });
        expect(board.members.find((m) => m.memberId === "d")!.best).toBeNull();
    });
    it("마릿수는 더한 값 · 잡어상은 가장 여러 어종(둘 이상일 때만)", () => {
        expect(board.awards.most).toEqual(["b"]);
        expect(board.awards.variety).toEqual(["b"]);
        expect(board.members.map((m) => [m.memberId, m.fish, m.species])).toEqual([["a", 7, 2], ["b", 32, 3], ["d", 2, 1]]);
        expect(tripBoard([c("a", "붕어"), c("b", "붕어")]).awards.variety).toEqual([]);
    });
    it("점수 — 참석 1 · 최대어 3 · 마릿수 2 · 잡어상 1, 높은 순", () => {
        expect(TRIP_POINTS).toEqual({ attend: 1, biggest: 3, most: 2, variety: 1 });
        expect(board.members.map((m) => [m.memberId, m.points, m.awards])).toEqual([["a", 4, ["biggest"]], ["b", 4, ["most", "variety"]], ["d", 1, []]]);
    });
    it("같은 값이면 같이 받는다 · 아무도 없으면 빈 판", () => {
        const tie = tripBoard([c("a", "붕어", { lengthCm: 33 }), c("b", "붕어", { lengthCm: 33 })]);
        expect(tie.awards.biggest).toEqual(["a", "b"]);
        expect(tie.awards.most).toEqual(["a", "b"]);
        expect(tripBoard([])).toEqual({ members: [], awards: { biggest: [], most: [], variety: [] } });
    });
    it("목록에 없는 이름도 길이를 적었으면 최대어를 겨룬다", () => {
        expect(tripBoard([c("a", "망둥어", { lengthCm: 19 })]).awards.biggest).toEqual(["a"]);
    });
});

describe("한 해의 판", () => {
    it("정출마다의 점수 · 상 · 참석을 더하고, 한 해의 최대어를 남긴다", () => {
        const t1 = tripBoard([c("a", "감성돔", { lengthCm: 47 }), c("b", "감성돔", { lengthCm: 41, count: 3 })]);
        const t2 = tripBoard([c("b", "농어", { lengthCm: 82 }), c("d", "우럭", { lengthCm: 30 })]);
        const s = seasonTable([t1, t2]);
        // 둘째 정출: 둘 다 한 마리라 마릿수는 같이 받는다(공동) — d 는 참석 1 + 마릿수 2
        expect(s.map((r) => [r.memberId, r.points, r.trips])).toEqual([["b", 9, 2], ["a", 4, 1], ["d", 3, 1]]);
        expect(s[0].awards).toEqual({ biggest: 1, most: 2, variety: 0 });
        expect(s[0].best).toEqual({ species: "농어", lengthCm: 82 });
        expect(seasonTable([])).toEqual([]);
    });
});

describe("정출 만들기", () => {
    const TODAY = "2026-10-14";
    it("지난 날도 · 앞날은 한 해 안쪽까지", () => {
        expect(cleanTrip({ day: "2026-11-01", place: " 추자도 ", title: " 11월 정출 " }, TODAY)).toEqual({ ok: true, value: { day: "2026-11-01", place: "추자도", title: "11월 정출" } });
        expect(cleanTrip({ day: "2026-09-01", place: "여수" }, TODAY)).toMatchObject({ ok: true, value: { title: null } });
        for (const bad of [{ day: "2028-01-01", place: "여수" }, { day: "어제", place: "여수" }, { day: "2026-11-01", place: "" }, null]) expect(cleanTrip(bad, TODAY).ok, JSON.stringify(bad)).toBe(false);
    });
});
