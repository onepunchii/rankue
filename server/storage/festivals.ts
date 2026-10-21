/**
 * 전국 축제(2026-10-21) — 표 tour_festivals(migrations/tour_festivals.sql). 규칙 · 글은 shared/festivals.
 * 목록은 인스턴스가 10분 기억한다(540줄쯤 · 가볍다). 사흘 넘게 목록에서 안 보인 줄(받은 자료에서 지워진 축제)은 싣지 않는다.
 * 쓰는 곳은 services/festivalSync 하나 — 화면은 읽기만.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import type { FestivalDetail, FestivalRow } from "../../shared/festivals.js";

const TTL_MS = 10 * 60_000;
let cache: { at: number; list: FestivalRow[]; byId: Map<string, FestivalRow> } | null = null;
let inflight: Promise<FestivalRow[]> | null = null;
const rowsOf = (r: any) => (r?.rows ?? r ?? []) as any[];

const toRow = (x: any): FestivalRow => ({
    id: String(x.content_id), title: String(x.title), start: String(x.start_ymd), end: String(x.end_ymd), addr: x.addr ?? null, region: x.region ?? null,
    lat: Number(x.lat), lng: Number(x.lng), cat: x.cat ?? null, image: x.image ?? null, lic: x.image_lic === "Type1" || x.image_lic === "Type3" ? x.image_lic : null,
    mod: x.modified ?? null,
});

export async function allFestivals(): Promise<FestivalRow[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            try {
                const raw = rowsOf(await db.execute(sql`
                    select content_id, title, start_ymd, end_ymd, addr, region, lat, lng, cat, image, image_lic, modified
                    from tour_festivals where seen_at > now() - interval '3 days' order by start_ymd, title`));
                const list = raw.map(toRow);
                cache = { at: Date.now(), list, byId: new Map(list.map((f) => [f.id, f])) };
                return list;
            } catch (e) {
                // 표가 아직 없을 때(배포 순서) · 잠깐 끊겼을 때 — 화면은 빈 목록으로 그린다
                console.warn("[festivals] list:", (e as Error)?.message);
                return cache?.list ?? [];
            }
        })().finally(() => { inflight = null; });
    }
    return inflight;
}

export async function getFestival(id: string): Promise<FestivalDetail | null> {
    if (!/^\d{1,12}$/.test(id)) return null;
    const r = rowsOf(await db.execute(sql`
        select content_id, title, start_ymd, end_ymd, addr, region, lat, lng, cat, image, image_lic, modified, tel, place, playtime, fee, host, host_tel, homepage, overview
        from tour_festivals where content_id = ${id} and seen_at > now() - interval '3 days'`))[0];
    if (!r) return null;
    return { ...toRow(r), tel: r.tel ?? null, place: r.place ?? null, playtime: r.playtime ?? null, fee: r.fee ?? null, host: r.host ?? null, hostTel: r.host_tel ?? null, homepage: r.homepage ?? null, overview: r.overview ?? null };
}

/** 목록에서 받은 줄들을 넣거나 고친다(상세 칸은 건드리지 않는다). 본 날(seen_at)을 지금으로 */
export async function upsertFestivalRows(list: readonly (FestivalRow & { tel: string | null })[]): Promise<number> {
    let n = 0;
    for (let i = 0; i < list.length; i += 200) {
        const chunk = list.slice(i, i + 200);
        await db.execute(sql`
            insert into tour_festivals (content_id, title, start_ymd, end_ymd, addr, region, lat, lng, cat, image, image_lic, tel, modified, seen_at)
            values ${sql.join(chunk.map((f) => sql`(${f.id}, ${f.title}, ${f.start}, ${f.end}, ${f.addr}, ${f.region}, ${f.lat}, ${f.lng}, ${f.cat}, ${f.image}, ${f.lic}, ${f.tel}, ${f.mod}, now())`), sql`, `)}
            on conflict (content_id) do update set title = excluded.title, start_ymd = excluded.start_ymd, end_ymd = excluded.end_ymd, addr = excluded.addr, region = excluded.region,
                lat = excluded.lat, lng = excluded.lng, cat = excluded.cat, image = excluded.image, image_lic = excluded.image_lic,
                tel = coalesce(excluded.tel, tour_festivals.tel), modified = excluded.modified, seen_at = now()`);
        n += chunk.length;
    }
    cache = null;
    return n;
}

/** 받은 자료에서 사라진 지 사흘 넘은 줄을 지운다(목록이 넉넉히 왔을 때만 부른다) */
export async function dropStaleFestivals(): Promise<number> {
    const r = rowsOf(await db.execute(sql`delete from tour_festivals where seen_at < now() - interval '3 days' returning content_id`));
    cache = null;
    return r.length;
}

/** 상세를 아직 안 받았거나 자료가 고쳐진 줄 — 열려 있거나 곧 열리는 것 먼저 */
export async function festivalsNeedingDetail(today: string, max: number): Promise<{ id: string; mod: string | null }[]> {
    const r = rowsOf(await db.execute(sql`
        select content_id, modified from tour_festivals
        where detail_mod is null or detail_mod is distinct from coalesce(modified, '')
        order by (end_ymd >= ${today}) desc, start_ymd asc limit ${max}`));
    return r.map((x) => ({ id: String(x.content_id), mod: x.modified ?? null }));
}

export async function setFestivalDetail(id: string, mod: string | null, d: { place: string | null; playtime: string | null; fee: string | null; host: string | null; hostTel: string | null; homepage: string | null; overview: string | null; tel: string | null }): Promise<void> {
    await db.execute(sql`
        update tour_festivals set place = ${d.place}, playtime = ${d.playtime}, fee = ${d.fee}, host = ${d.host}, host_tel = ${d.hostTel}, homepage = ${d.homepage},
            overview = ${d.overview}, tel = coalesce(tel, ${d.tel}), detail_mod = ${mod ?? ""}
        where content_id = ${id}`);
}

/** 근처를 셈할 골프장(공개 페이지) — 이름 · 좌표 · 로고만. 10분 기억 */
let golfCache: { at: number; list: { slug: string; name: string; lat: number; lng: number; logo: string | null }[] } | null = null;
export async function golfPoints(): Promise<{ slug: string; name: string; lat: number; lng: number; logo: string | null }[]> {
    if (golfCache && Date.now() - golfCache.at < TTL_MS) return golfCache.list;
    try {
        const raw = rowsOf(await db.execute(sql`select slug, name, lat, lng, logo from golf_course_pages where slug <> '' and btrim(name) <> '' and lat is not null and lng is not null`));
        const list = raw.map((x) => ({ slug: String(x.slug), name: String(x.name), lat: Number(x.lat), lng: Number(x.lng), logo: typeof x.logo === "string" && x.logo ? x.logo : null }))
            .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
        golfCache = { at: Date.now(), list };
        return list;
    } catch (e) {
        console.warn("[festivals] golf points:", (e as Error)?.message);
        return golfCache?.list ?? [];
    }
}
