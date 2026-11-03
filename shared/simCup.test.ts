import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { kstMonthRange, type MatchDelta } from "./simMonthly";
import {
    CUP_ENTER_EARLY_MS, CUP_GAMES, CUP_MATCH, CUP_MAX_ENTRANTS, CUP_MIN_MATCHES, CUP_MIN_NOTICE_MS, CUP_MIN_RATING, CUP_NO_SHOW_MS, CUP_PLAY_GRACE_MS, CUP_PRESENT_MS,
    cupCandidates, cupEntrants, cupGameKey, cupLosers, cupMyGame, cupPlaces, cupPlan, cupPresent, cupRoundSize, cupRounds, cupSeed, cupSettle, cupSize, cupWindow,
    type CupEntrant, type CupGame, type CupMatchInfo,
} from "./simCup";

/**
 * 월대회 규칙(2026-10-12 오너: "매월 대회 … 레이팅 기준으로 출전권 → 토너먼트 → 상대방이 못 오면 기권으로 · 1~5등 메달" → "추천대로").
 * 2026-11-03 운영자가 여는 대회로(오너: "우리가 지정된 날짜에 방을 만듬 … 일정시간 안들어오면 기권패 … 4구 대회는 삭제"):
 * 3쿠션만 · 성적으로 추천하고 운영자가 확정 · 판마다 운영자가 시각을 정함 · 10분 전부터 입장 · 15분 뒤 판정 · 우승~8강 메달.
 */
const DAY = 86_400_000, MIN = 60_000;
/** 아무 때 — 대회를 만든 때 */
const START = Date.UTC(2026, 10, 7, 3);
/** 경기 시각 — 토요일 21시(한국) */
const AT = Date.UTC(2026, 10, 7, 12);
const ent = (n: number): CupEntrant[] => Array.from({ length: n }, (_, i) => ({ memberId: `s${i + 1}`, seed: i + 1, rating: 1300 - i * 10, matches: 6, points: 20, wins: 4 }));
const seedsOf = (e: CupEntrant[]) => new Map(e.map((x) => [x.memberId, x.seed]));
const view = (games: CupGame[]) => games.map((g) => `${g.kind[0]}${g.round}.${g.slot} ${g.p1Id ?? "-"}v${g.p2Id ?? "-"}${g.outcome ? `=${g.outcome}:${g.winnerId ?? "x"}` : ""}`);
const find = (games: CupGame[], kind: "main" | "third", round: number, slot: number) => games.find((g) => g.kind === kind && g.round === round && g.slot === slot)!;
/** 그 라운드(3·4위전 포함)의 판에 시각을 정한다 */
const sched = (games: CupGame[], round: number, at: number) => { for (const g of games) if (g.round === round && !g.outcome) g.scheduledMs = at; return games; };
/** 그 칸에 대전을 열고 결과를 넣는다 */
function play(games: CupGame[], matches: Map<string, CupMatchInfo>, kind: "main" | "third", round: number, slot: number, winner: "p1" | "p2" | "draw") {
    const g = find(games, kind, round, slot);
    g.matchId = `m-${cupGameKey(g)}`;
    g.p1ReadyMs = g.p2ReadyMs = 1;
    matches.set(g.matchId, { status: "finished", winnerId: winner === "draw" ? null : winner === "p1" ? g.p1Id : g.p2Id, turnId: null });
}

