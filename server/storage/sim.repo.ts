/**
 * 시뮬레이터 v2 기록 저장소.
 *
 * 불변: 이 파일은 실전 경기 테이블·경기 마감 함수·회원 성적 컬럼(레이팅·에버리지·핸디)을 절대 건드리지 않는다.
 * sim.guard.test.ts 가 식별자 grep 으로 지킨다. 시뮬 성적은 hiqSimRatings 에만 쓴다.
 */
import { db } from "../db.js";
import { hiqSimSessions, hiqSimShots, hiqSimRatings, hiqMembers } from "../../shared/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import type { HiqSimSession, HiqSimShot } from "../../shared/schema.js";

export interface RecordShotArgs {
    sessionId: string;
    idx: number;
    playerIndex: number;
    preState: unknown;
    input: unknown;
    hash: string;
    clientHash: string | null;
    eventCount: number;
    outcomeCode: string;
    points: number;
    cushions: number;
    /** 샷 반영 후 정본 세션 상태·공 배치·비정규화 값 */
    newState: unknown;
    newBalls: unknown;
    score: number;
    innings: number;
    highRun: number;
    finished: boolean;
}

export class SimRepository {
    async createSession(data: typeof hiqSimSessions.$inferInsert): Promise<HiqSimSession> {
        const [row] = await db.insert(hiqSimSessions).values(data).returning();
        return row;
    }

    async getSession(id: string): Promise<HiqSimSession | undefined> {
        const [row] = await db.select().from(hiqSimSessions).where(eq(hiqSimSessions.id, id)).limit(1);
        return row;
    }

    async listSessions(memberId: string, limit = 30): Promise<HiqSimSession[]> {
        return db.select().from(hiqSimSessions)
            .where(eq(hiqSimSessions.memberId, memberId))
            .orderBy(desc(hiqSimSessions.startedAt))
            .limit(limit);
    }

    /** 대시보드용 세션 요약 — 무거운 jsonb(state·balls·rules) 없이 최근 limit 개, 시작 시각 내림차순. */
    async listSessionSummaries(memberId: string, limit = 100) {
        return db.select({
            id: hiqSimSessions.id,
            kind: hiqSimSessions.kind,
            gameType: hiqSimSessions.gameType,
            tableId: hiqSimSessions.tableId,
            cushionModel: hiqSimSessions.cushionModel,
            condition: hiqSimSessions.condition,
            targetScore: hiqSimSessions.targetScore,
            inningCap: hiqSimSessions.inningCap,
            score: hiqSimSessions.score,
            innings: hiqSimSessions.innings,
            highRun: hiqSimSessions.highRun,
            shots: hiqSimSessions.shots,
            status: hiqSimSessions.status,
            startedAt: hiqSimSessions.startedAt,
            finishedAt: hiqSimSessions.finishedAt,
        }).from(hiqSimSessions)
            .where(eq(hiqSimSessions.memberId, memberId))
            .orderBy(desc(hiqSimSessions.startedAt))
            .limit(limit);
    }

    /** 연습 래더에서의 내 순위(종목·테이블별). 세션이 있는 회원끼리 최고 에버 → 하이런 순(ladder 와 같은 정렬). total = 그 래더의 인원. */
    async myRanks(memberId: string): Promise<{ gameType: "3c" | "4c"; tableId: "DAEDAE" | "JUNGDAE_KR"; rank: number; total: number }[]> {
        const res = await db.execute(sql`
            select game_type, table_id, rank, total from (
                select member_id, game_type, table_id,
                    rank() over (partition by game_type, table_id order by best_avg desc, best_high_run desc) as rank,
                    count(*) over (partition by game_type, table_id) as total
                from hiq_sim_ratings where sessions > 0
            ) r where member_id = ${memberId}`);
        return (res.rows as { game_type: "3c" | "4c"; table_id: "DAEDAE" | "JUNGDAE_KR"; rank: string | number; total: string | number }[])
            .map((r) => ({ gameType: r.game_type, tableId: r.table_id, rank: Number(r.rank), total: Number(r.total) }));
    }

