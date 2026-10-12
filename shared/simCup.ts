/**
 * 월대회(2026-10-12 오너: "매월 대회 … 레이팅 기준으로 출전권 → 토너먼트 → 상대방이 못 오면 기권으로 · 1~5등 메달 · 장식장" → 쉬운 말로 다시 여쭌 뒤 "추천대로").
 * 기획: docs/01-plan/features/online-game-monthly-tournament-badges.md 4장 · 12-6 의 결정 5.
 *
 * 정한 것(오너)
 *  - 첫 대회는 3쿠션만(CUP_GAMES). 출전: 그 달이 끝날 때 **레이팅 1000 이상 + 그 달 5판 이상**, 많으면 레이팅 높은 순 16명.
 *  - 대진은 나온 인원에 맞춘다: 3~4명 4강 · 5~8명 8강 · 9~16명 16강. 빈자리는 시드 높은 사람부터 부전승. 3명이 안 되면 그 달은 열지 않는다.
 *  - **라운드마다 이틀.** 기한까지 한 사람만 들어왔으면 그 사람의 기권승, 둘 다 안 들어왔으면 둘 다 탈락(다음 상대는 부전승).
 *  - 3·4위전을 둔다. 메달은 우승 · 준우승 · 3위 · 4위 · 8강(공동 5위). 상금 · 참가비는 없다.
 *  - 그 달의 성적으로 **다음 달 1일에** 연다(10월 성적 → 11월 초 대회). 달 마감(shared/simShelf)과 같은 때다.
 *
 * 기획에 없어 여기서 정한 것(오너에게 알렸다 — 바꾸자고 하면 이 파일만 고친다)
 *  - 대회 판은 평소의 레이팅 판과 같은 **핸디전**이다(CUP_MATCH). 출전권을 준 레이팅이 핸디전으로 쌓인 것이라서.
 *  - 비긴 판(후구로 따라붙음 · 이닝 상한 동률)은 시드가 높은 사람이 올라간다.
 *  - 둘 다 들어왔는데 기한까지 판을 못 끝냈다: 치는 중이면 CUP_PLAY_GRACE_MS 만큼 더 기다리고, 그래도 안 끝나면 **차례를 쥐고 안 친 사람**의 기권패.
 *    판을 열지도 못했으면(서로 엇갈림) 시드가 높은 사람이 올라간다 — 진 사람은 기권이 아니다(3·4위전 · 메달 자격이 남는다).
 *  - **기권으로 떨어진 사람은 메달이 없다**(안 온 사람에게 4등 메달을 주지 않는다).
 *  - 두 사람이 정해진 때부터 적어도 하루(CUP_MIN_WINDOW_MS)는 준다 — 앞 판이 늦게 가려지면 그 판의 기한만 그만큼 뒤로 간다.
 *
 * 좌표는 크루 대진과 같다(shared/tournamentBracket): round 1 = 첫 라운드, round = rounds = 결승. (round, slot) 의 승자는 (round+1, slot>>1).
 * 3·4위전은 kind "third" 로 결승과 같은 round 에 둔다.
 * 이 파일은 계산만 한다 — 읽고 쓰는 것은 server/storage/simCup.repo.
 */
import { advanceTarget, planKnockout, totalRounds } from "./tournamentBracket.js";
import { START_RATING } from "./sim/rating.js";
import { MONTHLY_MIN_MATCHES, isMonthId, kstMonthRange, monthlyBoard, shiftMonth, type MatchDelta, type MonthlyGame } from "./simMonthly.js";
import { SHELF_FIRST_MONTH, ratingsBefore } from "./simShelf.js";