describe("출전권 · 대진 크기", () => {
    let seq = 0;
    const game = (month: string, day: number, hostId: string, guestId: string, delta: number): MatchDelta => ({
        id: `m${++seq}`, hostId, guestId, gameType: "3c", endedMs: kstMonthRange(month)[0] + (day - 1) * DAY + 12 * 3_600_000, delta, winner: delta > 0 ? 0 : 1,
    });
    const run = (month: string, hostId: string, guestId: string, deltas: number[]) => deltas.map((d, i) => game(month, i + 1, hostId, guestId, d));

    it("정한 것: 3쿠션만(4구 대회는 안 한다) · 추천은 레이팅 1000 이상 · 그 달 5판 · 많으면 16명 · 10분 전 입장 · 15분 뒤 판정", () => {
        expect([...CUP_GAMES]).toEqual(["3c"]);
        expect([CUP_MIN_RATING, CUP_MIN_MATCHES, CUP_MAX_ENTRANTS]).toEqual([1000, 5, 16]);
        expect([CUP_ENTER_EARLY_MS, CUP_NO_SHOW_MS, CUP_MIN_NOTICE_MS].map((x) => x / MIN)).toEqual([10, 15, 60]);
        // 대회 판은 평소의 레이팅 판(핸디전)과 같다
        expect(CUP_MATCH.handicap).toBe(true);
    });

    it("그 달 5판을 치고 달이 끝날 때 레이팅이 1000 이상인 사람 — 레이팅 높은 순으로 시드", () => {
        const d = [
            ...run("2026-10", "a", "b", [12, 12, 12, 12, 12]),     // a 1060 · b 940(탈락: 레이팅)
            ...run("2026-10", "c", "d", [12, 12, 12, 12]),         // c 1048 · d 952 — 네 판뿐(탈락: 판 수)
            ...run("2026-10", "e", "f", [12, -12, 12, -12, 12]),   // e 1012 · f 988(탈락: 레이팅)
            ...run("2026-10", "g", "h", [12, -12, 12, -12, 12, -12]),  // g 1000 · h 1000 — 딱 1000 은 나간다(점수 · 승수까지 같으면 id 순)
        ];
        const got = cupEntrants(d, "2026-10", "3c");
        expect(got.map((x) => `${x.seed}:${x.memberId}:${x.rating}`)).toEqual(["1:a:1060", "2:e:1012", "3:g:1000", "4:h:1000"]);
        expect(got[0]).toMatchObject({ matches: 5, points: 60, wins: 5 });
        // 4구는 열지 않아도 셈은 된다(판이 없으니 0명)
        expect(cupEntrants(d, "2026-10", "4c")).toEqual([]);
        expect(cupEntrants(d, "2026-13", "3c")).toEqual([]);
    });

    it("앞 달에 쌓은 레이팅이 높아도 그 달에 5판을 안 쳤으면 못 나간다 · 다음 달의 판은 확정에 들지 않는다", () => {
        const d = [
            ...run("2026-09", "old", "x", [12, 12, 12, 12, 12, 12, 12, 12]),   // 9월에 1096, 10월은 쉼
            ...run("2026-10", "a", "b", [12, 12, 12, 12, 12]),
            ...run("2026-11", "a", "b", [-12, -12, -12, -12, -12, -12]),       // 11월에 잃어도 10월 확정은 1060
        ];
        expect(cupEntrants(d, "2026-10", "3c").map((x) => `${x.memberId}:${x.rating}`)).toEqual(["a:1060"]);
    });

    it("달이 끝나기 전에는 '지금 이대로면' — 그 시각의 레이팅으로 센다", () => {
        const d = run("2026-10", "a", "b", [12, 12, 12, 12, 12, -12, -12, -12, -12, -12, -12]);   // 5일: a 1060 · b 940 → 11일: a 988 · b 1012
        const at = (day: number) => kstMonthRange("2026-10")[0] + (day - 1) * DAY + 13 * 3_600_000;
        const who = (ms?: number) => cupEntrants(d, "2026-10", "3c", ms).map((x) => `${x.memberId}:${x.rating}`);
        expect(who(at(5))).toEqual(["a:1060"]);
        // 뒤집혔다 — 지금 1000 을 넘는 사람이 나간다
        expect(who(at(11))).toEqual(["b:1012"]);
        expect(who()).toEqual(["b:1012"]);
    });

    it("후보: 그 달에 친 사람 전부(추천 여부와 함께) · 고른 사람에게 레이팅 순으로 시드", () => {
        const d = [
            ...run("2026-10", "a", "b", [12, 12, 12, 12, 12]),     // a 1060(추천) · b 940
            ...run("2026-10", "c", "d", [12, 12]),                 // c 1024 · d 976 — 두 판뿐
        ];
        const all = cupCandidates(d, "2026-10", "3c");
        expect(all.map((c) => `${c.memberId}:${c.rating}:${c.suggested ? "추천" : "-"}`)).toEqual(["a:1060:추천", "c:1024:-", "d:976:-", "b:940:-"]);
        // 운영자가 b · c 를 더했다 — 시드는 레이팅 순
        expect(cupSeed(all.filter((c) => c.memberId !== "d")).map((x) => `${x.seed}:${x.memberId}`)).toEqual(["1:a", "2:c", "3:b"]);
        // 추천만 고르면 cupEntrants 와 같다
        expect(cupSeed(all.filter((c) => c.suggested))).toEqual(cupEntrants(d, "2026-10", "3c"));
    });

    it("17명이 조건을 채워도 16명까지", () => {
        const d: MatchDelta[] = [];
        for (let i = 0; i < 17; i++) d.push(...run("2026-10", `w${String(i).padStart(2, "0")}`, `l${i}`, Array.from({ length: 5 + i }, () => 12)));
        const got = cupEntrants(d, "2026-10", "3c");
        expect(got).toHaveLength(16);
        expect(got[0].memberId).toBe("w16");
        expect(got.some((x) => x.memberId === "w00")).toBe(false);
    });

    it("대진 크기: 3~4명 4강 · 5~8명 8강 · 9~16명 16강 · 3명이 안 되면 열지 않는다", () => {
        expect([0, 1, 2, 3, 4, 5, 8, 9, 16].map(cupSize)).toEqual([0, 0, 0, 4, 4, 8, 8, 16, 16]);
        expect(cupPlan(ent(2))).toEqual([]);
    });
});

