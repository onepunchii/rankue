/**
 * 등산 — 산행 한 번의 요약 저장(2026-10-13). 규칙은 shared/hikingTrail(cleanTrip), 표는 migrations/hiking_trips.sql.
 * **좌표는 받지도 저장하지도 않는다** — 언제 · 어느 산 · 어느 코스 · 길 위의 거리 · 오른 높이 · 정상에 닿았는가뿐.
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import type { TripInput } from "../../shared/hikingTrail.js";

export interface TripRow { id: string; mountainId: string; courseId: string | null; startedAt: Date; endedAt: Date; km: number; gainM: number; reachedSummit: boolean }

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_trips" does not exist/.test(String(e?.message ?? ""));
// 날짜는 ISO 글자로 넘겨 UTC 벽시계로 적고, 읽을 때 Z 를 붙여 되돌린다(storage/hikingStamps 와 같은 규칙)
const iso = (t: number) => new Date(t).toISOString();
const utc = (v: unknown): Date => (v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}Z`));

/** 한 번 적는다 — 같은 시작 시각의 산행이 이미 있으면 그대로 두고 false */
export async function addTrip(memberId: string, t: TripInput): Promise<boolean> {
    const r = await rows<any>(sql`
        insert into hiking_trips (member_id, mountain_id, course_id, started_at, ended_at, km, gain_m, reached_summit)
        values (${memberId}::uuid, ${t.mountainId}, ${t.courseId}, (${iso(t.startedAt)}::timestamptz at time zone 'UTC'), (${iso(t.endedAt)}::timestamptz at time zone 'UTC'), ${t.km}, ${t.gainM}, ${t.reachedSummit})
        on conflict (member_id, started_at) do nothing returning id`);
    return r.length > 0;
}

/** 내 산행(새 것부터) */
export async function listTrips(memberId: string, limit = 50): Promise<TripRow[]> {
    try {
        const r = await rows<any>(sql`
            select id::text as id, mountain_id, course_id, to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as started_at, to_char(ended_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as ended_at, km, gain_m, reached_summit
            from hiking_trips where member_id = ${memberId}::uuid order by started_at desc limit ${limit}`);
        return r.map((x) => ({ id: x.id, mountainId: x.mountain_id, courseId: x.course_id ?? null, startedAt: utc(x.started_at), endedAt: utc(x.ended_at), km: Number(x.km), gainM: Number(x.gain_m), reachedSummit: !!x.reached_summit }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
