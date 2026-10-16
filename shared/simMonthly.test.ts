import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ELO_K, MIN_SHOTS_EACH } from "./sim/rating";
import { MONTHLY_MIN_MATCHES, daysLeftInMonth, isMonthId, kstMonthOf, kstMonthRange, monthlyBoard, monthsWithMatches, replayDeltas, shiftMonth, type FinishedMatchRow } from "./simMonthly";

/**
 * 이달의 랭킹(2026-10-12 오너: "랭킹을 달로 해야겠지? … 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 * 통산 레이팅은 그대로 두고, 그 달에 올린 점수만 따로 센다. 매월 1일(한국 시각) 0 에서 시작한다.
 */
const KST = 9 * 3600_000;
/** 한국 시각으로 적은 때 → ms */
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - KST;
let seq = 0;
const m = (hostId: string, guestId: string, winner: "h" | "g" | "draw", endedMs: number, o: Partial<FinishedMatchRow> = {}): FinishedMatchRow => ({
    id: `m${++seq}`, hostId, guestId, gameType: "3c", handicap: true, endReason: "target",
    winnerId: winner === "draw" ? null : winner === "h" ? hostId : guestId, endedMs, shots: [MIN_SHOTS_EACH + 5, MIN_SHOTS_EACH + 5], ...o,
});

describe("달(한국 시각)", () => {
    it("달의 경계는 한국 시각 1일 0시다", () => {
        expect(kstMonthOf(at(2026, 10, 1, 0, 0))).toBe("2026-10");
        expect(kstMonthOf(at(2026, 10, 1, 0, 0) - 1)).toBe("2026-09");
        expect(kstMonthOf(at(2026, 12, 31, 23, 59))).toBe("2026-12");
        expect(kstMonthOf(at(2027, 1, 1, 0, 0))).toBe("2027-01");
        const [from, to] = kstMonthRange("2026-10");
        expect([from, to]).toEqual([at(2026, 10, 1, 0, 0), at(2026, 11, 1, 0, 0)]);
    });

    it("앞 달 · 다음 달 · 남은 날 · 달 이름 검사", () => {
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(daysLeftInMonth("2026-10", at(2026, 10, 12, 15))).toBe(20);   // 12일 오후 → 31일 자정까지
        expect(daysLeftInMonth("2026-10", at(2026, 10, 31, 23, 30))).toBe(1);
        expect(daysLeftInMonth("2026-10", at(2026, 11, 1, 0, 0))).toBe(0);
        expect(["2026-10", "2026-13", "2026-1", "x", 3].map(isMonthId)).toEqual([true, false, false, false, false]);
    });
});

describe("판마다의 변화(replayDeltas) — 통산 레이팅과 같은 규칙", () => {
    it("핸디전이고 둘 다 충분히 친 판만 · 이기면 +K/2 · 무승부 0", () => {
        const rows = [
            m("a", "b", "h", at(2026, 10, 2)),
            m("a", "c", "g", at(2026, 10, 3)),
            m("a", "d", "draw", at(2026, 10, 4)),
            m("a", "e", "h", at(2026, 10, 5), { handicap: false }),                       // 친선전 — 빠진다
            m("a", "f", "h", at(2026, 10, 6), { shots: [MIN_SHOTS_EACH, 1] }),             // 너무 짧다 — 빠진다
        ];
        const d = replayDeltas(rows);
        expect(d.map((x) => [x.hostId, x.guestId, x.delta, x.winner])).toEqual([["a", "b", ELO_K / 2, 0], ["a", "c", -ELO_K / 2, 1], ["a", "d", 0, null]]);
    });

    it("같은 두 사람이 24시간 안에 연달아 치면 폭이 줄어든다 — 하루가 지나면 다시 온전히", () => {
        const d = replayDeltas([
            m("a", "b", "h", at(2026, 10, 2, 10)), m("b", "a", "g", at(2026, 10, 2, 11)), m("a", "b", "h", at(2026, 10, 2, 12)),
            m("a", "b", "h", at(2026, 10, 4, 10)),
        ]);
        expect(d.map((x) => Math.abs(x.delta))).toEqual([12, 6, 4, 12]);
    });

    it("그 판에 실제로 반영된 값이 남아 있으면 그 값을 쓴다(2026-10-12 부터)", () => {
        const d = replayDeltas([m("a", "b", "h", at(2026, 10, 13), { storedDelta: 7 }), m("a", "b", "h", at(2026, 10, 13, 13), { storedDelta: null })]);
        expect(d.map((x) => x.delta)).toEqual([7, 6]);
    });
});