/** 대회를 여는 종목 — 첫 대회는 3쿠션만(4구는 사다리 인원이 차면 더한다) */
export const CUP_GAMES: readonly MonthlyGame[] = ["3c"];
export const CUP_MIN_RATING = 1000;
export const CUP_MIN_MATCHES = MONTHLY_MIN_MATCHES;
export const CUP_MAX_ENTRANTS = 16;
export const CUP_MIN_ENTRANTS = 3;
export const CUP_ROUND_DAYS = 2;
/** 기한에 치는 중이던 판을 더 기다리는 시간 */
export const CUP_PLAY_GRACE_MS = 12 * 60 * 60 * 1000;
/** 두 사람이 정해진 뒤 적어도 이만큼은 칠 시간을 준다 — 앞 라운드가 늦게 가려져도 다음 판이 열리자마자 기한이 지나 있지 않게 */
export const CUP_MIN_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 이 달의 성적부터 대회를 연다(장식장과 같은 달) — 2026-10 성적 → 2026-11 초 첫 대회 */
export const CUP_FIRST_MONTH = SHELF_FIRST_MONTH;
const DAY_MS = 86_400_000;

/** 대회 판의 조건 — 평소의 레이팅 판(핸디전)과 같다. 목표 점수는 참가하는 순간 서버가 두 사람의 온라인 에버리지로 정한다 */
export const CUP_MATCH = { tableId: "DAEDAE", handicap: true, aimAssist: true, fullPreview: false, inningCap: 0, finishType: "none" } as const;

export interface CupEntrant {
    memberId: string;
    /** 1 = 가장 높은 시드 */
    seed: number;
    /** 확정 때의 레이팅 */
    rating: number;
    /** 그 달의 판 · 점수 · 승 */
    matches: number;
    points: number;
    wins: number;
}

/** 대진판 크기 — 3명이 안 되면 0(그 달은 열지 않는다) */
export function cupSize(entrants: number): 0 | 4 | 8 | 16 {
    if (entrants < CUP_MIN_ENTRANTS) return 0;
    return entrants <= 4 ? 4 : entrants <= 8 ? 8 : 16;
}

/**
 * 출전자 — 그 달 minMatches 판을 쳤고 레이팅이 minRating 이상인 사람, 레이팅 높은 순(같으면 그 달 점수 → 승수 → id)으로 16명까지.
 * atMs 를 주면 그 시각의 레이팅으로 센다(달이 끝나기 전의 '지금 이대로면' 보기). 안 주면 달이 끝날 때의 레이팅.
 */
export function cupEntrants(deltas: readonly MatchDelta[], month: string, gameType: MonthlyGame, atMs?: number): CupEntrant[] {
    if (!isMonthId(month)) return [];
    const [, end] = kstMonthRange(month);
    const ratings = ratingsBefore(deltas, atMs === undefined ? end : Math.min(end, atMs + 1));
    const rows = monthlyBoard(deltas, month, gameType, CUP_MIN_MATCHES)
        .filter((r) => r.rank !== null)
        .map((r) => ({ memberId: r.memberId, rating: ratings.get(`${r.memberId}|${gameType}`) ?? START_RATING, matches: r.matches, points: r.points, wins: r.wins }))
        .filter((r) => r.rating >= CUP_MIN_RATING)
        .sort((a, b) => (b.rating - a.rating) || (b.points - a.points) || (b.wins - a.wins) || (a.memberId < b.memberId ? -1 : 1))
        .slice(0, CUP_MAX_ENTRANTS);
    return rows.map((r, i) => ({ ...r, seed: i + 1 }));
}

/** 그 달 대회의 첫 라운드가 시작하는 때 — 다음 달 1일 0시(한국 시각) */
export function cupStartMs(month: string): number {
    return kstMonthRange(shiftMonth(month, 1))[0];
}
/** round 라운드의 기한 — 시작에서 이틀씩. 1라운드는 3일 0시, 2라운드는 5일 0시 … */
export const cupDeadlineMs = (startMs: number, round: number): number => startMs + round * CUP_ROUND_DAYS * DAY_MS;

export type CupGameKind = "main" | "third";
/**
 * played = 판을 쳐서 가렸다(비기면 시드) · walkover = 진 쪽이 기권(안 왔거나, 차례를 쥐고 안 쳤다)
 * seed = 둘 다 왔는데 판을 못 열어 시드로 가렸다(진 쪽은 기권이 아니다) · bye = 상대 자리가 비어 올라갔다 · void = 둘 다 기권(승자 없음)
 */
