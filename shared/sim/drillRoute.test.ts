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

describe("이름표 일치", () => {
    const route = (ev: SimEvent[]) => readRoute(ev, "white", OB);
    const ball = (rails: CushionId[]) => route([bb("white", "red"), ...rails.map((c) => cu("white", c)), bb("white", "yellow")]);

    it("빈쿠션 = 적구 전에 쿠션이 있으면 참", () => {
        expect(matchesPattern(route([cu("white", "left"), bb("white", "red"), cu("white", "top"), cu("white", "right"), bb("white", "yellow")]), "bank", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["left", "top", "right"]), "bank", NEAR_Y, L)).toBe(false);
    });
    it("옆돌리기 = 적구 먼저, 그 뒤 첫 쿠션이 긴 쿠션", () => {
        expect(matchesPattern(ball(["left", "top", "right"]), "side-around", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["bottom", "left", "right"]), "side-around", NEAR_Y, L)).toBe(false);
    });
    it("뒤돌리기 = 출발한 쪽 짧은 쿠션, 앞돌리기 = 건너편 짧은 쿠션", () => {
        expect(matchesPattern(ball(["bottom", "left", "top"]), "back-around", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["top", "left", "bottom"]), "back-around", NEAR_Y, L)).toBe(false);
        expect(matchesPattern(ball(["top", "left", "bottom"]), "front-around", NEAR_Y, L)).toBe(true);
        // 큐볼이 반대쪽에서 출발하면 가까운 쿠션도 뒤집힌다
        expect(matchesPattern(ball(["top", "left", "bottom"]), "back-around", L - NEAR_Y, L)).toBe(true);
    });
    it("짧은 뒤돌리기는 쿠션 3개 이하", () => {
        expect(matchesPattern(ball(["bottom", "left", "top"]), "short-back", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["bottom", "left", "top", "right"]), "short-back", NEAR_Y, L)).toBe(false);
    });
    it("대회전 = 적구 먼저 쿠션 5개 이상, 더블레일 = 같은 쿠션 연속", () => {
        expect(matchesPattern(ball(["left", "top", "right", "bottom", "left"]), "grand-tour", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["left", "top", "right"]), "grand-tour", NEAR_Y, L)).toBe(false);
        expect(matchesPattern(ball(["left", "left", "top"]), "double-rail", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["left", "top", "left"]), "double-rail", NEAR_Y, L)).toBe(false);
    });
    it("횡단 = 마주 보는 긴 쿠션을 잇달아", () => {
        expect(matchesPattern(ball(["right", "left", "bottom"]), "cross", NEAR_Y, L)).toBe(true);
        expect(matchesPattern(ball(["right", "top", "left"]), "cross", NEAR_Y, L)).toBe(false);
    });
    it("역회전·긴각은 샷 기록만으로 못 가른다 — 지어내지 않고 null", () => {
        expect(matchesPattern(ball(["left", "top", "right"]), "reverse", NEAR_Y, L)).toBeNull();
        expect(matchesPattern(ball(["left", "top", "right"]), "long-angle", NEAR_Y, L)).toBeNull();
    });
});