describe("이달의 판(monthlyBoard)", () => {
    // a: 6판 5승(+48 … 같은 상대가 아니라 온전히), b: 5판 2승, c: 1판 1승(순위 밖)
    const oct = (() => {
        seq = 0;
        const rows: FinishedMatchRow[] = [];
        const opp = ["p1", "p2", "p3", "p4", "p5", "p6"];
        opp.forEach((o, i) => rows.push(m("a", o, i === 5 ? "g" : "h", at(2026, 10, 2 + i))));
        ["q1", "q2", "q3", "q4", "q5"].forEach((o, i) => rows.push(m("b", o, i < 2 ? "h" : "g", at(2026, 10, 10 + i))));
        rows.push(m("c", "r1", "h", at(2026, 10, 20)));
        rows.push(m("a", "z", "h", at(2026, 9, 30, 23, 59)));    // 9월 — 10월 판에 안 들어간다
        rows.push(m("a", "y", "h", at(2026, 11, 1, 0, 0)));      // 11월
        rows.push(m("a", "x", "h", at(2026, 10, 9), { gameType: "4c" }));
        return rows.sort((x, y) => x.endedMs - y.endedMs);
    })();
    const deltas = replayDeltas(oct);

    it("그 달 · 그 종목의 판만 더한다 — 매월 1일 0 에서 시작", () => {
        const board = monthlyBoard(deltas, "2026-10", "3c");
        const a = board.find((r) => r.memberId === "a")!;
        expect(a).toMatchObject({ points: 12 * 5 - 12, matches: 6, wins: 5, rank: 1 });
        // 9월 판 · 11월 판은 각 달에만 있다
        expect(monthlyBoard(deltas, "2026-09", "3c").find((r) => r.memberId === "a")).toMatchObject({ points: 12, matches: 1 });
        expect(monthlyBoard(deltas, "2026-11", "3c").find((r) => r.memberId === "a")).toMatchObject({ points: 12, matches: 1 });
        expect(monthlyBoard(deltas, "2026-10", "4c").find((r) => r.memberId === "a")).toMatchObject({ points: 12, matches: 1 });
    });

    it(`순위는 그 달 ${MONTHLY_MIN_MATCHES}판을 친 사람만 — 한 판 이기고 1등이 되지 않는다`, () => {
        const board = monthlyBoard(deltas, "2026-10", "3c");
        expect(board.filter((r) => r.rank !== null).map((r) => [r.memberId, r.rank])).toEqual([["a", 1], ["b", 2]]);
        expect(board.find((r) => r.memberId === "c")).toMatchObject({ points: 12, matches: 1, wins: 1, rank: null });
        // 순위 있는 사람이 먼저 온다
        expect(board.findIndex((r) => r.rank === null)).toBe(2);
    });

    it("점수가 같으면 승수 많은 순 → 판 수 적은 순 · 셋 다 같으면 같은 등수", () => {
        seq = 100;
        const rows: FinishedMatchRow[] = [];
        // x: 5판 3승 2패(+12) / y: 7판 4승 3패(+12) / z: 5판 3승 2패(+12)
        ["a1", "a2", "a3", "a4", "a5"].forEach((o, i) => rows.push(m("x", o, i < 3 ? "h" : "g", at(2026, 10, 2 + i))));
        ["b1", "b2", "b3", "b4", "b5", "b6", "b7"].forEach((o, i) => rows.push(m("y", o, i < 4 ? "h" : "g", at(2026, 10, 2 + i, 13))));
        ["c1", "c2", "c3", "c4", "c5"].forEach((o, i) => rows.push(m("z", o, i < 3 ? "h" : "g", at(2026, 10, 2 + i, 14))));
        const board = monthlyBoard(replayDeltas(rows.sort((p, q) => p.endedMs - q.endedMs)), "2026-10", "3c").filter((r) => r.rank !== null);
        expect(board.map((r) => [r.memberId, r.points, r.rank])).toEqual([["y", 12, 1], ["x", 12, 2], ["z", 12, 2]]);
    });

    it("무승부는 양쪽 다 승으로 센다(통산 사다리와 같다) · 진 사람의 점수는 음수", () => {
        seq = 200;
        const d = replayDeltas([m("a", "b", "draw", at(2026, 10, 2)), m("a", "c", "h", at(2026, 10, 3))]);
        const board = monthlyBoard(d, "2026-10", "3c", 1);
        expect(board.find((r) => r.memberId === "a")).toMatchObject({ points: 12, matches: 2, wins: 2 });
        expect(board.find((r) => r.memberId === "b")).toMatchObject({ points: 0, matches: 1, wins: 1 });
        expect(board.find((r) => r.memberId === "c")).toMatchObject({ points: -12, matches: 1, wins: 0 });
    });

    it("대전이 있었던 달들 — 최근 달부터", () => {
        expect(monthsWithMatches(deltas, "3c")).toEqual(["2026-11", "2026-10", "2026-09"]);
        expect(monthsWithMatches(deltas, "4c")).toEqual(["2026-10"]);
    });
});

describe("서버: 이달의 랭킹은 읽기만 한다 — 통산 레이팅을 건드리지 않는다", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
    it("재료는 전체 다시 계산(recomputeRatings)과 같은 순서로 읽고, 그 판에 남은 변화가 있으면 그것을 쓴다", () => {
        const repo = read("server/storage/simMatch.repo.ts");
        const fn = repo.slice(repo.indexOf("private async finishedForReplay()"), repo.indexOf("async recomputeRatings(dryRun: boolean, "));
        expect(fn).toContain("order by coalesce(m.finished_at, m.last_shot_at, m.created_at) asc, m.id asc");
        expect(fn).toContain("(m.rating_result->>'delta') as stored_delta");
        // 재료는 한 곳(ratedDeltas)에서 읽는다 — 장식장(storage/simShelf.repo)도 같은 것을 쓴다
        expect(fn).toContain("return replayDeltas(replayCache.rows);");
        expect(fn).toContain("const deltas = await this.ratedDeltas();");
        expect(fn).toContain("const board = monthlyBoard(deltas, month, gameType);");
        // 쓰는 문장이 없다
        expect(fn).not.toMatch(/\.update\(|\.insert\(|delete from|\.delete\(/);
    });
    it("주소: GET /sim/rank/monthly — 로그인 필수, 달을 안 주면 이번 달(한국 시각)", () => {
        const route = read("server/routes/modules/sim.ts");
        expect(route).toContain('router.get("/sim/rank/monthly", requireAuth,');
        expect(route).toContain("const month = isMonthId(req.query.month) ? req.query.month : kstMonthOf(Date.now());");
    });
});
