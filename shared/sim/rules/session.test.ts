import { describe, it, expect } from "vitest";
import { createSession, applyShot, currentPlayer, timeoutOutcome, SHOT_CLOCK_S, SHOT_CLOCK_GRACE_S } from "./session.js";
import { DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "./evaluate.js";
import type { ShotOutcome } from "./types.js";

const base = { cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: ["yellow", "red"], kisses: 0 };
const POINT: ShotOutcome = { code: "point", points: 1, scored: true, consumesInning: false, ...base };
const MISS: ShotOutcome = { code: "miss-cushions", points: 0, scored: false, consumesInning: true, ...base, cushionsBeforeSecond: 2 };
const NOSHOT: ShotOutcome = { code: "no-shot", points: 0, scored: false, consumesInning: false, ...base, contacts: [] };
const BANK: ShotOutcome = { ...POINT, cushionsBeforeFirst: 3 };

describe("솔로 세션", () => {
    it("득점은 런을 잇고 이닝을 안 넘기며, 미스가 이닝을 넘긴다", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "me", target: 3 }] });
        s = applyShot(s, POINT).session;
        s = applyShot(s, POINT).session;
        expect(currentPlayer(s)).toMatchObject({ score: 2, innings: 0, currentRun: 2, highRun: 2 });
        s = applyShot(s, MISS).session;
        expect(currentPlayer(s)).toMatchObject({ score: 2, innings: 1, currentRun: 0, highRun: 2 });
        expect(s.status).toBe("playing");
        s = applyShot(s, POINT).session;
        expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
        expect(() => applyShot(s, POINT)).toThrow();
    });
    it("no-shot 은 아무것도 안 바꾸고 샷 수만 센다", () => {
        const s0 = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "me", target: 3 }] });
        const s1 = applyShot(s0, NOSHOT).session;
        expect(s1.players).toEqual(s0.players); expect(s1.shotCount).toBe(1);
    });
    it("이닝 상한", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, inningCap: 2, players: [{ id: "me", target: 99 }] });
        s = applyShot(s, MISS).session; expect(s.status).toBe("playing");
        s = applyShot(s, MISS).session; expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
    });
});

describe("마무리 규칙", () => {
    it("3c: 마지막 점수가 3쿠션 미만이면 무득점 처리", () => {
        let s = createSession({ rules: DEFAULT_4C_RULES, finishType: "3c", players: [{ id: "me", target: 10 }] });
        const normal: ShotOutcome = { code: "point", points: 10, scored: true, consumesInning: false, ...base, cushionsBeforeSecond: 1, contacts: ["red1", "red2"] };
        const r = applyShot(s, normal);
        expect(r.outcome.code).toBe("miss-finish");
        expect(r.session.status).toBe("playing"); expect(currentPlayer(r.session).innings).toBe(1);
        const three: ShotOutcome = { ...normal, cushionsBeforeSecond: 3 };
        const r2 = applyShot(r.session, three);
        expect(r2.session.status).toBe("finished");
    });
    it("bank: 원뱅크(쿠션 1개 먼저)도 뱅크샷 마무리로 인정한다", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, finishType: "bank", players: [{ id: "me", target: 1 }] });
        expect(applyShot(s, { ...POINT, cushionsBeforeFirst: 1 }).session.status).toBe("finished");
    });
    it("bank: 공을 먼저 맞힌 득점으로는 마무리가 안 된다", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, finishType: "bank", players: [{ id: "me", target: 1 }] });
        expect(applyShot(s, { ...POINT, cushionsBeforeFirst: 0 }).session.status).not.toBe("finished");
    });
    it("bank: 마지막 점수는 뱅크샷이어야 한다", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, finishType: "bank", players: [{ id: "me", target: 1 }] });
        expect(applyShot(s, POINT).outcome.code).toBe("miss-finish");
        expect(applyShot(s, BANK).session.status).toBe("finished");
    });
    it("목표 전 득점에는 마무리 규칙이 적용되지 않는다", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, finishType: "3c", players: [{ id: "me", target: 5 }] });
        expect(applyShot(s, { ...POINT, cushionsBeforeSecond: 3 }).outcome.code).toBe("point");
    });
});

