import { describe, it, expect } from "vitest";
import { applyShot, createSession, DEFAULT_3C_RULES, DEFAULT_4C_RULES, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import { appendShot, EMPTY_LOG, inningRows, popShot, shooterIndex, totals, type InningLog } from "./inningLog";

function o(code: ShotOutcome["code"], points: number, scored: boolean, consumesInning = !scored): ShotOutcome {
    return { code, points, scored, consumesInning, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
}
const POINT = o("point", 1, true);
const MISS = o("miss-cushions", 0, false);
const NOSHOT = o("no-shot", 0, false, false);

/** 세션에 샷을 적용하면서 로그를 같이 쌓는다(페이지의 onOutcome 흐름). */
function play(s: SessionState, log: InningLog, outcomes: readonly ShotOutcome[]): { s: SessionState; log: InningLog } {
    for (const oc of outcomes) {
        const shooter = s.turn;                 // 친 사람은 샷 '전' 의 차례다(후구에서는 득점 샷도 턴을 넘긴다)
        const r = applyShot(s, oc);
        s = r.session;
        log = appendShot(log, r.outcome, s, shooter);
    }
    return { s, log };
}

describe("inningLog", () => {
    it("1인: 득점은 같은 이닝에 쌓이고 미스는 이닝을 닫는다", () => {
        const s0 = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "p1", target: 10 }] });
        const { s, log } = play(s0, EMPTY_LOG, [POINT, POINT, MISS, MISS, POINT]);
        expect(log.entries.map((e) => e.inning)).toEqual([1, 1, 1, 2, 3]);
        expect(log.entries.map((e) => e.player)).toEqual([0, 0, 0, 0, 0]);
        expect(log.entries.map((e) => e.shot)).toEqual([1, 2, 3, 4, 5]);
        const rows = inningRows(log, 1);
        expect(rows).toEqual([{ inning: 1, cells: [2] }, { inning: 2, cells: [0] }, { inning: 3, cells: [1] }]);
        expect(totals(rows, 1)).toEqual([s.players[0].score]);
    });

    it("2인: 친 선수를 턴에서 역산한다(이닝 소모면 turn − 1)", () => {
        const s0 = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 10 }, { id: "b", target: 10 }] });
        // a 득점·미스 → b 미스 → a 득점 득점 미스 → b 득점
        const { s, log } = play(s0, EMPTY_LOG, [POINT, MISS, MISS, POINT, POINT, MISS, POINT]);
        expect(log.entries.map((e) => `${e.player}:${e.inning}`)).toEqual(["0:1", "0:1", "1:1", "0:2", "0:2", "0:2", "1:2"]);
        const rows = inningRows(log, 2);
        expect(rows).toEqual([{ inning: 1, cells: [1, 0] }, { inning: 2, cells: [2, 1] }]);
        expect(totals(rows, 2)).toEqual([s.players[0].score, s.players[1].score]);
        expect(shooterIndex({ consumesInning: true }, { turn: 0, players: s.players })).toBe(1);
        expect(shooterIndex({ consumesInning: false }, { turn: 0, players: s.players })).toBe(0);
    });

    it("목표 도달로 끝난 샷·no-shot 은 턴이 안 넘어가므로 그대로 turn", () => {
        // 2026-09-12 후구: 자리 0 이 목표에 닿으면 자리 1 에게 한 이닝이 더 간다(끝나지 않는다).
        // 이 테스트가 보는 것은 이닝 표 — 목표에 닿은 샷과 no-shot 이 턴을 안 넘긴다는 점은 그대로다.
        const s0 = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 1 }, { id: "b", target: 1 }] });
        const { s, log } = play(s0, EMPTY_LOG, [NOSHOT, POINT]);
        expect(s.pendingWinner).toBe(0);
        expect(log.entries.map((e) => `${e.player}:${e.inning}:${e.code}`)).toEqual(["0:1:no-shot", "0:1:point"]);
        expect(inningRows(log, 2)).toEqual([{ inning: 1, cells: [1, null] }]);
    });

    it("4구 파울 감점은 음수로 그대로 쌓인다", () => {
        const s0 = createSession({ rules: DEFAULT_4C_RULES, players: [{ id: "p1", target: 50 }] });
        const foul = o("foul-opponent", -10, false);
        const { log } = play(s0, EMPTY_LOG, [o("point", 10, true), foul, o("point", 10, true)]);
        expect(inningRows(log, 1)).toEqual([{ inning: 1, cells: [0] }, { inning: 2, cells: [10] }]);
    });

    it("popShot 은 마지막 샷을 빼고, 빈 로그는 같은 참조", () => {
        const s0 = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "p1", target: 10 }] });
        const { log } = play(s0, EMPTY_LOG, [POINT, MISS]);
        expect(popShot(log).entries).toHaveLength(1);
        expect(popShot(EMPTY_LOG)).toBe(EMPTY_LOG);
        expect(inningRows(EMPTY_LOG, 2)).toEqual([]);
    });
});