describe("경기 시각 · 입장 시간", () => {
    it("10분 전부터 입장 · 정각 15분 뒤까지 · 그 뒤는 판정만 — 시각이 없으면 '일정 미정'", () => {
        expect(cupWindow(null, AT)).toBe("unscheduled");
        expect(cupWindow(AT, AT - 10 * MIN - 1)).toBe("early");
        expect(cupWindow(AT, AT - 10 * MIN)).toBe("open");
        expect(cupWindow(AT, AT + 15 * MIN - 1)).toBe("open");
        expect(cupWindow(AT, AT + 15 * MIN)).toBe("closed");
    });

    it("대기실에 '지금 있다' — 마지막으로 적은 때가 25초 안", () => {
        expect(CUP_PRESENT_MS).toBe(25_000);
        expect(cupPresent(AT, AT + 25_000)).toBe(true);
        expect(cupPresent(AT, AT + 25_001)).toBe(false);
        expect(cupPresent(null, AT)).toBe(false);
        expect(cupPresent(undefined, AT)).toBe(false);
    });

    it("처음 대진: 표준 배치(1번과 2번은 결승에서만), 빈자리는 시드 높은 사람의 부전승, 3·4위전은 결승과 같은 라운드 — 시각은 비어 있다", () => {
        const games = cupPlan(ent(5));
        expect(cupRounds(games)).toBe(3);
        expect(view(games)).toEqual(["m1.0 s1v-", "m1.1 s4vs5", "m1.2 s2v-", "m1.3 s3v-", "m2.0 -v-", "m2.1 -v-", "m3.0 -v-", "t3.0 -v-"]);
        expect(games.every((g) => g.scheduledMs === null)).toBe(true);
        expect([1, 2, 3].map((r) => cupRoundSize(r, 3))).toEqual([8, 4, 2]);
    });
});

