/**
 * 월대회 저장소(2026-10-12 오너 "추천대로"). 규칙은 shared/simCup — 여기는 읽고, 그 규칙이 정한 것을 적는다.
 * 쓰는 표: hiq_sim_cups · hiq_sim_cup_entries · hiq_sim_cup_games · hiq_sim_awards(kind 'cup'). 대전 표는 storage/simMatch.repo 를 거쳐서만 건드린다.
 *
 * 흐름
 *  - openCups: 달이 마감되면(storage/simShelf.repo closeMonths) 그 달의 성적으로 대회를 연다 — 하루 한 번 도는 정리 작업이 부른다.
 *  - sync: 대진을 지금 시각까지 굴린다(shared/simCup cupSettle) — 대진 화면을 열 때 · 대회 판이 끝난 화면 · 매시 크론.
 *    칸을 고칠 때 '아직 안 가려졌을 때만' 이라는 조건을 달아, 같은 때 두 번 돌아도 알림은 한 번만 나간다.
 *  - ready: 기다리기 · 입장을 누른 것을 적는다(기권 판정의 근거). 방을 여는 일은 routes/modules/simCup 이 한다.
 */
import { db } from "../db.js";
import { hiqMembers, hiqSimAwards, hiqSimCupEntries, hiqSimCupGames, hiqSimCups, hiqSimMatchRatings, hiqSimMonthCloses } from "../../shared/schema.js";
import type { HiqSimCup, HiqSimCupEntry, HiqSimCupGame } from "../../shared/schema.js";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isWithdrawnMember } from "../../shared/chatSupport.js";
import { tierFor, type TierId } from "../../shared/sim/rank.js";
import { daysLeftInMonth, kstMonthOf, shiftMonth, type MatchDelta, type MonthlyGame } from "../../shared/simMonthly.js";
import {
    CUP_FIRST_MONTH, CUP_GAMES, CUP_MATCH, CUP_MAX_ENTRANTS, CUP_MIN_MATCHES, CUP_MIN_RATING, CUP_MIN_WINDOW_MS, CUP_ROUND_DAYS,
    cupDeadlineMs, cupEntrants, cupMyGame, cupPlaces, cupPlan, cupRounds, cupSettle, cupSize, cupStartMs,
    type CupGame, type CupMatchInfo, type CupOutcome, type CupPlace,
} from "../../shared/simCup.js";

const DAY_MS = 86_400_000;
type Row = HiqSimCupGame;
type Game = CupGame & { id: string };
const OUTCOMES: readonly CupOutcome[] = ["played", "walkover", "seed", "bye", "void"];
const toGame = (r: Row): Game => ({
    id: r.id, kind: r.kind, round: r.round, slot: r.slot, p1Id: r.p1Id ?? null, p2Id: r.p2Id ?? null,
    deadlineMs: r.deadlineAt.getTime(), p1ReadyMs: r.p1ReadyAt?.getTime() ?? null, p2ReadyMs: r.p2ReadyAt?.getTime() ?? null,
    matchId: r.matchId ?? null, winnerId: r.winnerId ?? null,
    outcome: OUTCOMES.includes(r.outcome as CupOutcome) ? (r.outcome as CupOutcome) : null, decidedMs: r.decidedAt?.getTime() ?? null,
});

/** 대진을 굴리며 생긴 일 — 알림을 보낼 재료 */
export interface CupSyncEvents {
    cup: HiqSimCup;
    /** 방금 두 사람이 정해진 판 */
    paired: Game[];
    /** 방금 결과가 난 판 */
    decided: Game[];
    /** 방금 대회가 끝났다 — 순위와 메달 */
    finished: CupPlace[] | null;
}

export interface CupMatchPort {
    info(ids: readonly string[]): Promise<Map<string, CupMatchInfo & { hostId: string; guestId: string | null }>>;
    cancel(ids: readonly string[]): Promise<number>;
}

export class SimCupRepository {
    /** deltas: 레이팅에 반영된 판과 그 변화(storage.simMatch.ratedDeltas) · matches: 대회 판으로 열린 대전의 상태와 닫기 */
    constructor(private readonly deltas: (fresh?: boolean) => Promise<MatchDelta[]>, private readonly matches: CupMatchPort) {}