    /**
     * 어드민 "온라인당구 게임" 화면(2026-09-08 오너): 얼마나 쓰는지 — 싱글(세션)·멀티(대전)·드릴 활동을 한 번에.
     * hiq_sim_* 와 회원 이름만 읽는다. 실전 성적 테이블은 건드리지 않는다.
     */
    async adminOverview(days = 30) {
        const one = async (q: ReturnType<typeof sql>) => ((await db.execute(q)).rows[0] ?? {}) as Record<string, string | number | null>;
        const many = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, string | number | null>[];
        const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

        const sessions = await one(sql`
            select count(*) as total,
                   count(*) filter (where status = 'finished') as finished,
                   count(*) filter (where status = 'playing') as playing,
                   count(*) filter (where kind = 'drill') as drill_kind,
                   count(distinct member_id) as players,
                   coalesce(sum(shots), 0) as shots,
                   coalesce(sum(innings), 0) as innings,
                   coalesce(sum(mismatches), 0) as mismatches,
                   count(*) filter (where started_at >= now() - interval '1 day') as d1,
                   count(*) filter (where started_at >= now() - interval '7 days') as d7,
                   count(*) filter (where started_at >= now() - interval '30 days') as d30,
                   avg(innings) filter (where status = 'finished' and innings > 0) as avg_innings,
                   avg(extract(epoch from (finished_at - started_at)) / 60) filter (where finished_at is not null and status = 'finished') as avg_minutes
            from hiq_sim_sessions`);
        const matches = await one(sql`
            select count(*) as total,
                   count(*) filter (where status = 'finished') as finished,
                   count(*) filter (where status = 'playing') as playing,
                   count(*) filter (where status = 'waiting') as waiting,
                   count(*) filter (where status = 'canceled') as canceled,
                   count(*) filter (where status = 'waiting' and is_public) as open_rooms,
                   count(*) filter (where is_public) as public_total,
                   count(*) filter (where password_hash is not null) as password_total,
                   count(*) filter (where invited_id is not null) as invited_total,
                   count(*) filter (where aim_assist = false) as reality,
                   count(*) filter (where end_reason = 'target') as end_target,
                   count(*) filter (where end_reason = 'inningCap') as end_inning_cap,
                   count(*) filter (where end_reason = 'resign') as end_resign,
                   count(*) filter (where end_reason = 'claim') as end_claim,
                   coalesce(sum(shots), 0) as shots,
                   coalesce(sum(mismatches), 0) as mismatches,
                   count(*) filter (where created_at >= now() - interval '1 day') as d1,
                   count(*) filter (where created_at >= now() - interval '7 days') as d7,
                   count(*) filter (where created_at >= now() - interval '30 days') as d30
            from hiq_sim_matches`);
        const matchPlayers = await one(sql`
            select count(distinct id) as players from (
                select host_id as id from hiq_sim_matches union select guest_id from hiq_sim_matches where guest_id is not null) u`);
        const drills = await one(sql`
            select count(*) as attempts, count(*) filter (where success) as successes, count(distinct member_id) as players,
                   count(distinct week_id) as weeks,
                   count(*) filter (where created_at >= now() - interval '7 days') as d7
            from hiq_sim_drill_attempts`);
        const active = async (interval: string) => n((await one(sql`
            select count(distinct id) as c from (
                select member_id as id from hiq_sim_sessions where started_at >= now() - ${interval}::interval
                union select host_id from hiq_sim_matches where created_at >= now() - ${interval}::interval
                union select guest_id from hiq_sim_matches where guest_id is not null and started_at >= now() - ${interval}::interval
                union select member_id from hiq_sim_drill_attempts where created_at >= now() - ${interval}::interval) u`)).c);
        const [a1, a7, a30] = await Promise.all([active("1 day"), active("7 days"), active("30 days")]);

        const dayKey = (d: Date) => d.toISOString().slice(0, 10);
        const daily = new Map<string, { day: string; sessions: number; matches: number; drills: number; players: number }>();
        for (let k = days - 1; k >= 0; k--) {
            const day = dayKey(new Date(Date.now() - k * 86_400_000));
            daily.set(day, { day, sessions: 0, matches: 0, drills: 0, players: 0 });
        }
        const bump = (rows: Record<string, string | number | null>[], key: "sessions" | "matches" | "drills") => {
            for (const r of rows) { const d = daily.get(String(r.day)); if (d) d[key] = n(r.c); }
        };
        bump(await many(sql`select to_char(started_at at time zone 'utc', 'YYYY-MM-DD') as day, count(*) as c from hiq_sim_sessions where started_at >= now() - ${`${days} days`}::interval group by 1`), "sessions");
        bump(await many(sql`select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day, count(*) as c from hiq_sim_matches where created_at >= now() - ${`${days} days`}::interval group by 1`), "matches");
        bump(await many(sql`select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day, count(*) as c from hiq_sim_drill_attempts where created_at >= now() - ${`${days} days`}::interval group by 1`), "drills");
        for (const r of await many(sql`
            select day, count(distinct id) as c from (
                select to_char(started_at at time zone 'utc', 'YYYY-MM-DD') as day, member_id as id from hiq_sim_sessions where started_at >= now() - ${`${days} days`}::interval
                union select to_char(created_at at time zone 'utc', 'YYYY-MM-DD'), host_id from hiq_sim_matches where created_at >= now() - ${`${days} days`}::interval
                union select to_char(created_at at time zone 'utc', 'YYYY-MM-DD'), member_id from hiq_sim_drill_attempts where created_at >= now() - ${`${days} days`}::interval) u group by 1`)) {
            const d = daily.get(String(r.day)); if (d) d.players = n(r.c);
        }

        const byGame = await many(sql`
            select g.game_type, g.table_id, coalesce(s.c, 0) as sessions, coalesce(m.c, 0) as matches from
              (select distinct game_type, table_id from hiq_sim_sessions union select distinct game_type, table_id from hiq_sim_matches) g
              left join (select game_type, table_id, count(*) as c from hiq_sim_sessions group by 1, 2) s on s.game_type = g.game_type and s.table_id = g.table_id
              left join (select game_type, table_id, count(*) as c from hiq_sim_matches group by 1, 2) m on m.game_type = g.game_type and m.table_id = g.table_id
            order by 1, 2`);
        const topPlayers = await many(sql`
            select mem.name, r.member_id, sum(r.sessions) as sessions, sum(r.matches) as matches, sum(r.wins) as wins, max(r.sim_rating) as rating, max(r.best_avg) as best_avg, max(r.updated_at) as last_at
            from hiq_sim_ratings r join hiq_members mem on mem.id = r.member_id
            group by 1, 2 order by (sum(r.sessions) + sum(r.matches)) desc, max(r.updated_at) desc limit 10`);
        const recentMatches = await many(sql`
            select m.id, m.status, m.game_type, m.table_id, m.is_public, m.end_reason, m.shots, m.created_at, m.finished_at,
                   h.name as host_name, g.name as guest_name
            from hiq_sim_matches m join hiq_members h on h.id = m.host_id left join hiq_members g on g.id = m.guest_id
            order by m.created_at desc limit 10`);

        return {
            generatedAt: new Date().toISOString(),
            days,
            sessions: {
                total: n(sessions.total), finished: n(sessions.finished), playing: n(sessions.playing), drillKind: n(sessions.drill_kind),
                players: n(sessions.players), shots: n(sessions.shots), innings: n(sessions.innings), mismatches: n(sessions.mismatches),
                d1: n(sessions.d1), d7: n(sessions.d7), d30: n(sessions.d30),
                avgInnings: sessions.avg_innings === null ? null : Number(sessions.avg_innings),
                avgMinutes: sessions.avg_minutes === null ? null : Number(sessions.avg_minutes),
            },
            matches: {
                total: n(matches.total), finished: n(matches.finished), playing: n(matches.playing), waiting: n(matches.waiting), canceled: n(matches.canceled),
                openRooms: n(matches.open_rooms), publicTotal: n(matches.public_total), passwordTotal: n(matches.password_total), invitedTotal: n(matches.invited_total),
                reality: n(matches.reality), players: n(matchPlayers.players), shots: n(matches.shots), mismatches: n(matches.mismatches),
                endReasons: { target: n(matches.end_target), inningCap: n(matches.end_inning_cap), resign: n(matches.end_resign), claim: n(matches.end_claim) },
                d1: n(matches.d1), d7: n(matches.d7), d30: n(matches.d30),
            },
            drills: { attempts: n(drills.attempts), successes: n(drills.successes), players: n(drills.players), weeks: n(drills.weeks), d7: n(drills.d7) },
            activePlayers: { d1: a1, d7: a7, d30: a30 },
            daily: [...daily.values()],
            byGame: byGame.map((r) => ({ gameType: String(r.game_type), tableId: String(r.table_id), sessions: n(r.sessions), matches: n(r.matches) })),
            topPlayers: topPlayers.map((r) => ({
                memberId: String(r.member_id), name: String(r.name), sessions: n(r.sessions), matches: n(r.matches), wins: n(r.wins),
                rating: n(r.rating), bestAvg: Number(r.best_avg ?? 0), lastAt: r.last_at ? new Date(String(r.last_at)).toISOString() : null,
            })),
            recentMatches: recentMatches.map((r) => ({
                id: String(r.id), status: String(r.status), gameType: String(r.game_type), tableId: String(r.table_id), isPublic: !!r.is_public,
                endReason: r.end_reason ? String(r.end_reason) : null, shots: n(r.shots), hostName: String(r.host_name), guestName: r.guest_name ? String(r.guest_name) : null,
                createdAt: new Date(String(r.created_at)).toISOString(), finishedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null,
            })),
        };
    }

