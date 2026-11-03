/**
 * 월대회 저장소(2026-10-12 오너 "추천대로" · 2026-11-03 운영자가 여는 대회로 다시 짬). 규칙은 shared/simCup — 여기는 읽고, 그 규칙이 정한 것을 적는다.
 * 쓰는 표: hiq_sim_cups · hiq_sim_cup_entries · hiq_sim_cup_games · hiq_sim_awards(kind 'cup'). 대전 표는 storage/simMatch.repo 를 거쳐서만 건드린다.
 *
 * 흐름
 *  - 운영자: candidates(출전 후보와 추천) → createDraft(고른 사람으로 대진 · 회원에게 안 보인다) → schedule(판마다 시각) → publish(대회 시작 · 알림).
 *    draft 는 지울 수 있다(removeDraft). 치르는 중인 대회는 무효로 할 수 있다(voidCup — 열린 방을 닫는다).
 *  - sync: 대진을 지금 시각까지 굴린다(shared/simCup cupSettle) — 대진 화면 · 대기실 · 대회 판이 끝난 화면 · 크론.
 *    칸을 고칠 때 '아직 안 가려졌을 때만' 이라는 조건을 달아, 같은 때 두 번 돌아도 알림은 한 번만 나간다.
 *  - checkIn: 대기실에 들어온 것 · 아직 있는 것을 적는다(입장 = 기권 판정의 근거, 있음 = 판을 시작할 근거). 판을 여는 일은 routes/modules/simCup 이 한다.
 */
import { db } from "../db.js";
import { hiqMembers, hiqSimAwards, hiqSimCupEntries, hiqSimCupGames, hiqSimCups, hiqSimMatchRatings } from "../../shared/schema.js";
import type { HiqSimCup, HiqSimCupEntry, HiqSimCupGame } from "../../shared/schema.js";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isWithdrawnMember } from "../../shared/chatSupport.js";
import { tierFor, type TierId } from "../../shared/sim/rank.js";
import { daysLeftInMonth, kstMonthOf, type MatchDelta, type MonthlyGame } from "../../shared/simMonthly.js";
import {
    CUP_ENTER_EARLY_MS, CUP_MATCH, CUP_MAX_ENTRANTS, CUP_MIN_ENTRANTS, CUP_MIN_MATCHES, CUP_MIN_RATING, CUP_NO_SHOW_MS,
    cupCandidates, cupEntrants, cupMyGame, cupPlaces, cupPlan, cupPresent, cupRounds, cupSeed, cupSettle, cupSize, cupWindow,
    type CupCandidate, type CupGame, type CupMatchInfo, type CupOutcome, type CupPlace,
} from "../../shared/simCup.js";

const DAY_MS = 86_400_000;
type Row = HiqSimCupGame;
/** 저장소가 다루는 칸 — 규칙의 칸 + id · 대기실에 있던 때 */
export type CupGameRow = CupGame & { id: string; p1SeenMs: number | null; p2SeenMs: number | null };
const OUTCOMES: readonly CupOutcome[] = ["played", "walkover", "seed", "bye", "void"];
const toGame = (r: Row): CupGameRow => ({
    id: r.id, kind: r.kind, round: r.round, slot: r.slot, p1Id: r.p1Id ?? null, p2Id: r.p2Id ?? null,
    scheduledMs: r.scheduledAt?.getTime() ?? null, p1ReadyMs: r.p1ReadyAt?.getTime() ?? null, p2ReadyMs: r.p2ReadyAt?.getTime() ?? null,
    p1SeenMs: r.p1SeenAt?.getTime() ?? null, p2SeenMs: r.p2SeenAt?.getTime() ?? null,
    matchId: r.matchId ?? null, winnerId: r.winnerId ?? null,
    outcome: OUTCOMES.includes(r.outcome as CupOutcome) ? (r.outcome as CupOutcome) : null, decidedMs: r.decidedAt?.getTime() ?? null,
});
/** deadline_at(옛 칸 · NOT NULL) — 이제 '판정하는 때'(경기 시각 + 15분)를 적어 둔다. 시각이 없으면 대회를 만든 때 */
const deadlineFor = (scheduledMs: number | null, fallbackMs: number) => new Date(scheduledMs === null ? fallbackMs : scheduledMs + CUP_NO_SHOW_MS);
/** 회원에게 보이는 대회 */
const SHOWN = sql`${hiqSimCups.status} in ('running', 'finished')`;