export type CupOutcome = "played" | "walkover" | "seed" | "bye" | "void";

export interface CupGame {
    kind: CupGameKind;
    round: number;
    slot: number;
    p1Id: string | null;
    p2Id: string | null;
    deadlineMs: number;
    /** 들어온 적이 있는가 — 기다리기 · 입장을 처음 누른 때 */
    p1ReadyMs: number | null;
    p2ReadyMs: number | null;
    /** 이 판을 치는(친) 대전 */
    matchId: string | null;
    winnerId: string | null;
    outcome: CupOutcome | null;
    decidedMs: number | null;
}

/** 처음 대진 — 본선 전 칸(윗 라운드는 빈 칸) + 3·4위전. 부전승은 cupSettle 이 가린다 */
export function cupPlan(entrants: readonly CupEntrant[], startMs: number): CupGame[] {
    const size = cupSize(entrants.length);
    if (size === 0) return [];
    const ordered = [...entrants].sort((a, b) => a.seed - b.seed).map((e) => e.memberId);
    const rounds = totalRounds(size);
    const blank = { p1ReadyMs: null, p2ReadyMs: null, matchId: null, winnerId: null, outcome: null, decidedMs: null };
    const games: CupGame[] = planKnockout(ordered).map((m) => ({ kind: "main" as const, round: m.round, slot: m.slot, p1Id: m.p1Id, p2Id: m.p2Id, deadlineMs: cupDeadlineMs(startMs, m.round), ...blank }));
    games.push({ kind: "third", round: rounds, slot: 0, p1Id: null, p2Id: null, deadlineMs: cupDeadlineMs(startMs, rounds), ...blank });
    return games;
}

export const cupRounds = (games: readonly CupGame[]): number => games.reduce((m, g) => (g.kind === "main" ? Math.max(m, g.round) : m), 0);
const keyOf = (kind: CupGameKind, round: number, slot: number) => `${kind}:${round}:${slot}`;
export const cupGameKey = (g: Pick<CupGame, "kind" | "round" | "slot">): string => keyOf(g.kind, g.round, g.slot);

/** 그 판에서 진 사람들 — forfeit 는 기권(메달 · 3·4위전 자격이 없다) */
export function cupLosers(g: CupGame): { memberId: string; forfeit: boolean }[] {
    if (!g.outcome || g.outcome === "bye") return [];
    if (g.outcome === "void") return [g.p1Id, g.p2Id].filter((x): x is string => !!x).map((memberId) => ({ memberId, forfeit: true }));
    const loser = g.winnerId === g.p1Id ? g.p2Id : g.p1Id;
    return loser ? [{ memberId: loser, forfeit: g.outcome === "walkover" }] : [];
}

/** 대회 판으로 열린 대전의 지금 상태(서버가 읽어 넘긴다) */
export interface CupMatchInfo {
    status: "waiting" | "playing" | "finished" | "canceled";
    winnerId: string | null;
    /** 지금 차례인 사람(치는 중일 때) */
    turnId: string | null;
}

export interface CupSettled {
    games: CupGame[];
    /** 이번에 달라진 칸(선수가 채워졌거나 결과가 났다) */
    changed: CupGame[];
    /** 이번에 결과가 난 칸 */
    decided: CupGame[];
    /** 닫아야 할 대전(기한이 지나 결과를 정한 판의 대기 방 · 치던 판) */
    cancelMatchIds: string[];
    /** 결승과 3·4위전이 모두 가려졌다 */
    finished: boolean;
}

/**
 * 대진을 지금 시각까지 굴린다 — 부전승 · 끝난 판의 승자 · 기한이 지난 판의 기권을 가리고, 승자를 다음 칸에 앉힌다.
 * 몇 번을 불러도 같은 결과다(이미 가려진 칸은 건드리지 않는다). seeds: 회원 → 시드(작을수록 높다).
 */
