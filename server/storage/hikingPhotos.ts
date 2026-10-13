/**
 * 등산 — 산행 사진의 저장(2026-10-13). 규칙은 shared/hikingPhotos, 표는 migrations/hiking_photos.sql + hiking_photos_public.sql.
 *
 * 세 가지 길이 있고 서로 섞이지 않는다.
 *  - **올린 사람의 길**(listPhotos · addPhoto · setPhotoPublic · appealPhoto · removePhoto): 모든 질의에 member_id 조건 — 내 사진만 읽고 바꾸고 지운다.
 *    비공개 · 가려진 사진은 이 길로만 나간다.
 *  - **누구나 보는 길**(listMountainPhotos): 공개(is_public)이고 안 가려졌고(hidden_at is null) 올린 사람이 탈퇴하지 않았고,
 *    보는 사람이 차단한 회원의 것이 아닌 사진만. 이름과 **달까지의 날짜**만 싣는다(전화 · 메일 · 정확한 날은 싣지 않는다).
 *  - **신고 · 운영자 · 탈퇴의 길**(get · getMany · hideByReports · setHidden · remove · deleteAllByMember): 공유 기반(신고 저장소 · 운영자 큐 ·
 *    services/moderation · 탈퇴 라우트)이 storage.hikingPhotos 로 부른다. 등산 라우트는 이 길을 쓰지 않는다.
 * 좌표는 받지도 저장하지도 않는다. 표의 틀(drizzle)을 두지 않고 글자 그대로의 질의로 쓴다(등산의 다른 저장과 같다).
 *
 * 표나 새 칸이 아직 없으면(배포 순서가 어긋났을 때): 읽기는 버틴다 — 내 사진첩은 옛 칸만으로 읽어 전부 비공개로, 공개 목록 · 운영자 미리보기는 빈 값
 * (운영자 큐의 질의도 버틴다 — admin.repo reportQueueCte). 쓰기(올리기 · 공개 바꾸기 · 가리기 · 이의제기)는 새 칸이 있어야 한다 —
 * migrations/hiking_photos_public.sql 을 배포 전에 돌린다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { hikingMountainPath } from "../../shared/hikingMountains.js";
import { HIKING_GALLERY_MAX, HIKING_PHOTOS_ANCHOR, hikingPhotoCredit, hikingPhotoMonth, type HikingPhoto, type MountainPhoto } from "../../shared/hikingPhotos.js";

type Q = ReturnType<typeof sql>;
const rows = async <T>(q: Q): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const code = (e: any) => e?.code ?? e?.cause?.code;
const said = (e: any) => `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
const missingTable = (e: any) => code(e) === "42P01" || /relation "hiking_photos" does not exist/.test(said(e));
// 새 칸이 없을 때만 — 다른 칸의 오타까지 삼키지 않게 이름을 본다
const missingColumn = (e: any) => /column "?(?:p\.)?(?:is_public|hidden_at|appeal_text|appeal_at)"? does not exist/.test(said(e));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// timestamp(시간대 없음) 칸은 UTC 벽시계다 — 글자로 읽어 Z 를 붙인다(storage/hikingStamps 와 같은 규칙). 적을 때는 DB 의 now() 만 쓴다(Date 를 넘기지 않는다)
const utc = (v: unknown): string => `${String(v).replace(" ", "T")}Z`;
const utcDate = (v: unknown): Date | null => (v == null ? null : new Date(utc(v)));
const at = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS')`);

// ── 올린 사람의 길 ────────────────────────────────────────────────────
const out = (x: any): HikingPhoto => ({
    id: x.id, mountainId: x.mountain_id, url: x.url, thumbUrl: x.thumb_url, width: Number(x.width), height: Number(x.height), takenAt: utc(x.taken_at),
    isPublic: !!x.is_public, hidden: !!x.hidden, appealed: !!x.appealed,
});
/** 가린 뒤에 낸 이의제기만 센다 — 풀렸다가 다시 가려지면 새로 낼 수 있게 */
const MINE = sql`id::text as id, mountain_id, url, thumb_url, width, height, ${at("taken_at")} as taken_at, is_public,
    (hidden_at is not null) as hidden, (hidden_at is not null and appeal_at is not null and appeal_at >= hidden_at) as appealed`;
/** 새 칸이 아직 없을 때 — 있는 사진은 전부 "내 사진첩에만"의 약속 아래 올린 것이다 */
const MINE_BEFORE = sql`id::text as id, mountain_id, url, thumb_url, width, height, ${at("taken_at")} as taken_at, false as is_public, false as hidden, false as appealed`;

