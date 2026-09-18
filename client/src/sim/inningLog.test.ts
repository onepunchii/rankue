import { describe, it, expect } from "vitest";
import {
    applyShot, createSession, shotInning, timeoutOutcome, DEFAULT_3C_RULES, DEFAULT_4C_RULES,
    type SessionState, type ShotOutcome,
} from "@shared/sim/rules";
import {
    appendShot, dropFrom, EMPTY_LOG, inningRows, popShot, rebuildInningLog, shooterIndex, totals, withHistory,
    type HistoryShot, type InningLog, type ShotEntry,
} from "./inningLog";

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

/* ── 다시 들어온 대전: 서버 샷 기록으로 되살리기(2026-09-18) ─────────────────────────────── */

type Op = ShotOutcome | "timeout";

/**
 * 서버를 흉내 낸다 — 라우트 POST /shots·/timeout 과 같은 순서로 세션을 굴리며 샷 행을 남기고,
 * 같은 판을 **처음부터 계속 보고 있던 화면**의 기록(onOutcome → appendShot)도 같이 쌓는다. 되살린 기록은 이것과 같아야 한다.
 */
function serve(ops: readonly Op[], opt: { targets?: [number, number]; finishType?: "none" | "3c" | "bank"; inningCap?: number; withInning?: boolean } = {}) {
    let s = createSession({
        rules: DEFAULT_3C_RULES, finishType: opt.finishType ?? "none", inningCap: opt.inningCap ?? 0,
        players: [{ id: "h", target: opt.targets?.[0] ?? 10 }, { id: "g", target: opt.targets?.[1] ?? 10 }],
    });
    const rows: HistoryShot[] = [];
    let live: InningLog = EMPTY_LOG;
    for (const op of ops) {
        if (s.status !== "playing") break;
        if (op === "timeout") { s = applyShot(s, timeoutOutcome()).session; continue; }
        const shooter = s.turn;
        const r = applyShot(s, op);
        const idx = rows.length;
        rows.push({
            idx, playerIndex: shooter, outcomeCode: r.outcome.code, points: r.outcome.points, cushions: r.outcome.cushionsBeforeSecond,
            inning: opt.withInning === false ? null : shotInning(r.outcome, r.session.players[shooter]),
        });
        live = appendShot(live, r.outcome, r.session, shooter, idx);
        s = r.session;
    }
    return { s, rows, live };
}

const key = (e: ShotEntry) => `${e.idx}:${e.player}:${e.inning}:${e.points}:${e.code}`;
const BANK_POINT: ShotOutcome = { ...o("point-bank", 1, true), cushionsBeforeFirst: 3 };
const PLAIN_TO_TARGET = o("point", 1, true);   // cushionsBeforeFirst 0 — 뱅크 마무리 규칙에선 miss-finish 로 바뀐다

/** 결정론 난수(LCG) — 실패하면 같은 시드로 다시 본다. */
function lcg(seed: number) {
    let x = seed >>> 0;
    return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}

