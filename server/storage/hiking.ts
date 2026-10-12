/**
 * 등산 — 산 · 코스 · 길 위의 지점 읽기(2026-10-13). 표는 migrations/hiking_base.sql, 채우는 것은 server/scripts/hiking-import.ts.
 *
 *  - allMountains()        산 요약 전부(3,800여 곳) — 인스턴스마다 10분 기억한다. 허브 · 목록 · 가까운 산 · 사이트맵 · 검색용 화면이 다 이것을 쓴다.
 *                          글(guide)과 코스 선은 싣지 않는다(무겁다 — 산 한 곳씩 따로 읽는다).
 *  - getMountainDetail()   산 한 곳의 글 · 코스(선 포함) · 지점.
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값 — 화면은 '준비 중'으로 열린다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { hasMountainGuide, type MountainGuide } from "../../shared/hikingGuide.js";
import { distM, type LinePoint } from "../../shared/hikingGeo.js";
import type { HikingPoiKind } from "../../shared/hikingPois.js";

export interface MountainSummary {
    id: string;
    slug: string;
    name: string;
    heightM: number | null;
    lat: number | null;
    lng: number | null;
    region: string | null;
    sido: string | null;
    sigungu: string | null;
    tier: number;
    /** 속한 목록의 id("kfs100" …) */
    lists: string[];
    /** 산림청 100대 명산의 번호(가나다 순 번호가 아니라 목록의 순번) — 정렬에 쓴다 */
    kfsNo: number | null;
    traits: string[];
    courses: number;
    minKm: number | null;
    maxKm: number | null;
    hasGuide: boolean;
    /** 산림청의 한 줄("섬세한 비경 두루 갖춘 팔방미인") */
    subtitle: string | null;
}
export interface MountainCourse {
    id: string;
    seq: number;
    km: number;
    gainM: number;
    lossM: number;
    minM: number;
    maxM: number;
    loop: boolean;
    summitKm: number | null;
    line: LinePoint[];
}
export interface MountainPoi {
    id: string;
    kind: HikingPoiKind;
    name: string;
    note: string | null;
    lat: number;
    lng: number;
    altM: number | null;
    courseId: string | null;
    km: number | null;
}
export interface MountainDetail extends MountainSummary {
    peakName: string | null;
    aliases: string[];
    dong: string | null;
    guide: MountainGuide | null;
    poiCounts: Record<string, number>;
    courseList: MountainCourse[];
    pois: MountainPoi[];
}

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => { const r: any = await db.execute(q); return (r.rows ?? r) as T[]; };
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_[a-z_]+" does not exist/.test(String(e?.message ?? ""));
const num = (v: unknown): number | null => (v == null ? null : Number(v));

const toSummary = (r: any): MountainSummary => {
    const lists: { list: string; no: number | null }[] = Array.isArray(r.lists) ? r.lists : [];
    return {
        id: r.id, slug: r.slug, name: r.name, heightM: num(r.height_m), lat: num(r.lat), lng: num(r.lng), region: r.region ?? null, sido: r.sido ?? null, sigungu: r.sigungu ?? null,
        tier: Number(r.tier), lists: lists.map((l) => l.list), kfsNo: lists.find((l) => l.list === "kfs100")?.no ?? null, traits: Array.isArray(r.traits) ? r.traits : [],
        courses: Number(r.course_count ?? 0), minKm: num(r.course_min_km), maxKm: num(r.course_max_km), hasGuide: !!r.has_guide, subtitle: r.subtitle ?? null,
    };
};

const TTL_MS = 10 * 60_000;
let cache: { at: number; list: MountainSummary[]; bySlug: Map<string, MountainSummary> } | null = null;
let loading: Promise<MountainSummary[]> | null = null;