    /**
     * 방금 끝난 달의 대회를 연다(종목마다 한 번). 달이 마감된 뒤에만 — 메달 · 배지와 같은 자료로 출전자를 정한다.
     * 출전자가 3명이 안 되면 열지 않는다(줄은 skipped 로 남겨 다시 시도하지 않는다).
     * 지난달 것만 연다 — 정리 작업을 오래 걸러 한참 지난 달의 대회를 뒤늦게 여는 일은 없다.
     */
    async openCups(nowMs: number): Promise<{ cup: HiqSimCup; entrants: string[] }[]> {
        const month = shiftMonth(kstMonthOf(nowMs), -1);
        if (month < CUP_FIRST_MONTH) return [];
        const [closed] = await db.select({ month: hiqSimMonthCloses.month }).from(hiqSimMonthCloses).where(eq(hiqSimMonthCloses.month, month)).limit(1);
        if (!closed) return [];
        const have = new Set((await db.select({ g: hiqSimCups.gameType }).from(hiqSimCups).where(eq(hiqSimCups.month, month))).map((r: { g: string }) => r.g));
        const todo = CUP_GAMES.filter((g) => !have.has(g));
        if (todo.length === 0) return [];
        const deltas = await this.deltas(true);
        const out: { cup: HiqSimCup; entrants: string[] }[] = [];
        for (const gameType of todo) {
            const entrants = cupEntrants(deltas, month, gameType);
            const size = cupSize(entrants.length);
            // 첫 라운드에 적어도 하루는 남게 — 늦게 열었으면 시작을 날짜 단위로 민다(기한은 늘 한국 시각 0시)
            let startMs = cupStartMs(month);
            while (cupDeadlineMs(startMs, 1) - nowMs < CUP_MIN_WINDOW_MS) startMs += DAY_MS;
            const seeds = new Map(entrants.map((e) => [e.memberId, e.seed]));
            const games = size === 0 ? [] : cupSettle(cupPlan(entrants, startMs), seeds, new Map(), nowMs).games;
            const rules = { minRating: CUP_MIN_RATING, minMatches: CUP_MIN_MATCHES, maxEntrants: CUP_MAX_ENTRANTS, roundDays: CUP_ROUND_DAYS, match: CUP_MATCH };
            const cup = await db.transaction(async (tx: any) => {
                const [row] = await tx.insert(hiqSimCups).values({ month, gameType, status: size === 0 ? "skipped" : "running", size, startsAt: new Date(startMs), rules })
                    .onConflictDoNothing().returning();
                if (!row) return null;
                if (size > 0) {
                    await tx.insert(hiqSimCupEntries).values(entrants.map((e) => ({ cupId: row.id, memberId: e.memberId, seed: e.seed, rating: e.rating, matches: e.matches, points: e.points })));
                    await tx.insert(hiqSimCupGames).values(games.map((g) => ({
                        cupId: row.id, kind: g.kind, round: g.round, slot: g.slot, p1Id: g.p1Id, p2Id: g.p2Id, deadlineAt: new Date(g.deadlineMs),
                        winnerId: g.winnerId, outcome: g.outcome, decidedAt: g.decidedMs === null ? null : new Date(g.decidedMs),
                    })));
                }
                return row as HiqSimCup;
            });
            if (cup) out.push({ cup, entrants: size === 0 ? [] : entrants.map((e) => e.memberId) });
        }
        return out;
    }

    private async load(cupId: string) {
        const [cup] = await db.select().from(hiqSimCups).where(eq(hiqSimCups.id, cupId)).limit(1);
        if (!cup) return null;
        const [rows, entries] = await Promise.all([
            db.select().from(hiqSimCupGames).where(eq(hiqSimCupGames.cupId, cupId)).orderBy(asc(hiqSimCupGames.round), asc(hiqSimCupGames.slot)),
            db.select().from(hiqSimCupEntries).where(eq(hiqSimCupEntries.cupId, cupId)).orderBy(asc(hiqSimCupEntries.seed)),
        ]);
        return { cup: cup as HiqSimCup, games: (rows as Row[]).map(toGame), entries: entries as HiqSimCupEntry[] };
    }

    /** 치르는 중인 대회들 — 매시 크론이 이것들을 굴린다 */
    async runningIds(): Promise<string[]> {
        return (await db.select({ id: hiqSimCups.id }).from(hiqSimCups).where(eq(hiqSimCups.status, "running"))).map((r: { id: string }) => r.id);
    }