/** 대진을 굴리며 생긴 일 — 알림을 보낼 재료 */
export interface CupSyncEvents {
    cup: HiqSimCup;
    /** 방금 두 사람이 정해진 판 */
    paired: CupGameRow[];
    /** 방금 결과가 난 판 */
    decided: CupGameRow[];
    /** 방금 대회가 끝났다 — 순위와 메달 */
    finished: CupPlace[] | null;
}

export interface CupMatchPort {
    info(ids: readonly string[]): Promise<Map<string, CupMatchInfo & { hostId: string; guestId: string | null }>>;
    cancel(ids: readonly string[]): Promise<number>;
}

export type CupAdminError = { ok: false; why: string };

export class SimCupRepository {
    /** deltas: 레이팅에 반영된 판과 그 변화(storage.simMatch.ratedDeltas) · matches: 대회 판으로 열린 대전의 상태와 닫기 */
    constructor(private readonly deltas: (fresh?: boolean) => Promise<MatchDelta[]>, private readonly matches: CupMatchPort) {}

    /** 출전 후보 — 그 달에 친 사람 전부와 추천 여부(운영자 화면). 이번 달이면 지금의 레이팅으로 센다 */
    async candidates(month: string, gameType: MonthlyGame, nowMs: number): Promise<CupCandidate[]> {
        const deltas = await this.deltas(true);
        return cupCandidates(deltas, month, gameType, month >= kstMonthOf(nowMs) ? nowMs : undefined);
    }

    /**
     * 운영자가 고른 사람으로 대진을 짠다(draft — 회원에게 안 보인다). 고른 사람은 그 달에 친 사람이어야 한다(시드 · 레이팅의 근거).
     * 부전승은 바로 가린다. 그 달 · 그 종목에 대회가 이미 있으면(무효로 한 것 포함) 만들지 않는다.
     */
    async createDraft(month: string, gameType: MonthlyGame, memberIds: readonly string[], nowMs: number): Promise<HiqSimCup | CupAdminError> {
        const ids = [...new Set(memberIds)];
        if (ids.length < CUP_MIN_ENTRANTS) return { ok: false, why: `${CUP_MIN_ENTRANTS}명 이상 골라 주세요` };
        if (ids.length > CUP_MAX_ENTRANTS) return { ok: false, why: `${CUP_MAX_ENTRANTS}명까지 고를 수 있어요` };
        const pool = new Map((await this.candidates(month, gameType, nowMs)).map((c) => [c.memberId, c]));
        const missing = ids.filter((id) => !pool.has(id));
        if (missing.length) return { ok: false, why: "그 달에 친 판이 없는 사람이 있어요" };
        const entrants = cupSeed(ids.map((id) => pool.get(id)!));
        const seeds = new Map(entrants.map((e) => [e.memberId, e.seed]));
        const games = cupSettle(cupPlan(entrants), seeds, new Map(), nowMs).games;
        const rules = { minRating: CUP_MIN_RATING, minMatches: CUP_MIN_MATCHES, maxEntrants: CUP_MAX_ENTRANTS, enterEarlyMin: CUP_ENTER_EARLY_MS / 60_000, noShowMin: CUP_NO_SHOW_MS / 60_000, match: CUP_MATCH };
        const cup = await db.transaction(async (tx: any) => {
            const [row] = await tx.insert(hiqSimCups).values({ month, gameType, status: "draft", size: cupSize(entrants.length), startsAt: new Date(nowMs), rules })
                .onConflictDoNothing().returning();
            if (!row) return null;
            await tx.insert(hiqSimCupEntries).values(entrants.map((e) => ({ cupId: row.id, memberId: e.memberId, seed: e.seed, rating: e.rating, matches: e.matches, points: e.points })));
            await tx.insert(hiqSimCupGames).values(games.map((g) => ({
                cupId: row.id, kind: g.kind, round: g.round, slot: g.slot, p1Id: g.p1Id, p2Id: g.p2Id, deadlineAt: deadlineFor(null, nowMs),
                winnerId: g.winnerId, outcome: g.outcome, decidedAt: g.decidedMs === null ? null : new Date(g.decidedMs),
            })));
            return row as HiqSimCup;
        });
        return cup ?? { ok: false, why: "그 달 대회가 이미 있어요" };
    }