    /**
     * 온라인 대전 랭킹(종목·테이블별). 배치(대전 3판) 를 마친 선수만 순위에 오르고, 전체 순위는 국가 필터와 무관하게 전역이다.
     * country 가 있으면 그 나라 행만 돌려준다(순위 번호는 전역 그대로 + 국가 순위). me 는 배치 전이어도 레이팅·판 수를 준다.
     */
    async rankLadder(memberId: string, gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR", country: string | null, limit = 100, placement = 3) {
        const ranked = sql`
            select r.member_id, mem.name, mem.country, r.sim_rating, r.matches, r.wins,
                   rank() over (order by r.sim_rating desc, r.wins desc, r.matches asc) as rank,
                   rank() over (partition by mem.country order by r.sim_rating desc, r.wins desc, r.matches asc) as country_rank
            from hiq_sim_ratings r join hiq_members mem on mem.id = r.member_id
            where r.game_type = ${gameType} and r.table_id = ${tableId} and r.matches >= ${placement}`;
        const rows = (await db.execute(sql`
            select * from (${ranked}) x where ${country}::text is null or x.country = ${country}::text order by x.rank asc limit ${limit}`)).rows as Record<string, unknown>[];
        const countries = (await db.execute(sql`
            select country, count(*)::int as players from (${ranked}) x group by country order by players desc, country asc nulls last`)).rows as Record<string, unknown>[];
        const [total] = (await db.execute(sql`select count(*)::int as n from (${ranked}) x`)).rows as { n: number }[];
        const [meRanked] = (await db.execute(sql`select * from (${ranked}) x where x.member_id = ${memberId}`)).rows as Record<string, unknown>[];
        const [meRow] = (await db.execute(sql`
            select r.sim_rating, r.matches, r.wins, mem.country from hiq_sim_ratings r join hiq_members mem on mem.id = r.member_id
            where r.member_id = ${memberId} and r.game_type = ${gameType} and r.table_id = ${tableId}`)).rows as Record<string, unknown>[];
        const [meCountry] = (await db.execute(sql`select country from hiq_members where id = ${memberId}`)).rows as { country: string | null }[];
        const n = (v: unknown) => Number(v ?? 0);
        const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
        return {
            rows: rows.map((r) => ({
                memberId: String(r.member_id), name: String(r.name), country: str(r.country),
                rating: n(r.sim_rating), matches: n(r.matches), wins: n(r.wins), rank: n(r.rank), countryRank: n(r.country_rank),
            })),
            total: n(total?.n),
            countries: countries.map((c) => ({ country: str(c.country), players: n(c.players) })),
            me: meRow ? {
                rating: n(meRow.sim_rating), matches: n(meRow.matches), wins: n(meRow.wins), country: str(meRow.country),
                rank: meRanked ? n(meRanked.rank) : null, countryRank: meRanked && meRanked.country ? n(meRanked.country_rank) : null,
            } : { rating: 1000, matches: 0, wins: 0, country: meCountry?.country ?? null, rank: null, countryRank: null },
        };
    }