describe("대진 굴리기(cupSettle)", () => {
    it("부전승은 바로 올라가고, 다음 상대가 정해지는 대로 칸에 앉는다", () => {
        const e = ent(5);
        const r = cupSettle(cupPlan(e), seedsOf(e), new Map(), START);
        expect(view(r.games)).toEqual(["m1.0 s1v-=bye:s1", "m1.1 s4vs5", "m1.2 s2v-=bye:s2", "m1.3 s3v-=bye:s3", "m2.0 s1v-", "m2.1 s2vs3", "m3.0 -v-", "t3.0 -v-"]);
        expect(r.finished).toBe(false);
        expect(r.cancelMatchIds).toEqual([]);
        // 내 판: s2 는 준결승 상대(s3)가 정해졌고, s1 은 아직 기다린다
        expect(cupMyGame(r.games, "s2")).toMatchObject({ opponentId: "s3", waiting: false, mine: "p1" });
        expect(cupMyGame(r.games, "s1")).toMatchObject({ opponentId: null, waiting: true });
        expect(cupMyGame(r.games, "nobody")).toBeNull();
    });

    it("몇 번을 불러도 같다 — 가려진 칸은 건드리지 않는다", () => {
        const e = ent(5);
        const a = cupSettle(cupPlan(e), seedsOf(e), new Map(), START);
        const b = cupSettle(a.games, seedsOf(e), new Map(), START + 5000);
        expect(b.changed).toEqual([]);
        expect(b.decided).toEqual([]);
        expect(b.games).toEqual(a.games);
    });

    it("시각이 없는 판은 시간으로 가리지 않는다 — 한참 지나도 그대로(운영자가 시각을 정하거나 결과를 정한다)", () => {
        const e = ent(4);
        const r = cupSettle(cupPlan(e), seedsOf(e), new Map(), START);
        const later = cupSettle(r.games, seedsOf(e), new Map(), START + 30 * DAY);
        expect(later.decided).toEqual([]);
        expect(view(later.games)).toEqual(view(r.games));
    });

    it("끝난 판의 승자가 올라간다 — 비기면 시드가 높은 사람", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START);
        play(r.games, m, "main", 1, 0, "p2");     // s4 가 s1 을 이겼다
        play(r.games, m, "main", 1, 1, "draw");   // s2 v s3 비김 → s2
        r = cupSettle(r.games, seedsOf(e), m, START + 2);
        expect(view(r.games)).toEqual(["m1.0 s1vs4=played:s4", "m1.1 s2vs3=played:s2", "m2.0 s4vs2", "t2.0 s1vs3"]);
        expect(r.decided.map(cupGameKey)).toEqual(["main:1:0", "main:1:1"]);
    });

    it("15분이 지나도 판이 안 열렸다 — 한 사람만 입장했으면 그 사람의 기권승 · 아무도 안 왔으면 둘 다 탈락, 다음 상대는 부전승", () => {
        const e = ent(8);
        let r = cupSettle(sched(cupPlan(e), 1, AT), seedsOf(e), new Map(), START);
        find(r.games, "main", 1, 0).p2ReadyMs = AT - 5 * MIN;   // s8 만 입장(s1 불참)
        find(r.games, "main", 1, 2).p1ReadyMs = AT;             // s2 만 입장
        // 나머지 두 판(1.1 · 1.3)은 아무도 안 왔다
        expect(cupSettle(r.games, seedsOf(e), new Map(), AT + CUP_NO_SHOW_MS - 1).decided).toEqual([]);   // 15분 전에는 가리지 않는다
        r = cupSettle(r.games, seedsOf(e), new Map(), AT + CUP_NO_SHOW_MS);
        expect(view(r.games).slice(0, 6)).toEqual([
            "m1.0 s1vs8=walkover:s8", "m1.1 s4vs5=void:x", "m1.2 s2vs7=walkover:s2", "m1.3 s3vs6=void:x",
            "m2.0 s8v-=bye:s8", "m2.1 s2v-=bye:s2",
        ]);
        const final = find(r.games, "main", 3, 0);
        expect([final.p1Id, final.p2Id]).toEqual(["s8", "s2"]);
        expect(cupLosers(find(r.games, "main", 1, 0))).toEqual([{ memberId: "s1", forfeit: true }]);
        expect(cupLosers(find(r.games, "main", 1, 1))).toEqual([{ memberId: "s4", forfeit: true }, { memberId: "s5", forfeit: true }]);
    });

    it("두 사람이 경기 시각 1시간 안에야 정해지면 그 시각은 지운다 — 알림 없이 기권이 되지 않게(운영자가 다시 정한다)", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START);
        sched(r.games, 2, AT);                                      // 결승 · 3·4위전을 미리 정해 두었다
        play(r.games, m, "main", 1, 0, "p1");
        play(r.games, m, "main", 1, 1, "p1");
        // 준결승이 결승 30분 전에 끝났다
        r = cupSettle(r.games, seedsOf(e), m, AT - 30 * MIN);
        expect(find(r.games, "main", 2, 0)).toMatchObject({ p1Id: "s1", p2Id: "s2", scheduledMs: null, outcome: null });
        // 하루 전에 정해졌으면 시각은 그대로
        let early = cupSettle(cupPlan(e), seedsOf(e), m, START);
        sched(early.games, 2, AT);
        early = cupSettle(early.games.map((g) => (g.round === 1 ? { ...g, matchId: `m-${cupGameKey(g)}` } : g)), seedsOf(e), m, AT - DAY);
        expect(find(early.games, "main", 2, 0)).toMatchObject({ p1Id: "s1", p2Id: "s2", scheduledMs: AT });
    });

    it("둘 다 입장했는데 판을 못 열었다(엇갈림) — 시드가 높은 사람이 올라가고, 진 사람은 기권이 아니다(3·4위전 자격이 남는다)", () => {
        const e = ent(4);
        let r = cupSettle(sched(cupPlan(e), 1, AT), seedsOf(e), new Map(), START);
        for (const g of r.games.filter((x) => x.round === 1)) { g.p1ReadyMs = AT - 8 * MIN; g.p2ReadyMs = AT + 10 * MIN; }
        r = cupSettle(r.games, seedsOf(e), new Map(), AT + CUP_NO_SHOW_MS);
        expect(view(r.games)).toEqual(["m1.0 s1vs4=seed:s1", "m1.1 s2vs3=seed:s2", "m2.0 s1vs2", "t2.0 s4vs3"]);
        expect(cupLosers(find(r.games, "main", 1, 0))).toEqual([{ memberId: "s4", forfeit: false }]);
    });

    it("시작된 판은 15분과 상관없이 끝날 때까지 — 아주 오래(12시간) 안 끝나면 차례를 쥐고 안 친 사람의 기권패, 그 판은 닫는다", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(sched(cupPlan(e), 1, AT), seedsOf(e), m, START);
        const g = find(r.games, "main", 1, 0);
        g.matchId = "live"; g.p1ReadyMs = g.p2ReadyMs = AT;
        m.set("live", { status: "playing", winnerId: null, turnId: "s1" });
        expect(cupSettle(r.games, seedsOf(e), m, AT + CUP_NO_SHOW_MS + 5 * MIN).decided.map(cupGameKey)).not.toContain("main:1:0");
        expect(cupSettle(r.games, seedsOf(e), m, AT + CUP_PLAY_GRACE_MS - 1).decided.map(cupGameKey)).not.toContain("main:1:0");
        r = cupSettle(r.games, seedsOf(e), m, AT + CUP_PLAY_GRACE_MS);
        expect(find(r.games, "main", 1, 0)).toMatchObject({ outcome: "walkover", winnerId: "s4" });
        expect(r.cancelMatchIds).toContain("live");
        // 그 사이에 판이 끝났으면 결과대로
        m.set("live", { status: "finished", winnerId: "s1", turnId: null });
        const done = cupSettle(sched(cupPlan(e), 1, AT).map((x) => (x.round === 1 && x.slot === 0 ? { ...x, matchId: "live" } : x)), seedsOf(e), m, AT + 40 * MIN);
        expect(find(done.games, "main", 1, 0)).toMatchObject({ outcome: "played", winnerId: "s1" });
        expect(done.cancelMatchIds).not.toContain("live");
    });

    it("판정으로 정한 판에 닫히지 않은 방이 남아 있었으면 닫는다", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>([["room", { status: "waiting", winnerId: null, turnId: null }]]);
        let r = cupSettle(sched(cupPlan(e), 1, AT), seedsOf(e), m, START);
        const g = find(r.games, "main", 1, 0);
        g.matchId = "room"; g.p1ReadyMs = AT;
        r = cupSettle(r.games, seedsOf(e), m, AT + CUP_NO_SHOW_MS);
        expect(find(r.games, "main", 1, 0)).toMatchObject({ outcome: "walkover", winnerId: "s1" });
        expect(r.cancelMatchIds).toEqual(["room"]);
    });
});