    /** 짜는 중인 대회를 지운다(회원에게 보인 적이 없다) */
    async removeDraft(cupId: string): Promise<boolean> {
        return db.transaction(async (tx: any) => {
            const [c] = await tx.select({ status: hiqSimCups.status }).from(hiqSimCups).where(eq(hiqSimCups.id, cupId)).for("update");
            if (!c || c.status !== "draft") return false;
            await tx.delete(hiqSimCupGames).where(eq(hiqSimCupGames.cupId, cupId));
            await tx.delete(hiqSimCupEntries).where(eq(hiqSimCupEntries.cupId, cupId));
            await tx.delete(hiqSimCups).where(eq(hiqSimCups.id, cupId));
            return true;
        });
    }

    /** 대회를 연다(draft → running). 첫 라운드의 두 사람이 앉은 판은 모두 시각이 있어야 한다. 출전자 id 를 돌려준다 */
    async publish(cupId: string, nowMs: number): Promise<{ cup: HiqSimCup; entrants: string[] } | CupAdminError> {
        const st = await this.load(cupId);
        if (!st || st.cup.status !== "draft") return { ok: false, why: "짜는 중인 대회만 열 수 있어요" };
        const unscheduled = st.games.filter((g) => g.kind === "main" && g.round === 1 && !g.outcome && g.p1Id && g.p2Id && g.scheduledMs === null);
        if (unscheduled.length) return { ok: false, why: `첫 라운드 ${unscheduled.length}판의 시각을 먼저 정해 주세요` };
        if (st.games.some((g) => !g.outcome && g.scheduledMs !== null && g.scheduledMs < nowMs)) return { ok: false, why: "지난 시각으로 정한 판이 있어요 — 시각을 다시 정해 주세요" };
        const [row] = await db.update(hiqSimCups).set({ status: "running", startsAt: new Date(nowMs) })
            .where(and(eq(hiqSimCups.id, cupId), eq(hiqSimCups.status, "draft"))).returning();
        if (!row) return { ok: false, why: "그 사이에 상태가 바뀌었어요" };
        return { cup: row as HiqSimCup, entrants: st.entries.map((e) => e.memberId) };
    }

    /** 치르는 중인 대회를 무효로 한다 — 열린 대회 방은 닫는다. 대진 · 출전 기록은 남는다(회원에게는 안 보인다) */
    async voidCup(cupId: string): Promise<boolean> {
        const st = await this.load(cupId);
        if (!st || st.cup.status !== "running") return false;
        const [row] = await db.update(hiqSimCups).set({ status: "void", finishedAt: new Date() })
            .where(and(eq(hiqSimCups.id, cupId), eq(hiqSimCups.status, "running"))).returning({ id: hiqSimCups.id });
        if (!row) return false;
        const open = st.games.filter((g) => !g.outcome && g.matchId).map((g) => g.matchId!);
        if (open.length) await this.matches.cancel(open);
        return true;
    }