    async getShots(sessionId: string): Promise<HiqSimShot[]> {
        return db.select().from(hiqSimShots)
            .where(eq(hiqSimShots.sessionId, sessionId))
            .orderBy(hiqSimShots.idx);
    }

    /**
     * 샷 한 개를 원자적으로 기록한다. 세션 행을 잠그고(FOR UPDATE) idx 가 현재 shots 와 같을 때만 쓴다.
     * 같은 idx 가 이미 있으면(재전송) 기존 행을 돌려준다 — 멱등.
     */
    async recordShot(a: RecordShotArgs): Promise<{ shot: HiqSimShot; duplicate: boolean }> {
        return db.transaction(async (tx) => {
            const [s] = await tx.select().from(hiqSimSessions)
                .where(eq(hiqSimSessions.id, a.sessionId)).for("update");
            if (!s) throw new Error("session not found");
            if (s.status !== "playing") throw new Error("session not playing");

            const [existing] = await tx.select().from(hiqSimShots)
                .where(and(eq(hiqSimShots.sessionId, a.sessionId), eq(hiqSimShots.idx, a.idx))).limit(1);
            if (existing) return { shot: existing, duplicate: true };
            if (a.idx !== s.shots) throw new Error(`idx mismatch: expected ${s.shots}, got ${a.idx}`);

            const [shot] = await tx.insert(hiqSimShots).values({
                sessionId: a.sessionId, idx: a.idx, playerIndex: a.playerIndex,
                preState: a.preState, input: a.input, hash: a.hash, clientHash: a.clientHash,
                eventCount: a.eventCount, outcomeCode: a.outcomeCode, points: a.points, cushions: a.cushions,
            }).returning();

            const mismatch = a.clientHash !== null && a.clientHash !== a.hash;
            await tx.update(hiqSimSessions).set({
                state: a.newState, balls: a.newBalls,
                score: a.score, innings: a.innings, highRun: a.highRun,
                shots: s.shots + 1,
                mismatches: mismatch ? s.mismatches + 1 : s.mismatches,
                lastShotAt: new Date(),
                ...(a.finished ? { status: "finished" as const, finishedAt: new Date() } : {}),
            }).where(eq(hiqSimSessions.id, a.sessionId));

            if (a.finished) await this.upsertSoloRating(tx, { ...s, score: a.score, innings: a.innings, highRun: a.highRun });
            return { shot, duplicate: false };
        });
    }

