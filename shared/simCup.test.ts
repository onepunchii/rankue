import { describe, expect, it } from "vitest";
import { kstMonthRange, type MatchDelta } from "./simMonthly";
import {
    CUP_FIRST_MONTH, CUP_GAMES, CUP_MATCH, CUP_MAX_ENTRANTS, CUP_MIN_MATCHES, CUP_MIN_RATING, CUP_MIN_WINDOW_MS, CUP_PLAY_GRACE_MS,
    cupDeadlineMs, cupEntrants, cupGameKey, cupLosers, cupMyGame, cupPlaces, cupPlan, cupRoundSize, cupRounds, cupSettle, cupSize, cupStartMs,
    type CupEntrant, type CupGame, type CupMatchInfo,
} from "./simCup";

/**
 * 월대회 규칙(2026-10-12 오너: "매월 대회 … 레이팅 기준으로 출전권 → 토너먼트 → 상대방이 못 오면 기권으로 · 1~5등 메달" → "추천대로").
 * 첫 대회는 3쿠션만 · 레이팅 1000 이상 + 그 달 5판 · 인원에 맞춰 4/8/16강 · 라운드 이틀 · 안 오면 기권 · 우승~8강 메달.
 */
const DAY = 86_400_000;
const START = cupStartMs("2026-10");
const ent = (n: number): CupEntrant[] => Array.from({ length: n }, (_, i) => ({ memberId: `s${i + 1}`, seed: i + 1, rating: 1300 - i * 10, matches: 6, points: 20, wins: 4 }));
const seedsOf = (e: CupEntrant[]) => new Map(e.map((x) => [x.memberId, x.seed]));
const view = (games: CupGame[]) => games.map((g) => `${g.kind[0]}${g.round}.${g.slot} ${g.p1Id ?? "-"}v${g.p2Id ?? "-"}${g.outcome ? `=${g.outcome}:${g.winnerId ?? "x"}` : ""}`);
const find = (games: CupGame[], kind: "main" | "third", round: number, slot: number) => games.find((g) => g.kind === kind && g.round === round && g.slot === slot)!;
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

    it("정한 것: 첫 대회는 3쿠션만 · 레이팅 1000 이상 · 그 달 5판 · 많으면 16명 · 10월 성적부터", () => {
        expect([...CUP_GAMES]).toEqual(["3c"]);
        expect([CUP_MIN_RATING, CUP_MIN_MATCHES, CUP_MAX_ENTRANTS]).toEqual([1000, 5, 16]);
        expect(CUP_FIRST_MONTH).toBe("2026-10");
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
        expect(cupPlan(ent(2), START)).toEqual([]);
    });
});

describe("일정", () => {
    it("그 달의 대회는 다음 달 1일 0시(한국 시각)에 시작하고, 라운드마다 이틀", () => {
        expect(new Date(START).toISOString()).toBe("2026-10-31T15:00:00.000Z");   // 11월 1일 0시 KST
        expect(new Date(cupDeadlineMs(START, 1)).toISOString()).toBe("2026-11-02T15:00:00.000Z");   // 3일 0시
        expect(cupDeadlineMs(START, 4) - START).toBe(8 * DAY);   // 16강이면 결승 기한은 9일 0시
    });

    it("처음 대진: 표준 배치(1번과 2번은 결승에서만), 빈자리는 시드 높은 사람의 부전승, 3·4위전은 결승과 같은 라운드", () => {
        const games = cupPlan(ent(5), START);
        expect(cupRounds(games)).toBe(3);
        expect(view(games)).toEqual(["m1.0 s1v-", "m1.1 s4vs5", "m1.2 s2v-", "m1.3 s3v-", "m2.0 -v-", "m2.1 -v-", "m3.0 -v-", "t3.0 -v-"]);
        expect(games.filter((g) => g.round === 1).every((g) => g.deadlineMs === cupDeadlineMs(START, 1))).toBe(true);
        expect(find(games, "third", 3, 0).deadlineMs).toBe(find(games, "main", 3, 0).deadlineMs);
        expect([1, 2, 3].map((r) => cupRoundSize(r, 3))).toEqual([8, 4, 2]);
    });
});

