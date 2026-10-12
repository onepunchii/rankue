/**
 * 등산 — 산행 사진의 저장(2026-10-13). 규칙은 shared/hikingPhotos, 표는 migrations/hiking_photos.sql.
 * 올린 사람의 것만 읽고 지운다(첫 걸음은 내 사진첩이다 — 남에게 보이는 목록이 없다). 좌표는 받지도 저장하지도 않는다.
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import type { HikingPhoto } from "../../shared/hikingPhotos.js";

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_photos" does not exist/.test(String(e?.message ?? ""));
// timestamp(시간대 없음) 칸은 UTC 벽시계다 — 글자로 읽어 Z 를 붙인다(storage/hikingStamps 와 같은 규칙)
const out = (x: any): HikingPhoto => ({ id: x.id, mountainId: x.mountain_id, url: x.url, thumbUrl: x.thumb_url, width: Number(x.width), height: Number(x.height), takenAt: `${String(x.taken_at).replace(" ", "T")}Z` });
const COLS = sql`id::text as id, mountain_id, url, thumb_url, width, height, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as taken_at`;

/** 내 사진(새 것부터) — 산을 주면 그 산의 것만 */
export async function listPhotos(memberId: string, mountainId?: string | null, limit = 120): Promise<HikingPhoto[]> {
    try {
        const r = mountainId
            ? await rows<any>(sql`select ${COLS} from hiking_photos where member_id = ${memberId}::uuid and mountain_id = ${mountainId} order by taken_at desc, created_at desc limit ${limit}`)
            : await rows<any>(sql`select ${COLS} from hiking_photos where member_id = ${memberId}::uuid order by taken_at desc, created_at desc limit ${limit}`);
        return r.map(out);
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

/** 올릴 수 있는지 세는 값 — 지난 24시간에 올린 수 · 그 산에 둔 수 */
export async function photoCounts(memberId: string, mountainId: string): Promise<{ day: number; mountain: number }> {
    const [r] = await rows<any>(sql`
        select count(*) filter (where created_at > now() - interval '24 hours')::int as day, count(*) filter (where mountain_id = ${mountainId})::int as mountain
        from hiking_photos where member_id = ${memberId}::uuid`);
    return { day: Number(r?.day ?? 0), mountain: Number(r?.mountain ?? 0) };
}

export async function addPhoto(memberId: string, p: { mountainId: string; url: string; thumbUrl: string; width: number; height: number }): Promise<HikingPhoto> {
    const [r] = await rows<any>(sql`
        insert into hiking_photos (member_id, mountain_id, url, thumb_url, width, height)
        values (${memberId}::uuid, ${p.mountainId}, ${p.url}, ${p.thumbUrl}, ${p.width}, ${p.height})
        returning ${COLS}`);
    return out(r);
}

/** 내 사진 한 장을 지운다 — 지운 파일의 주소를 돌려준다(부르는 쪽이 저장소에서도 지운다). 남의 것 · 없는 것은 null */
export async function removePhoto(memberId: string, photoId: string): Promise<{ url: string; thumbUrl: string } | null> {
    const [r] = await rows<any>(sql`delete from hiking_photos where id = ${photoId}::uuid and member_id = ${memberId}::uuid returning url, thumb_url`);
    return r ? { url: r.url, thumbUrl: r.thumb_url } : null;
}
