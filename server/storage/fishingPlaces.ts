/**
 * 전국 낚시터(공개 페이지 · 검색용 화면 · 사이트맵, 2026-10-18) — fishing_places 전부를 인스턴스가 10분 기억한다(1,151줄 · 가볍다).
 * 받은 칸만 싣는다(shared/fishingPlaces 머리말). 좌표는 페이지의 '여기' · 가까운 낚시터를 셈하는 데 쓴다.
 * 같은 곳이 해마다 새 번호로 다시 실려(1,151줄 = 861곳) 한 곳으로 묶어 낸다 — 옛 번호는 canonicalPlaceId 로 대표 번호를 찾는다(2026-10-19).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { dedupePlaces, type PublicPlace } from "../../shared/fishingPlaces.js";

const TTL_MS = 10 * 60_000;
let cache: { at: number; list: PublicPlace[]; byId: Map<string, PublicPlace>; alias: Map<string, string>; updated: string | null } | null = null;
let inflight: Promise<PublicPlace[]> | null = null;

const num = (v: unknown) => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : n; };

export async function allPlaces(): Promise<PublicPlace[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            const r: any = await db.execute(sql`select id, name, kind, sido, sigungu, address, lat, lng, species, fee, tel, data_date, updated_at from fishing_places where btrim(name) <> '' order by sido, sigungu, name`);
            const rows = (r.rows ?? r) as any[];
            const raw: PublicPlace[] = rows.map((x) => ({
                id: String(x.id), name: String(x.name).trim(), kind: x.kind ?? null, sido: x.sido ?? null, sigungu: x.sigungu ?? null, address: x.address ?? null,
                lat: num(x.lat), lng: num(x.lng), species: Array.isArray(x.species) ? x.species.map(String).filter(Boolean) : [],
                fee: x.fee ?? null, tel: x.tel ?? null, dataDate: x.data_date ? String(x.data_date).slice(0, 10) : null,
            }));
            const updated = rows.reduce<string | null>((m, x) => { const d = x.updated_at ? new Date(x.updated_at).toISOString().slice(0, 10) : null; return d && (!m || d > m) ? d : m; }, null);
            const { list, alias } = dedupePlaces(raw);
            cache = { at: Date.now(), list, byId: new Map(list.map((p) => [p.id, p])), alias, updated };
            return list;
        })().finally(() => { inflight = null; });
    }
    return inflight;
}

/** 한 곳 — 옛 번호(같은 곳의 지난 등록)로 물어도 대표를 준다(돌려준 place.id 가 대표 번호) */
export async function placeById(id: string): Promise<PublicPlace | null> {
    await allPlaces();
    return cache?.byId.get(cache.alias.get(id) ?? id) ?? null;
}

/** 대표 번호 — 대표면 그대로, 옛 번호면 대표, 없는 번호면 null */
export async function canonicalPlaceId(id: string): Promise<string | null> {
    await allPlaces();
    const c = cache?.alias.get(id) ?? id;
    return cache?.byId.has(c) ? c : null;
}

/** 사이트맵의 lastmod — 낚시터 표를 마지막으로 고친 날 */
export async function placesUpdatedDay(): Promise<string | null> {
    await allPlaces();
    return cache?.updated ?? null;
}