/** 산 요약 전부 — 명산 먼저(100대 명산의 순번), 그다음 높은 산부터 */
export async function allMountains(): Promise<MountainSummary[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
    if (!loading) {
        loading = (async () => {
            try {
                const raw = await rows<any>(sql`
                    select id, slug, name, height_m, lat, lng, region, sido, sigungu, tier, lists, traits, course_count, course_min_km, course_max_km,
                           (guide is not null) as has_guide, guide->>'subtitle' as subtitle
                    from hiking_mountains`);
                const list = raw.map(toSummary).sort((a, b) => a.tier - b.tier || (a.kfsNo ?? 999) - (b.kfsNo ?? 999) || (b.heightM ?? 0) - (a.heightM ?? 0) || a.name.localeCompare(b.name, "ko"));
                cache = { at: Date.now(), list, bySlug: new Map(list.map((m) => [m.slug, m])) };
                return list;
            } catch (e) {
                if (missingTable(e)) return [];
                throw e;
            } finally { loading = null; }
        })();
    }
    return loading;
}
export async function mountainBySlug(slug: string): Promise<MountainSummary | null> {
    await allMountains();
    return cache?.bySlug.get(slug) ?? null;
}

/** 가까운 산 — 직선거리 순. 코스가 있거나 글이 있는 산만(빈 페이지로 보내지 않는다) */
export function nearbyMountains(all: readonly MountainSummary[], m: { id: string; lat: number | null; lng: number | null }, n = 8, withinKm = 40): (MountainSummary & { km: number })[] {
    if (m.lat == null || m.lng == null) return [];
    const out: (MountainSummary & { km: number })[] = [];
    for (const x of all) {
        if (x.id === m.id || x.lat == null || x.lng == null || !(x.courses > 0 || x.hasGuide)) continue;
        // 위도 1도 ≈ 111km — 먼 산은 재지도 않는다
        if (Math.abs(x.lat - m.lat) > withinKm / 111) continue;
        const km = distM(m.lat, m.lng, x.lat, x.lng) / 1000;
        if (km <= withinKm) out.push({ ...x, km: Math.round(km * 10) / 10 });
    }
    return out.sort((a, b) => a.km - b.km).slice(0, n);
}

/** 산 한 곳 — 글 · 코스(선) · 지점. 없으면 null */
export async function getMountainDetail(slug: string): Promise<MountainDetail | null> {
    try {
        const [m] = await rows<any>(sql`
            select id, slug, name, peak_name, aliases, height_m, lat, lng, region, sido, sigungu, dong, tier, lists, traits, guide, course_count, course_min_km, course_max_km, poi_counts,
                   (guide is not null) as has_guide, guide->>'subtitle' as subtitle
            from hiking_mountains where slug = ${slug}`);
        if (!m) return null;
        const [courses, pois] = await Promise.all([
            rows<any>(sql`select id, seq, km, gain_m, loss_m, min_m, max_m, loop, summit_km, line from hiking_courses where mountain_id = ${m.id} order by frtrl_id, seq`),
            rows<any>(sql`select id, type, name, note, lat, lng, alt_m, course_id, km from hiking_pois where mountain_id = ${m.id} order by course_id nulls last, km nulls last, id`),
        ]);
        return {
            ...toSummary(m), peakName: m.peak_name ?? null, aliases: Array.isArray(m.aliases) ? m.aliases : [], dong: m.dong ?? null,
            guide: hasMountainGuide(m.guide) ? m.guide : null, poiCounts: m.poi_counts && typeof m.poi_counts === "object" ? m.poi_counts : {},
            courseList: courses.map((c): MountainCourse => ({
                id: c.id, seq: Number(c.seq), km: Number(c.km), gainM: Number(c.gain_m), lossM: Number(c.loss_m), minM: Number(c.min_m), maxM: Number(c.max_m), loop: !!c.loop,
                summitKm: num(c.summit_km), line: Array.isArray(c.line) ? c.line : [],
            })),
            pois: pois.map((p): MountainPoi => ({ id: p.id, kind: p.type, name: p.name, note: p.note ?? null, lat: Number(p.lat), lng: Number(p.lng), altM: num(p.alt_m), courseId: p.course_id ?? null, km: num(p.km) })),
        };
    } catch (e) {
        if (missingTable(e)) return null;
        throw e;
    }
}
