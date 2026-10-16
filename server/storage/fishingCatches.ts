/**
 * 낚시 조과의 신고 · 운영자 · 이의제기 길(2026-10-17 어드민 › 낚시 › 조과 검수 — 공개 전 필수). 산행 사진(storage/hikingPhotos)과 같은 모양.
 * 가림 = hidden_at(migrations/fishing_catches_v6.sql). 가린 조과는 랭킹 · 정출판 · 수족관 구경에서 빠지고, 올린 사람의 일지에만 '가려짐'으로 남는다.
 * 지우면 줄과 사진 파일(원본 · 썸네일)을 함께 — 부르는 쪽이 저장소에서 지운다(utils/blob deleteBlobs).
 * member_id 칸은 글자(text)다 — hiq_members.id 와 잇을 때 m.id::text 로.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);
// timestamp(시간대 없음)은 UTC 벽시계 — 글자로 읽어 Z 를 붙인다
const at = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS')`);
const utcDate = (v: unknown): Date | null => (v == null ? null : new Date(`${String(v).replace(" ", "T")}Z`));

/** 올린 사람이 그 조과를 다시 찾는 자리 — 일지 */
export const FISHING_CATCH_PAGE = "/fishing/log";

export interface FishingCatchRow {
    id: string; memberId: string; species: string; lengthCm: number | null; count: number; weightKg: number | null; place: string; day: string;
    url: string | null; thumbUrl: string | null; isPublic: boolean; tripId: string | null; crewId: string | null; note: string | null;
    hiddenAt: Date | null; appealText: string | null; appealAt: Date | null; createdAt: Date | null;
}
const row = (x: any): FishingCatchRow => ({
    id: x.id, memberId: String(x.member_id), species: String(x.species), lengthCm: x.length_cm == null ? null : Number(x.length_cm), count: Number(x.fish_count) || 1,
    weightKg: x.weight_kg == null ? null : Number(x.weight_kg), place: String(x.place ?? ""), day: String(x.fished_on ?? ""),
    url: x.photo_url ?? null, thumbUrl: x.thumb_url ?? null, isPublic: !!x.is_public, tripId: x.trip_id ?? null, crewId: x.crew_id ?? null, note: x.note ?? null,
    hiddenAt: utcDate(x.hidden_at), appealText: x.appeal_text ?? null, appealAt: utcDate(x.appeal_at), createdAt: utcDate(x.created_at_txt),
});

/** 조과 여러 개(신고 큐 미리보기) — 한 번의 질의로 */
export async function getMany(ids: readonly string[]): Promise<FishingCatchRow[]> {
    const list = Array.from(new Set(ids.filter((id) => UUID.test(id))));
    if (!list.length) return [];
    try {
        const r = await rows<any>(sql`
            select c.id::text as id, c.member_id, c.species, c.length_cm, c.fish_count, c.weight_kg, c.place, c.fished_on, c.photo_url, c.thumb_url, c.is_public, c.note,
                   c.trip_id::text as trip_id, t.crew_id::text as crew_id, c.appeal_text,
                   ${at("c.hidden_at")} as hidden_at, ${at("c.appeal_at")} as appeal_at, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') as created_at_txt
            from fishing_catches c left join fishing_trips t on t.id = c.trip_id
            where c.id in (${sql.join(list.map((id) => sql`${id}::uuid`), sql`, `)})`);
        return r.map(row);
    } catch (e) {
        if (missing(e)) return [];
        throw e;
    }
}
export async function get(id: string): Promise<FishingCatchRow | null> {
    return (await getMany([id]))[0] ?? null;
}

/** 신고가 쌓여 저절로 가린다 — 새로 가렸으면 올린 사람의 id(알림용), 이미 가려졌거나 없으면 null. 지우지 않는다(올린 사람이 보고 이의제기할 수 있게) */
export async function hideByReports(id: string): Promise<string | null> {
    const [r] = await rows<any>(sql`update fishing_catches set hidden_at = now() where id = ${id}::uuid and hidden_at is null returning member_id`);
    return r?.member_id ? String(r.member_id) : null;
}

/** 운영자의 가리기 · 다시 보이기(신고 큐) */
export async function setHidden(id: string, hidden: boolean): Promise<boolean> {
    const r = hidden
        ? await rows<any>(sql`update fishing_catches set hidden_at = now() where id = ${id}::uuid returning id`)
        : await rows<any>(sql`update fishing_catches set hidden_at = null where id = ${id}::uuid returning id`);
    return r.length > 0;
}

/** 운영자의 지우기 — 지운 사진의 주소(부르는 쪽이 저장소에서도 지운다) */
export async function remove(id: string): Promise<{ url: string | null; thumbUrl: string | null } | null> {
    const [r] = await rows<any>(sql`delete from fishing_catches where id = ${id}::uuid returning photo_url, thumb_url`);
    return r ? { url: r.photo_url ?? null, thumbUrl: r.thumb_url ?? null } : null;
}

/** 올린 사람의 이의제기 — 가려진 내 조과에만 */
export async function appealCatch(memberId: string, id: string, text: string): Promise<boolean> {
    const r = await rows<any>(sql`update fishing_catches set appeal_text = ${text}, appeal_at = now()
        where id = ${id}::uuid and member_id = ${memberId} and hidden_at is not null returning id`);
    return r.length > 0;
}

/**
 * 신고할 수 있는가 — 볼 수 있었던 사람만(라운드 사진과 같은 원칙): 공개 조과는 누구나, 정출에 붙인 조과는 그 크루원만.
 * 볼 수 있었으면 올린 사람의 id, 아니면 null.
 */
export async function reportableAuthor(id: string, reporterId: string): Promise<string | null> {
    const c = await get(id);
    if (!c) return null;
    if (c.isPublic) return c.memberId;
    if (!c.crewId) return null;
    const [m] = await rows<any>(sql`select 1 from hiq_crew_members where crew_id = ${c.crewId}::uuid and member_id = ${reporterId}::uuid and role <> 'pending'`);
    return m ? c.memberId : null;
}
