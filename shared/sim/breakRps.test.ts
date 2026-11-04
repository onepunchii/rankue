import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    BREAK_RPS_MAX_ROUNDS, BREAK_RPS_PICK_MS, BREAK_RPS_TIE_SHOW_MS, applyBreakWinner, breakRpsPending, breakRpsPick, breakRpsSettle, breakRpsStart, breakRpsView,
    parseBreakRps, rpsBeats, type BreakRps,
} from "./breakRps";
import { applyShot, createSession, DEFAULT_3C_RULES, type ShotOutcome } from "./rules";

/**
 * 선구 정하기 — 가위바위보(2026-11-04 오너 "응 이렇게 진행하자", 시안 reports/sim-rps-mockup-1104.png).
 * 이긴 사람이 초구 · 20초 · 비기면 한 번 더 · 한 사람만 내면 낸 사람 · 아무도 안 내면 방장 · 이긴 사람이 흰 공과 선공.
 */
const T0 = 1_800_000_000_000;

describe("가위바위보 판정", () => {
    it("바위 > 가위 > 보 > 바위", () => {
        expect([rpsBeats("rock", "scissors"), rpsBeats("scissors", "paper"), rpsBeats("paper", "rock")]).toEqual([true, true, true]);
        expect([rpsBeats("scissors", "rock"), rpsBeats("rock", "rock")]).toEqual([false, false]);
    });

    it("시작: 1판 · 20초 · 아직 아무도 안 냈다 — 정하는 중", () => {
        const s = breakRpsStart(T0);
        expect(s).toEqual({ round: 1, deadlineMs: T0 + BREAK_RPS_PICK_MS, picks: [null, null], last: null, winner: null, by: null, decidedMs: null });
        expect(breakRpsPending(s)).toBe(true);
        expect(breakRpsPending(null)).toBe(false);
    });

    it("둘 다 내면 바로 가린다 — 이긴 쪽 · 두 손이 남는다(공개)", () => {
        let s = breakRpsPick(breakRpsStart(T0), 1, "rock", T0 + 2000);
        expect(s).toMatchObject({ picks: [null, "rock"], winner: null });
        s = breakRpsPick(s, 0, "scissors", T0 + 5000);
        expect(s).toMatchObject({ winner: 1, by: "rps", decidedMs: T0 + 5000, last: { round: 1, picks: ["scissors", "rock"] } });
        expect(breakRpsPending(s)).toBe(false);
    });

    it("한 번 내면 바꿀 수 없다 · 정해진 뒤에는 아무것도 안 바뀐다", () => {
        const a = breakRpsPick(breakRpsStart(T0), 0, "paper", T0 + 1000);
        expect(breakRpsPick(a, 0, "rock", T0 + 2000)).toEqual(a);
        const done = breakRpsPick(a, 1, "rock", T0 + 3000);
        expect(done.winner).toBe(0);
        expect(breakRpsPick(done, 1, "scissors", T0 + 4000)).toEqual(done);
    });

    it("비기면 한 번 더 — 같은 손을 1.5초 보여 주고 새 20초", () => {
        let s = breakRpsPick(breakRpsStart(T0), 0, "paper", T0 + 1000);
        s = breakRpsPick(s, 1, "paper", T0 + 3000);
        expect(s).toEqual({ round: 2, deadlineMs: T0 + 3000 + BREAK_RPS_TIE_SHOW_MS + BREAK_RPS_PICK_MS, picks: [null, null], last: { round: 1, picks: ["paper", "paper"] }, winner: null, by: null, decidedMs: null });
        s = breakRpsPick(breakRpsPick(s, 0, "rock", T0 + 6000), 1, "paper", T0 + 7000);
        expect(s).toMatchObject({ round: 2, winner: 1, by: "rps", last: { round: 2, picks: ["rock", "paper"] } });
    });

    it("비김이 상한까지 이어지면 방장", () => {
        let s: BreakRps = breakRpsStart(T0);
        for (let r = 1; r <= BREAK_RPS_MAX_ROUNDS; r++) s = breakRpsPick(breakRpsPick(s, 0, "rock", s.deadlineMs - 100), 1, "rock", s.deadlineMs - 50);
        expect(s).toMatchObject({ winner: 0, by: "rounds" });
    });

    it("20초가 지나면: 한 사람만 냈으면 그 사람 · 아무도 안 냈으면 방장 · 시간 전에는 그대로", () => {
        const one = breakRpsPick(breakRpsStart(T0), 1, "scissors", T0 + 4000);
        expect(breakRpsSettle(one, T0 + BREAK_RPS_PICK_MS - 1)).toEqual(one);
        expect(breakRpsSettle(one, T0 + BREAK_RPS_PICK_MS)).toMatchObject({ winner: 1, by: "timeout", decidedMs: T0 + BREAK_RPS_PICK_MS });
        expect(breakRpsSettle(breakRpsStart(T0), T0 + BREAK_RPS_PICK_MS + 5)).toMatchObject({ winner: 0, by: "default" });
        // 시간이 지난 뒤에 낸 손은 받지 않는다 — 먼저 정한다
        expect(breakRpsPick(one, 0, "rock", T0 + BREAK_RPS_PICK_MS + 1)).toMatchObject({ winner: 1, by: "timeout", picks: [null, "scissors"] });
    });
});