export function cupSettle(input: readonly CupGame[], seeds: ReadonlyMap<string, number>, matches: ReadonlyMap<string, CupMatchInfo>, nowMs: number): CupSettled {
    const games = input.map((g) => ({ ...g }));
    const by = new Map(games.map((g) => [cupGameKey(g), g]));
    const rounds = cupRounds(games);
    const touched = new Set<CupGame>(), decided: CupGame[] = [], cancel = new Set<string>();
    const higher = (a: string, b: string) => ((seeds.get(a) ?? 999) <= (seeds.get(b) ?? 999) ? a : b);
    const decide = (g: CupGame, outcome: CupOutcome, winnerId: string | null) => {
        g.outcome = outcome; g.winnerId = winnerId; g.decidedMs = nowMs;
        touched.add(g); decided.push(g);
    };
    const seat = (g: CupGame, p1: string | null, p2: string | null) => {
        if (g.p1Id === p1 && g.p2Id === p2) return;
        const wasFull = !!g.p1Id && !!g.p2Id;
        g.p1Id = p1; g.p2Id = p2; touched.add(g);
        // 방금 두 사람이 정해졌다 — 적어도 하루는 칠 시간을 준다
        if (!wasFull && p1 && p2) g.deadlineMs = Math.max(g.deadlineMs, nowMs + CUP_MIN_WINDOW_MS);
    };
    const feedersOf = (g: CupGame): CupGame[] => {
        if (g.kind === "third") return [by.get(keyOf("main", rounds - 1, 0)), by.get(keyOf("main", rounds - 1, 1))].filter((x): x is CupGame => !!x);
        if (g.round <= 1) return [];
        return [by.get(keyOf("main", g.round - 1, g.slot * 2)), by.get(keyOf("main", g.round - 1, g.slot * 2 + 1))].filter((x): x is CupGame => !!x);
    };
    // 3·4위전에 앉는 사람 — 준결승에서 **쳐서(또는 시드로) 진** 사람. 기권한 사람은 자격이 없다
    const thirdSeat = (f: CupGame): string | null => cupLosers(f).find((l) => !l.forfeit)?.memberId ?? null;

    const order = [...games].sort((a, b) => (a.round - b.round) || (a.kind === b.kind ? a.slot - b.slot : a.kind === "main" ? -1 : 1));
    for (let pass = 0; pass < rounds + 2; pass++) {
        let moved = false;
        for (const g of order) {
            if (g.outcome) continue;
            const f = feedersOf(g);
            const open = f.some((x) => !x.outcome);
            if (f.length > 0) {
                // 가려진 쪽부터 앉힌다 — 대진표에 다음 상대가 보이게
                const pick = (x: CupGame | undefined, cur: string | null) => (!x || !x.outcome ? cur : g.kind === "third" ? thirdSeat(x) : x.winnerId);
                seat(g, pick(f[0], g.p1Id), pick(f[1], g.p2Id));
            }
            if (open) continue;
            const { p1Id: a, p2Id: b } = g;
            const closeRoom = () => { if (g.matchId && matches.get(g.matchId)?.status !== "finished") cancel.add(g.matchId); };
            if (!a && !b) { decide(g, "void", null); moved = true; continue; }
            if (!a || !b) { decide(g, "bye", a ?? b); moved = true; continue; }
            const m = g.matchId ? matches.get(g.matchId) : undefined;
            if (m?.status === "finished") { decide(g, "played", m.winnerId === a || m.winnerId === b ? m.winnerId : higher(a, b)); moved = true; continue; }
            if (nowMs < g.deadlineMs) continue;
            if (m?.status === "playing") {
                // 치는 중 — 조금 더 기다린다. 그래도 안 끝나면 차례를 쥐고 안 친 사람의 기권패
                if (nowMs < g.deadlineMs + CUP_PLAY_GRACE_MS) continue;
                const idle = m.turnId === a || m.turnId === b ? m.turnId : null;
                closeRoom();
                decide(g, idle ? "walkover" : "seed", idle ? (idle === a ? b : a) : higher(a, b));
                moved = true; continue;
            }
            const ra = g.p1ReadyMs !== null, rb = g.p2ReadyMs !== null;
            closeRoom();
            if (ra && !rb) decide(g, "walkover", a);
            else if (!ra && rb) decide(g, "walkover", b);
            else if (!ra && !rb) decide(g, "void", null);
            else decide(g, "seed", higher(a, b));
            moved = true;
        }
        if (!moved) break;
    }
    const final = by.get(keyOf("main", rounds, 0));
    const third = by.get(keyOf("third", rounds, 0));
    return { games, changed: games.filter((g) => touched.has(g)), decided, cancelMatchIds: [...cancel], finished: !!final?.outcome && (!third || !!third.outcome) };
}

