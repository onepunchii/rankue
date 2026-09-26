/**
 * 시뮬레이터 v2 기록 저장소.
 *
 * 불변: 이 파일은 실전 경기 테이블·경기 마감 함수·회원 성적 컬럼(레이팅·에버리지·핸디)을 절대 건드리지 않는다.
 * sim.guard.test.ts 가 식별자 grep 으로 지킨다. 대전 성적은 hiqSimMatchRatings, 연습은 집계하지 않는다(2026-09-12).
 */
import { db } from "../db.js";
import { hiqSimSessions, hiqSimShots, hiqSimRatings, hiqMembers, hiqSimMatchRatings} from "../../shared/schema.js";
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
     * 어드민 "온라인게임" 대시보드(2026-09-08 오너 → 2026-09-26 개편: "이용 현황 대시보드가 중요").
     * hiq_sim_* 와 회원 이름·앱 접속만 읽는다. 실전 성적 테이블은 건드리지 않는다.
     *
     * 날짜는 모두 **한국 날짜**다(timestamp 칸은 UTC 로 저장 — golf.repo 와 같은 전제). 예전엔 일별 막대를 UTC 로 잘라
     * 한국 오전 9시 전 플레이가 전날로 갔고, 숫자 대부분이 전체 누적이라 기간(7·30·90일)을 바꿔도 그래프만 바뀌었다.
     * 지금은 모든 숫자가 기간 안의 값이고, 같은 길이의 **직전 기간**과 비교한다.
     *
     * "플레이" = 싱글 세션 시작 · 대전 방 만들기(호스트) · 대전 입장(게스트) · 드릴 시도. 이용자 = 플레이가 있는 회원.
     * 대전에는 끝난 시각 칸이 없다 — 대전 길이는 시작 → 마지막 샷(last_shot_at)으로 잰다.
     */
    async adminOverview(days = 30) {
        const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[];
        const one = async (q: ReturnType<typeof sql>) => (await rows(q))[0] ?? {};
        const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
        const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

        // 한국 오늘 0시(UTC 벽시계) · 기간 시작 · 직전 기간 시작
        const TODAY = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '9 hours')`;
        const P = sql`(${TODAY} - make_interval(days => ${days - 1}))`;
        const PP = sql`(${P} - make_interval(days => ${days}))`;
        const NOW = sql`(now() at time zone 'UTC')`;
        const KST_DAY = (col: ReturnType<typeof sql>) => sql`((${col}) at time zone 'UTC' at time zone 'Asia/Seoul')::date`;
        const ISO = (col: ReturnType<typeof sql>) => sql`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
        const PLAYS = sql`(
            select member_id as mid, started_at as at, 'single' as kind from hiq_sim_sessions
            union all select host_id, created_at, 'match' from hiq_sim_matches
            union all select guest_id, started_at, 'match' from hiq_sim_matches where guest_id is not null and started_at is not null
            union all select member_id, created_at, 'drill' from hiq_sim_drill_attempts
        )`;
        const SESSION_MIN = sql`least(extract(epoch from (coalesce(finished_at, last_shot_at, started_at) - started_at)), 14400) / 60`;
        const MATCH_MIN = sql`least(extract(epoch from (coalesce(finished_at, last_shot_at, started_at) - started_at)), 14400) / 60`;

        const [kpi, sess, mat, drill, live, today, funnel] = await Promise.all([
            one(sql`
                with plays as ${PLAYS}, firsts as (select mid, min(at) as first_at from plays group by mid)
                select
                  (select count(distinct mid) from plays where at >= ${P})::int as players,
                  (select count(distinct mid) from plays where at >= ${PP} and at < ${P})::int as players_prev,
                  (select count(*) from firsts where first_at >= ${P})::int as new_players,
                  (select count(*) from firsts where first_at >= ${PP} and first_at < ${P})::int as new_players_prev,
                  (select count(*) from plays where at >= ${P})::int as plays,
                  (select count(*) from plays where at >= ${PP} and at < ${P})::int as plays_prev,
                  -- 기간 안에 이틀 이상 온 이용자(재방문)
                  (select count(*) from (select mid from plays where at >= ${P} group by mid having count(distinct ${KST_DAY(sql`at`)}) >= 2) x)::int as returning_players,
                  (select count(*) from firsts)::int as players_all`),
            one(sql`
                select
                  count(*) filter (where started_at >= ${P})::int as total,
                  count(*) filter (where started_at >= ${PP} and started_at < ${P})::int as total_prev,
                  count(*) filter (where started_at >= ${P} and status = 'finished')::int as finished,
                  count(*) filter (where started_at >= ${P} and kind = 'drill')::int as drill_kind,
                  count(distinct member_id) filter (where started_at >= ${P})::int as players,
                  coalesce(sum(shots) filter (where started_at >= ${P}), 0)::int as shots,
                  coalesce(sum(mismatches) filter (where started_at >= ${P}), 0)::int as mismatches,
                  count(*) filter (where started_at >= ${P} and mismatches > 0)::int as mismatch_games,
                  avg(innings) filter (where started_at >= ${P} and status = 'finished' and innings > 0)::float as avg_innings,
                  avg(${SESSION_MIN}) filter (where started_at >= ${P} and status = 'finished')::float as avg_minutes,
                  coalesce(sum(${SESSION_MIN}) filter (where started_at >= ${P}), 0)::float as total_minutes,
                  coalesce(sum(${SESSION_MIN}) filter (where started_at >= ${PP} and started_at < ${P}), 0)::float as total_minutes_prev
                from hiq_sim_sessions where started_at >= ${PP}`),
            one(sql`
                select
                  count(*) filter (where created_at >= ${P})::int as created,
                  count(*) filter (where created_at >= ${PP} and created_at < ${P})::int as created_prev,
                  count(*) filter (where created_at >= ${P} and started_at is not null)::int as started,
                  count(*) filter (where created_at >= ${P} and status = 'finished')::int as finished,
                  count(*) filter (where created_at >= ${PP} and created_at < ${P} and status = 'finished')::int as finished_prev,
                  count(*) filter (where created_at >= ${P} and status = 'canceled')::int as canceled,
                  count(*) filter (where created_at >= ${P} and is_public)::int as public_rooms,
                  count(*) filter (where created_at >= ${P} and password_hash is not null)::int as password_rooms,
                  count(*) filter (where created_at >= ${P} and invited_id is not null)::int as invited,
                  count(*) filter (where created_at >= ${P} and aim_assist = false)::int as reality,
                  count(*) filter (where created_at >= ${P} and handicap)::int as handicap,
                  count(*) filter (where created_at >= ${P} and end_reason = 'target')::int as end_target,
                  count(*) filter (where created_at >= ${P} and end_reason = 'inningCap')::int as end_inning_cap,
                  count(*) filter (where created_at >= ${P} and end_reason = 'resign')::int as end_resign,
                  count(*) filter (where created_at >= ${P} and end_reason = 'claim')::int as end_claim,
                  coalesce(sum(shots) filter (where created_at >= ${P}), 0)::int as shots,
                  coalesce(sum(mismatches) filter (where created_at >= ${P}), 0)::int as mismatches,
                  count(*) filter (where created_at >= ${P} and mismatches > 0)::int as mismatch_games,
                  -- 방을 만들고 상대가 들어오기까지(초) · 대전 길이(분, 끝난 판)
                  percentile_cont(0.5) within group (order by extract(epoch from (started_at - created_at)))
                      filter (where created_at >= ${P} and started_at is not null)::float as median_wait_sec,
                  avg(${MATCH_MIN}) filter (where created_at >= ${P} and status = 'finished')::float as avg_minutes,
                  avg(shots) filter (where created_at >= ${P} and status = 'finished')::float as avg_shots,
                  (select count(distinct id) from (
                      select host_id as id from hiq_sim_matches where created_at >= ${P} and started_at is not null
                      union select guest_id from hiq_sim_matches where created_at >= ${P} and guest_id is not null and started_at is not null) u)::int as players
                from hiq_sim_matches where created_at >= ${PP}`),
            one(sql`
                select
                  count(*) filter (where created_at >= ${P})::int as attempts,
                  count(*) filter (where created_at >= ${PP} and created_at < ${P})::int as attempts_prev,
                  count(*) filter (where created_at >= ${P} and success)::int as successes,
                  count(distinct member_id) filter (where created_at >= ${P})::int as players
                from hiq_sim_drill_attempts where created_at >= ${PP}`),
            // 지금 — 싱글은 최근 10분 안에 샷, 대전은 진행 중이고 한쪽이라도 2분 안에 화면을 봄, 열린 방은 1시간 안에 만든 공개 대기 방
            one(sql`
                select
                  (select count(*) from hiq_sim_sessions where status = 'playing' and coalesce(last_shot_at, started_at) > ${NOW} - interval '10 minutes')::int as singles,
                  (select count(*) from hiq_sim_matches where status = 'playing'
                      and greatest(coalesce(host_seen_at, 'epoch'), coalesce(guest_seen_at, 'epoch'), coalesce(last_shot_at, 'epoch')) > ${NOW} - interval '2 minutes')::int as matches,
                  (select count(*) from hiq_sim_matches where status = 'waiting' and is_public and created_at > ${NOW} - interval '1 hour')::int as open_rooms,
                  (select count(distinct id) from (
                      select member_id as id from hiq_sim_sessions where status = 'playing' and coalesce(last_shot_at, started_at) > ${NOW} - interval '10 minutes'
                      union select host_id from hiq_sim_matches where status = 'playing' and coalesce(host_seen_at, 'epoch') > ${NOW} - interval '2 minutes'
                      union select guest_id from hiq_sim_matches where status = 'playing' and guest_id is not null and coalesce(guest_seen_at, 'epoch') > ${NOW} - interval '2 minutes') u)::int as players`),
            // 오늘 vs 어제 같은 시각까지
            one(sql`
                with plays as ${PLAYS}
                select
                  count(distinct mid) filter (where at >= ${TODAY})::int as players,
                  count(distinct mid) filter (where at >= ${TODAY} - interval '1 day' and at < ${NOW} - interval '1 day')::int as players_yday,
                  count(*) filter (where at >= ${TODAY} and kind = 'single')::int as singles,
                  count(*) filter (where at >= ${TODAY} and kind = 'match')::int as match_plays,
                  count(*) filter (where at >= ${TODAY} and kind = 'drill')::int as drills
                from plays where at >= ${TODAY} - interval '1 day'`),
            // 깔때기(기간) — 앱을 연 회원 → 온라인게임 → 대전 1판 → (전체) 대전 배치 완료
            one(sql`
                with plays as ${PLAYS}
                select
                  (select count(distinct member_id) from hiq_app_sessions where opened_at >= ${P})::int as app_users,
                  (select count(distinct mid) from plays where at >= ${P})::int as game_users,
                  (select count(distinct id) from (
                      select host_id as id from hiq_sim_matches where created_at >= ${P} and started_at is not null
                      union select guest_id from hiq_sim_matches where created_at >= ${P} and guest_id is not null and started_at is not null) u)::int as match_users,
                  (select count(distinct member_id) from hiq_sim_match_ratings where matches >= 3)::int as placed_all`),
        ]);

        // 일별(한국 날짜) — 빈 날도 0 으로
        const dayRows = await rows(sql`
            with plays as ${PLAYS}
            select to_char(${KST_DAY(sql`at`)}, 'YYYY-MM-DD') as day,
                   count(distinct mid)::int as players,
                   count(*) filter (where kind = 'single')::int as sessions,
                   count(*) filter (where kind = 'match')::int as match_plays,
                   count(*) filter (where kind = 'drill')::int as drills
            from plays where at >= ${P} group by 1`);
        const matchDays = await rows(sql`
            select to_char(${KST_DAY(sql`created_at`)}, 'YYYY-MM-DD') as day,
                   count(*)::int as created, count(*) filter (where status = 'finished')::int as finished
            from hiq_sim_matches where created_at >= ${P} group by 1`);
        const newDays = await rows(sql`
            with plays as ${PLAYS}, firsts as (select mid, min(at) as first_at from plays group by mid)
            select to_char(${KST_DAY(sql`first_at`)}, 'YYYY-MM-DD') as day, count(*)::int as c from firsts where first_at >= ${P} group by 1`);
        const todayKst = new Date(Date.now() + 9 * 3600_000);
        const daily: { day: string; players: number; newPlayers: number; sessions: number; matches: number; finishedMatches: number; drills: number }[] = [];
        const byDay = new Map(dayRows.map((r) => [String(r.day), r]));
        const mByDay = new Map(matchDays.map((r) => [String(r.day), r]));
        const nByDay = new Map(newDays.map((r) => [String(r.day), n(r.c)]));
        for (let k = days - 1; k >= 0; k--) {
            const day = new Date(todayKst.getTime() - k * 86_400_000).toISOString().slice(0, 10);
            const r = byDay.get(day), m = mByDay.get(day);
            daily.push({
                day, players: n(r?.players), newPlayers: nByDay.get(day) ?? 0,
                sessions: n(r?.sessions), matches: n(m?.created), finishedMatches: n(m?.finished), drills: n(r?.drills),
            });
        }

        // 요일 × 시간(한국) — 플레이 수. isodow 1=월 … 7=일
        const heat = await rows(sql`
            with plays as ${PLAYS}
            select extract(isodow from (at at time zone 'UTC' at time zone 'Asia/Seoul'))::int as dow,
                   extract(hour from (at at time zone 'UTC' at time zone 'Asia/Seoul'))::int as hour,
                   count(*)::int as c
            from plays where at >= ${P} group by 1, 2`);
        const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
        for (const h of heat) {
            const d = n(h.dow) - 1, hr = n(h.hour);
            if (d >= 0 && d < 7 && hr >= 0 && hr < 24) heatmap[d][hr] = n(h.c);
        }

        // 첫 플레이 주 코호트(최근 8주) — 다음 날(D1) · 7일 안(D7) 다시 왔나. 날짜는 한국 기준.
        const cohorts = await rows(sql`
            with plays as ${PLAYS},
            pd as (select mid, ${KST_DAY(sql`at`)} as d from plays group by 1, 2),
            f as (select mid, min(d) as fd from pd group by mid),
            today as (select (now() at time zone 'Asia/Seoul')::date as t)
            select to_char(date_trunc('week', fd), 'MM-DD') as week, count(*)::int as players,
                   count(*) filter (where exists (select 1 from pd where pd.mid = f.mid and pd.d = f.fd + 1))::int as d1,
                   count(*) filter (where exists (select 1 from pd where pd.mid = f.mid and pd.d > f.fd and pd.d <= f.fd + 7))::int as d7,
                   (max(fd) + 1 < (select t from today)) as d1_ready,
                   (max(fd) + 7 < (select t from today)) as d7_ready
            from f where fd >= (select t from today) - 56
            group by date_trunc('week', fd) order by date_trunc('week', fd) desc`);

        const byGame = await rows(sql`
            select g.game_type, g.table_id, coalesce(s.c, 0)::int as sessions, coalesce(m.c, 0)::int as matches from
              (select distinct game_type, table_id from hiq_sim_sessions where started_at >= ${P}
               union select distinct game_type, table_id from hiq_sim_matches where created_at >= ${P}) g
              left join (select game_type, table_id, count(*) as c from hiq_sim_sessions where started_at >= ${P} group by 1, 2) s on s.game_type = g.game_type and s.table_id = g.table_id
              left join (select game_type, table_id, count(*) as c from hiq_sim_matches where created_at >= ${P} group by 1, 2) m on m.game_type = g.game_type and m.table_id = g.table_id
            order by 3 + 4 desc, 1, 2`);

        // 기간 상위 이용자 — 플레이 수 기준. 레이팅은 대전 레이팅 최고값(종목 중).
        const topPlayers = await rows(sql`
            with plays as ${PLAYS}
            select p.mid as member_id, mem.name,
                   count(*) filter (where p.kind = 'single')::int as sessions,
                   count(*) filter (where p.kind = 'match')::int as matches,
                   count(*) filter (where p.kind = 'drill')::int as drills,
                   count(distinct ${KST_DAY(sql`p.at`)})::int as days,
                   (select count(*) from hiq_sim_matches w where w.winner_id = p.mid and w.created_at >= ${P})::int as wins,
                   (select max(r.rating) from hiq_sim_match_ratings r where r.member_id = p.mid)::int as rating,
                   (select max(r.best_avg) from hiq_sim_ratings r where r.member_id = p.mid)::float as best_avg,
                   ${ISO(sql`max(p.at)`)} as last_at
            from plays p join hiq_members mem on mem.id = p.mid
            where p.at >= ${P}
            group by p.mid, mem.name
            order by count(*) desc, max(p.at) desc limit 15`);

        const newPlayers = await rows(sql`
            with plays as ${PLAYS}, firsts as (select mid, min(at) as first_at from plays group by mid)
            select f.mid as member_id, mem.name, ${ISO(sql`f.first_at`)} as first_at,
                   (select count(*) from plays p where p.mid = f.mid)::int as plays,
                   (select kind from plays p where p.mid = f.mid order by p.at asc limit 1) as first_kind
            from firsts f join hiq_members mem on mem.id = f.mid
            where f.first_at >= ${P} order by f.first_at desc limit 15`);

        const recentMatches = await rows(sql`
            select m.id, m.status, m.game_type, m.table_id, m.is_public, (m.password_hash is not null) as has_password,
                   (m.invited_id is not null) as invited, m.aim_assist, m.end_reason, m.shots, m.mismatches,
                   ${ISO(sql`m.created_at`)} as created_at, ${ISO(sql`m.started_at`)} as started_at, ${ISO(sql`m.last_shot_at`)} as last_shot_at,
                   h.name as host_name, g.name as guest_name, w.name as winner_name
            from hiq_sim_matches m
            join hiq_members h on h.id = m.host_id
            left join hiq_members g on g.id = m.guest_id
            left join hiq_members w on w.id = m.winner_id
            order by m.created_at desc limit 20`);

        return {
            generatedAt: new Date().toISOString(),
            days,
            live: { players: n(live.players), singles: n(live.singles), matches: n(live.matches), openRooms: n(live.open_rooms) },
            today: {
                players: n(today.players), playersYesterdaySoFar: n(today.players_yday),
                singles: n(today.singles), matchPlays: n(today.match_plays), drills: n(today.drills),
            },
            kpi: {
                players: n(kpi.players), playersPrev: n(kpi.players_prev),
                newPlayers: n(kpi.new_players), newPlayersPrev: n(kpi.new_players_prev),
                plays: n(kpi.plays), playsPrev: n(kpi.plays_prev),
                returningPlayers: n(kpi.returning_players), playersAll: n(kpi.players_all),
                minutes: Math.round(n(sess.total_minutes) + 0), minutesPrev: Math.round(n(sess.total_minutes_prev)),
            },
            sessions: {
                total: n(sess.total), totalPrev: n(sess.total_prev), finished: n(sess.finished), drillKind: n(sess.drill_kind),
                players: n(sess.players), shots: n(sess.shots), mismatches: n(sess.mismatches), mismatchGames: n(sess.mismatch_games),
                avgInnings: numOrNull(sess.avg_innings), avgMinutes: numOrNull(sess.avg_minutes),
            },
            matches: {
                created: n(mat.created), createdPrev: n(mat.created_prev), started: n(mat.started),
                finished: n(mat.finished), finishedPrev: n(mat.finished_prev), canceled: n(mat.canceled),
                publicRooms: n(mat.public_rooms), passwordRooms: n(mat.password_rooms), invited: n(mat.invited),
                reality: n(mat.reality), handicap: n(mat.handicap), players: n(mat.players),
                shots: n(mat.shots), mismatches: n(mat.mismatches), mismatchGames: n(mat.mismatch_games),
                medianWaitSec: numOrNull(mat.median_wait_sec), avgMinutes: numOrNull(mat.avg_minutes), avgShots: numOrNull(mat.avg_shots),
                endReasons: { target: n(mat.end_target), inningCap: n(mat.end_inning_cap), resign: n(mat.end_resign), claim: n(mat.end_claim) },
            },
            drills: { attempts: n(drill.attempts), attemptsPrev: n(drill.attempts_prev), successes: n(drill.successes), players: n(drill.players) },
            funnel: { appUsers: n(funnel.app_users), gameUsers: n(funnel.game_users), matchUsers: n(funnel.match_users), placedAll: n(funnel.placed_all) },
            daily,
            heatmap,
            cohorts: cohorts.map((c) => ({
                week: String(c.week), players: n(c.players), d1: n(c.d1), d7: n(c.d7),
                d1Ready: c.d1_ready === true, d7Ready: c.d7_ready === true,
            })),
            byGame: byGame.map((r) => ({ gameType: String(r.game_type), tableId: String(r.table_id), sessions: n(r.sessions), matches: n(r.matches) })),
            topPlayers: topPlayers.map((r) => ({
                memberId: String(r.member_id), name: String(r.name ?? ""), sessions: n(r.sessions), matches: n(r.matches), drills: n(r.drills),
                days: n(r.days), wins: n(r.wins), rating: numOrNull(r.rating), bestAvg: Number(r.best_avg ?? 0), lastAt: str(r.last_at),
            })),
            newPlayers: newPlayers.map((r) => ({
                memberId: String(r.member_id), name: String(r.name ?? ""), firstAt: String(r.first_at ?? ""),
                plays: n(r.plays), firstKind: String(r.first_kind ?? "single"),
            })),
            recentMatches: recentMatches.map((r) => ({
                id: String(r.id), status: String(r.status), gameType: String(r.game_type), tableId: String(r.table_id),
                isPublic: r.is_public === true, hasPassword: r.has_password === true, invited: r.invited === true, reality: r.aim_assist === false,
                endReason: str(r.end_reason), shots: n(r.shots), mismatches: n(r.mismatches),
                hostName: String(r.host_name ?? ""), guestName: str(r.guest_name), winnerName: str(r.winner_name),
                createdAt: String(r.created_at ?? ""), startedAt: str(r.started_at), lastShotAt: str(r.last_shot_at),
            })),
        };
    }

    /**
     * 온라인 대전 랭킹(종목·테이블별). 배치(대전 3판) 를 마친 선수만 순위에 오르고, 전체 순위는 국가 필터와 무관하게 전역이다.
     * country 가 있으면 그 나라 행만 돌려준다(순위 번호는 전역 그대로 + 국가 순위). me 는 배치 전이어도 레이팅·판 수를 준다.
     */
    /**
     * 여러 사람의 온라인 대전 순위를 **한 번에**(초대 목록). 정렬·배치 조건은 rankLadder 와 **글자 그대로 같아야** 한다 —
     * 다르면 초대 목록의 #5 와 랭킹 화면의 #5 가 다른 사람이 된다.
     * 배치(matches < placement) 전이면 그 사람은 사다리에 없다 → Map 에 없음(화면이 순위를 안 그린다).
     */
    async ranksFor(memberIds: readonly string[], gameType: "3c" | "4c", placement = 3): Promise<Map<string, { rank: number; total: number; matches: number }>> {
        const out = new Map<string, { rank: number; total: number; matches: number }>();
        if (memberIds.length === 0) return out;
        const ids = [...new Set(memberIds)];
        const ranked = sql`
            select r.member_id, r.matches,
                   rank() over (order by r.rating desc, r.wins desc, r.matches asc) as rank,
                   count(*) over () as total
            from hiq_sim_match_ratings r join hiq_members mem on mem.id = r.member_id
            where r.game_type = ${gameType} and r.matches >= ${placement}`;
        const rows = (await db.execute(sql`
            select * from (${ranked}) x where x.member_id in ${ids}`)).rows as Record<string, unknown>[];
        for (const r of rows) out.set(String(r.member_id), { rank: Number(r.rank ?? 0), total: Number(r.total ?? 0), matches: Number(r.matches ?? 0) });
        return out;
    }

    async rankLadder(memberId: string, gameType: "3c" | "4c", country: string | null, limit = 100, placement = 3) {
        // 2026-09-12: 대대·중대를 합친 hiq_sim_match_ratings 를 본다(오너 지시). 테이블 구분은 사다리에서 사라졌다.
        const ranked = sql`
            select r.member_id, mem.name, mem.country, r.rating as sim_rating, r.matches, r.wins,
                   rank() over (order by r.rating desc, r.wins desc, r.matches asc) as rank,
                   rank() over (partition by mem.country order by r.rating desc, r.wins desc, r.matches asc) as country_rank
            from hiq_sim_match_ratings r join hiq_members mem on mem.id = r.member_id
            where r.game_type = ${gameType} and r.matches >= ${placement}`;
        const rows = (await db.execute(sql`
            select * from (${ranked}) x where ${country}::text is null or x.country = ${country}::text order by x.rank asc limit ${limit}`)).rows as Record<string, unknown>[];
        const countries = (await db.execute(sql`
            select country, count(*)::int as players from (${ranked}) x group by country order by players desc, country asc nulls last`)).rows as Record<string, unknown>[];
        const [total] = (await db.execute(sql`select count(*)::int as n from (${ranked}) x`)).rows as { n: number }[];
        const [meRanked] = (await db.execute(sql`select * from (${ranked}) x where x.member_id = ${memberId}`)).rows as Record<string, unknown>[];
        const [meRow] = (await db.execute(sql`
            select r.rating as sim_rating, r.matches, r.wins, mem.country from hiq_sim_match_ratings r join hiq_members mem on mem.id = r.member_id
            where r.member_id = ${memberId} and r.game_type = ${gameType}`)).rows as Record<string, unknown>[];
        const [meCountry] = (await db.execute(sql`select country from hiq_members where id = ${memberId}`)).rows as { country: string | null }[];
        const combos = (await db.execute(sql`
            select game_type,
                   count(*) filter (where matches >= ${placement})::int as ranked,
                   coalesce(max(matches) filter (where member_id = ${memberId}), 0)::int as my_matches
            from hiq_sim_match_ratings group by game_type`)).rows as Record<string, unknown>[];
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
            // 종목별 등재 인원과 내 대전 수 — 화면이 "사람이 있는 종목"을 기본으로 열고 칩에 인원을 적는다.
            // 2026-09-12 부터 테이블(대대·중대) 구분은 없다.
            combos: combos.map((c) => ({
                gameType: String(c.game_type) as "3c" | "4c",
                ranked: n(c.ranked), myMatches: n(c.my_matches),
            })),
        };
    }

    /**
     * 온라인 대전 랭킹에서 내 순위 — 종목별로(3쿠션·4구). 진입 화면의 '랭킹' 줄이 가장 높은 순위를 보여 준다.
     * 정렬·배치 조건은 rankLadder 와 **글자 그대로 같다**(회원 표와 inner join 까지) — 둘이 다르면 로비와 랭킹 화면의 숫자가 어긋난다.
     * 배치 전(대전 < placement)이면 rank 가 null 이고 matches 로 '배치 중 n/m' 을 보여 준다.
     * 2026-09-12: 대대·중대를 합쳐 판이 넷에서 둘로 줄었다(오너 지시).
     */
    async myMatchRanks(memberId: string, placement = 3): Promise<{ gameType: "3c" | "4c"; matches: number; wins: number; rank: number | null; total: number }[]> {
        const res = await db.execute(sql`
            with ranked as (
                select r.member_id, r.game_type,
                       rank() over (partition by r.game_type order by r.rating desc, r.wins desc, r.matches asc) as rank,
                       count(*) over (partition by r.game_type) as total
                from hiq_sim_match_ratings r join hiq_members mem on mem.id = r.member_id
                where r.matches >= ${placement}
            )
            select m.game_type, m.matches, m.wins, x.rank, x.total
            from hiq_sim_match_ratings m
            left join ranked x on x.member_id = m.member_id and x.game_type = m.game_type
            where m.member_id = ${memberId}`);
        return (res.rows as Record<string, unknown>[]).map((r) => ({
            gameType: String(r.game_type) as "3c" | "4c",
            matches: Number(r.matches ?? 0),
            // 무승부는 wins 에 포함돼 있다(오너 규칙) — 패 = matches - wins.
            wins: Number(r.wins ?? 0),
            rank: r.rank === null || r.rank === undefined ? null : Number(r.rank),
            total: Number(r.total ?? 0),
        }));
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

            // 2026-09-12 오너: "연습은 다 빼자, 공식 멀티경기만 적용" — 연습은 되돌리기로 이닝을 지울 수 있어
            // 에버리지·하이런이 실력이 아니라 되돌리기 사용량을 잰다. 세션 행(hiq_sim_sessions)은 그대로 남아 목록에는 보인다.
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
            // '완료'는 서버가 가진 세션 상태로 판정한다 — 화면이 finished 라고 보내도 판이 안 끝났으면 중단이다
            // (2026-09-26 검토: 2/25 에서 finished 를 보내면 완료로 남아 기록·통계를 흐렸다).
            if (status === "finished" && (s.state as { status?: string } | null)?.status !== "finished") status = "abandoned";
            const [row] = await tx.update(hiqSimSessions)
                .set({ status, finishedAt: new Date() })
                .where(eq(hiqSimSessions.id, id)).returning();
            // 연습은 성적 집계에 넣지 않는다(2026-09-12 오너) — 세션 행만 남는다
            return row;
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


    async myRatings(memberId: string) {
        return db.select().from(hiqSimRatings).where(eq(hiqSimRatings.memberId, memberId));
    }

    /**
     * 대전 레이팅(종목별, 대대·중대 통합 — 2026-09-12). 대시보드가 '공식 기록'을 여기서 읽는다.
     * hiq_sim_ratings 의 sim_rating 은 통합 전 값이라 더 이상 보지 않는다.
     */
    async myMatchRatings(memberId: string) {
        return db.select({
            gameType: hiqSimMatchRatings.gameType,
            rating: hiqSimMatchRatings.rating,
            matches: hiqSimMatchRatings.matches,
            wins: hiqSimMatchRatings.wins,
        }).from(hiqSimMatchRatings).where(eq(hiqSimMatchRatings.memberId, memberId));
    }

    async myRating(memberId: string, gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR") {
        const [row] = await db.select().from(hiqSimRatings)
            .where(and(eq(hiqSimRatings.memberId, memberId), eq(hiqSimRatings.gameType, gameType), eq(hiqSimRatings.tableId, tableId)))
            .limit(1);
        return row;
    }
}
