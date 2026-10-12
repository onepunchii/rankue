/**
 * 등산 — 정상에 오른 기록과 받은 것의 저장(2026-10-13). 규칙은 shared/hikingStamps, 표는 migrations/hiking_stamps.sql.
 *
 *  - addSummit()          정상 인증(위치로 확인됨) 또는 인증 없는 기록 한 줄. 같은 산 · 같은 날 · 같은 종류는 한 번만.
 *                         **좌표는 받지 않는다** — 부르는 쪽(라우트)이 거리를 재고 인증 여부와 거리 구간만 넘긴다.
 *  - listSummits()        내 기록(오래된 순).
 *  - syncHikingAwards()   기록에서 받았어야 할 것(와펜 · 핀) 가운데 아직 안 적은 것을 적는다. 준 것은 거두지 않는다.
 *  - listHikingAwards()   받은 것(받은 순서).
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { hikingAwardId, hikingAwardsDue, kstDay, type HikingAwardDue, type HikingAwardKind, type StampMountain, type Summit, type SummitBucket } from "../../shared/hikingStamps.js";

export interface SummitRow { id: string; mountainId: string; at: Date; verified: boolean; bucket: string | null }
export interface HikingAwardRow { id: string; kind: HikingAwardKind; key: string; serial: number; earnedAt: Date }

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const code = (e: any) => e?.code ?? e?.cause?.code;
const missingTable = (e: any) => code(e) === "42P01" || /relation "hiking_(summits|awards)" does not exist/.test(String(e?.message ?? ""));
const serialClash = (e: any) => code(e) === "23505" && /hiking_awards_kind_key_serial_unique/.test(`${e?.constraint ?? ""} ${e?.cause?.constraint ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""}`);
const SERIAL_RETRIES = 4;
// 날짜는 ISO 글자로 넘겨 UTC 벽시계로 적는다 — JS Date 를 그대로 넘기면 돌리는 기계의 시간대에 따라 어긋난다
const iso = (t: number) => new Date(t).toISOString();
// timestamp(시간대 없음) 칸은 UTC 벽시계다 — 읽을 때 Z 를 붙여 UTC 로 되돌린다
const utc = (v: unknown): Date => (v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}Z`));

export async function listSummits(memberId: string): Promise<SummitRow[]> {
    try {
        const r = await rows<any>(sql`select id::text as id, mountain_id, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as at, verified, bucket from hiking_summits where member_id = ${memberId}::uuid order by at, created_at`);
        return r.map((x) => ({ id: x.id, mountainId: x.mountain_id, at: utc(x.at), verified: !!x.verified, bucket: x.bucket ?? null }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

/** 한 줄 적는다 — 같은 산 · 같은 날 · 같은 종류가 이미 있으면 그대로 두고 false */
export async function addSummit(memberId: string, mountainId: string, input: { atMs: number; verified: boolean; bucket: SummitBucket | null }): Promise<boolean> {
    const r = await rows<any>(sql`
        insert into hiking_summits (member_id, mountain_id, at, verified, bucket, day)
        values (${memberId}::uuid, ${mountainId}, (${iso(input.atMs)}::timestamptz at time zone 'UTC'), ${input.verified}, ${input.bucket}, ${kstDay(input.atMs)})
        on conflict (member_id, mountain_id, day, verified) do nothing returning id`);
    return r.length > 0;
}

/** 인증 없이 적은 기록 한 줄을 지운다(본인 것만). 인증 도장은 지우지 않는다 */
export async function removeRecord(memberId: string, summitId: string): Promise<boolean> {
    const r = await rows<any>(sql`delete from hiking_summits where id = ${summitId}::uuid and member_id = ${memberId}::uuid and verified = false returning id`);
    return r.length > 0;
}

export async function listHikingAwards(memberId: string): Promise<HikingAwardRow[]> {
    try {
        const r = await rows<any>(sql`select kind, key, serial, to_char(earned_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as earned_at from hiking_awards where member_id = ${memberId}::uuid order by earned_at, created_at`);
        return r.map((x) => ({ id: hikingAwardId(x.kind, x.key), kind: x.kind, key: x.key, serial: Number(x.serial), earnedAt: utc(x.earned_at) }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

async function insertAward(memberId: string, d: HikingAwardDue): Promise<HikingAwardRow | null> {
    for (let attempt = 0; ; attempt++) {
        try {
            const r = await rows<any>(sql`
                insert into hiking_awards (member_id, kind, key, serial, earned_at)
                select ${memberId}::uuid, ${d.kind}, ${d.key}, coalesce(max(serial), 0) + 1, (${iso(d.earnedAt)}::timestamptz at time zone 'UTC')
                from hiking_awards where kind = ${d.kind} and key = ${d.key}
                on conflict (member_id, kind, key) do nothing
                returning serial`);
            return r[0] ? { id: hikingAwardId(d.kind, d.key), kind: d.kind, key: d.key, serial: Number(r[0].serial), earnedAt: new Date(d.earnedAt) } : null;
        } catch (e) {
            // 같은 순간에 다른 회원이 같은 순번을 잡았다 — 다시 센다
            if (serialClash(e) && attempt < SERIAL_RETRIES) continue;
            throw e;
        }
    }
}

/** 받았어야 할 것 가운데 아직 안 적은 것을 적는다. 새로 적은 것을 돌려준다(받은 순서) */
export async function syncHikingAwards(memberId: string, mountains: readonly StampMountain[], summits: readonly Summit[]): Promise<HikingAwardRow[]> {
    const due = hikingAwardsDue(mountains, summits);
    if (due.length === 0) return [];
    try {
        const have = new Set((await listHikingAwards(memberId)).map((a) => a.id));
        const fresh: HikingAwardRow[] = [];
        for (const d of due) {
            if (have.has(hikingAwardId(d.kind, d.key))) continue;
            const row = await insertAward(memberId, d);
            if (row) fresh.push(row);
        }
        return fresh;
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

// ── 산악회가 함께 오른 산 ─────────────────────────────────────────────
export interface CrewSummitRow { mountainId: string; firstDay: string; times: number; people: number }
/**
 * 산악회가 **함께** 오른 산 — 같은 날(한국 날짜) 그 산의 정상에서 인증한 회원이 CREW_TOGETHER 명 이상인 날이 있는 산.
 * 한 사람이 혼자 오른 산은 산악회의 도장이 아니다(그것은 그 사람의 도장이다). 가입 대기 중인 사람은 세지 않는다.
 * 돌려주는 것은 산 · 처음 함께 오른 날 · 함께 오른 횟수 · 가장 많이 모인 사람 수뿐 — 누가 올랐는지는 싣지 않는다.
 */
export const CREW_TOGETHER = 2;
export async function crewSummits(crewId: string): Promise<CrewSummitRow[]> {
    try {
        const r = await rows<any>(sql`
            with days as (
                select s.mountain_id, s.day, count(distinct s.member_id)::int as n
                from hiking_summits s
                join hiq_crew_members cm on cm.member_id = s.member_id and cm.crew_id = ${crewId}::uuid and cm.role <> 'pending'
                join hiq_crews c on c.id = cm.crew_id and c.sport_category = 'HIKING'
                where s.verified
                group by s.mountain_id, s.day
                having count(distinct s.member_id) >= ${CREW_TOGETHER}
            )
            select mountain_id, min(day) as first_day, count(*)::int as times, max(n)::int as people from days group by mountain_id order by min(day), mountain_id`);
        return r.map((x) => ({ mountainId: x.mountain_id, firstDay: String(x.first_day), times: Number(x.times), people: Number(x.people) }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
