import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cupPlan, cupSettle, type CupEntrant, type CupGame } from "./simCup";
import { adminOutcome, canChangeResult, canDecide, downstreamOf } from "./simCupAdmin";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const START = Date.parse("2026-10-31T15:00:00Z");
const ent = (n: number): CupEntrant[] => Array.from({ length: n }, (_, i) => ({ memberId: `m${i + 1}`, seed: i + 1, rating: 1100 - i * 10, matches: 6, points: 10, wins: 3 }));
const seeds = (e: CupEntrant[]) => new Map(e.map((x) => [x.memberId, x.seed]));
const find = (gs: CupGame[], kind: "main" | "third", round: number, slot: number) => gs.find((g) => g.kind === kind && g.round === round && g.slot === slot)!;

/** 8명 대진을 열고(부전승 없음) 1라운드 네 판을 판정으로 가른다 — 시드 높은 쪽이 이긴 것으로 */
function eight() {
    const e = ent(8);
    let gs = cupSettle(cupPlan(e, START), seeds(e), new Map(), START).games;
    for (const g of gs.filter((x) => x.round === 1)) Object.assign(g, { outcome: "played", winnerId: g.p1Id, decidedMs: START + 1 });
    gs = cupSettle(gs, seeds(e), new Map(), START + 2).games;
    return { e, gs };
}

describe("월대회 운영 — 이 판에 기대는 판", () => {
    it("1라운드 판은 다음 칸의 한쪽에, 준결승은 결승과 3·4위전에 기댄다", () => {
        const { gs } = eight();
        const r1s1 = find(gs, "main", 1, 1);
        expect(downstreamOf(r1s1, gs).map((d) => [d.game.round, d.game.slot, d.side, d.takes])).toEqual([[2, 0, "p2", "winner"]]);
        const semi1 = find(gs, "main", 2, 1);
        expect(downstreamOf(semi1, gs).map((d) => [d.game.kind, d.side, d.takes])).toEqual([["main", "p2", "winner"], ["third", "p2", "loser"]]);
        expect(downstreamOf(find(gs, "third", 3, 0), gs)).toEqual([]);
    });
});

describe("월대회 운영 — 손대도 되는 때", () => {
    it("결과 바꾸기: 가려진 판 · 다음 판이 시작 전 · 치르는 중인 대회만", () => {
        const { gs } = eight();
        const r1s0 = find(gs, "main", 1, 0);
        expect(canChangeResult(r1s0, gs, true)).toEqual({ ok: true });
        expect(canChangeResult(r1s0, gs, false).ok).toBe(false);
        expect(canChangeResult(find(gs, "main", 2, 0), gs, true).ok).toBe(false); // 아직 안 가려졌다
        find(gs, "main", 2, 0).matchId = "room-1"; // 다음 판의 방이 열렸다
        expect(canChangeResult(r1s0, gs, true)).toEqual({ ok: false, why: "다음 판이 이미 시작됐어요" });
    });

    it("부전승은 바꿀 수 없다", () => {
        const e = ent(5);
        const gs = cupSettle(cupPlan(e, START), seeds(e), new Map(), START).games;
        const bye = gs.find((g) => g.outcome === "bye")!;
        expect(canChangeResult(bye, gs, true)).toEqual({ ok: false, why: "부전승은 바꿀 수 없어요" });
    });

    it("결과 정하기: 아직 안 가려졌고 두 사람이 앉은 판만", () => {
        const { gs } = eight();
        expect(canDecide(find(gs, "main", 2, 0), true)).toEqual({ ok: true });
        expect(canDecide(find(gs, "main", 1, 0), true).ok).toBe(false);
        expect(canDecide(find(gs, "main", 3, 0), true)).toEqual({ ok: false, why: "두 사람이 다 앉아야 정할 수 있어요" });
    });

    it("결과의 이름 — 승자 없음 = 둘 다 기권 · 진 쪽 기권 = 기권승 · 아니면 시드와 같은 것", () => {
        expect(adminOutcome(null, false)).toBe("void");
        expect(adminOutcome("m1", true)).toBe("walkover");
        expect(adminOutcome("m1", false)).toBe("seed");
    });
});

describe("월대회 운영 — 결과를 바꾸면 굴림이 다음 칸을 다시 앉힌다", () => {
    it("1라운드 승자를 바꾸면 다음 칸의 그 자리가 새 승자로", () => {
        const { e, gs } = eight();
        const r1s1 = find(gs, "main", 1, 1);
        expect(find(gs, "main", 2, 0).p2Id).toBe(r1s1.p1Id);
        Object.assign(r1s1, { winnerId: r1s1.p2Id, outcome: "seed" });
        const after = cupSettle(gs, seeds(e), new Map(), START + 3).games;
        expect(find(after, "main", 2, 0).p2Id).toBe(r1s1.p2Id);
    });

    it("준결승을 기권승으로 바꾸면 진 사람은 3·4위전 자리를 잃는다", () => {
        const { e, gs } = eight();
        for (const g of gs.filter((x) => x.round === 2)) Object.assign(g, { outcome: "played", winnerId: g.p1Id, decidedMs: START + 4 });
        let after = cupSettle(gs, seeds(e), new Map(), START + 5).games;
        const semi0 = find(after, "main", 2, 0);
        expect(find(after, "third", 3, 0).p1Id).toBe(semi0.p2Id);
        Object.assign(semi0, { outcome: "walkover" });
        after = cupSettle(after, seeds(e), new Map(), START + 6).games;
        expect(find(after, "third", 3, 0).p1Id).toBeNull();
    });
});

describe("월대회 운영 — 서버", () => {
    const route = read("server/routes/modules/adminBilliards.ts");
    const after = (path: string) => route.slice(route.indexOf(`router.post("/cups/games/:gameId/${path}"`));
    it("모든 길이 까닭을 받고, 운영 기록을 칸에 남긴다", () => {
        for (const p of ["extend", "decide", "change"]) {
            expect(after(p)).toMatch(/if \(!reason\) return sendError\(res, 400/);
            expect(after(p)).toMatch(/adminNote: noteSql\(/);
        }
    });
    it("결과 정하기는 열린 대회 방을 닫고 굴린다 · 바꾸기는 다음 판 그 자리의 '들어옴'을 지우고 굴린다", () => {
        expect(after("decide")).toMatch(/cancelForCup\(\[st\.game\.matchId\]\)[\s\S]*rollOne\(st\.cupId\)/);
        expect(after("change")).toMatch(/downstreamOf\(st\.game, st\.games\)[\s\S]*p1ReadyAt: null[\s\S]*rollOne\(st\.cupId\)/);
    });
    it("마이그레이션은 칸 하나를 더하기만 한다", () => {
        const body = read("migrations/sim_cup_admin_note.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toEqual(["alter table hiq_sim_cup_games add column if not exists admin_note jsonb;"]);
    });
});