describe("순위와 메달(cupPlaces)", () => {
    it("4강: 우승 · 준우승 · 3위 · 4위 — 메달 1~4", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START + 1);
        play(r.games, m, "main", 1, 0, "p1"); play(r.games, m, "main", 1, 1, "p2");
        r = cupSettle(r.games, seedsOf(e), m, START + 2);
        play(r.games, m, "main", 2, 0, "p2"); play(r.games, m, "third", 2, 0, "p1");
        r = cupSettle(r.games, seedsOf(e), m, START + 3);
        expect(r.finished).toBe(true);
        expect(cupPlaces(r.games)).toEqual([
            { memberId: "s3", place: 1, medal: 1, forfeit: false },
            { memberId: "s1", place: 2, medal: 2, forfeit: false },
            { memberId: "s4", place: 3, medal: 3, forfeit: false },
            { memberId: "s2", place: 4, medal: 4, forfeit: false },
        ]);
    });

    it("8강 이상이면 8강에서 진 네 명이 공동 5위(메달 5) · 16강에서 진 사람은 메달이 없다", () => {
        const e = ent(16);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START + 1);
        for (let round = 1; round <= 4; round++) {
            for (const g of r.games.filter((x) => x.round === round)) play(r.games, m, g.kind, g.round, g.slot, "p1");
            r = cupSettle(r.games, seedsOf(e), m, START + round * 10);
        }
        expect(r.finished).toBe(true);
        const places = cupPlaces(r.games);
        expect(places).toHaveLength(16);
        expect(places.filter((p) => p.place === 1).map((p) => p.memberId)).toEqual(["s1"]);
        expect(places.filter((p) => p.place === 5)).toHaveLength(4);
        expect(places.filter((p) => p.place === 5).every((p) => p.medal === 5)).toBe(true);
        expect(places.filter((p) => p.place === 9)).toHaveLength(8);
        expect(places.filter((p) => p.place === 9).every((p) => p.medal === null)).toBe(true);
        expect(places.filter((p) => p.medal !== null)).toHaveLength(8);
    });

    it("3명: 1번 시드는 결승에서 기다리고, 준결승에서 진 사람이 3위(3·4위전 없이)", () => {
        const e = ent(3);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START + 1);
        expect(view(r.games)).toEqual(["m1.0 s1v-=bye:s1", "m1.1 s2vs3", "m2.0 s1v-", "t2.0 -v-"]);
        play(r.games, m, "main", 1, 1, "p2");
        r = cupSettle(r.games, seedsOf(e), m, START + 2);
        expect(find(r.games, "third", 2, 0)).toMatchObject({ outcome: "bye", winnerId: "s2" });
        play(r.games, m, "main", 2, 0, "p1");
        r = cupSettle(r.games, seedsOf(e), m, START + 3);
        expect(cupPlaces(r.games).map((p) => `${p.memberId}#${p.place}:${p.medal}`)).toEqual(["s1#1:1", "s3#2:2", "s2#3:3"]);
    });

    it("기권으로 떨어진 사람은 메달이 없다 — 안 온 사람에게 4등 메달을 주지 않는다", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e), seedsOf(e), m, START + 1);
        sched(r.games, 1, AT);
        play(r.games, m, "main", 1, 0, "p1");                   // s1 이 s4 를 이겼다
        find(r.games, "main", 1, 1).p1ReadyMs = AT;             // s2 만 왔다 → s3 기권
        r = cupSettle(r.games, seedsOf(e), m, AT + CUP_NO_SHOW_MS);
        // 3·4위전: 쳐서 진 s4 만 앉는다 → 3위
        expect(find(r.games, "third", 2, 0)).toMatchObject({ outcome: "bye", winnerId: "s4" });
        // 결승(다음 날 같은 시각): 아무도 안 왔다 → 둘 다 기권, 우승자 없음
        sched(r.games, 2, AT + DAY);
        r = cupSettle(r.games, seedsOf(e), m, AT + DAY + CUP_NO_SHOW_MS);
        expect(r.finished).toBe(true);
        expect(cupPlaces(r.games)).toEqual([
            { memberId: "s1", place: 2, medal: null, forfeit: true },
            { memberId: "s2", place: 2, medal: null, forfeit: true },
            { memberId: "s4", place: 3, medal: 3, forfeit: false },
            { memberId: "s3", place: 4, medal: null, forfeit: true },
        ]);
    });
});

