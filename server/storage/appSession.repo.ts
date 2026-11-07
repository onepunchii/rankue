/**
 * 앱 접속 세션 저장·집계(2026-09-13 오너: "회원들이 우리 앱에 얼마나 잔류하는지").
 * 규칙 숫자(하트비트·유휴 종료·상한)는 shared/appSession 이 정본이다 — SQL 에도 같은 값을 넣는다.
 */
import { db } from "../db.js";
import { hiqAppSessions } from "../../shared/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { IDLE_END_MS, MAX_SESSION_MS, type AppPlatform } from "../../shared/appSession.js";
import { RETENTION_DAYS, type RetentionDay, type RetentionGroup, type RetentionReport } from "../../shared/retention.js";

/** 접속 기록이 쌓이기 시작한 날 — 그 전 가입자는 재방문을 셀 수 없다(shared/retention) */
export const RETENTION_SINCE = "2026-09-13";
const SPORT_LABEL: Readonly<Record<string, string>> = { BILLIARDS: "당구", GOLF: "골프", HIKING: "등산", FISHING: "낚시", NONE: "종목 미정" };

/** SQL 에서 세션 끝 = coalesce(closed_at, last_seen_at), 길이는 상한으로 자른다(잠든 폰의 8시간짜리 방지). */
const SESSION_END = sql`coalesce(closed_at, last_seen_at)`;
const SESSION_SEC = sql`least(extract(epoch from (${SESSION_END} - opened_at)), ${MAX_SESSION_MS / 1000})`;
/**
 * 한국 날짜의 0시를 UTC 벽시계로(timestamp 컬럼은 UTC 로 저장된다 — golf.repo 와 같은 전제).
 * `opened_at >= 이것` 으로 거르면 (member_id, opened_at) 인덱스를 그대로 탄다. 서버(Vercel)는 UTC 라
 * JS 의 setHours(0) 는 한국 오전 9시다 — "오늘"은 반드시 여기서 자른다.
 */