    /**
     * 한 판의 경기 시각을 정한다(null = 일정 미정으로). 짜는 중 · 치르는 중인 대회의, 아직 안 가려졌고 판이 시작되지 않은 칸만.
     * 시각이 바뀌면 그 판의 입장 · 대기실 · 알림 표시를 지운다(새 시각에 처음부터).
     */
    async schedule(gameId: string, atMs: number | null, nowMs: number, note?: unknown): Promise<{ cup: HiqSimCup; game: CupGameRow } | CupAdminError> {
        const found = await this.game(gameId);
        if (!found) return { ok: false, why: "대진 칸을 찾을 수 없어요" };
        const { cup, game } = found;
        if (cup.status !== "draft" && cup.status !== "running") return { ok: false, why: "짜는 중이거나 치르는 중인 대회만 시각을 정할 수 있어요" };
        if (game.outcome) return { ok: false, why: "이미 가려진 판이에요" };
        if (game.matchId) {
            const m = (await this.matches.info([game.matchId])).get(game.matchId);
            if (m && (m.status === "playing" || m.status === "finished")) return { ok: false, why: "이미 시작된 판이에요" };
        }
        if (atMs !== null && atMs < nowMs + CUP_ENTER_EARLY_MS) return { ok: false, why: "적어도 10분 뒤로 정해 주세요(10분 전부터 입장해요)" };
        const [row] = await db.update(hiqSimCupGames).set({
            scheduledAt: atMs === null ? null : new Date(atMs), deadlineAt: deadlineFor(atMs, nowMs),
            p1ReadyAt: null, p2ReadyAt: null, p1SeenAt: null, p2SeenAt: null, remindedAt: null, calledAt: null,
            ...(note ? { adminNote: sql`coalesce(${hiqSimCupGames.adminNote}, '[]'::jsonb) || ${JSON.stringify([note])}::jsonb` as any } : {}),
        }).where(and(eq(hiqSimCupGames.id, gameId), isNull(hiqSimCupGames.outcome))).returning();
        if (!row) return { ok: false, why: "그 사이에 결과가 났어요" };
        return { cup, game: toGame(row as Row) };
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

    /** 치르는 중인 대회들 — 크론이 이것들을 굴린다 */
    async runningIds(): Promise<string[]> {
        return (await db.select({ id: hiqSimCups.id }).from(hiqSimCups).where(eq(hiqSimCups.status, "running"))).map((r: { id: string }) => r.id);
    }

    /**
     * 대진을 지금 시각까지 굴리고 달라진 것을 적는다. 치르는 중이 아닌 대회는 아무 일도 없다.
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
        const paired: CupGameRow[] = [], decided: CupGameRow[] = [];
        for (const g of r.changed as CupGameRow[]) {
            const old = before.get(g.id)!;
            const set = {
                p1Id: g.p1Id, p2Id: g.p2Id, scheduledAt: g.scheduledMs === null ? null : new Date(g.scheduledMs), deadlineAt: deadlineFor(g.scheduledMs, nowMs),
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
    async game(gameId: string): Promise<{ cup: HiqSimCup; game: CupGameRow } | null> {
        const [row] = await db.select().from(hiqSimCupGames).where(eq(hiqSimCupGames.id, gameId)).limit(1);
        if (!row) return null;
        const [cup] = await db.select().from(hiqSimCups).where(eq(hiqSimCups.id, row.cupId)).limit(1);
        return cup ? { cup: cup as HiqSimCup, game: toGame(row as Row) } : null;
    }

    /**
     * 대기실에 들어왔다 · 아직 있다 — 입장(처음 한 번, 기권 판정의 근거)과 있음(매번, 판을 시작할 근거)을 적는다.
     * 입장 시간(10분 전 ~ 15분 뒤) 안의, 아직 안 가려진 판만. 고친 칸을 돌려준다(상대가 지금 있는지 보려고). firstTime = 이번이 첫 입장
     */
    async checkIn(gameId: string, side: "p1" | "p2", nowMs: number): Promise<{ game: CupGameRow; firstTime: boolean } | null> {
        const now = new Date(nowMs);
        const [row] = await db.update(hiqSimCupGames)
            .set(side === "p1" ? { p1SeenAt: now, p1ReadyAt: sql`coalesce(${hiqSimCupGames.p1ReadyAt}, ${now.toISOString()}::timestamp)` as any }
                : { p2SeenAt: now, p2ReadyAt: sql`coalesce(${hiqSimCupGames.p2ReadyAt}, ${now.toISOString()}::timestamp)` as any })
            .where(and(eq(hiqSimCupGames.id, gameId), isNull(hiqSimCupGames.outcome),
                // 입장 시간 안에서만 — 시각은 ISO 글자로 넘긴다(Date 를 그대로 넘기면 드라이버가 서버 시간대로 적어 9시간 어긋난다)
                sql`${hiqSimCupGames.scheduledAt} is not null`,
                sql`${hiqSimCupGames.scheduledAt} <= ${new Date(nowMs + CUP_ENTER_EARLY_MS).toISOString()}::timestamp`,
                sql`${hiqSimCupGames.scheduledAt} > ${new Date(nowMs - CUP_NO_SHOW_MS).toISOString()}::timestamp`))
            .returning();
        if (!row) return null;
        const game = toGame(row as Row);
        const readyMs = side === "p1" ? game.p1ReadyMs : game.p2ReadyMs;
        return { game, firstTime: readyMs === nowMs };
    }

    /** 이 칸의 방을 바꿔 적는다 — 그 사이에 다른 쪽이 먼저 판을 열었으면(값이 달라졌으면) false */
    async setMatch(gameId: string, from: string | null, to: string): Promise<boolean> {
        const res = await db.update(hiqSimCupGames).set({ matchId: to })
            .where(and(eq(hiqSimCupGames.id, gameId), isNull(hiqSimCupGames.outcome), sql`${hiqSimCupGames.matchId} is not distinct from ${from}`))
            .returning({ id: hiqSimCupGames.id });
        return res.length > 0;
    }

    /** 치르는 중인 대회의, 두 사람이 정해졌고 아직 안 가려진 판 가운데 조건에 맞는 것에 표시를 하고 돌려준다(알림 한 번) */
    private async markDue(col: "reminded" | "called", where: ReturnType<typeof sql>, nowMs: number): Promise<CupGameRow[]> {
        const mark = col === "reminded" ? { remindedAt: new Date(nowMs) } : { calledAt: new Date(nowMs) };
        const rows = await db.update(hiqSimCupGames).set(mark)
            .where(and(isNull(hiqSimCupGames.outcome), isNull(hiqSimCupGames.matchId), isNull(col === "reminded" ? hiqSimCupGames.remindedAt : hiqSimCupGames.calledAt),
                sql`${hiqSimCupGames.p1Id} is not null`, sql`${hiqSimCupGames.p2Id} is not null`, sql`${hiqSimCupGames.scheduledAt} is not null`,
                sql`exists (select 1 from ${hiqSimCups} where ${hiqSimCups.id} = ${hiqSimCupGames.cupId} and ${hiqSimCups.status} = 'running')`, where))
            .returning();
        return (rows as Row[]).map(toGame);
    }

    /** 경기가 하루 안으로 다가온 판(아직 입장 시간 전) — 두 사람에게 한 번 */
    dueReminders(nowMs: number): Promise<CupGameRow[]> {
        return this.markDue("reminded", sql`${hiqSimCupGames.scheduledAt} > ${new Date(nowMs + CUP_ENTER_EARLY_MS).toISOString()}::timestamp and ${hiqSimCupGames.scheduledAt} <= ${new Date(nowMs + DAY_MS).toISOString()}::timestamp`, nowMs);
    }

    /** 입장 시간이 열린 판 — '지금 입장하세요'를 두 사람에게 한 번 */
    dueCalls(nowMs: number): Promise<CupGameRow[]> {
        return this.markDue("called", sql`${hiqSimCupGames.scheduledAt} <= ${new Date(nowMs + CUP_ENTER_EARLY_MS).toISOString()}::timestamp and ${hiqSimCupGames.scheduledAt} > ${new Date(nowMs - CUP_NO_SHOW_MS).toISOString()}::timestamp`, nowMs);
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
     * 대회 화면에 그릴 것 — 가장 최근에 연 대회(그 종목, 회원에게 보이는 것)의 대진 · 출전자 · 내 판, 그리고 이번 달 '지금 이대로면' 추천.
     * 시작된 대회 판의 대전 id 는 모두에게 준다(공개 방 — 관전). 시작 전의 판은 id 가 없다.
     */
    async view(memberId: string, gameType: MonthlyGame, nowMs: number, placement = 3) {
        const [cup] = await db.select().from(hiqSimCups).where(and(eq(hiqSimCups.gameType, gameType), SHOWN))
            .orderBy(desc(hiqSimCups.startsAt)).limit(1);
        const month = kstMonthOf(nowMs);
        const preview = cupEntrants(await this.deltas(), month, gameType, nowMs);
        const st = cup ? await this.load(cup.id) : null;
        const ids = [...new Set([...preview.map((e) => e.memberId), ...(st?.entries ?? []).map((e) => e.memberId), memberId])];
        const who = await this.people(ids, gameType, placement);
        const person = (id: string) => ({ name: who.get(id)?.name ?? "", country: who.get(id)?.country ?? null, tier: who.get(id)?.tier ?? null });
        const info = st ? await this.matches.info(st.games.map((g) => g.matchId).filter((x): x is string => !!x)) : new Map();
        const live = (g: CupGameRow) => { const m = g.matchId ? info.get(g.matchId) : undefined; return m && (m.status === "playing" || m.status === "finished") ? m : null; };
        const mine = st ? cupMyGame(st.games, memberId) : null;
        const mg = mine?.game as CupGameRow | undefined;
        const cupView = !st ? null : {
            id: st.cup.id, month: st.cup.month, gameType: st.cup.gameType, status: st.cup.status, size: st.cup.size, rounds: cupRounds(st.games),
            startsAt: st.cup.startsAt, finishedAt: st.cup.finishedAt ?? null,
            entries: st.entries.map((e) => ({ memberId: e.memberId, seed: e.seed, rating: e.rating, place: e.place ?? null, medal: e.medal ?? null, forfeit: e.forfeit === true, ...person(e.memberId) })),
            games: st.games.map((g) => ({
                id: g.id, kind: g.kind, round: g.round, slot: g.slot, p1Id: g.p1Id, p2Id: g.p2Id,
                scheduledAt: g.scheduledMs === null ? null : new Date(g.scheduledMs),
                p1Ready: g.p1ReadyMs !== null, p2Ready: g.p2ReadyMs !== null, winnerId: g.winnerId, outcome: g.outcome,
                matchId: live(g) ? g.matchId : null, matchStatus: live(g)?.status ?? null,
            })),
            mine: mine && mg ? {
                gameId: mg.id, opponentId: mine.opponentId, waiting: mine.waiting,
                scheduledAt: mg.scheduledMs === null ? null : new Date(mg.scheduledMs), window: cupWindow(mg.scheduledMs, nowMs),
                iReady: (mine.mine === "p1" ? mg.p1ReadyMs : mg.p2ReadyMs) !== null,
                opponentReady: (mine.mine === "p1" ? mg.p2ReadyMs : mg.p1ReadyMs) !== null,
                opponentPresent: cupPresent(mine.mine === "p1" ? mg.p2SeenMs : mg.p1SeenMs, nowMs),
                matchId: live(mg) ? mg.matchId : null,
                matchStatus: live(mg)?.status ?? null,
            } : null,
        };
        const me = who.get(memberId);
        const myRow = preview.find((e) => e.memberId === memberId) ?? null;
        // 이번 달에 내가 친 판 수(추천 조건의 한쪽) — 순위표와 같은 셈
        const myMatches = (await this.deltas()).filter((d) => d.gameType === gameType && kstMonthOf(d.endedMs) === month && (d.hostId === memberId || d.guestId === memberId)).length;
        return {
            now: new Date(nowMs),
            cup: cupView,
            /** 다음 대회 — 이번 달 성적이 이대로면 추천되는 사람(운영자가 확정한다) */
            next: {
                month, daysLeft: daysLeftInMonth(month, nowMs),
                minRating: CUP_MIN_RATING, minMatches: CUP_MIN_MATCHES, maxEntrants: CUP_MAX_ENTRANTS,
                enterEarlyMin: CUP_ENTER_EARLY_MS / 60_000, noShowMin: CUP_NO_SHOW_MS / 60_000,
                size: cupSize(preview.length),
                entrants: preview.map((e) => ({ memberId: e.memberId, seed: e.seed, rating: e.rating, matches: e.matches, ...person(e.memberId) })),
                me: { qualified: !!myRow, seed: myRow?.seed ?? null, rating: me?.rating ?? null, matches: myMatches },
            },
        };
    }

    /** 홈 입구의 한 줄 — 치르는 중인 대회에서 내가 칠 판이 있나 */
    async summary(memberId: string): Promise<{ month: string; gameType: MonthlyGame; scheduledAt: Date | null; waiting: boolean } | null> {
        const rows = await db.select({ g: hiqSimCupGames, month: hiqSimCups.month, gameType: hiqSimCups.gameType }).from(hiqSimCupGames)
            .innerJoin(hiqSimCups, eq(hiqSimCups.id, hiqSimCupGames.cupId))
            .where(and(eq(hiqSimCups.status, "running"), isNull(hiqSimCupGames.outcome), sql`(${hiqSimCupGames.p1Id} = ${memberId} or ${hiqSimCupGames.p2Id} = ${memberId})`))
            .orderBy(asc(hiqSimCupGames.round)).limit(1);
        const r = rows[0] as { g: Row; month: string; gameType: MonthlyGame } | undefined;
        if (!r) return null;
        return { month: r.month, gameType: r.gameType, scheduledAt: r.g.scheduledAt ?? null, waiting: !(r.g.p1Id && r.g.p2Id) };
    }
}