describe("대진 굴리기(cupSettle)", () => {
    it("부전승은 바로 올라가고, 다음 상대가 정해지는 대로 칸에 앉는다", () => {
        const e = ent(5);
        const r = cupSettle(cupPlan(e, START), seedsOf(e), new Map(), START + 1);
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
        const a = cupSettle(cupPlan(e, START), seedsOf(e), new Map(), START + 1);
        const b = cupSettle(a.games, seedsOf(e), new Map(), START + 5000);
        expect(b.changed).toEqual([]);
        expect(b.decided).toEqual([]);
        expect(b.games).toEqual(a.games);
    });

    it("끝난 판의 승자가 올라간다 — 비기면 시드가 높은 사람", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
        play(r.games, m, "main", 1, 0, "p2");     // s4 가 s1 을 이겼다
        play(r.games, m, "main", 1, 1, "draw");   // s2 v s3 비김 → s2
        r = cupSettle(r.games, seedsOf(e), m, START + 2);
        expect(view(r.games)).toEqual(["m1.0 s1vs4=played:s4", "m1.1 s2vs3=played:s2", "m2.0 s4vs2", "t2.0 s1vs3"]);
        expect(r.decided.map(cupGameKey)).toEqual(["main:1:0", "main:1:1"]);
    });

    it("기한까지 한 사람만 들어왔으면 그 사람의 기권승 · 둘 다 안 왔으면 둘 다 탈락하고 다음 상대는 부전승", () => {
        const e = ent(8);
        let r = cupSettle(cupPlan(e, START), seedsOf(e), new Map(), START + 1);
        find(r.games, "main", 1, 0).p2ReadyMs = START + 10;   // s8 만 들어왔다(s1 불참)
        find(r.games, "main", 1, 2).p1ReadyMs = START + 10;   // s2 만 들어왔다
        // 나머지 두 판(1.1 · 1.3)은 아무도 안 왔다
        expect(cupSettle(r.games, seedsOf(e), new Map(), cupDeadlineMs(START, 1) - 1).decided).toEqual([]);   // 기한 전에는 가리지 않는다
        r = cupSettle(r.games, seedsOf(e), new Map(), cupDeadlineMs(START, 1));
        expect(view(r.games).slice(0, 6)).toEqual([
            "m1.0 s1vs8=walkover:s8", "m1.1 s4vs5=void:x", "m1.2 s2vs7=walkover:s2", "m1.3 s3vs6=void:x",
            "m2.0 s8v-=bye:s8", "m2.1 s2v-=bye:s2",
        ]);
        // 결승은 두 사람이 정해졌다 — 방금 정해졌으니 적어도 하루는 준다(달력의 기한이 더 뒤면 그것)
        const final = find(r.games, "main", 3, 0);
        expect([final.p1Id, final.p2Id]).toEqual(["s8", "s2"]);
        expect(final.deadlineMs).toBe(cupDeadlineMs(START, 3));
        expect(cupLosers(find(r.games, "main", 1, 0))).toEqual([{ memberId: "s1", forfeit: true }]);
        expect(cupLosers(find(r.games, "main", 1, 1))).toEqual([{ memberId: "s4", forfeit: true }, { memberId: "s5", forfeit: true }]);
    });

    it("앞 판이 늦게 가려져 다음 판이 기한 뒤에 열리면 — 열린 때부터 하루를 준다(열리자마자 기권이 되지 않는다)", () => {
        const e = ent(4);
        let r = cupSettle(cupPlan(e, START), seedsOf(e), new Map(), START + 1);
        find(r.games, "main", 1, 0).p1ReadyMs = 1;
        find(r.games, "main", 1, 1).p1ReadyMs = 1;
        // 한참 동안 굴리지 못했다 — 결승 기한(5일 0시)도 지났다
        const late = cupDeadlineMs(START, 2) + 3 * 3_600_000;
        r = cupSettle(r.games, seedsOf(e), new Map(), late);
        const final = find(r.games, "main", 2, 0);
        expect([final.p1Id, final.p2Id, final.outcome]).toEqual(["s1", "s2", null]);
        expect(final.deadlineMs).toBe(late + CUP_MIN_WINDOW_MS);
        expect(r.finished).toBe(false);
    });

    it("둘 다 들어왔는데 판을 못 열었다 — 시드가 높은 사람이 올라가고, 진 사람은 기권이 아니다(3·4위전 자격이 남는다)", () => {
        const e = ent(4);
        let r = cupSettle(cupPlan(e, START), seedsOf(e), new Map(), START + 1);
        for (const g of r.games.filter((x) => x.round === 1)) { g.p1ReadyMs = START + 10; g.p2ReadyMs = START + DAY; }
        r = cupSettle(r.games, seedsOf(e), new Map(), cupDeadlineMs(START, 1));
        expect(view(r.games)).toEqual(["m1.0 s1vs4=seed:s1", "m1.1 s2vs3=seed:s2", "m2.0 s1vs2", "t2.0 s4vs3"]);
        expect(cupLosers(find(r.games, "main", 1, 0))).toEqual([{ memberId: "s4", forfeit: false }]);
    });

    it("기한에 치는 중이면 더 기다리고, 그래도 안 끝나면 차례를 쥐고 안 친 사람의 기권패 — 그 판은 닫는다", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
        const g = find(r.games, "main", 1, 0);
        g.matchId = "live"; g.p1ReadyMs = g.p2ReadyMs = 1;
        m.set("live", { status: "playing", winnerId: null, turnId: "s1" });
        const dl = cupDeadlineMs(START, 1);
        expect(cupSettle(r.games, seedsOf(e), m, dl + CUP_PLAY_GRACE_MS - 1).decided.map(cupGameKey)).not.toContain("main:1:0");
        r = cupSettle(r.games, seedsOf(e), m, dl + CUP_PLAY_GRACE_MS);
        expect(find(r.games, "main", 1, 0)).toMatchObject({ outcome: "walkover", winnerId: "s4" });
        expect(r.cancelMatchIds).toContain("live");
        // 그 사이에 판이 끝났으면 결과대로
        m.set("live", { status: "finished", winnerId: "s1", turnId: null });
        const done = cupSettle(cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1).games.map((x) => (x.round === 1 && x.slot === 0 ? { ...x, matchId: "live" } : x)), seedsOf(e), m, dl + 5);
        expect(find(done.games, "main", 1, 0)).toMatchObject({ outcome: "played", winnerId: "s1" });
        expect(done.cancelMatchIds).not.toContain("live");
    });

    it("기권승으로 정한 판에 대기 방이 열려 있었으면 닫는다", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>([["room", { status: "waiting", winnerId: null, turnId: null }]]);
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
        const g = find(r.games, "main", 1, 0);
        g.matchId = "room"; g.p1ReadyMs = START + 5;
        r = cupSettle(r.games, seedsOf(e), m, cupDeadlineMs(START, 1));
        expect(find(r.games, "main", 1, 0)).toMatchObject({ outcome: "walkover", winnerId: "s1" });
        expect(r.cancelMatchIds).toEqual(["room"]);
    });
});