describe("rebuildInningLog — 서버 샷 기록으로 이닝 기록 되살리기", () => {
    it("시간 초과 없는 판: 옛 샷(서버 이닝 없음)도 계속 보던 화면과 똑같다", () => {
        const { s, rows, live } = serve([POINT, MISS, MISS, POINT, POINT, MISS, NOSHOT, POINT, MISS], { withInning: false });
        const rebuilt = rebuildInningLog(rows, s);
        expect(rebuilt.entries.map(key)).toEqual(live.entries.map(key));
        expect(totals(inningRows(rebuilt, 2), 2)).toEqual([s.players[0].score, s.players[1].score]);
    });

    it("샷 사이 시간 초과 하나(친 사람이 차례와 다르다)는 샷 순서로 알아낸다", () => {
        // 호스트 미스 → 게스트 시간 초과(행 없음) → 호스트가 다시 친다: 호스트 두 번째 샷은 2이닝이다.
        // 그 뒤 한 번 더: 호스트 미스 → 게스트 시간 초과 → 호스트 3이닝. 게스트는 샷 없이 2이닝을 끝냈다.
        const { s, rows, live } = serve([MISS, "timeout", POINT, MISS, "timeout", MISS], { withInning: false });
        expect(rows.map((r) => r.playerIndex)).toEqual([0, 0, 0, 0]);
        const rebuilt = rebuildInningLog(rows, s);
        expect(rebuilt.entries.map(key)).toEqual(live.entries.map(key));
        expect(rebuilt.entries.map((e) => `${e.player}:${e.inning}`)).toEqual(["0:1", "0:2", "0:2", "0:3"]);
        // 점수판: 게스트의 시간 초과 이닝은 빈칸이 아니라 0
        expect(inningRows(rebuilt, 2, s.players.map((p) => p.innings)).map((r) => r.cells)).toEqual([[0, 0], [1, 0], [0, null]]);
    });

    it("두 사람이 연달아 시간 초과한 자리는 샷 순서에 흔적이 없다 — 서버가 적은 이닝이 있으면 그걸 쓴다", () => {
        const ops: Op[] = [MISS, MISS, "timeout", "timeout", POINT, MISS];
        const legacy = serve(ops, { withInning: false });
        const guessed = rebuildInningLog(legacy.rows, legacy.s);
        // 추정은 한 이닝씩 모자란다 — 실제는 3이닝인데 2이닝으로 센다(이게 서버에 이닝을 적게 된 이유다)
        expect(guessed.entries.map((e) => e.inning)).toEqual([1, 1, 2, 2]);
        const now = serve(ops);
        const exact = rebuildInningLog(now.rows, now.s);
        expect(exact.entries.map(key)).toEqual(now.live.entries.map(key));
        expect(exact.entries.map((e) => `${e.player}:${e.inning}`)).toEqual(["0:1", "1:1", "0:3", "0:3"]);
    });

    it("후구: 선공이 목표에 닿으면 이닝 소모 없이 차례가 넘어간다 — 가짜 시간 초과를 끼우지 않는다", () => {
        const { s, rows, live } = serve([POINT, POINT, MISS], { targets: [2, 5], withInning: false });
        expect(rows.map((r) => r.playerIndex)).toEqual([0, 0, 1]);
        expect(s.status).toBe("finished");
        const rebuilt = rebuildInningLog(rows, s);
        expect(rebuilt.entries.map(key)).toEqual(live.entries.map(key));
        expect(inningRows(rebuilt, 2, s.players.map((p) => p.innings))).toEqual([{ inning: 1, cells: [2, 0] }]);
    });

    it("마무리 규칙: 서버가 이미 바꾼 miss-finish 는 이닝을 닫고, 받아 준 득점은 다시 뒤집지 않는다", () => {
        // 뱅크 마무리: 목표 1점을 보통 득점으로 넣으면 miss-finish(무득점·이닝 소모), 뱅크샷이면 인정.
        const { s, rows, live } = serve([PLAIN_TO_TARGET, MISS, BANK_POINT, MISS], { targets: [1, 3], finishType: "bank", withInning: false });
        expect(rows.map((r) => r.outcomeCode)).toEqual(["miss-finish", "miss-cushions", "point-bank", "miss-cushions"]);
        const rebuilt = rebuildInningLog(rows, s);
        expect(rebuilt.entries.map(key)).toEqual(live.entries.map(key));
    });

    it("무작위 판 300개: 서버 이닝이 있으면 항상, 없어도 연속 시간 초과가 없으면 계속 보던 화면과 같다", () => {
        const pool: Op[] = [POINT, POINT, MISS, MISS, MISS, NOSHOT, o("miss-no-contact", 0, false), BANK_POINT, "timeout"];
        for (let seed = 1; seed <= 300; seed++) {
            const rnd = lcg(seed);
            const ops: Op[] = Array.from({ length: 10 + Math.floor(rnd() * 50) }, () => pool[Math.floor(rnd() * pool.length)]);
            const opt = { targets: [2 + Math.floor(rnd() * 8), 2 + Math.floor(rnd() * 8)] as [number, number], inningCap: rnd() < 0.3 ? 5 : 0, finishType: rnd() < 0.3 ? "bank" as const : "none" as const };
            const now = serve(ops, opt);
            expect(rebuildInningLog(now.rows, now.s).entries.map(key), `seed ${seed}`).toEqual(now.live.entries.map(key));
            // 행 사이 시간 초과가 0·1 번뿐이면 옛 샷도 정확해야 한다
            let run = 0, maxRun = 0;
            for (const op of ops) { run = op === "timeout" ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
            if (maxRun <= 1) {
                const legacy = serve(ops, { ...opt, withInning: false });
                expect(rebuildInningLog(legacy.rows, legacy.s).entries.map(key), `legacy seed ${seed}`).toEqual(legacy.live.entries.map(key));
                // 점수판(시간 초과 이닝 0 채움 포함)도 같다
                const done = legacy.s.players.map((p) => p.innings);
                expect(inningRows(rebuildInningLog(legacy.rows, legacy.s), 2, done), `rows seed ${seed}`).toEqual(inningRows(legacy.live, 2, done));
            }
        }
    });

    it("이상한 기록에도 던지지 않는다(끝난 뒤의 샷·모르는 코드·범위 밖 선수·세션 없음)", () => {
        const s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 1 }, { id: "b", target: 1 }] });
        const weird: HistoryShot[] = [
            { idx: 0, playerIndex: 0, outcomeCode: "point", points: 1, cushions: 3 },
            { idx: 1, playerIndex: 1, outcomeCode: "point", points: 1, cushions: 3 },    // 무승부로 끝난 뒤
            { idx: 2, playerIndex: 0, outcomeCode: "???", points: 0, cushions: 0 },
            { idx: 3, playerIndex: 7, outcomeCode: "miss-cushions", points: 0, cushions: 1 },
        ];
        expect(() => rebuildInningLog(weird, s)).not.toThrow();
        expect(rebuildInningLog(weird, s).entries.map((e) => e.idx)).toEqual([0, 1, 2]);
        // 세션이 없으면 서버가 적은 이닝이 있는 샷만
        expect(rebuildInningLog([{ ...weird[0], inning: 4 }, weird[1]], null).entries.map((e) => `${e.idx}:${e.inning}`)).toEqual(["0:4"]);
        expect(rebuildInningLog([], s)).toEqual({ entries: [] });
    });

    it("샷 행이 뒤섞여 와도 idx 순으로 센다", () => {
        const { s, rows, live } = serve([POINT, MISS, MISS, POINT, MISS], { withInning: false });
        expect(rebuildInningLog([...rows].reverse(), s).entries.map(key)).toEqual(live.entries.map(key));
    });
});