describe("정해진 사람을 세션에", () => {
    const session = () => createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "host", target: 10 }, { id: "guest", target: 10 }] });

    it("방장이 이기면 그대로(예전과 같은 세션)", () => {
        const s = session();
        expect(applyBreakWinner(s, 0)).toBe(s);
    });

    it("게스트가 이기면 흰 공 · 차례 · 선공이 게스트에게", () => {
        const s = applyBreakWinner(session(), 1);
        expect(s.players.map((p) => p.cueBallId)).toEqual(["yellow", "white"]);
        expect([s.turn, s.first]).toEqual([1, 1]);
        // 이미 친 판은 건드리지 않는다
        const played = { ...session(), shotCount: 1 };
        expect(applyBreakWinner(played, 1)).toBe(played);
    });

    it("게스트가 선공이면 후구도 게스트 기준 — 게스트가 먼저 닿으면 방장에게 한 이닝, 방장이 닿으면 바로 끝", () => {
        const score = (points: number): ShotOutcome => ({ code: "score", points, scored: true, consumesInning: false, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: [], kisses: 0 } as ShotOutcome);
        const miss: ShotOutcome = { code: "miss", points: 0, scored: false, consumesInning: true, cushionsBeforeSecond: 0, cushionsBeforeFirst: 0, contacts: [], kisses: 0 } as ShotOutcome;
        // 게스트(선공)가 목표에 닿았다 → 후구: 방장 차례, 아직 안 끝남
        let s = applyBreakWinner(session(), 1);
        s = applyShot(s, score(10)).session;
        expect([s.status, s.pendingWinner, s.turn]).toEqual(["playing", 1, 0]);
        // 방장이 후구를 못 채우면 게스트 승
        expect(applyShot(s, miss).session).toMatchObject({ status: "finished", winnerIndex: 1 });
        // 반대로 게스트가 이닝을 넘기고, 방장(후공)이 닿으면 바로 끝
        let t = applyBreakWinner(session(), 1);
        t = applyShot(t, miss).session;
        expect(t.turn).toBe(0);
        expect(applyShot(t, score(10)).session).toMatchObject({ status: "finished", winnerIndex: 0, pendingWinner: null });
    });
});

describe("보는 사람 기준 · 저장 모양", () => {
    it("이번 판 상대 손은 '냈다'만 — 공개된 앞 판은 나 · 상대로 · 관전자는 이번 판 손을 모른다", () => {
        let s = breakRpsPick(breakRpsStart(T0), 0, "rock", T0 + 1000);
        expect(breakRpsView(s, 1)).toMatchObject({ myPick: null, opponentPicked: true, winner: null });
        expect(breakRpsView(s, 0)).toMatchObject({ myPick: "rock", opponentPicked: false });
        expect(breakRpsView(s, -1)).toMatchObject({ myPick: null });
        s = breakRpsPick(s, 1, "paper", T0 + 2000);
        expect(breakRpsView(s, 0)).toMatchObject({ winner: "opponent", last: { mine: "rock", theirs: "paper" }, by: "rps" });
        expect(breakRpsView(s, 1)).toMatchObject({ winner: "me", last: { mine: "paper", theirs: "rock" } });
        expect(JSON.stringify(breakRpsView(breakRpsPick(breakRpsStart(T0), 0, "rock", T0), 1))).not.toContain("rock");
    });

    it("저장된 값을 읽는다 — 모양이 틀리면 null(가위바위보 없는 대전과 같다)", () => {
        const s = breakRpsPick(breakRpsPick(breakRpsStart(T0), 0, "rock", T0 + 1), 1, "rock", T0 + 2);
        expect(parseBreakRps(JSON.parse(JSON.stringify(s)))).toEqual(s);
        for (const bad of [null, {}, { round: 1 }, { round: 1, deadlineMs: 1, picks: ["gun", null] }, "x"]) {
            const p = parseBreakRps(bad);
            if (p) expect(p.picks).toEqual([null, null]); else expect(p).toBeNull();
        }
    });
});

