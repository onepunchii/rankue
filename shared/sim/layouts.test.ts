import { describe, it, expect } from "vitest";
import { TABLES } from "./params.js";
import { openingLayout, isOpeningLayout, isValidLayout } from "./layouts.js";
import { DRILLS, drillLayout } from "./drills.js";
import { createSession, applyShot, isOpeningShot, DEFAULT_3C_RULES, DEFAULT_4C_RULES, type ShotOutcome } from "./rules/index.js";
import type { BallState } from "./types.js";

const tables = [TABLES.DAEDAE, TABLES.JUNGDAE_KR] as const;

function moved(balls: readonly BallState[], id: string, dx: number, dy: number): readonly BallState[] {
    return balls.map((b) => (b.id === id ? { ...b, r: [b.r[0] + dx, b.r[1] + dy, b.r[2]] as const } : b));
}

describe("개시 배치 판정 isOpeningLayout", () => {
    it("openingLayout 이 만든 배치는 종목·테이블·큐볼·좌우 모두 참", () => {
        for (const t of tables) {
            for (const g of ["3c", "4c"] as const) {
                for (const cue of ["white", "yellow"] as const) {
                    for (const side of ["left", "right"] as const) {
                        const balls = openingLayout(g, t, cue, side);
                        expect(isValidLayout(balls, t)).toBe(true);
                        expect(isOpeningLayout(balls, g), `${g} ${t.id} ${cue} ${side}`).toBe(true);
                    }
                }
            }
        }
    });
    it("공 순서가 달라도 참, 종목이 다르면 거짓", () => {
        const balls = openingLayout("3c", TABLES.DAEDAE, "white");
        expect(isOpeningLayout([...balls].reverse(), "3c")).toBe(true);
        expect(isOpeningLayout(balls, "4c")).toBe(false);
        expect(isOpeningLayout(openingLayout("4c", TABLES.DAEDAE, "white"), "3c")).toBe(false);
    });
    it("어느 공이든 1 mm 만 옮겨도 거짓", () => {
        const balls = openingLayout("3c", TABLES.DAEDAE, "white");
        for (const id of ["white", "yellow", "red"]) {
            expect(isOpeningLayout(moved(balls, id, 0.001, 0), "3c"), id).toBe(false);
            expect(isOpeningLayout(moved(balls, id, 0, -0.001), "3c"), id).toBe(false);
        }
        const four = openingLayout("4c", TABLES.JUNGDAE_KR, "yellow", "left");
        expect(isOpeningLayout(moved(four, "red2", 0, 0.001), "4c")).toBe(false);
    });
    it("드릴 배치는 개시 배치가 아니다", () => {
        for (const t of tables) for (const d of DRILLS) expect(isOpeningLayout(drillLayout(d, t), "3c"), d.id).toBe(false);
    });
    it("공이 빠지거나 id 가 겹치면 거짓", () => {
        const balls = openingLayout("3c", TABLES.DAEDAE, "white");
        expect(isOpeningLayout(balls.slice(0, 2), "3c")).toBe(false);
        expect(isOpeningLayout([balls[0], balls[0], balls[2]], "3c")).toBe(false);
    });
});

describe("개시 샷 isOpeningShot", () => {
    const balls = openingLayout("3c", TABLES.DAEDAE, "white");
    const MISS: ShotOutcome = { code: "miss-one-ball", points: 0, scored: false, consumesInning: true, cushionsBeforeSecond: 0, cushionsBeforeFirst: 0, contacts: ["yellow"], kisses: 0 };
    const NO_SHOT: ShotOutcome = { code: "no-shot", points: 0, scored: false, consumesInning: false, cushionsBeforeSecond: 0, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
    it("3쿠션 첫 샷 + 개시 배치 = 참, 4구는 거짓", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 15 }, { id: "b", target: 15 }] });
        expect(isOpeningShot(s, balls)).toBe(true);
        const four = createSession({ rules: DEFAULT_4C_RULES, players: [{ id: "a", target: 50 }] });
        expect(isOpeningShot(four, openingLayout("4c", TABLES.DAEDAE, "white"))).toBe(false);
    });
    it("이닝이 넘어가면 배치가 그대로여도 거짓, 0 파워(no-shot) 뒤에는 여전히 참", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 15 }, { id: "b", target: 15 }] });
        expect(isOpeningShot(applyShot(s, MISS).session, balls)).toBe(false);
        expect(isOpeningShot(applyShot(s, NO_SHOT).session, balls)).toBe(true);
    });
    it("공을 옮긴 자유 배치는 거짓", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 15 }] });
        expect(isOpeningShot(s, moved(balls, "red", 0.1, 0))).toBe(false);
    });
});