describe("withHistory · dropFrom — 기록을 받는 사이에도 대전은 계속된다", () => {
    const e = (idx: number, points = 0): ShotEntry => ({ shot: idx + 1, idx, player: 0, inning: 1, code: "point", points, cushions: 3, consumesInning: false });
    const hist: InningLog = { entries: [e(0, 1), e(1, 1), e(2, 1)] };

    it("다시 들어오자마자 상대가 쳐서 화면이 먼저 한 줄 쌓았어도 순서대로 이어진다", () => {
        const cur: InningLog = { entries: [e(3, 9), e(4, 9)] };
        expect(withHistory(cur, hist, 3).entries.map((x) => `${x.idx}:${x.points}`)).toEqual(["0:1", "1:1", "2:1", "3:9", "4:9"]);
    });

    it("기준점 앞의 화면 줄은 서버 기록으로 바뀐다(겹치지 않는다)", () => {
        const cur: InningLog = { entries: [e(0, 5), e(1, 5), e(2, 5), e(3, 9)] };
        expect(withHistory(cur, hist, 3).entries.map((x) => `${x.idx}:${x.points}`)).toEqual(["0:1", "1:1", "2:1", "3:9"]);
    });

    it("서버 정본으로 갈아탄 순간 idx ≥ 샷 수 줄은 버린다 — 거부된 내 샷이 같은 번호의 다음 샷과 겹치지 않게", () => {
        const cur: InningLog = { entries: [e(0), e(1), e(2, 7)] };     // idx 2 는 서버가 거부했다(서버 샷 수 2)
        const dropped = dropFrom(cur, 2);
        expect(dropped.entries.map((x) => x.idx)).toEqual([0, 1]);
        const next = appendShot(dropped, o("point", 1, true), createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 9 }] }), 0, 2);
        expect(withHistory(next, hist, 2).entries.map((x) => `${x.idx}:${x.points}`)).toEqual(["0:1", "1:1", "2:1"]);
        expect(dropFrom(cur, 5)).toBe(cur);
    });
});

describe("inningRows — 샷 없이 끝난 이닝(시간 초과)", () => {
    const e = (player: number, inning: number, points: number): ShotEntry => ({ shot: 0, player, inning, code: "point", points, cushions: 3, consumesInning: false });

    it("같은 선수의 더 뒤 이닝이 있으면 그 사이 빈 이닝은 0(끝난 이닝)", () => {
        const log: InningLog = { entries: [e(0, 1, 2), e(0, 3, 1), e(1, 1, 1)] };
        expect(inningRows(log, 2)).toEqual([
            { inning: 1, cells: [2, 1] }, { inning: 2, cells: [0, null] }, { inning: 3, cells: [1, null] },
        ]);
    });

    it("끝낸 이닝 수를 주면 마지막 시간 초과 이닝도 0 으로 채우고 행을 늘린다. 아직 안 친 이닝은 비운다", () => {
        const log: InningLog = { entries: [e(0, 1, 2), e(1, 1, 1)] };
        expect(inningRows(log, 2, [2, 1])).toEqual([{ inning: 1, cells: [2, 1] }, { inning: 2, cells: [0, null] }]);
        expect(inningRows(log, 2, [1, 1])).toEqual([{ inning: 1, cells: [2, 1] }]);
        expect(inningRows(EMPTY_LOG, 2, [1, 0])).toEqual([{ inning: 1, cells: [0, null] }]);
    });
});