const KST_TODAY_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '9 hours')`;

export type TodayActiveMember = {
    id: string;
    name: string;
    phone: string;
    countryCode: string | null;
    platform: string;
    sessions: number;
    minutes: number;
    firstAt: string;
    lastAt: string;
    /** 지금도 앱을 보고 있나(닫힘 없음 + 마지막 신호가 유휴 종료 시간 안) */
    live: boolean;
    /** 오늘(한국) 가입 */
    isNew: boolean;
};

export class AppSessionRepository {
    /** 앱이 앞으로 왔다. 같은 회원의 열린 세션이 유휴 종료 시간 안에 있으면 새로 열지 않고 그것을 잇는다(탭 전환·잠깐 나갔다 옴). */
    async open(memberId: string, platform: AppPlatform): Promise<{ id: string }> {
        const [live] = await db.select({ id: hiqAppSessions.id }).from(hiqAppSessions)
            .where(and(
                eq(hiqAppSessions.memberId, memberId),
                sql`${hiqAppSessions.closedAt} is null`,
                sql`${hiqAppSessions.lastSeenAt} > now() - make_interval(secs => ${IDLE_END_MS / 1000})`,
            ))
            .orderBy(sql`${hiqAppSessions.openedAt} desc`)
            .limit(1);
        if (live) {
            await db.update(hiqAppSessions).set({ lastSeenAt: new Date() }).where(eq(hiqAppSessions.id, live.id));
            return { id: live.id };
        }
        const [row] = await db.insert(hiqAppSessions).values({ memberId, platform }).returning({ id: hiqAppSessions.id });
        return { id: row.id };
    }

    async touch(id: string, memberId: string): Promise<void> {
        await db.update(hiqAppSessions).set({ lastSeenAt: new Date() })
            .where(and(eq(hiqAppSessions.id, id), eq(hiqAppSessions.memberId, memberId), sql`${hiqAppSessions.closedAt} is null`));
    }

    async close(id: string, memberId: string): Promise<void> {
        await db.update(hiqAppSessions).set({ closedAt: new Date(), lastSeenAt: new Date() })
            .where(and(eq(hiqAppSessions.id, id), eq(hiqAppSessions.memberId, memberId), sql`${hiqAppSessions.closedAt} is null`));
    }

    /**
     * 어드민 요약: DAU/WAU/MAU(앱을 연 회원 수) + 가입 코호트 리텐션.
     * 리텐션 = 그 주에 가입한 회원 중 가입 뒤 N일 안에 앱을 한 번이라도 연 비율. 가입 당일은 D1 에 넣지 않는다(가입하려면 열어야 하니까).
     */
    async summary(weeks = 8) {
        const [active] = (await db.execute(sql`
            select count(distinct member_id) filter (where opened_at >= now() - interval '1 day')::int as dau,
                   count(distinct member_id) filter (where opened_at >= now() - interval '7 days')::int as wau,
                   count(distinct member_id) filter (where opened_at >= now() - interval '30 days')::int as mau,
                   count(*) filter (where opened_at >= now() - interval '7 days')::int as sessions7,
                   coalesce(avg(${SESSION_SEC}) filter (where opened_at >= now() - interval '7 days'), 0)::float as avg_sec7
            from hiq_app_sessions`)).rows as Record<string, unknown>[];
        const cohorts = (await db.execute(sql`
            with m as (
                select id, date_trunc('week', created_at) as wk, created_at from hiq_members
                where created_at >= now() - make_interval(weeks => ${weeks})
            )
            select to_char(wk, 'MM-DD') as week, count(*)::int as signed,
                   count(*) filter (where exists (select 1 from hiq_app_sessions s where s.member_id = m.id
                        and s.opened_at >= m.created_at + interval '1 day' and s.opened_at < m.created_at + interval '2 days'))::int as d1,
                   count(*) filter (where exists (select 1 from hiq_app_sessions s where s.member_id = m.id
                        and s.opened_at >= m.created_at + interval '1 day' and s.opened_at < m.created_at + interval '8 days'))::int as d7,
                   count(*) filter (where exists (select 1 from hiq_app_sessions s where s.member_id = m.id
                        and s.opened_at >= m.created_at + interval '1 day' and s.opened_at < m.created_at + interval '31 days'))::int as d30,
                   (min(created_at) + interval '31 days' <= now()) as d30_ready,
                   (min(created_at) + interval '8 days' <= now()) as d7_ready
            from m group by wk order by wk desc`)).rows as Record<string, unknown>[];
        const n = (v: unknown) => Number(v ?? 0);
        const [kst] = (await db.execute(sql`
            select count(distinct member_id) filter (where opened_at >= ${KST_TODAY_START})::int as today,
                   count(distinct member_id) filter (where opened_at < ${KST_TODAY_START})::int as yesterday
            from hiq_app_sessions where opened_at >= ${KST_TODAY_START} - interval '1 day'`)).rows as Record<string, unknown>[];
        return {
            // dau 는 최근 24시간(굴러가는 창), today 는 한국 날짜 0시부터 — 화면의 "오늘"은 today 를 쓴다.
            today: n(kst?.today), yesterday: n(kst?.yesterday),
            dau: n(active?.dau), wau: n(active?.wau), mau: n(active?.mau),
            sessions7: n(active?.sessions7), avgMinutes7: Math.round(n(active?.avg_sec7) / 60),
            cohorts: cohorts.map((c) => ({
                week: String(c.week), signed: n(c.signed), d1: n(c.d1), d7: n(c.d7), d30: n(c.d30),
                d7Ready: c.d7_ready === true, d30Ready: c.d30_ready === true,
            })),
        };
    }

    /**
     * 회원 리텐션 — 업계와 같은 '그날' 셈(정의는 shared/retention 머리말). 2026-11-07 오너 "타 플랫폼 대비 리텐션" → 어드민 회원 화면 '회원이 다시 오나요'.
     * 사람 단위(profile_id) · 탈퇴 제외 · RETENTION_SINCE 이후 가입. 앱/웹은 처음 연 곳, 종목은 처음 고른 주 종목.
     */
    async retention(): Promise<RetentionReport> {
        const cols = RETENTION_DAYS.map((n) => sql.raw(`
            count(distinct pid) filter (where signed + interval '${n + 1} days' <= now()) as e${n},
            count(distinct pid) filter (where signed + interval '${n + 1} days' <= now() and day = ${n}) as r${n}`));
        const rows = (await db.execute(sql`
            with people as (
                select coalesce(profile_id::text, id::text) as pid, min(created_at) as signed,
                       (array_agg(primary_sport order by created_at) filter (where primary_sport is not null))[1] as sport
                from hiq_members where phone is null or phone not like 'del-%'
                group by 1
            ),
            mrow as (select id, coalesce(profile_id::text, id::text) as pid from hiq_members),
            s as (select m.pid, a.opened_at, a.platform from hiq_app_sessions a join mrow m on m.id = a.member_id),
            firstp as (select distinct on (pid) pid, platform from s order by pid, opened_at),
            d as (
                select p.pid, p.signed, coalesce(p.sport, 'NONE') as sport,
                       case when f.platform in ('ios', 'android') then 'app' when f.platform = 'web' then 'web' else 'none' end as plat,
                       floor(extract(epoch from (s.opened_at - p.signed)) / 86400)::int as day
                from people p
                left join s on s.pid = p.pid and s.opened_at >= p.signed
                left join firstp f on f.pid = p.pid
                where p.signed >= ${RETENTION_SINCE}::timestamp
            )
            select g.kind, g.key, count(distinct pid)::int as signed, ${sql.join(cols, sql`, `)}
            from d cross join lateral (values ('all', 'all'), ('plat', plat), ('sport', sport)) as g(kind, key)
            group by 1, 2`)).rows as Record<string, unknown>[];
        const n = (v: unknown) => Number(v ?? 0);
        const group = (kind: string, key: string, label: string): RetentionGroup => {
            const r = rows.find((x) => x.kind === kind && x.key === key);
            const days = Object.fromEntries(RETENTION_DAYS.map((d) => [d, { eligible: n(r?.[`e${d}`]), returned: n(r?.[`r${d}`]) }])) as Record<RetentionDay, { eligible: number; returned: number }>;
            return { key, label, signed: n(r?.signed), days };
        };
        const [st] = (await db.execute(sql`
            with mrow as (select id, coalesce(profile_id::text, id::text) as pid from hiq_members),
            s as (select m.pid, a.opened_at, (a.opened_at at time zone 'UTC' at time zone 'Asia/Seoul')::date as day
                  from hiq_app_sessions a join mrow m on m.id = a.member_id where a.platform <> 'web' and a.opened_at >= now() - interval '30 days')
            select (select coalesce(avg(c), 0) from (select count(distinct pid) c from s where opened_at >= now() - interval '28 days' group by day) x)::float as avg_daily,
                   (select count(distinct pid) from s)::int as monthly,
                   (select count(*) from (select pid from s group by pid having count(distinct day) = 1) y)::int as one_day`)).rows as Record<string, unknown>[];
        return {
            since: RETENTION_SINCE,
            all: group("all", "all", "전체"),
            app: group("plat", "app", "앱으로 시작"),
            web: group("plat", "web", "웹으로 시작"),
            sports: ["BILLIARDS", "GOLF", "HIKING", "FISHING", "NONE"]
                .map((k) => group("sport", k, SPORT_LABEL[k]))
                .filter((g) => g.signed > 0),
            stickiness: { appAvgDaily: Math.round(n(st?.avg_daily) * 10) / 10, appMonthly: n(st?.monthly), appOneDay: n(st?.one_day) },
        };
    }

    /**
     * 오늘(한국 날짜) 앱을 연 회원 목록 + 시간대별 접속자 수 + 어제 같은 시각까지와의 비교.
     * 어드민 "오늘 접속" 화면용(2026-09-26 오너: "오늘 활성화 사용자 보기 편하게").
     */
    async today(limit = 500): Promise<{
        total: number;
        live: number;
        newToday: number;
        yesterdaySoFar: number;
        hourly: number[];
        platforms: Record<string, number>;
        members: TodayActiveMember[];
    }> {
        const rows = (await db.execute(sql`
            with s as (
                select member_id, platform, opened_at, ${SESSION_END} as ended, closed_at, last_seen_at, ${SESSION_SEC} as sec
                from hiq_app_sessions where opened_at >= ${KST_TODAY_START}
            )
            select m.id, m.name, m.phone, p.country_code,
                   count(*)::int as sessions,
                   coalesce(round(sum(s.sec) / 60), 0)::int as minutes,
                   to_char(min(s.opened_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first_at,
                   to_char(max(s.ended), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_at,
                   bool_or(s.closed_at is null and s.last_seen_at > now() at time zone 'UTC' - make_interval(secs => ${IDLE_END_MS / 1000})) as live,
                   (m.created_at >= ${KST_TODAY_START}) as is_new,
                   (array_agg(s.platform order by s.opened_at desc))[1] as platform
            from s join hiq_members m on m.id = s.member_id
            left join profiles p on p.id = m.profile_id
            group by m.id, m.name, m.phone, m.created_at, p.country_code
            order by max(s.ended) desc
            limit ${limit}`)).rows as Record<string, unknown>[];
        const hourlyRows = (await db.execute(sql`
            select extract(hour from (opened_at at time zone 'UTC' at time zone 'Asia/Seoul'))::int as h,
                   count(distinct member_id)::int as n
            from hiq_app_sessions where opened_at >= ${KST_TODAY_START}
            group by 1`)).rows as Record<string, unknown>[];
        const [cmp] = (await db.execute(sql`
            select
              (select count(distinct member_id)::int from hiq_app_sessions
                 where opened_at >= ${KST_TODAY_START}) as total,
              (select count(distinct member_id)::int from hiq_app_sessions
                 where opened_at >= ${KST_TODAY_START} - interval '1 day'
                   and opened_at < now() at time zone 'UTC' - interval '1 day') as yesterday_so_far,
              (select count(*)::int from hiq_members where created_at >= ${KST_TODAY_START}) as new_today`)).rows as Record<string, unknown>[];

        const hourly = Array.from({ length: 24 }, () => 0);
        for (const r of hourlyRows) {
            const h = Number(r.h);
            if (h >= 0 && h < 24) hourly[h] = Number(r.n ?? 0);
        }
        const members: TodayActiveMember[] = rows.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            phone: String(r.phone ?? ""),
            countryCode: (r.country_code as string | null) ?? null,
            platform: String(r.platform ?? "web"),
            sessions: Number(r.sessions ?? 0),
            minutes: Number(r.minutes ?? 0),
            firstAt: String(r.first_at ?? ""),
            lastAt: String(r.last_at ?? ""),
            live: r.live === true,
            isNew: r.is_new === true,
        }));
        const platforms: Record<string, number> = {};
        for (const m of members) platforms[m.platform] = (platforms[m.platform] ?? 0) + 1;
        return {
            total: Number(cmp?.total ?? members.length),
            live: members.filter((m) => m.live).length,
            newToday: Number(cmp?.new_today ?? 0),
            yesterdaySoFar: Number(cmp?.yesterday_so_far ?? 0),
            hourly,
            platforms,
            members,
        };
    }
}