    /**
     * 대진을 지금 시각까지 굴리고 달라진 것을 적는다. 끝난 대회 · 열지 않은 대회는 아무 일도 없다.
     * 칸마다 "아직 안 가려졌을 때만" 고친다 — 같은 때 두 곳에서 돌아도 한쪽만 '방금 났다'고 알린다.
     */
    async sync(cupId: string, nowMs: number): Promise<CupSyncEvents | null> {
        const st = await this.load(cupId);
        if (!st || st.cup.status !== "running") return null;
        const seeds = new Map<string, number>(st.entries.map((e) => [e.memberId, e.seed]));
        const ids = st.games.map((g) => g.matchId).filter((x): x is string => !!x);
        const info = await this.matches.info(ids);
        const r = cupSettle(st.games, seeds, info, nowMs);
        const before = new Map(st.games.map((g) => [g.id, g]));
        const paired: Game[] = [], decided: Game[] = [];
        for (const g of r.changed as Game[]) {
            const old = before.get(g.id)!;
            const set = {
                p1Id: g.p1Id, p2Id: g.p2Id, deadlineAt: new Date(g.deadlineMs),
                winnerId: g.winnerId, outcome: g.outcome, decidedAt: g.decidedMs === null ? null : new Date(g.decidedMs),
            };
            const done = await db.update(hiqSimCupGames).set(set)
                .where(and(eq(hiqSimCupGames.id, g.id), isNull(hiqSimCupGames.outcome),
                    // 자리가 그 사이에 달라졌으면(다른 쪽이 먼저 굴렸다) 덮지 않는다
                    sql`${hiqSimCupGames.p1Id} is not distinct from ${old.p1Id}`, sql`${hiqSimCupGames.p2Id} is not distinct from ${old.p2Id}`))
                .returning({ id: hiqSimCupGames.id });
            if (done.length === 0) continue;
            if (g.outcome) decided.push(g);
            else if (g.p1Id && g.p2Id && !(old.p1Id && old.p2Id)) paired.push(g);
        }
        if (r.cancelMatchIds.length > 0) await this.matches.cancel(r.cancelMatchIds);
        let finished: CupPlace[] | null = null;
        if (r.finished) {
            const places = cupPlaces(r.games);
            const won = await db.transaction(async (tx: any) => {
                const closed = await tx.update(hiqSimCups).set({ status: "finished", finishedAt: new Date(nowMs) })
                    .where(and(eq(hiqSimCups.id, cupId), eq(hiqSimCups.status, "running"))).returning({ id: hiqSimCups.id });
                if (closed.length === 0) return false;
                for (const p of places) {
                    await tx.update(hiqSimCupEntries).set({ place: p.place, medal: p.medal, forfeit: p.forfeit })
                        .where(and(eq(hiqSimCupEntries.cupId, cupId), eq(hiqSimCupEntries.memberId, p.memberId)));
                }
                const medals = places.filter((p) => p.medal !== null);
                if (medals.length > 0) {
                    const entryOf = new Map(st.entries.map((e) => [e.memberId, e]));
                    // 장식장에 놓는다 — 한 번 준 것은 고치지 않는다(storage/simShelf.repo 와 같은 표)
                    await tx.insert(hiqSimAwards).values(medals.map((p) => ({
                        memberId: p.memberId, month: st.cup.month, kind: "cup" as const, gameType: st.cup.gameType, rank: p.medal,
                        detail: { place: p.place, size: st.cup.size, seed: entryOf.get(p.memberId)?.seed ?? null, rating: entryOf.get(p.memberId)?.rating ?? null },
                    }))).onConflictDoNothing();
                }
                return true;
            });
            if (won) finished = places;
        }
        return { cup: st.cup, paired, decided, finished };
    }

    /** 대진 칸 하나와 그 대회 */
    async game(gameId: string): Promise<{ cup: HiqSimCup; game: Game } | null> {
        const [row] = await db.select().from(hiqSimCupGames).where(eq(hiqSimCupGames.id, gameId)).limit(1);
        if (!row) return null;
        const [cup] = await db.select().from(hiqSimCups).where(eq(hiqSimCups.id, row.cupId)).limit(1);
        return cup ? { cup: cup as HiqSimCup, game: toGame(row as Row) } : null;
    }