export type CupMedal = 1 | 2 | 3 | 4 | 5;
export interface CupPlace {
    memberId: string;
    /** 1 · 2 · 3 · 4 · 5(8강) · 9(16강). 결승이 둘 다 기권이면 1등이 없다 */
    place: number;
    /** 기권으로 떨어졌으면 없다 */
    medal: CupMedal | null;
    forfeit: boolean;
}

/** 끝난 대회의 순위와 메달. 대진이 4강이면 메달은 1~4, 8강 이상이면 5(8강에서 진 사람들)까지 */
export function cupPlaces(games: readonly CupGame[]): CupPlace[] {
    const rounds = cupRounds(games);
    const out = new Map<string, CupPlace>();
    const put = (memberId: string, place: number, forfeit: boolean) => {
        if (out.has(memberId)) return;
        out.set(memberId, { memberId, place, forfeit, medal: !forfeit && place >= 1 && place <= 5 ? (place as CupMedal) : null });
    };
    const final = games.find((g) => g.kind === "main" && g.round === rounds);
    const third = games.find((g) => g.kind === "third");
    if (final?.winnerId) put(final.winnerId, 1, false);
    for (const l of final ? cupLosers(final) : []) put(l.memberId, 2, l.forfeit);
    if (third?.winnerId) put(third.winnerId, 3, false);
    for (const l of third ? cupLosers(third) : []) put(l.memberId, 4, l.forfeit);
    for (const g of games) {
        if (g.kind !== "main" || g.round === rounds) continue;
        // 준결승에서 진 사람 가운데 3·4위전에 못 앉은 사람(기권) = 4등 자리, 메달 없음 · 그 아래 라운드는 8강 5등 · 16강 9등
        const place = g.round === rounds - 1 ? 4 : g.round === rounds - 2 ? 5 : 9;
        for (const l of cupLosers(g)) put(l.memberId, place, l.forfeit);
    }
    return [...out.values()].sort((a, b) => (a.place - b.place) || (a.memberId < b.memberId ? -1 : 1));
}

/** 라운드의 이름을 고를 재료 — 그 라운드를 시작할 때 남은 인원(16 · 8 · 4 · 2) */
export const cupRoundSize = (round: number, rounds: number): number => Math.pow(2, rounds - round + 1);

/**
 * 내가 지금 쳐야 할 판 — 아직 안 가려졌고 내가 앉아 있는 칸. 상대가 아직 안 정해졌으면 waiting.
 * 없으면 null(떨어졌거나, 대회가 끝났거나, 출전하지 않았다).
 */
export function cupMyGame(games: readonly CupGame[], memberId: string): { game: CupGame; opponentId: string | null; waiting: boolean; mine: "p1" | "p2" } | null {
    const g = [...games].filter((x) => !x.outcome && (x.p1Id === memberId || x.p2Id === memberId)).sort((a, b) => a.round - b.round)[0];
    if (!g) return null;
    const mine = g.p1Id === memberId ? "p1" as const : "p2" as const;
    const opponentId = mine === "p1" ? g.p2Id : g.p1Id;
    return { game: g, opponentId, waiting: !opponentId, mine };
}

/** 다음 칸(화면이 선을 잇는 데 쓴다) — 결승이면 null */
export const cupNext = (g: Pick<CupGame, "kind" | "round" | "slot">, rounds: number) => (g.kind === "third" ? null : advanceTarget(g.round, g.slot, rounds));
