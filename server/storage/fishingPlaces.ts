/**
 * 전국 낚시터(공개 페이지 · 검색용 화면 · 사이트맵, 2026-10-18) — fishing_places 전부를 인스턴스가 10분 기억한다(1,151줄 · 가볍다).
 * 받은 칸만 싣는다(shared/fishingPlaces 머리말). 좌표는 페이지의 '여기' · 가까운 낚시터를 셈하는 데 쓴다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import type { PublicPlace } from "../../shared/fishingPlaces.js";

const TTL_MS = 10 * 60_000;
let cache: { at: number; list: PublicPlace[]; byId: Map<string, PublicPlace>; updated: string | null } | null = null;
let inflight: Promise<PublicPlace[]> | null = null;

const num = (v: unknown) => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : n; };

export async function allPlaces(): Promise<PublicPlace[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            const r: any = await db.execute(sql`select id, name, kind, sido, sigungu, address, lat, lng, species, fee, tel, data_date, updated_at from fishing_places where btrim(name) <> '' order by sido, sigungu, name`);
            const rows = (r.rows ?? r) as any[];
            const list: PublicPlace[] = rows.map((x) => ({
                id: String(x.id), name: String(x.name).trim(), kind: x.kind ?? null, sido: x.sido ?? null, sigungu: x.sigungu ?? null, address: x.address ?? null,
                lat: num(x.lat), lng: num(x.lng), species: Array.isArray(x.species) ? x.species.map(String).filter(Boolean) : [],
                fee: x.fee ?? null, tel: x.tel ?? null, dataDate: x.data_date ? String(x.data_date).slice(0, 10) : null,
            }));
            const updated = rows.reduce<string | null>((m, x) => { const d = x.updated_at ? new Date(x.updated_at).toISOString().slice(0, 10) : null; return d && (!m || d > m) ? d : m; }, null);
            cache = { at: Date.now(), list, byId: new Map(list.map((p) => [p.id, p])), updated };
            return list;
        })().finally(() => { inflight = null; });
    }
    return inflight;
}

export async function placeById(id: string): Promise<PublicPlace | null> {
    await allPlaces();
    return cache?.byId.get(id) ?? null;
}

/** 사이트맵의 lastmod — 낚시터 표를 마지막으로 고친 날 */
export async function placesUpdatedDay(): Promise<string | null> {
    await allPlaces();
    return cache?.updated ?? null;
}