    /** 들어온 것을 적는다(처음 한 번) — 기한에 한 사람만 들어왔으면 그 사람의 기권승이다 */
    async markReady(gameId: string, side: "p1" | "p2", nowMs: number): Promise<void> {
        const col = side === "p1" ? hiqSimCupGames.p1ReadyAt : hiqSimCupGames.p2ReadyAt;
        await db.update(hiqSimCupGames).set(side === "p1" ? { p1ReadyAt: new Date(nowMs) } : { p2ReadyAt: new Date(nowMs) })
            .where(and(eq(hiqSimCupGames.id, gameId), isNull(col), isNull(hiqSimCupGames.outcome)));
    }

    /** 이 칸의 방을 바꿔 적는다 — 그 사이에 상대가 먼저 방을 열었으면(값이 달라졌으면) false */
    async setMatch(gameId: string, from: string | null, to: string): Promise<boolean> {
        const res = await db.update(hiqSimCupGames).set({ matchId: to })
            .where(and(eq(hiqSimCupGames.id, gameId), isNull(hiqSimCupGames.outcome), sql`${hiqSimCupGames.matchId} is not distinct from ${from}`))
            .returning({ id: hiqSimCupGames.id });
        return res.length > 0;
    }

    /** 기한이 하루 안으로 남았고 아직 안 가려진 판 가운데, 알림을 안 보낸 것 — 보낸 것으로 적고 돌려준다(매시 크론) */
    async dueReminders(nowMs: number): Promise<Game[]> {
        const rows = await db.update(hiqSimCupGames).set({ remindedAt: new Date(nowMs) })
            .where(and(isNull(hiqSimCupGames.outcome), isNull(hiqSimCupGames.remindedAt),
                sql`${hiqSimCupGames.p1Id} is not null`, sql`${hiqSimCupGames.p2Id} is not null`,
                // 시각은 ISO 글자로 넘긴다 — Date 를 그대로 넘기면 드라이버가 서버의 시간대로 적어, 시간대 없는 칸과 견줄 때 그만큼 어긋난다(로컬 9시간)
                sql`${hiqSimCupGames.deadlineAt} > ${new Date(nowMs).toISOString()}`, sql`${hiqSimCupGames.deadlineAt} <= ${new Date(nowMs + DAY_MS).toISOString()}`))
            .returning();
        return (rows as Row[]).map(toGame);
    }

    private async people(ids: readonly string[], gameType: MonthlyGame, placement: number) {
        const out = new Map<string, { name: string; country: string | null; tier: TierId | null; rating: number | null }>();
        if (ids.length === 0) return out;
        const rows = await db.select({ id: hiqMembers.id, name: hiqMembers.name, country: hiqMembers.country, phone: hiqMembers.phone, rating: hiqSimMatchRatings.rating, rated: hiqSimMatchRatings.matches })
            .from(hiqMembers)
            .leftJoin(hiqSimMatchRatings, and(eq(hiqSimMatchRatings.memberId, hiqMembers.id), eq(hiqSimMatchRatings.gameType, gameType)))
            .where(inArray(hiqMembers.id, [...ids]));
        for (const r of rows as { id: string; name: string; country: string | null; phone: string | null; rating: number | null; rated: number | null }[]) {
            const placed = typeof r.rating === "number" && Number(r.rated ?? 0) >= placement;
            out.set(String(r.id), { name: isWithdrawnMember(r) ? "" : String(r.name), country: r.country ?? null, tier: placed ? tierFor(r.rating as number).id : null, rating: placed ? (r.rating as number) : null });
        }
        return out;
    }

