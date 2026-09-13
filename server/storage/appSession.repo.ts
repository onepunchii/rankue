/**
 * 앱 접속 세션 저장·집계(2026-09-13 오너: "회원들이 우리 앱에 얼마나 잔류하는지").
 * 규칙 숫자(하트비트·유휴 종료·상한)는 shared/appSession 이 정본이다 — SQL 에도 같은 값을 넣는다.
 */
import { db } from "../db.js";
import { hiqAppSessions } from "../../shared/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { IDLE_END_MS, MAX_SESSION_MS, type AppPlatform } from "../../shared/appSession.js";

/** SQL 에서 세션 끝 = coalesce(closed_at, last_seen_at), 길이는 상한으로 자른다(잠든 폰의 8시간짜리 방지). */
const SESSION_END = sql`coalesce(closed_at, last_seen_at)`;
const SESSION_SEC = sql`least(extract(epoch from (${SESSION_END} - opened_at)), ${MAX_SESSION_MS / 1000})`;

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
        return {
            dau: n(active?.dau), wau: n(active?.wau), mau: n(active?.mau),
            sessions7: n(active?.sessions7), avgMinutes7: Math.round(n(active?.avg_sec7) / 60),
            cohorts: cohorts.map((c) => ({
                week: String(c.week), signed: n(c.signed), d1: n(c.d1), d7: n(c.d7), d30: n(c.d30),
                d7Ready: c.d7_ready === true, d30Ready: c.d30_ready === true,
            })),
        };
    }
}
