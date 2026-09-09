import { describe, it, expect } from "vitest";
import type { SimEvent } from "../types.js";
import { evaluateShot, DEFAULT_3C_RULES, DEFAULT_4C_RULES, objectBallIds } from "./evaluate.js";
import type { Rules } from "./types.js";

// 합성 이벤트 로그 빌더. 시간은 순서만 의미 있다.
let clock = 0;
const bb = (a: string, b: string): SimEvent => ({ type: "ball-ball", t: ++clock, ids: [a, b].sort() as [string, string] });
const cu = (id: string, c: "left" | "right" | "top" | "bottom" = "left"): SimEvent => ({ type: "ball-cushion", t: ++clock, ids: [id], cushion: c });
const tr = (id: string): SimEvent => ({ type: "transition", t: ++clock, ids: [id], from: "sliding", to: "rolling" });
const PBA: Rules = { gameType: "3c", ruleSet: "pba", bankShotPoint: 2 };

describe("3쿠션 판정 (UMB 기본)", () => {
    it("적구 → 쿠션 3 → 적구 = 1점", () => {
        const o = evaluateShot([tr("white"), bb("white", "yellow"), cu("white"), cu("white", "top"), cu("white", "right"), bb("white", "red")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point"); expect(o.points).toBe(1); expect(o.scored).toBe(true);
        expect(o.cushionsBeforeSecond).toBe(3); expect(o.cushionsBeforeFirst).toBe(0);
        expect(o.contacts).toEqual(["yellow", "red"]);
    });
    it("쿠션 2 → 적구 → 쿠션 1 → 적구 = 1점 (순서 무관, 합산)", () => {
        const o = evaluateShot([cu("white"), cu("white"), bb("white", "red"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point"); expect(o.cushionsBeforeSecond).toBe(3);
    });
    it("쿠션 2개면 무득점, 이닝 소모", () => {
        const o = evaluateShot([bb("white", "red"), cu("white"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("miss-cushions"); expect(o.points).toBe(0); expect(o.consumesInning).toBe(true);
    });
    it("두 번째 적구 접촉 이후의 쿠션은 세지 않는다", () => {
        const o = evaluateShot([bb("white", "red"), cu("white"), bb("white", "yellow"), cu("white"), cu("white")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("miss-cushions"); expect(o.cushionsBeforeSecond).toBe(1);
    });
    it("적구가 밟은 쿠션은 세지 않는다", () => {
        const o = evaluateShot([bb("white", "red"), cu("red"), cu("red"), cu("red"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("miss-cushions"); expect(o.cushionsBeforeSecond).toBe(0);
    });
    it("코너: 같은 시각 두 면 이벤트는 2쿠션", () => {
        const o = evaluateShot([bb("white", "red"), cu("white", "left"), cu("white", "bottom"), cu("white", "right"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point");
    });
    it("키스(같은 적구 재접촉)는 합법이고 kisses 로 집계", () => {
        const o = evaluateShot([bb("white", "red"), cu("white"), bb("white", "red"), cu("white"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point"); expect(o.kisses).toBe(1);
    });
    it("적구끼리 쫑은 판정에 무관", () => {
        const o = evaluateShot([bb("white", "red"), bb("red", "yellow"), cu("white"), cu("white"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point"); expect(o.kisses).toBe(1);
    });
    it("뱅크샷(쿠션 3 먼저)은 UMB 에서 1점, PBA 에서 2점", () => {
        const ev = [cu("white"), cu("white"), cu("white"), bb("white", "red"), bb("white", "yellow")];
        expect(evaluateShot(ev, "white", DEFAULT_3C_RULES)).toMatchObject({ code: "point", points: 1 });
        expect(evaluateShot(ev, "white", PBA)).toMatchObject({ code: "point-bank", points: 2 });
    });
    it("PBA 에서도 쿠션 2 → 적구 → 쿠션 1 은 1점(뱅크 아님)", () => {
        const ev = [cu("white"), cu("white"), bb("white", "red"), cu("white"), bb("white", "yellow")];
        expect(evaluateShot(ev, "white", PBA)).toMatchObject({ code: "point", points: 1 });
    });
    it("한 공만 맞힘 / 아무것도 못 맞힘 / 쿠션만", () => {
        expect(evaluateShot([bb("white", "red"), cu("white")], "white", DEFAULT_3C_RULES).code).toBe("miss-one-ball");
        expect(evaluateShot([cu("white"), cu("white"), tr("white")], "white", DEFAULT_3C_RULES).code).toBe("miss-no-contact");
    });
    it("이벤트에 큐볼이 전혀 없으면 no-shot (이닝 소모 안 함)", () => {
        const o = evaluateShot([], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("no-shot"); expect(o.consumesInning).toBe(false);
    });
    it("truncated 는 무효 샷", () => {
        expect(evaluateShot([bb("white", "red")], "white", DEFAULT_3C_RULES, true).code).toBe("foul-truncated");
    });
    it("노란 공이 큐볼이면 흰 공이 적구", () => {
        expect(objectBallIds("3c", "yellow")).toEqual(["white", "red"]);
        const o = evaluateShot([bb("yellow", "white"), cu("yellow"), cu("yellow"), cu("yellow"), bb("yellow", "red")], "yellow", DEFAULT_3C_RULES);
        expect(o.code).toBe("point");
    });
    it("적구가 정지한 큐볼에 굴러와 닿아도 접촉으로 인정", () => {
        // 흰 공이 red 를 맞히고 멈춘 뒤, red 가 쿠션을 돌아 yellow 를 밀고 yellow 가 white 에 닿음
        const o = evaluateShot([bb("white", "red"), cu("white"), cu("white"), cu("white"), bb("red", "yellow"), bb("yellow", "white")], "white", DEFAULT_3C_RULES);
        expect(o.code).toBe("point");
    });
});

describe("4구 판정 (국내 관행)", () => {
    it("두 빨간 공 = +10", () => {
        const o = evaluateShot([bb("white", "red1"), bb("white", "red2")], "white", DEFAULT_4C_RULES);
        expect(o).toMatchObject({ code: "point", points: 10, scored: true });
    });
    it("같은 빨간 공 두 번은 한 공", () => {
        const o = evaluateShot([bb("white", "red1"), cu("white"), bb("white", "red1")], "white", DEFAULT_4C_RULES);
        expect(o.code).toBe("miss-one-ball"); expect(o.kisses).toBe(1);
    });
    it("상대 큐볼 직접 접촉 = −10 (득점보다 우선)", () => {
        const o = evaluateShot([bb("white", "red1"), bb("white", "yellow"), bb("white", "red2")], "white", DEFAULT_4C_RULES);
        expect(o).toMatchObject({ code: "foul-opponent", points: -10, consumesInning: true });
    });
    it("적구가 상대 큐볼을 미는 건 파울이 아니다 — 실제 당구에 없는 규칙이라 옵션째로 없앴다(2026-09-09)", () => {
        const ev = [bb("white", "red1"), bb("red1", "yellow"), bb("white", "red2")];
        expect(evaluateShot(ev, "white", DEFAULT_4C_RULES).code).toBe("point");
        // 옛 방에 남아 있는 값이 켜져 있어도 판정은 같다(호환 필드일 뿐)
        const legacy: Rules = { ...DEFAULT_4C_RULES, gameType: "4c", passiveOpponentContactIsFoul: true };
        expect(evaluateShot(ev, "white", legacy).code).toBe("point");
        const oneBall = [bb("white", "red1"), bb("red1", "yellow")];
        expect(evaluateShot(oneBall, "white", legacy).code).toBe("miss-one-ball");
    });
    it("3쿠션 2배 옵션", () => {
        const ev = [bb("white", "red1"), cu("white"), cu("white"), cu("white"), bb("white", "red2")];
        expect(evaluateShot(ev, "white", DEFAULT_4C_RULES)).toMatchObject({ code: "point", points: 10 });
        const dbl: Rules = { ...DEFAULT_4C_RULES, gameType: "4c", threeCushionDouble: true };
        expect(evaluateShot(ev, "white", dbl)).toMatchObject({ code: "point-3c", points: 20 });
    });
    it("노란 공 차례면 흰 공이 상대 큐볼", () => {
        const o = evaluateShot([bb("yellow", "white")], "yellow", DEFAULT_4C_RULES);
        expect(o.code).toBe("foul-opponent");
    });
    it("파울 감점 배수", () => {
        const heavy: Rules = { ...DEFAULT_4C_RULES, gameType: "4c", foulPenaltyUnits: 2 };
        expect(evaluateShot([bb("white", "yellow")], "white", heavy).points).toBe(-20);
    });
});

describe("3쿠션 개시 샷(UMB: 빨간 공 먼저)", () => {
    const OPEN = { opening: true };
    it("상대 큐볼을 먼저 맞히면 3쿠션 득점 조건을 채워도 파울(무득점·이닝 소모)", () => {
        const ev = [bb("white", "yellow"), cu("white"), cu("white", "top"), cu("white", "right"), bb("white", "red")];
        const o = evaluateShot(ev, "white", DEFAULT_3C_RULES, false, OPEN);
        expect(o).toMatchObject({ code: "foul-opening", points: 0, scored: false, consumesInning: true });
        expect(o.contacts).toEqual(["yellow", "red"]);
        // 같은 이벤트가 개시 샷이 아니면 평소대로 득점
        expect(evaluateShot(ev, "white", DEFAULT_3C_RULES).code).toBe("point");
        expect(evaluateShot(ev, "white", DEFAULT_3C_RULES, false, { opening: false }).code).toBe("point");
    });
    it("빨간 공을 먼저 맞히면 평소 판정(득점·쿠션 부족·한 공)", () => {
        expect(evaluateShot([bb("white", "red"), cu("white"), cu("white"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES, false, OPEN).code).toBe("point");
        expect(evaluateShot([bb("white", "red"), cu("white"), bb("white", "yellow")], "white", DEFAULT_3C_RULES, false, OPEN).code).toBe("miss-cushions");
        expect(evaluateShot([bb("white", "red"), cu("white")], "white", DEFAULT_3C_RULES, false, OPEN).code).toBe("miss-one-ball");
    });
    it("아무 공도 못 맞히면 보통의 미스, 0 파워는 no-shot", () => {
        expect(evaluateShot([cu("white"), cu("white")], "white", DEFAULT_3C_RULES, false, OPEN).code).toBe("miss-no-contact");
        expect(evaluateShot([], "white", DEFAULT_3C_RULES, false, OPEN).code).toBe("no-shot");
    });
    it("노란 공 차례면 흰 공이 상대 큐볼 — 먼저 맞히면 파울", () => {
        expect(evaluateShot([bb("yellow", "white")], "yellow", DEFAULT_3C_RULES, false, OPEN).code).toBe("foul-opening");
        expect(evaluateShot([bb("yellow", "red")], "yellow", DEFAULT_3C_RULES, false, OPEN).code).toBe("miss-one-ball");
    });
    it("4구는 개시 옵션을 무시한다", () => {
        expect(evaluateShot([bb("white", "red2"), bb("white", "red1")], "white", DEFAULT_4C_RULES, false, OPEN).code).toBe("point");
    });
    it("계산 한도 초과는 개시 파울보다 먼저", () => {
        expect(evaluateShot([bb("white", "yellow")], "white", DEFAULT_3C_RULES, true, OPEN).code).toBe("foul-truncated");
    });
});
