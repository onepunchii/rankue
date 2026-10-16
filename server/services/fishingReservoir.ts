/**
 * 민물 — 저수지의 물높이를 받아 둔다(2026-10-14).
 *
 * 자료: 한국농어촌공사 저수지 수위정보(공공데이터포털 B552149 — 서비스 이름의 철자가 reserviorWaterLevel 이고 주소 끝에 / 가 붙는다 · XML 만).
 *   목록  reservoircode/?county=<시군 이름 조각>     → 그 시군의 저수지(코드 · 이름 · 주소)
 *   수위  reservoirlevel/?fac_code=&date_s=&date_e=  → 날마다 한 줄(저수율 · 수위)
 * 받아 두는 곳: fishing_obs — 'resvlist'(시군 찾기 결과 · 이레) · 'resv'(한 저수지의 여드레 · 여섯 시간).
 * 한 번에 하나씩 띄워서 부른다(공공데이터포털은 한꺼번에 여럿을 부르면 막힌다 — services/fishingMarket 의 사고).
 * 못 받으면 가진 것을 주고, 가진 것도 없으면 그 저수지는 뺀다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { RESERVOIR_MAX, isReservoirCode, reservoirView, shortCounty, xmlItems, type ReservoirRef, type ReservoirView } from "../../shared/fishingReservoir.js";
import { fishingKstDay } from "../../shared/fishing.js";
import { noteFeed } from "./fishingFeedHealth.js";

const BASE = "https://apis.data.go.kr/B552149/reserviorWaterLevel";
const LIST_TTL_MS = 7 * 86_400_000;
const LEVEL_TTL_MS = 6 * 3600_000;
const rowsOf = (r: any) => (r.rows ?? r) as any[];

async function getXml(path: string, params: Record<string, string | number>, timeoutMs: number): Promise<string | null> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const u = new URL(`${BASE}/${path}/`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    try {
        const r = await fetch(`${u.toString()}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`, { signal: AbortSignal.timeout(timeoutMs) });
        await noteFeed("krc:reservoir", r.ok, r.ok ? null : `HTTP ${r.status}`);
        return r.ok ? await r.text() : null;
    } catch { await noteFeed("krc:reservoir", false, "응답 없음(시간 초과)"); return null; }
}
async function readObs<T>(kind: string, key: string): Promise<{ data: T; ms: number } | null> {
    const [row] = rowsOf(await db.execute(sql`select data, (extract(epoch from fetched_at) * 1000)::bigint as ms from fishing_obs where kind = ${kind} and key = ${key}`));
    return row ? { data: row.data as T, ms: Number(row.ms) } : null;
}
const saveObs = (kind: string, key: string, data: unknown) => db.execute(sql`
    insert into fishing_obs (kind, key, data, fetched_at) values (${kind}, ${key}, ${JSON.stringify(data)}::jsonb, now())
    on conflict (kind, key) do update set data = excluded.data, fetched_at = now()`);

/** 시군 이름으로 저수지 찾기 — 이름순 300곳까지 */
export async function searchReservoirs(county: string, nowMs = Date.now()): Promise<ReservoirRef[] | null> {
    const have = await readObs<ReservoirRef[]>("resvlist", county);
    if (have && nowMs - have.ms < LIST_TTL_MS) return have.data;
    const xml = await getXml("reservoircode", { pageNo: 1, numOfRows: 300, county }, 5000);
    if (xml == null) return have?.data ?? null;
    const list: ReservoirRef[] = xmlItems(xml).filter((x) => isReservoirCode(x.fac_code) && x.fac_name).map((x) => ({ code: x.fac_code, name: x.fac_name, county: shortCounty(x.county) }));
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    // 자료 없음(빈 목록)도 받아 둔다 — 같은 글을 다시 조르지 않게
    await saveObs("resvlist", county, list).catch(() => {});
    return list;
}

/** 고른 저수지들의 여드레 — 여섯 곳까지. 차례는 받은 차례 그대로 */
export async function getReservoirs(refs: readonly ReservoirRef[], nowMs = Date.now()): Promise<ReservoirView[]> {
    const today = fishingKstDay(nowMs);
    const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
    const t = Date.parse(`${today}T00:00:00Z`);
    const out: ReservoirView[] = [];
    const until = Date.now() + 4000;
    for (const ref of refs.slice(0, RESERVOIR_MAX)) {
        const have = await readObs<ReservoirView>("resv", ref.code);
        if (have && nowMs - have.ms < LEVEL_TTL_MS) { out.push({ ...have.data, name: ref.name, county: ref.county }); continue; }
        let view: ReservoirView | null = null;
        if (Date.now() < until) {
            const xml = await getXml("reservoirlevel", { pageNo: 1, numOfRows: 20, fac_code: ref.code, date_s: ymd(t - 8 * 86_400_000), date_e: ymd(t) }, 3000);
            view = xml == null ? null : reservoirView(ref, xmlItems(xml));
            if (view) await saveObs("resv", ref.code, view).catch(() => {});
            await new Promise((r) => setTimeout(r, 150));
        }
        if (view ?? have?.data) out.push({ ...(view ?? have!.data), name: ref.name, county: ref.county });
    }
    return out;
}