/** 내 사진(새 것부터) — 산을 주면 그 산의 것만. 비공개 · 가려진 것까지 */
export async function listPhotos(memberId: string, mountainId?: string | null, limit = 120): Promise<HikingPhoto[]> {
    const run = (cols: Q) => (mountainId
        ? rows<any>(sql`select ${cols} from hiking_photos where member_id = ${memberId}::uuid and mountain_id = ${mountainId} order by taken_at desc, created_at desc limit ${limit}`)
        : rows<any>(sql`select ${cols} from hiking_photos where member_id = ${memberId}::uuid order by taken_at desc, created_at desc limit ${limit}`));
    try {
        return (await run(MINE)).map(out);
    } catch (e) {
        if (missingTable(e)) return [];
        if (missingColumn(e)) return (await run(MINE_BEFORE)).map(out);
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

/** 한 장 적는다 — 공개 여부는 부르는 쪽이 정해 준다(표의 기본값에 맡기지 않는다) */
export async function addPhoto(memberId: string, p: { mountainId: string; url: string; thumbUrl: string; width: number; height: number; isPublic: boolean }): Promise<HikingPhoto> {
    const [r] = await rows<any>(sql`
        insert into hiking_photos (member_id, mountain_id, url, thumb_url, width, height, is_public)
        values (${memberId}::uuid, ${p.mountainId}, ${p.url}, ${p.thumbUrl}, ${p.width}, ${p.height}, ${p.isPublic === true})
        returning ${MINE}`);
    return out(r);
}

/** 내 사진의 공개 · 비공개 — 바뀐 사진을 돌려준다. 남의 것 · 없는 것은 null */
export async function setPhotoPublic(memberId: string, photoId: string, isPublic: boolean): Promise<HikingPhoto | null> {
    const [r] = await rows<any>(sql`update hiking_photos set is_public = ${isPublic === true} where id = ${photoId}::uuid and member_id = ${memberId}::uuid returning ${MINE}`);
    return r ? out(r) : null;
}

/** 이의제기 — **가려진 내 사진**에만. 운영자 큐가 appeal_at 으로 이 건을 다시 연다(admin.repo reportQueueCte) */
export async function appealPhoto(memberId: string, photoId: string, text: string): Promise<boolean> {
    const r = await rows<any>(sql`
        update hiking_photos set appeal_text = ${text}, appeal_at = now()
        where id = ${photoId}::uuid and member_id = ${memberId}::uuid and hidden_at is not null returning id`);
    return r.length > 0;
}

/** 내 사진 한 장을 지운다 — 지운 파일의 주소를 돌려준다(부르는 쪽이 저장소에서도 지운다). 남의 것 · 없는 것은 null */
export async function removePhoto(memberId: string, photoId: string): Promise<{ url: string; thumbUrl: string } | null> {
    const [r] = await rows<any>(sql`delete from hiking_photos where id = ${photoId}::uuid and member_id = ${memberId}::uuid returning url, thumb_url`);
    return r ? { url: r.url, thumbUrl: r.thumb_url } : null;
}

// ── 누구나 보는 길 ────────────────────────────────────────────────────
/**
 * 산 화면 '이 산의 사진' — 새 것부터. 로그인하지 않은 사람에게도 나간다.
 * 공개 · 안 가려진 것만, 탈퇴한 회원의 것은 빼고(탈퇴는 사진을 지우지만 지우기 전에 남은 줄이 있을 수 있다), 보는 사람이 차단한 회원의 것도 뺀다.
 * 올린 때는 달로 바꿔 싣는다 — 정확한 날 · 시각은 응답에 없다.
 */
export async function listMountainPhotos(mountainId: string, viewerId: string | null, limit: number): Promise<MountainPhoto[]> {
    const n = Math.min(Math.max(Math.floor(limit) || 1, 1), HIKING_GALLERY_MAX);
    const notBlocked = viewerId && UUID.test(viewerId)
        ? sql`and not exists (select 1 from hiq_blocks b where b.blocker_id = ${viewerId}::uuid and b.blocked_id = p.member_id)`
        : sql``;
    try {
        const r = await rows<any>(sql`
            select p.id::text as id, p.member_id::text as member_id, p.url, p.thumb_url, p.width, p.height, ${at("p.taken_at")} as taken_at, m.name
            from hiking_photos p
            join hiq_members m on m.id = p.member_id and m.profile_id is not null
            where p.mountain_id = ${mountainId} and p.is_public and p.hidden_at is null ${notBlocked}
            order by p.taken_at desc, p.created_at desc limit ${n}`);
        return r.map((x) => ({
            id: x.id, memberId: x.member_id, credit: hikingPhotoCredit(x.name), month: hikingPhotoMonth(utc(x.taken_at)),
            url: x.url, thumbUrl: x.thumb_url, width: Number(x.width), height: Number(x.height),
        }));
    } catch (e) {
        if (missingTable(e) || missingColumn(e)) return [];
        throw e;
    }
}

// ── 신고 · 운영자 · 탈퇴의 길 ─────────────────────────────────────────
/** 신고 대상 · 운영자 미리보기가 읽는 한 줄 — 화면으로 그대로 내보내지 않는다 */
export interface HikingPhotoRow {
    id: string; memberId: string; mountainId: string; mountainName: string | null; mountainSlug: string | null;
    url: string; thumbUrl: string; isPublic: boolean; hiddenAt: Date | null; appealText: string | null; appealAt: Date | null; createdAt: Date | null;
}
const row = (x: any): HikingPhotoRow => ({
    id: x.id, memberId: x.member_id, mountainId: x.mountain_id, mountainName: x.mountain_name ?? null, mountainSlug: x.mountain_slug ?? null,
    url: x.url, thumbUrl: x.thumb_url, isPublic: !!x.is_public, hiddenAt: utcDate(x.hidden_at), appealText: x.appeal_text ?? null, appealAt: utcDate(x.appeal_at), createdAt: utcDate(x.created_at),
});

/** 사진 여러 장(신고 큐 미리보기) — 한 번의 질의로 */
export async function getMany(ids: readonly string[]): Promise<HikingPhotoRow[]> {
    const list = Array.from(new Set(ids.filter((id) => UUID.test(id))));
    if (!list.length) return [];
    try {
        const r = await rows<any>(sql`
            select p.id::text as id, p.member_id::text as member_id, p.mountain_id, p.url, p.thumb_url, p.is_public, p.appeal_text,
                   ${at("p.hidden_at")} as hidden_at, ${at("p.appeal_at")} as appeal_at, ${at("p.created_at")} as created_at,
                   mt.name as mountain_name, mt.slug as mountain_slug
            from hiking_photos p left join hiking_mountains mt on mt.id = p.mountain_id
            where p.id in (${sql.join(list.map((id) => sql`${id}::uuid`), sql`, `)})`);
        return r.map(row);
    } catch (e) {
        if (missingTable(e) || missingColumn(e)) return [];
        throw e;
    }
}
export async function get(id: string): Promise<HikingPhotoRow | null> {
    return (await getMany([id]))[0] ?? null;
}

/** 올린 사람이 그 사진을 다시 찾는 자리 — 그 산의 화면 '내 산행 사진'(알림의 링크) */
export const photoPagePath = (p: Pick<HikingPhotoRow, "mountainSlug"> | null | undefined): string | null =>
    (p?.mountainSlug ? `${hikingMountainPath(p.mountainSlug)}#${HIKING_PHOTOS_ANCHOR}` : null);

/** 신고가 쌓여 저절로 가린다 — 새로 가렸으면 올린 사람의 id(알림용), 이미 가려졌거나 없으면 null. 지우지 않는다(올린 사람이 보고 이의제기할 수 있게) */
export async function hideByReports(id: string): Promise<string | null> {
    const [r] = await rows<any>(sql`update hiking_photos set hidden_at = now() where id = ${id}::uuid and hidden_at is null returning member_id::text as member_id`);
    return r?.member_id ?? null;
}

/** 운영자의 가리기 · 다시 보이기(신고 큐). 바뀐 줄이 있으면 true */
export async function setHidden(id: string, hidden: boolean): Promise<boolean> {
    const r = hidden
        ? await rows<any>(sql`update hiking_photos set hidden_at = now() where id = ${id}::uuid returning id`)
        : await rows<any>(sql`update hiking_photos set hidden_at = null where id = ${id}::uuid returning id`);
    return r.length > 0;
}

/** 운영자의 지우기 — 지운 파일의 주소(부르는 쪽이 저장소에서도 지운다). 올린 사람의 지우기는 removePhoto 다 */
export async function remove(id: string): Promise<{ url: string; thumbUrl: string } | null> {
    const [r] = await rows<any>(sql`delete from hiking_photos where id = ${id}::uuid returning url, thumb_url`);
    return r ? { url: r.url, thumbUrl: r.thumb_url } : null;
}

/** 탈퇴 — 그 회원의 사진을 전부 지우고 파일의 주소를 돌려준다(저장소 정리는 부르는 쪽). 표가 없으면 빈 값 */
export async function deleteAllByMember(memberId: string): Promise<string[]> {
    try {
        const r = await rows<any>(sql`delete from hiking_photos where member_id = ${memberId}::uuid returning url, thumb_url`);
        return r.flatMap((x) => [x.url, x.thumb_url]);
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