describe("2인 세션", () => {
    it("턴은 이닝 소모 시에만 넘어가고 큐볼은 white/yellow 로 갈린다", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 2 }, { id: "b", target: 1 }] });
        expect(currentPlayer(s).cueBallId).toBe("white");
        s = applyShot(s, POINT).session; expect(s.turn).toBe(0);
        s = applyShot(s, MISS).session; expect(s.turn).toBe(1); expect(currentPlayer(s).cueBallId).toBe("yellow");
        s = applyShot(s, POINT).session;
        expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(1);
    });
    it("다른 다마수(핸디캡) — 선공이 먼저 닿으면 후공에게 후구 한 이닝", () => {
        let s = createSession({ rules: DEFAULT_4C_RULES, players: [{ id: "a", target: 30 }, { id: "b", target: 100 }] });
        const p10: ShotOutcome = { code: "point", points: 10, scored: true, consumesInning: false, ...base, contacts: ["red1", "red2"] };
        s = applyShot(s, p10).session; s = applyShot(s, p10).session; s = applyShot(s, p10).session;
        // 아직 안 끝났다 — 자리 0 이 매 이닝을 먼저 치므로 자리 1 에게 마지막 이닝을 준다(2026-09-12)
        expect(s.status).toBe("playing");
        expect(s.pendingWinner).toBe(0);
        expect(s.turn).toBe(1);
        s = applyShot(s, MISS).session;
        expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
    });

    /**
     * 후구(2026-09-12 테스터 제보 → 오너 결정). 자리 0 이 매 이닝을 먼저 치니 그대로 끝내면 자리 1 은 그 이닝을 못 친다.
     * 3쿠션 공식전처럼 한 이닝을 더 주고, 따라붙으면 무승부로 본다.
     */
    describe("후구", () => {
        const P: ShotOutcome = { code: "point", points: 1, scored: true, consumesInning: false, ...base, contacts: ["red", "yellow"] };
        const two = (t = 2) => createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: t }, { id: "b", target: t }] });

        it("후공이 후구에서 자기 목표까지 따라붙으면 무승부", () => {
            let s = two(1);
            s = applyShot(s, P).session;                 // 선공 1점 = 목표 → 후구
            expect(s.status).toBe("playing"); expect(s.turn).toBe(1);
            s = applyShot(s, P).session;                 // 후공도 1점
            expect(s.status).toBe("finished");
            expect(s.winnerIndex).toBeNull();
            expect(s.players.map((p) => p.score)).toEqual([1, 1]);
        });

        it("후공이 먼저 목표에 닿으면 이닝이 같으므로 바로 끝난다", () => {
            let s = two(1);
            s = applyShot(s, MISS).session;              // 선공 실패 → 차례 넘김
            expect(s.turn).toBe(1);
            s = applyShot(s, P).session;                 // 후공 1점 = 목표
            expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(1);
        });

        it("후구 중 시간 초과로 이닝을 넘겨도 먼저 닿은 사람의 승리", () => {
            let s = two(1);
            s = applyShot(s, P).session;
            s = applyShot(s, timeoutOutcome()).session;
            expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
        });

        it("혼자 치는 연습(1인)은 후구가 없다", () => {
            let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "solo", target: 1 }] });
            s = applyShot(s, P).session;
            expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
        });

        it("후구에서 한 점 더 쳐도 목표에 못 미치면 계속 치고, 실패하면 끝난다", () => {
            let s = two(3);
            s = applyShot(s, P).session; s = applyShot(s, P).session; s = applyShot(s, P).session;  // 선공 3점 = 목표
            expect(s.pendingWinner).toBe(0);
            s = applyShot(s, P).session; s = applyShot(s, P).session;                                // 후공 2점(아직 부족)
            expect(s.status).toBe("playing");
            s = applyShot(s, MISS).session;
            expect(s.status).toBe("finished"); expect(s.winnerIndex).toBe(0);
            expect(s.players[1].score).toBe(2);
        });
    });
    it("이닝 상한 동률은 무승부", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, inningCap: 1, players: [{ id: "a", target: 10 }, { id: "b", target: 10 }] });
        s = applyShot(s, MISS).session; s = applyShot(s, MISS).session;
        expect(s.status).toBe("finished"); expect(s.winnerIndex).toBeNull();
    });
    it("음수 점수는 정상", () => {
        let s = createSession({ rules: DEFAULT_4C_RULES, players: [{ id: "a", target: 30 }, { id: "b", target: 30 }] });
        const foul: ShotOutcome = { code: "foul-opponent", points: -10, scored: false, consumesInning: true, ...base, contacts: [] };
        s = applyShot(s, foul).session;
        expect(s.players[0].score).toBe(-10);
    });
    it("같은 큐볼은 거부", () => {
        expect(() => createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 1, cueBallId: "white" }, { id: "b", target: 1, cueBallId: "white" }] })).toThrow();
    });
});

describe("시간 초과(40초 룰)", () => {
    it("timeoutOutcome 을 applyShot 에 넣으면 무득점으로 이닝이 소모되고 차례가 넘어간다", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 15 }, { id: "b", target: 15 }] });
        const r = applyShot(s, timeoutOutcome());
        expect(r.outcome.code).toBe("foul-timeout");
        expect(r.session.turn).toBe(1);
        expect(r.session.players[0].innings).toBe(1);
        expect(r.session.players[0].score).toBe(0);
        expect(r.session.shotCount).toBe(1);
        expect(SHOT_CLOCK_S).toBe(40);
        expect(SHOT_CLOCK_GRACE_S).toBe(10);
    });
});