/** 서버 · 화면이 그 규칙대로 도는가 — 소스를 읽어 지킨다 */
describe("서버: 대회 판은 두 사람이 대기실에 함께 있을 때 서버가 열고, 다른 사람은 못 들어온다", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");

    it("참가하는 길(방 id · 코드 모두)에 가드 — 대회 방은 초대된 상대가 아니면 '없는 방'", () => {
        const route = read("server/routes/modules/simMatch.ts");
        const fn = route.slice(route.indexOf("async function joinAndStart("), route.indexOf("export async function startCupMatch("));
        expect(fn).toContain('if (m.cupGameId && m.invitedId !== req.userId && m.guestId !== req.userId) return sendError(res, 404, "err.sim.roomNotFound");');
        // 가드는 비밀번호 · 시작 처리보다 앞에 있다
        expect(fn.indexOf("m.cupGameId")).toBeLessThan(fn.indexOf("checkRoomPassword"));
    });

    it("입장: 남의 판은 '없는 판' · 입장 시간 밖이면 거절 · 진행 중인 판은 묻는다 · 입장을 적은 뒤 상대도 있으면 판을 연다", () => {
        const route = code(read("server/routes/modules/simCup.ts"));
        expect(route).toContain('router.post("/sim/cup/games/:id/ready", requireAuth,');
        expect(route).toContain('if (!side) return sendError(res, 404, "err.sim.cupGameNotFound");');
        for (const c of ["CUP_UNSCHEDULED", "CUP_EARLY", "CUP_CLOSED"]) expect(route).toContain(`"${c}"`);
        expect(route).toContain('if (playing === "ask") return sendError(res, 409, "err.sim.hasPlaying", "HAS_PLAYING");');
        const a = route.indexOf("const checked = await storage.simCup.checkIn(game.id, side, now);");
        const b = route.indexOf("const matchId = await startCupMatch(");
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        // 판을 여는 것은 상대가 '지금' 대기실에 있을 때만
        expect(route.slice(a, b)).toContain("if (cupPresent(side === \"p1\" ? g.p2SeenMs : g.p1SeenMs, now) && g.p1Id && g.p2Id) {");
        // 옛 길(먼저 온 사람이 방을 열고 기다리기)은 없다
        expect(route).not.toContain("createHostMatch");
    });

    it("판 열기: 서버가 비공개로 만들고 대진 칸에 묶을 때 공개(관전) — 칸의 match_id 를 바꿔 적는 것이 자물쇠, 바로 시작", () => {
        const route = read("server/routes/modules/simMatch.ts");
        const fn = route.slice(route.indexOf("export async function startCupMatch("), route.indexOf("function pointUnitOf("));
        expect(fn).toContain("handicap: CUP_MATCH.handicap, isPublic: false,");
        expect(fn).toContain("if (!bound || !(await storage.simCup.setMatch(game.id, game.matchId, roomId))) {");
        expect(fn).toContain("await storage.simMatch.cancel(roomId, game.p1Id).catch(() => false);");
        expect(fn).toContain("const started = await storage.simMatch.start(roomId, game.p2Id, guestTarget, state,");
        const repo = read("server/storage/simMatch.repo.ts");
        expect(repo).toContain("const res = await db.update(hiqSimMatches).set({ cupGameId, invitedId: opponentId, isPublic: true })");
    });

    it("굴리기: 대진 화면 · 대기실 · 대회 판이 끝난 화면 · 크론(매시 + 골프 크론 둘에 얹어 10분마다) — 대회는 저절로 열리지 않는다", () => {
        expect(read("server/routes/modules/simCup.ts")).toContain("await rollCups(Date.now()).catch(");
        expect(read("server/routes/modules/simMatch.ts")).toContain('if (m.cupGameId && m.status === "finished") await rollCups().catch(');
        const cron = read("server/routes/modules/cron.ts");
        expect(cron).toContain("const rolled = await rollCups(Date.now());");
        expect(cron).toContain("called: await callDue(Date.now())");
        expect(cron.match(/cup: await cupQuietly\(\)/g)).toHaveLength(2);   // /reminders 의 GET · POST
        expect(cron.match(/const cup = await cupQuietly\(\);/g)).toHaveLength(2);   // 골프 날씨 · 남은 티
        expect(code(cron)).not.toContain("openAndAnnounce");
        expect(read("server/services/simCupService.ts")).not.toContain("openCups");
    });

    it("칸을 고칠 때는 '아직 안 가려졌을 때만' — 같은 때 두 번 굴려도 알림은 한 번", () => {
        const repo = read("server/storage/simCup.repo.ts");
        const fn = repo.slice(repo.indexOf("async sync("), repo.indexOf("/** 대진 칸 하나와 그 대회 */"));
        expect(fn).toContain(".where(and(eq(hiqSimCupGames.id, g.id), isNull(hiqSimCupGames.outcome),");
        expect(fn).toContain("if (done.length === 0) continue;");
        expect(fn).toContain('.where(and(eq(hiqSimCups.id, cupId), eq(hiqSimCups.status, "running"))).returning({ id: hiqSimCups.id });');
        // 메달은 장식장 표에 — 한 번 준 것은 고치지 않는다
        expect(fn).toContain('kind: "cup" as const');
        expect(fn).toContain("}))).onConflictDoNothing();");
        // 시각을 맨 SQL 에 넘길 때는 ISO 글자로(서버의 시간대에 따라 어긋나지 않게)
        expect(repo).toContain(".toISOString()}::timestamp");
        expect(code(repo)).not.toMatch(/sql`[^`]*\$\{new Date\([^)]*\)\}/);
        // 회원에게는 짜는 중 · 무효인 대회가 안 보인다
        expect(repo).toContain("const SHOWN = sql`${hiqSimCups.status} in ('running', 'finished')`;");
    });

    it("표: 더하기만 — 첫 표 셋과 대전 표의 칸 하나 · 일정제의 칸 넷, 정의와 적용 문장이 같은 이름", () => {
        const sql = read("migrations/sim_cups.sql");
        for (const t of ["hiq_sim_cups", "hiq_sim_cup_entries", "hiq_sim_cup_games"]) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t} (`);
        expect(sql).toContain("ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS cup_game_id uuid;");
        expect(code(sql)).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/i);
        const sched = read("migrations/sim_cup_schedule.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(sched).toEqual(["scheduled_at", "p1_seen_at", "p2_seen_at", "called_at"].map((c) => `alter table hiq_sim_cup_games add column if not exists ${c} timestamp;`));
        const schema = read("shared/schema.ts");
        expect(schema).toContain('export const hiqSimCups = pgTable("hiq_sim_cups", {');
        expect(schema).toContain('status: text("status", { enum: ["draft", "running", "finished", "skipped", "void"] }).notNull(),');
        for (const [k, c] of [["scheduledAt", "scheduled_at"], ["p1SeenAt", "p1_seen_at"], ["p2SeenAt", "p2_seen_at"], ["calledAt", "called_at"]]) expect(schema).toContain(`${k}: timestamp("${c}"),`);
        expect(schema).toContain('cupGameId: uuid("cup_game_id"),');
        expect(schema).toContain('kind: text("kind", { enum: ["month_rank", "month_tier", "cup"] }).notNull(),');
    });

    it("알림 · 오류 문구가 다섯 언어에 있다 — 알림에 시각은 적지 않는다(해외 회원 · 시간대)", () => {
        const need: Record<string, string[]> = {
            "notif.cup.open.title": [], "notif.cup.open.body": ["{n}"], "notif.cup.paired.title": [], "notif.cup.paired.body": ["{name}"], "notif.cup.waiting.title": [], "notif.cup.waiting.body": ["{name}"],
            "notif.cup.remind.title": [], "notif.cup.remind.body": ["{name}"], "notif.cup.call.title": [], "notif.cup.call.body": ["{name}"], "notif.cup.schedule.title": [], "notif.cup.schedule.body": ["{name}"],
            "notif.cup.out.title": [], "notif.cup.out.body": [], "notif.cup.done.title": [], "notif.cup.done.medal": ["{place}"], "notif.cup.done.body": ["{place}"],
            "err.sim.cupGameNotFound": [], "err.sim.cupGameClosed": [], "err.sim.cupNoOpponent": [], "err.sim.cupUnscheduled": [], "err.sim.cupEarly": [],
        };
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = read(`shared/i18n/${l}.ts`);
            for (const [k, ph] of Object.entries(need)) {
                const v = d.match(new RegExp(`^  "${k.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
                expect(v, `${l} ${k}`).not.toMatch(/\{date\}|\{time\}/);
            }
        }
    });
});