describe("순위와 메달(cupPlaces)", () => {
    it("4강: 우승 · 준우승 · 3위 · 4위 — 메달 1~4", () => {
        const e = ent(4);
        const m = new Map<string, CupMatchInfo>();
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
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
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
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
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
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
        let r = cupSettle(cupPlan(e, START), seedsOf(e), m, START + 1);
        play(r.games, m, "main", 1, 0, "p1");                   // s1 이 s4 를 이겼다
        find(r.games, "main", 1, 1).p1ReadyMs = START + 5;      // s2 만 왔다 → s3 기권
        r = cupSettle(r.games, seedsOf(e), m, cupDeadlineMs(START, 1));
        // 3·4위전: 쳐서 진 s4 만 앉는다 → 3위
        expect(find(r.games, "third", 2, 0)).toMatchObject({ outcome: "bye", winnerId: "s4" });
        // 결승: 아무도 안 왔다 → 둘 다 기권, 우승자 없음
        r = cupSettle(r.games, seedsOf(e), m, find(r.games, "main", 2, 0).deadlineMs);
        expect(r.finished).toBe(true);
        expect(cupPlaces(r.games)).toEqual([
            { memberId: "s1", place: 2, medal: null, forfeit: true },
            { memberId: "s2", place: 2, medal: null, forfeit: true },
            { memberId: "s4", place: 3, medal: 3, forfeit: false },
            { memberId: "s3", place: 4, medal: null, forfeit: true },
        ]);
    });
});