    /** 플레이어가 나가거나 포기. finished 로 마감하면 성적에 반영, abandoned 는 반영 안 함. */
    async closeSession(id: string, memberId: string, status: "finished" | "abandoned"): Promise<HiqSimSession | undefined> {
        return db.transaction(async (tx) => {
            const [s] = await tx.select().from(hiqSimSessions)
                .where(and(eq(hiqSimSessions.id, id), eq(hiqSimSessions.memberId, memberId))).for("update");
            if (!s) return undefined;
            if (s.status !== "playing") return s;
            const [row] = await tx.update(hiqSimSessions)
                .set({ status, finishedAt: new Date() })
                .where(eq(hiqSimSessions.id, id)).returning();
            if (status === "finished" && s.innings > 0) await this.upsertSoloRating(tx, s);
            return row;
        });
    }

    /** 솔로 세션 마감 → 시뮬 성적 집계. 이닝 0 이면 반영하지 않는다(에버리지 분모). */
    private async upsertSoloRating(tx: any, s: Pick<HiqSimSession, "memberId" | "gameType" | "tableId" | "score" | "innings" | "highRun" | "kind">) {
        if (s.kind !== "solo" || s.innings <= 0) return;
        const avg = s.score / s.innings;
        await tx.insert(hiqSimRatings).values({
            memberId: s.memberId, gameType: s.gameType, tableId: s.tableId,
            sessions: 1, totalScore: s.score, totalInnings: s.innings,
            bestAvg: avg, bestHighRun: s.highRun, updatedAt: new Date(),
        }).onConflictDoUpdate({
            target: [hiqSimRatings.memberId, hiqSimRatings.gameType, hiqSimRatings.tableId],
            set: {
                sessions: sql`${hiqSimRatings.sessions} + 1`,
                totalScore: sql`${hiqSimRatings.totalScore} + ${s.score}`,
                totalInnings: sql`${hiqSimRatings.totalInnings} + ${s.innings}`,
                bestAvg: sql`GREATEST(${hiqSimRatings.bestAvg}, ${avg})`,
                bestHighRun: sql`GREATEST(${hiqSimRatings.bestHighRun}, ${s.highRun})`,
                updatedAt: new Date(),
            },
        });
    }

