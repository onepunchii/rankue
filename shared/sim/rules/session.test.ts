import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSession, applyShot, currentInning, currentPlayer, decideByInningCap, finishReason, inningsLeft, isLastInning, opponentResult, shotInning, timeoutOutcome, SHOT_CLOCK_S, SHOT_CLOCK_GRACE_S } from "./session.js";
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

/**
 * 끝난 까닭과 상대에게 가는 말(2026-10-13 오너 제보: "후구 때 동점 되면 … 무로 되어야 되는데 알림창에는 승이라고 뜨던데").
 * 승패 자체는 맞았다(무승부). 틀린 것은 둘: 상대에게 '당신이 이겼어요'가 갔고, 끝난 까닭이 '이닝 제한'으로 적혔다.
 */
describe("끝난 까닭 · 상대에게 가는 말", () => {
    const two = (o: { inningCap?: number; t0?: number; t1?: number } = {}) => createSession({ rules: DEFAULT_3C_RULES, inningCap: o.inningCap ?? 0, players: [{ id: "a", target: o.t0 ?? 1 }, { id: "b", target: o.t1 ?? 1 }] });
    const step = (s: ReturnType<typeof two>, o: ShotOutcome) => { const r = applyShot(s, o); return { s: r.session, why: finishReason(s, r.session) }; };

    it("후구에서 따라붙어 비긴 판 — 승자는 없고, 까닭은 이닝 제한이 아니라 목표 도달이다", () => {
        let x = step(two(), POINT);                       // 선공이 목표 → 후구
        expect(x.s.status).toBe("playing"); expect(x.why).toBeNull();
        x = step(x.s, POINT);                             // 후공도 목표 → 무승부
        expect(x.s.status).toBe("finished"); expect(x.s.winnerIndex).toBeNull();
        expect(x.why).toBe("target");
        // 마지막에 친 사람은 후공(자리 1) — 상대(선공)에게 '당신이 이겼어요'가 아니라 '비겼어요'
        expect(opponentResult(x.s.winnerIndex, 1)).toBe("draw");
    });
    it("후구를 못 채우면 먼저 닿은 사람의 승리 — 까닭은 목표 도달, 진 사람이 마지막에 쳤으니 상대는 '이겼다'", () => {
        let x = step(two(), POINT);
        x = step(x.s, MISS);
        expect(x.s.winnerIndex).toBe(0); expect(x.why).toBe("target");
        expect(opponentResult(x.s.winnerIndex, 1)).toBe("won");
        // 이닝 제한이 걸린 판의 마지막 이닝이어도 후구 실패는 목표 도달로 끝난 것이다
        let y = step(two({ inningCap: 1 }), POINT);
        y = step(y.s, MISS);
        expect(y.s.winnerIndex).toBe(0); expect(y.why).toBe("target");
    });
    it("후공이 먼저 닿으면 바로 끝 — 친 사람이 이겼으니 상대는 '졌다'", () => {
        let x = step(two(), MISS);
        x = step(x.s, POINT);
        expect(x.s.winnerIndex).toBe(1); expect(x.why).toBe("target");
        expect(opponentResult(x.s.winnerIndex, 1)).toBe("lost");
    });
    it("이닝 제한 — 둘 다 그 이닝을 마치면 달성률이 높은 쪽, 같으면 무승부. 까닭은 이닝 제한", () => {
        // 2이닝 제한 · 목표 10: 선공 2점, 후공 1점
        let x = step(two({ inningCap: 2, t0: 10, t1: 10 }), POINT);
        x = step(x.s, MISS); x = step(x.s, MISS);          // 1이닝 끝(1:0)
        x = step(x.s, POINT); x = step(x.s, MISS);          // 선공 2이닝 끝(2:0)
        expect(x.s.status).toBe("playing");                 // 후공의 2이닝이 남았다
        x = step(x.s, POINT); x = step(x.s, MISS);          // 후공 2이닝 끝(2:1)
        expect(x.s.status).toBe("finished"); expect(x.s.winnerIndex).toBe(0); expect(x.why).toBe("inningCap");
        expect(opponentResult(x.s.winnerIndex, 1)).toBe("won");
        // 동률 — 무승부, 상대에게도 '비겼어요'
        let y = step(two({ inningCap: 1, t0: 10, t1: 10 }), MISS);
        y = step(y.s, MISS);
        expect(y.s.winnerIndex).toBeNull(); expect(y.why).toBe("inningCap");
        expect(opponentResult(y.s.winnerIndex, 1)).toBe("draw");
    });
    it("이닝 제한의 마지막 이닝에 선공이 목표에 닿으면 후구가 먼저다(이닝 제한으로 끝내지 않는다)", () => {
        let x = step(two({ inningCap: 1 }), POINT);
        expect(x.s.status).toBe("playing"); expect(x.s.pendingWinner).toBe(0);
        x = step(x.s, POINT);
        expect(x.s.winnerIndex).toBeNull(); expect(x.why).toBe("target");
    });
    it("시간 초과로 이닝이 넘어가며 끝나도 같은 규칙", () => {
        let x = step(two(), POINT);
        x = step(x.s, timeoutOutcome());                    // 후구 중 시간 초과 → 선공 승
        expect(x.s.winnerIndex).toBe(0); expect(x.why).toBe("target");
        let y = step(two({ inningCap: 1, t0: 10, t1: 10 }), timeoutOutcome());
        y = step(y.s, timeoutOutcome());
        expect(y.s.status).toBe("finished"); expect(y.why).toBe("inningCap");
    });
    it("달성률은 나눗셈 없이 견준다 — 다마가 달라도 같은 비율이면 무승부", () => {
        expect(decideByInningCap([{ score: 10, target: 30 }, { score: 7, target: 21 }])).toBeNull();
        expect(decideByInningCap([{ score: 1, target: 3 }, { score: 2, target: 6 }])).toBeNull();
        expect(decideByInningCap([{ score: 11, target: 30 }, { score: 7, target: 21 }])).toBe(0);
        expect(decideByInningCap([{ score: 10, target: 30 }, { score: 8, target: 21 }])).toBe(1);
        // 음수 점수(4구 파울)도 그대로 견준다
        expect(decideByInningCap([{ score: -10, target: 100 }, { score: 0, target: 200 }])).toBe(1);
        expect(decideByInningCap([{ score: 5, target: 20 }])).toBe(0);
    });
    it("지금 이닝 · 마지막 이닝 — 둘이 같은 이닝을 같은 숫자로 보고, 후구는 제한이 남아도 마지막이다", () => {
        let s = two({ inningCap: 2, t0: 10, t1: 10 });
        expect(currentInning(s)).toBe(1); expect(isLastInning(s)).toBe(false);
        s = applyShot(s, MISS).session;                     // 후공의 1이닝
        expect(currentInning(s)).toBe(1); expect(isLastInning(s)).toBe(false);
        s = applyShot(s, MISS).session;                     // 선공의 2이닝 = 마지막
        expect(currentInning(s)).toBe(2); expect(isLastInning(s)).toBe(true);
        s = applyShot(s, MISS).session;                     // 후공의 2이닝
        expect(currentInning(s)).toBe(2); expect(isLastInning(s)).toBe(true);
        // 제한이 없는 판은 마지막 이닝이 없다 — 후구만 예외
        let n = two();
        expect(isLastInning(n)).toBe(false);
        n = applyShot(n, POINT).session;                    // 선공이 목표 → 후구
        expect(n.pendingWinner).toBe(0); expect(isLastInning(n)).toBe(true);
        // 제한 20 의 첫 이닝에 닿아도 후구가 마지막이다('남은 19'가 아니다)
        let c = two({ inningCap: 20 });
        c = applyShot(c, POINT).session;
        expect(currentInning(c)).toBe(1); expect(isLastInning(c)).toBe(true);
    });
    it("고정: 서버는 끝난 까닭과 상대 알림을 이 규칙으로 정하고, 다섯 언어 모두 '비겼어요' 문구가 있다", () => {
        const read = (f: string) => readFileSync(resolve(__dirname, "../../..", f), "utf8");
        const server = read("server/routes/modules/simMatch.ts");
        expect(server).toContain("opponentResult(applied.session.winnerIndex, myIndex)");
        expect(server).toContain('"notif.sim.finished.draw"');
        expect(server).toContain("finishReason(state, applied.session)");
        // 예전 식 — 승자가 없으면 이닝 상한 · 친 사람이 안 이겼으면 상대 승 — 이 돌아오지 않는다
        expect(server).not.toMatch(/winnerIndex === null \? "inningCap"/);
        expect(server).not.toMatch(/iWon \? msg\("notif\.sim\.finished\.lost"/);
        for (const loc of ["ko", "en", "vi", "tr", "es"]) {
            expect(read(`shared/i18n/${loc}.ts`), loc).toContain('"notif.sim.finished.draw"');
            const c = read(`client/src/lib/i18n/${loc}.ts`);
            for (const k of ["sim.match.endTargetDraw", "sim.hud.inningsLeft", "sim.hud.lastInning"]) expect(c, `${loc} ${k}`).toContain(`"${k}"`);
        }
        // 화면: 머리줄 밑 이닝 제한 줄이 대전 · 연습 화면에 걸려 있다
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain("<InningCapBar session={sim.session} />");
    });
    it("남은 이닝 — 지금 이닝을 빼고 그 뒤에 남은 수, 제한이 없으면 없다", () => {
        expect(inningsLeft(20, 3)).toBe(17);
        expect(inningsLeft(20, 20)).toBe(0);
        expect(inningsLeft(20, 25)).toBe(0);
        expect(inningsLeft(20, 0)).toBe(19);
        expect(inningsLeft(0, 3)).toBeNull();
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

describe("shotInning — 샷 행에 적는 이닝 번호(2026-09-18)", () => {
    const pt: ShotOutcome = { code: "point", points: 1, scored: true, consumesInning: false, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
    const miss: ShotOutcome = { ...pt, code: "miss-cushions", points: 0, scored: false, consumesInning: true };
    const noShot: ShotOutcome = { ...miss, code: "no-shot", consumesInning: false };

    it("적용 뒤 선수 상태로 센다: 이닝을 닫은 샷은 innings, 이어 치는 샷·no-shot 은 innings + 1", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 9 }, { id: "b", target: 9 }] });
        const seen: string[] = [];
        for (const o of [noShot, pt, miss, miss, pt, miss]) {
            const shooter = s.turn;
            const r = applyShot(s, o);
            seen.push(`${shooter}:${shotInning(r.outcome, r.session.players[shooter])}`);
            s = r.session;
        }
        expect(seen).toEqual(["0:1", "0:1", "0:1", "1:1", "0:2", "0:2"]);
    });

    it("시간 초과로 넘어간 이닝을 건너뛴다 — 샷 행이 없어도 다음 샷 번호가 맞다", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 9 }, { id: "b", target: 9 }] });
        s = applyShot(s, miss).session;                 // a 1이닝
        s = applyShot(s, timeoutOutcome()).session;     // b 1이닝(시간 초과)
        s = applyShot(s, timeoutOutcome()).session;     // a 2이닝(시간 초과)
        const r = applyShot(s, miss);                   // b 2이닝
        expect(shotInning(r.outcome, r.session.players[1])).toBe(2);
    });

    it("0 이하로는 안 내려간다", () => {
        expect(shotInning({ consumesInning: true }, { innings: 0 })).toBe(1);
    });
});