    /**
     * 대회 화면에 그릴 것 — 가장 최근 대회(그 종목)의 대진 · 출전자 · 내 판, 그리고 이번 달 '지금 이대로면' 출전권.
     * 대진의 대전 id 는 내 판에만 준다(남의 대회 방에 들어가는 길이 되지 않게).
     */
    async view(memberId: string, gameType: MonthlyGame, nowMs: number, placement = 3) {
        const [cup] = await db.select().from(hiqSimCups).where(and(eq(hiqSimCups.gameType, gameType), sql`${hiqSimCups.status} <> 'skipped'`))
            .orderBy(desc(hiqSimCups.month)).limit(1);
        const month = kstMonthOf(nowMs);
        const preview = cupEntrants(await this.deltas(), month, gameType, nowMs);
        const st = cup ? await this.load(cup.id) : null;
        const ids = [...new Set([...preview.map((e) => e.memberId), ...(st?.entries ?? []).map((e) => e.memberId), memberId])];
        const who = await this.people(ids, gameType, placement);
        const person = (id: string) => ({ name: who.get(id)?.name ?? "", country: who.get(id)?.country ?? null, tier: who.get(id)?.tier ?? null });
        const mine = st ? cupMyGame(st.games, memberId) : null;
        const info = mine?.game.matchId ? (await this.matches.info([mine.game.matchId])).get(mine.game.matchId) ?? null : null;
        const cupView = !st ? null : {
            id: st.cup.id, month: st.cup.month, gameType: st.cup.gameType, status: st.cup.status, size: st.cup.size, rounds: cupRounds(st.games),
            startsAt: st.cup.startsAt, finishedAt: st.cup.finishedAt ?? null,
            entries: st.entries.map((e) => ({ memberId: e.memberId, seed: e.seed, rating: e.rating, place: e.place ?? null, medal: e.medal ?? null, forfeit: e.forfeit === true, ...person(e.memberId) })),
            games: st.games.map((g) => ({
                id: g.id, kind: g.kind, round: g.round, slot: g.slot, p1Id: g.p1Id, p2Id: g.p2Id, deadlineAt: new Date(g.deadlineMs),
                p1Ready: g.p1ReadyMs !== null, p2Ready: g.p2ReadyMs !== null, winnerId: g.winnerId, outcome: g.outcome,
            })),
            mine: mine ? {
                gameId: (mine.game as Game).id, opponentId: mine.opponentId, waiting: mine.waiting, deadlineAt: new Date(mine.game.deadlineMs),
                iReady: (mine.mine === "p1" ? mine.game.p1ReadyMs : mine.game.p2ReadyMs) !== null,
                opponentReady: (mine.mine === "p1" ? mine.game.p2ReadyMs : mine.game.p1ReadyMs) !== null,
                matchId: info && (info.status === "waiting" || info.status === "playing") ? mine.game.matchId : null,
                matchStatus: info?.status ?? null,
                hosting: !!info && info.hostId === memberId,
            } : null,
        };
        const me = who.get(memberId);
        const myRow = preview.find((e) => e.memberId === memberId) ?? null;
        // 이번 달에 내가 친 판 수(출전 조건의 한쪽) — 순위표와 같은 셈
        const myMatches = (await this.deltas()).filter((d) => d.gameType === gameType && kstMonthOf(d.endedMs) === month && (d.hostId === memberId || d.guestId === memberId)).length;
        return {
            now: new Date(nowMs),
            cup: cupView,
            /** 다음 대회 — 이번 달 성적으로 다음 달 1일에 연다 */
            next: {
                month, startsAt: new Date(cupStartMs(month)), daysLeft: daysLeftInMonth(month, nowMs),
                minRating: CUP_MIN_RATING, minMatches: CUP_MIN_MATCHES, maxEntrants: CUP_MAX_ENTRANTS, roundDays: CUP_ROUND_DAYS,
                size: cupSize(preview.length),
                entrants: preview.map((e) => ({ memberId: e.memberId, seed: e.seed, rating: e.rating, matches: e.matches, ...person(e.memberId) })),
                me: { qualified: !!myRow, seed: myRow?.seed ?? null, rating: me?.rating ?? null, matches: myMatches },
            },
        };
    }

    /** 홈 배너의 한 줄 — 치르는 중인 대회에서 내가 칠 판이 있나 */
    async summary(memberId: string): Promise<{ month: string; gameType: MonthlyGame; deadlineAt: Date; waiting: boolean } | null> {
        const rows = await db.select({ g: hiqSimCupGames, month: hiqSimCups.month, gameType: hiqSimCups.gameType }).from(hiqSimCupGames)
            .innerJoin(hiqSimCups, eq(hiqSimCups.id, hiqSimCupGames.cupId))
            .where(and(eq(hiqSimCups.status, "running"), isNull(hiqSimCupGames.outcome), sql`(${hiqSimCupGames.p1Id} = ${memberId} or ${hiqSimCupGames.p2Id} = ${memberId})`))
            .orderBy(asc(hiqSimCupGames.round)).limit(1);
        const r = rows[0] as { g: Row; month: string; gameType: MonthlyGame } | undefined;
        if (!r) return null;
        return { month: r.month, gameType: r.gameType, deadlineAt: r.g.deadlineAt, waiting: !(r.g.p1Id && r.g.p2Id) };
    }
}
