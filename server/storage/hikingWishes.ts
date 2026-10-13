/**
 * 등산 — 가고 싶은 산(2026-10-13). 규칙은 shared/hikingWish, 표는 migrations/hiking_wishes.sql.
 * 어느 회원이 어느 산을 담았는가뿐 — 위치도 계획한 날짜도 없다. 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { HIKING_WISH_MAX } from "../../shared/hikingWish.js";

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_wishes" does not exist/.test(String(e?.message ?? ""));

/** 내가 담은 산의 id — 새로 담은 것부터 */
export async function listWishes(memberId: string): Promise<string[]> {
    try {
        const r = await rows<{ mountain_id: string }>(sql`select mountain_id from hiking_wishes where member_id = ${memberId}::uuid order by created_at desc, mountain_id limit ${HIKING_WISH_MAX}`);
        return r.map((x) => x.mountain_id);
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

/** 담는다 — 이미 담았으면 그대로. 가득 찼으면 "full" */
export async function addWish(memberId: string, mountainId: string): Promise<"added" | "kept" | "full"> {
    const have = await rows<{ n: number; mine: number }>(sql`
        select count(*)::int as n, count(*) filter (where mountain_id = ${mountainId})::int as mine from hiking_wishes where member_id = ${memberId}::uuid`);
    if ((have[0]?.mine ?? 0) > 0) return "kept";
    if ((have[0]?.n ?? 0) >= HIKING_WISH_MAX) return "full";
    const r = await rows<any>(sql`insert into hiking_wishes (member_id, mountain_id) values (${memberId}::uuid, ${mountainId}) on conflict (member_id, mountain_id) do nothing returning mountain_id`);
    return r.length > 0 ? "added" : "kept";
}

/** 뺀다 — 내 것만 */
export async function removeWish(memberId: string, mountainId: string): Promise<boolean> {
    const r = await rows<any>(sql`delete from hiking_wishes where member_id = ${memberId}::uuid and mountain_id = ${mountainId} returning mountain_id`);
    return r.length > 0;
}

/** 계정을 지울 때 — 담아 둔 것을 다 뺀다 */
export async function removeAllWishes(memberId: string): Promise<void> {
    try { await db.execute(sql`delete from hiking_wishes where member_id = ${memberId}::uuid`); } catch (e) { if (!missingTable(e)) throw e; }
}