    /** 방치된 playing 세션 정리: 마지막 샷(없으면 시작) 뒤 hours 시간이 지나면 abandoned. 성적 반영 없음. */
    async cleanupStale(hours = 6): Promise<number> {
        const rows = await db.update(hiqSimSessions)
            .set({ status: "abandoned", finishedAt: new Date() })
            .where(and(
                eq(hiqSimSessions.status, "playing"),
                sql`coalesce(${hiqSimSessions.lastShotAt}, ${hiqSimSessions.startedAt}) < now() - make_interval(hours => ${hours})`,
            ))
            .returning({ id: hiqSimSessions.id });
        return rows.length;
    }

    /** 연습 에버리지 랭킹. 최소 세션 수·이닝 수 조건은 호출자가 정한다. */
    async ladder(gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR", limit = 50) {
        return db.select({
            memberId: hiqSimRatings.memberId,
            name: hiqMembers.name,
            sessions: hiqSimRatings.sessions,
            bestAvg: hiqSimRatings.bestAvg,
            bestHighRun: hiqSimRatings.bestHighRun,
            avg: sql<number>`CASE WHEN ${hiqSimRatings.totalInnings} > 0 THEN ${hiqSimRatings.totalScore}::float / ${hiqSimRatings.totalInnings} ELSE 0 END`,
            updatedAt: hiqSimRatings.updatedAt,
        })
            .from(hiqSimRatings)
            .innerJoin(hiqMembers, eq(hiqMembers.id, hiqSimRatings.memberId))
            .where(and(eq(hiqSimRatings.gameType, gameType), eq(hiqSimRatings.tableId, tableId)))
            .orderBy(desc(hiqSimRatings.bestAvg), desc(hiqSimRatings.bestHighRun))
            .limit(limit);
    }


    async myRatings(memberId: string) {
        return db.select().from(hiqSimRatings).where(eq(hiqSimRatings.memberId, memberId));
    }

    async myRating(memberId: string, gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR") {
        const [row] = await db.select().from(hiqSimRatings)
            .where(and(eq(hiqSimRatings.memberId, memberId), eq(hiqSimRatings.gameType, gameType), eq(hiqSimRatings.tableId, tableId)))
            .limit(1);
        return row;
    }
}
