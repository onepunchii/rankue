/**
 * 코리아둘레길 코스 도장의 저장(2026-10-21). 규칙은 shared/trailStamps, 표는 migrations/hiking_trail_stamps.sql.
 *
 *  - addTrailCheck()    끝에서 확인한 한 줄(어느 끝 · 때). **좌표는 받지 않는다** — 라우트가 거리를 재고 끝만 넘긴다.
 *  - recentTrailChecks() 이 코스의 최근 확인(도장 판단용 — 36시간 창 안)
 *  - addTrailStamp()    도장 한 줄. 이미 있으면 그대로(처음 받은 것이 남는다) — 새로 찍혔으면 true
 *  - myTrailStamps()    내 도장 전부 · myOpenTrailChecks() 도장이 안 된 최근 출발 확인
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { TRAIL_PAIR_WINDOW_H, type TrailEnd } from "../../shared/trailStamps.js";

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_trail_(checks|stamps)" does not exist/.test(String(e?.message ?? ""));
const iso = (t: number) => new Date(t).toISOString();
const utcMs = (v: unknown): number => (v instanceof Date ? v.getTime() : Date.parse(`${String(v).replace(" ", "T")}Z`));

export interface TrailCheckRow { courseId: string; route: string; key: string; end: TrailEnd; atMs: number }
export interface TrailStampRow { courseId: string; route: string; key: string; firstEnd: TrailEnd; startedMs: number; doneMs: number }

export async function addTrailCheck(memberId: string, c: { id: string; route: string; key: string }, end: TrailEnd, atMs: number): Promise<void> {
    await db.execute(sql`insert into hiking_trail_checks (member_id, course_id, route, course_key, end_at, at)
        values (${memberId}::uuid, ${c.id}, ${c.route}, ${c.key}, ${end}, (${iso(atMs)}::timestamptz at time zone 'UTC'))`);
}

/** 하루에 남기는 확인의 수 — 누름 장난을 막는 상한(정상 인증은 산마다 하루 한 번) */
export async function trailChecksToday(memberId: string, sinceMs: number): Promise<number> {
    try {
        const r = await rows<any>(sql`select count(*)::int as n from hiking_trail_checks where member_id = ${memberId}::uuid and at >= (${iso(sinceMs)}::timestamptz at time zone 'UTC')`);
        return Number(r[0]?.n ?? 0);
    } catch (e) { if (missingTable(e)) return 0; throw e; }
}

export async function recentTrailChecks(memberId: string, courseId: string, nowMs: number): Promise<TrailCheckRow[]> {
    const since = nowMs - TRAIL_PAIR_WINDOW_H * 3_600_000;
    try {
        const r = await rows<any>(sql`select course_id, route, course_key, end_at, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as at from hiking_trail_checks
            where member_id = ${memberId}::uuid and course_id = ${courseId} and at >= (${iso(since)}::timestamptz at time zone 'UTC') order by at`);
        return r.map((x) => ({ courseId: x.course_id, route: x.route, key: x.course_key, end: x.end_at, atMs: utcMs(x.at) }));
    } catch (e) { if (missingTable(e)) return []; throw e; }
}

export async function addTrailStamp(memberId: string, c: { id: string; route: string; key: string }, from: { end: TrailEnd; atMs: number }, doneMs: number): Promise<boolean> {
    const r = await rows<any>(sql`insert into hiking_trail_stamps (member_id, course_id, route, course_key, first_end, started_at, done_at)
        values (${memberId}::uuid, ${c.id}, ${c.route}, ${c.key}, ${from.end}, (${iso(from.atMs)}::timestamptz at time zone 'UTC'), (${iso(doneMs)}::timestamptz at time zone 'UTC'))
        on conflict (member_id, course_id) do nothing returning course_id`);
    return r.length > 0;
}

export async function myTrailStamps(memberId: string): Promise<TrailStampRow[]> {
    try {
        const r = await rows<any>(sql`select course_id, route, course_key, first_end, to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as s, to_char(done_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as d
            from hiking_trail_stamps where member_id = ${memberId}::uuid order by done_at`);
        return r.map((x) => ({ courseId: x.course_id, route: x.route, key: x.course_key, firstEnd: x.first_end, startedMs: utcMs(x.s), doneMs: utcMs(x.d) }));
    } catch (e) { if (missingTable(e)) return []; throw e; }
}

/** 도장이 안 된 코스의 최근 출발 확인(36시간 안, 코스마다 가장 이른 것) */
export async function myOpenTrailChecks(memberId: string, nowMs: number): Promise<TrailCheckRow[]> {
    const since = nowMs - TRAIL_PAIR_WINDOW_H * 3_600_000;
    try {
        const r = await rows<any>(sql`select distinct on (c.course_id) c.course_id, c.route, c.course_key, c.end_at, to_char(c.at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as at
            from hiking_trail_checks c
            where c.member_id = ${memberId}::uuid and c.at >= (${iso(since)}::timestamptz at time zone 'UTC')
              and not exists (select 1 from hiking_trail_stamps s where s.member_id = c.member_id and s.course_id = c.course_id)
            order by c.course_id, c.at`);
        return r.map((x) => ({ courseId: x.course_id, route: x.route, key: x.course_key, end: x.end_at, atMs: utcMs(x.at) }));
    } catch (e) { if (missingTable(e)) return []; throw e; }
}