describe("화면: 월대회", () => {
    const client = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");

    it("들어가는 길: /online-game?cup=1 — 홈 · 이달의 랭킹 · 장식장 · 대회 판이 끝난 화면 · 관전은 ?watch=", () => {
        const page = client("sim/SimulatorPage.tsx");
        expect(page).toContain('const cupView = params.get("cup") === "1";');
        expect(page).toContain("onOpenMatch={(id) => navigate(`/online-game?match=${id}`)}");
        expect(page).toContain("onWatch={(id) => navigate(`/online-game?watch=${id}`)}");
        expect(client("sim/rank/MonthlyRank.tsx")).toContain('{onCup && <CupLink onClick={onCup} className="mt-2" testId="rank-monthly-cup" />}');
        expect(client("sim/match/MatchEndRapport.tsx")).toContain("{info.cup === true && (");
        expect(client("sim/cup/cupApi.ts")).toContain('export const CUP_PATH = "/online-game?cup=1";');
    });

    it("홈 첫 화면은 시각 규칙만 가져온다(shared/simCupTime) — 대진 · 레이팅 코드를 싣지 않는다", () => {
        const hub = client("components/hiq/cueCase/CueCaseHub.tsx");
        expect(hub).toContain('import { cupWindow } from "@shared/simCupTime";');
        expect(hub).not.toMatch(/from "@shared\/simCup"/);
    });

    it("그림: 대회 아이콘과 메달 다섯 장 — webp, 가볍다(한 장 40KB · 합쳐 100KB)", () => {
        let total = 0;
        for (const f of ["icon-cup", "cup-1", "cup-2", "cup-3", "cup-4", "cup-5"]) {
            const p = resolve(__dirname, `../client/public/sim/rank/${f}.webp`);
            expect(existsSync(p), f).toBe(true);
            const b = readFileSync(p);
            expect(b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP", f).toBe(true);
            const n = statSync(p).size; total += n;
            expect(n, f).toBeLessThan(40 * 1024);
        }
        expect(total).toBeLessThan(100 * 1024);
    });

    it("문구가 다섯 언어에 있고 자리 표시를 지킨다 · 4구 대회 · 옛 '기한 · 기다리기' 문구는 없다", () => {
        const need: Record<string, string[]> = {
            "sim.cup.title": [], "sim.cup.sub": [], "sim.cup.cupOf": ["{month}"], "sim.cup.roundOf": ["{n}"], "sim.cup.semi": [], "sim.cup.final": [], "sim.cup.third": [],
            "sim.cup.when": ["{date}"], "sim.cup.leftDays": ["{d}", "{h}"], "sim.cup.leftHours": ["{h}", "{m}"], "sim.cup.leftMin": ["{m}"],
            "sim.cup.unscheduled": [], "sim.cup.unscheduledShort": [], "sim.cup.enterSoon": ["{n}"], "sim.cup.enterOpen": ["{n}"], "sim.cup.closedWait": [],
            "sim.cup.oppPresent": [], "sim.cup.oppEntered": [], "sim.cup.room": [], "sim.cup.roomWaiting": [], "sim.cup.oppOnline": [], "sim.cup.oppOffline": [],
            "sim.cup.btnEnter": [], "sim.cup.btnBack": [], "sim.cup.btnLeave": [], "sim.cup.btnWatch": [], "sim.cup.btnReplay": [], "sim.cup.readyHint": ["{e}", "{m}"], "sim.cup.readyFailed": [],
            "sim.cup.bye": [], "sim.cup.walkover": [], "sim.cup.void": [], "sim.cup.bySeed": [], "sim.cup.tbd": [], "sim.cup.win": [],
            "sim.cup.place1": [], "sim.cup.place2": [], "sim.cup.place3": [], "sim.cup.place4": [], "sim.cup.place5": [],
            "sim.cup.nextTitle": ["{month}"], "sim.cup.qualYes": ["{n}"], "sim.cup.qualNo": [], "sim.cup.qualRating": ["{n}"], "sim.cup.qualNow": ["{n}"], "sim.cup.qualMatches": ["{n}"], "sim.cup.qualMatchesNow": ["{n}"],
            "sim.cup.entrantsSize": ["{n}", "{size}"], "sim.cup.entrantsFew": ["{n}"], "sim.cup.rule1": ["{n}"], "sim.cup.rule2": ["{e}"], "sim.cup.rule3": ["{m}"], "sim.cup.rule4": [], "sim.cup.rule5": [], "sim.cup.rule6": [],
            "sim.cup.linkSub": [], "sim.cup.shelfMedals": [], "sim.cup.rowMedal": ["{place}"], "sim.cup.toBracket": [],
            "home.hubCup": [], "home.hubCupSub": [], "home.hubCupWait": [], "home.hubCupUnscheduled": [], "home.hubCupNow": [], "home.hubCupOver": [],
            "home.hubCupDays": ["{d}", "{h}"], "home.hubCupHours": ["{h}", "{m}"], "home.hubCupMin": ["{m}"],
        };
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = client(`lib/i18n/${l}.ts`);
            for (const [k, ph] of Object.entries(need)) {
                const v = d.match(new RegExp(`^  "${k.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
            }
            for (const gone of ["sim.cup.deadline", "sim.cup.btnWait", "sim.cup.btnRoom", "sim.cup.oppWaiting", "sim.cup.iWaiting", "sim.cup.leftNone"]) expect(d, `${l} ${gone}`).not.toContain(`"${gone}"`);
        }
        expect(client("lib/i18n/ko.ts")).not.toMatch(/"sim\.cup\.[^"]+": "[^"]*4구/);
    });
});
