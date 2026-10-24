/**
 * 당구대 로고 · 광고 저장소(2026-10-24) — 표 sim_table_brands(migrations/sim_table_brands.sql) · 규칙 shared/tableBrand.
 * 게임이 묻는 '지금 걸 것'은 인스턴스마다 15초 둔다(고치면 그 인스턴스는 바로 비운다). 표가 아직 없으면 우리 기본 로고만.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { DEFAULT_BRAND_IMAGE, pickBrands, type BrandTableId, type TableBrandRow, type TableBrandView } from "../../shared/tableBrand.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);
const ms = (v: unknown): number | null => (v == null ? null : v instanceof Date ? v.getTime() : new Date(String(v)).getTime());
const LIVE_MS = 15_000;
let cache: { at: number; rows: TableBrandRow[] } | null = null;

/** 표가 없을 때의 한 줄 — 마이그레이션이 넣는 '랭큐 기본'과 같다 */
const FALLBACK: TableBrandRow = {
    id: "default", title: "랭큐 기본", image: DEFAULT_BRAND_IMAGE, opacity: 0.16, scale: 0.6, place: "center", tone: "original", sponsor: null,
    tables: ["DAEDAE", "JUNGDAE_KR"], startsAt: null, endsAt: null, enabled: true, createdAt: 0, updatedAt: 0,
};

function toRow(r: any): TableBrandRow {
    return {
        id: String(r.id), title: String(r.title), image: String(r.image),
        opacity: Number(r.opacity), scale: Number(r.scale),
        place: r.place === "ends" ? "ends" : "center", tone: r.tone === "cloth" ? "cloth" : "original",
        sponsor: r.sponsor ? String(r.sponsor) : null,
        tables: (Array.isArray(r.tables) ? r.tables : String(r.tables ?? "").replace(/[{}]/g, "").split(",")).filter((t: string) => t === "DAEDAE" || t === "JUNGDAE_KR") as BrandTableId[],
        startsAt: ms(r.starts_at), endsAt: ms(r.ends_at), enabled: r.enabled === true,
        createdAt: ms(r.created_at) ?? 0, updatedAt: ms(r.updated_at) ?? 0,
    };
}

export async function listBrands(): Promise<TableBrandRow[]> {
    try {
        return rowsOf(await db.execute(sql`select * from sim_table_brands order by (starts_at is null), starts_at desc, created_at desc`)).map(toRow);
    } catch (e) {
        if (missing(e)) return [FALLBACK];
        throw e;
    }
}

/** 테이블마다 지금 걸 것(1분 캐시) */
export async function liveBrands(now = Date.now()): Promise<Record<BrandTableId, TableBrandView | null>> {
    if (!cache || now - cache.at > LIVE_MS) cache = { at: now, rows: await listBrands() };
    return pickBrands(cache.rows, now);
}
export const dropBrandCache = () => { cache = null; };

type Input = Partial<Omit<TableBrandRow, "id" | "createdAt" | "updatedAt">>;
const ts = (v: number | null | undefined) => (v == null ? null : new Date(v).toISOString());

export async function createBrand(v: Input & Pick<TableBrandRow, "title" | "image">): Promise<TableBrandRow> {
    const tables = v.tables ?? ["DAEDAE", "JUNGDAE_KR"];
    const [r] = rowsOf(await db.execute(sql`
        insert into sim_table_brands (title, image, opacity, scale, place, tone, tables, sponsor, starts_at, ends_at, enabled)
        values (${v.title}, ${v.image}, ${v.opacity ?? 0.16}, ${v.scale ?? 0.6}, ${v.place ?? "center"}, ${v.tone ?? "original"},
                ${`{${tables.join(",")}}`}::text[], ${v.sponsor ?? null}, ${ts(v.startsAt)}, ${ts(v.endsAt)}, ${v.enabled ?? true})
        returning *`));
    dropBrandCache();
    return toRow(r);
}

/** 고칠 칸만 바꾼다. 없으면 null */
export async function updateBrand(id: string, v: Input): Promise<{ before: TableBrandRow; after: TableBrandRow } | null> {
    const [cur] = rowsOf(await db.execute(sql`select * from sim_table_brands where id = ${id}::uuid`));
    if (!cur) return null;
    const before = toRow(cur);
    const n = { ...before, ...v };
    if (n.startsAt !== null && n.endsAt !== null && n.endsAt <= n.startsAt) throw Object.assign(new Error("끝나는 때가 시작보다 뒤여야 합니다"), { status: 400 });
    const [r] = rowsOf(await db.execute(sql`
        update sim_table_brands set title = ${n.title}, image = ${n.image}, opacity = ${n.opacity}, scale = ${n.scale}, place = ${n.place}, tone = ${n.tone},
            tables = ${`{${n.tables.join(",")}}`}::text[], sponsor = ${n.sponsor}, starts_at = ${ts(n.startsAt)}, ends_at = ${ts(n.endsAt)},
            enabled = ${n.enabled}, updated_at = now()
        where id = ${id}::uuid returning *`));
    dropBrandCache();
    return { before, after: toRow(r) };
}

export async function deleteBrand(id: string): Promise<TableBrandRow | null> {
    const [r] = rowsOf(await db.execute(sql`delete from sim_table_brands where id = ${id}::uuid returning *`));
    dropBrandCache();
    return r ? toRow(r) : null;
}
