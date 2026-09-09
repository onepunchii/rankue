import { describe, it, expect } from "vitest";
import type { SimEvent, CushionId } from "./types.js";
import { readRoute, matchesPattern, isLongRail } from "./drillRoute.js";

let clock = 0;
const bb = (a: string, b: string): SimEvent => ({ type: "ball-ball", t: ++clock, ids: [a, b].sort() as [string, string] });
const cu = (id: string, c: CushionId): SimEvent => ({ type: "ball-cushion", t: ++clock, ids: [id], cushion: c });
const OB = ["red", "yellow"];
const L = 2840;          // 대대 길이(짧은 쿠션 bottom y=0 · top y=L)
const NEAR_Y = 500;      // 큐볼이 bottom 쪽에서 출발 → 가까운 짧은 쿠션 = bottom

describe("길 읽기", () => {
    it("적구 먼저 — 첫 적구 뒤 첫 쿠션과 쿠션 차례를 뽑는다", () => {
        const r = readRoute([bb("white", "red"), cu("white", "left"), cu("white", "top"), cu("white", "right"), bb("white", "yellow")], "white", OB);
        expect(r).toMatchObject({ bankFirst: 0, contacts: 2, firstRailAfterBall: "left" });
        expect(r.rails).toEqual(["left", "top", "right"]);
    });
    it("빈쿠션 먼저 — 적구 전 쿠션을 센다", () => {
        const r = readRoute([cu("white", "left"), cu("white", "top"), bb("white", "red"), cu("white", "right"), bb("white", "yellow")], "white", OB);
        expect(r).toMatchObject({ bankFirst: 2, contacts: 2, firstRailAfterBall: "right" });
    });
    it("둘째 적구 뒤 쿠션은 세지 않는다", () => {
        const r = readRoute([bb("white", "red"), cu("white", "left"), bb("white", "yellow"), cu("white", "top"), cu("white", "top")], "white", OB);
        expect(r.rails).toEqual(["left"]);
    });
    it("같은 적구를 두 번 맞혀도 한 공 — 적구끼리 쫑·다른 공 쿠션은 무시", () => {
        const r = readRoute([bb("white", "red"), cu("red", "top"), bb("red", "yellow"), cu("white", "left"), bb("white", "red"), cu("white", "top"), bb("white", "yellow")], "white", OB);
        expect(r.contacts).toBe(2);
        expect(r.rails).toEqual(["left", "top"]);
    });
    it("아무것도 못 맞히면 접촉 0, 첫 쿠션은 null", () => {
        const r = readRoute([cu("white", "left"), cu("white", "top")], "white", OB);
        expect(r).toMatchObject({ bankFirst: 2, contacts: 0, firstRailAfterBall: null });
    });
    it("긴 쿠션은 left·right", () => {
        expect([isLongRail("left"), isLongRail("right"), isLongRail("top"), isLongRail("bottom")]).toEqual([true, true, false, false]);
    });
});

describe("이름표 일치 — 힌트가 길을 못박은 패턴만 판별한다", () => {
    const route = (ev: SimEvent[]) => readRoute(ev, "white", OB);
    const ball = (rails: CushionId[]) => route([bb("white", "red"), ...rails.map((c) => cu("white", c)), bb("white", "yellow")]);

    it("빈쿠션 = 적구 전에 쿠션이 있으면 참", () => {
        expect(matchesPattern(route([cu("white", "left"), bb("white", "red"), cu("white", "top"), cu("white", "right"), bb("white", "yellow")]), "bank")).toBe(true);
        expect(matchesPattern(ball(["left", "top", "right"]), "bank")).toBe(false);
    });
    it("대회전 = 적구 먼저 쿠션 5개 이상", () => {
        expect(matchesPattern(ball(["left", "top", "right", "bottom", "left"]), "grand-tour")).toBe(true);
        expect(matchesPattern(ball(["left", "top", "right"]), "grand-tour")).toBe(false);
    });
    it("더블레일 = 같은 '긴' 쿠션을 두 번, 사이에 다른 쿠션이 끼어도 된다", () => {
        expect(matchesPattern(ball(["left", "right", "left"]), "double-rail")).toBe(true);
        expect(matchesPattern(ball(["left", "right", "top", "left"]), "double-rail")).toBe(true);
        expect(matchesPattern(ball(["left", "left", "top"]), "double-rail")).toBe(true);
        // 짧은 쿠션 연속은 더블레일이 아니다 — 예전 규칙이 이걸 인정했다
        expect(matchesPattern(ball(["top", "top", "left"]), "double-rail")).toBe(false);
        expect(matchesPattern(ball(["left", "right", "top", "bottom"]), "double-rail")).toBe(false);
    });
    it("앞돌리기 = 적구 먼저, 그 뒤 첫 쿠션이 긴 쿠션 — 드릴 힌트와 같은 말", () => {
        expect(matchesPattern(ball(["right", "top", "left"]), "front-around")).toBe(true);
        expect(matchesPattern(ball(["top", "right", "bottom"]), "front-around")).toBe(false);
    });
    it("빈쿠션으로 시작하면 적구 먼저를 요구하는 패턴은 모두 거짓", () => {
        const bankStart = route([cu("white", "left"), bb("white", "red"), cu("white", "right"), cu("white", "left"), cu("white", "top"), cu("white", "bottom"), bb("white", "yellow")]);
        expect(matchesPattern(bankStart, "grand-tour")).toBe(false);
        expect(matchesPattern(bankStart, "double-rail")).toBe(false);
        expect(matchesPattern(bankStart, "front-around")).toBe(false);
    });
    it("정의가 갈리는 패턴은 지어내지 않고 null", () => {
        for (const p of ["back-around", "side-around", "short-back", "cross", "reverse", "long-angle"] as const) {
            expect(matchesPattern(ball(["left", "top", "right"]), p), p).toBeNull();
        }
    });
});