/** 서버가 그 규칙대로 도는가 — 소스를 읽어 지킨다 */
describe("서버: 모든 새 대전은 가위바위보로 시작하고, 정해질 때까지 칠 수 없다", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
    const route = read("server/routes/modules/simMatch.ts");
    const repo = read("server/storage/simMatch.repo.ts");

    it("참가 · 월대회 판이 시작할 때 가위바위보를 연다 · 그동안 시계는 걸지 않는다", () => {
        expect(route.match(/breakRpsStart\(Date\.now\(\)\)\);/g)).toHaveLength(2);
        expect(repo).toContain("turnSeenAt: breakRps ? null : startTurnSeenAt(m.hostSeenAt),");
        // 시계를 거는 길(ack)도 막는다
        expect(repo).toContain("sql`(${hiqSimMatches.breakRps} is null or ${hiqSimMatches.breakRps} ->> 'winner' is not null)`");
    });

    it("정해지기 전에는 샷 · 승리 주장이 409 · 내는 길은 선수만 · 정해지면 이긴 사람의 시계를 건다", () => {
        expect(route.match(/if \(breakRpsPending\(parseBreakRps\(m\.breakRps\)\)\) return sendError\(res, 409, "err\.sim\.breakPicking", "BREAK_PICKING"\);/g)).toHaveLength(2);
        expect(route).toContain('router.post("/sim/matches/:id/rps", requireAuth,');
        expect(route).toContain("await storage.simMatch.decideBreak(m.id, (r) => breakRpsPick(r, seat, hand, now));");
        const fn = repo.slice(repo.indexOf("async decideBreak("), repo.indexOf("/* ── 월대회 판"));
        expect(fn).toContain('.for("update")');
        expect(fn).toContain("const state = decided ? applyBreakWinner(m.state as SessionState, rps.winner!) : null;");
        expect(fn).toContain("turnSeenAt: startTurnSeenAt(rps.winner === 0 ? m.hostSeenAt : m.guestSeenAt),");
        expect(fn).toContain("version: m.version + 1,");
    });

    it("20초가 지난 판은 폴링(GET)이 정한다 · 화면에는 보는 사람 기준으로 준다", () => {
        expect(route).toContain("if (await storage.simMatch.decideBreak(m.id, (r) => breakRpsSettle(r, now))) m = (await storage.simMatch.get(m.id)) ?? m;");
        expect(route).toContain("breakRps: (() => { const r = parseBreakRps(m.breakRps); return r ? breakRpsView(r, myIndex) : null; })(),");
    });

    it("표: 더하기만 — 대전 표에 칸 하나", () => {
        const body = read("migrations/sim_break_rps.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toEqual(["alter table hiq_sim_matches add column if not exists break_rps jsonb;"]);
        expect(read("shared/schema.ts")).toContain('breakRps: jsonb("break_rps"),');
    });

    it("문구가 다섯 언어에 있다", () => {
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            expect(read(`shared/i18n/${l}.ts`), l).toMatch(/^  "err\.sim\.breakPicking": ".+",$/m);
            const c = read(`client/src/lib/i18n/${l}.ts`);
            for (const [k, ph] of [["title", []], ["noteFirst", ["{n}"]], ["beat", ["{a}", "{b}"]], ["tieSub", ["{a}"]], ["pickAria", ["{hand}"]], ["oppFirst", []]] as const) {
                const v = c.match(new RegExp(`^  "sim\\.rps\\.${k}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
            }
        }
    });
});
