/**
 * 전국 당구장 인허가 자료 받기(2026-10-19) — 「행정안전부_생활_당구장업 조회서비스」(apis.data.go.kr/1741000/billiard_halls/info, 한 번에 100줄 · 개발계정 하루 10,000번).
 *  full    영업 중 전부(15,191곳 → 152번 부름) — 처음 한 번(server/scripts/import-billiard-halls.ts)
 *  recent  최근 사흘 사이 바뀐 줄(상태 무관) — 매일 크론(/api/cron/billiard-halls): 새로 연 곳은 넣고, 폐업 · 휴업은 상태만 바꾼다
 * 쓰는 법(셈은 shared/billiardHalls):
 *  - 이미 이은 곳(gov_key 가 있는 행): 상태 · 좌표 · 인허가일을 새로. 인허가 자료로만 들어온 행('gov')은 이름 · 주소도 새로
 *  - 처음 보는 곳: 우리 수집 매장(아직 안 이은 행)과 같은 곳이면 gov_* 열만 채운다(이름 · 주소 · 있던 좌표는 그대로) — 아니면 영업 중일 때만 새 행('gov')
 * 데이터는 더하기만 — 우리 수집 매장의 이름 · 주소 · 좌표 · 요금은 건드리지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { BILLIARD_HALLS_API, govHallCode, govHallOf, matchHalls, type GovHall, type GovHallRow, type OurListing } from "../../shared/billiardHalls.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const pad = (n: number) => String(n).padStart(2, "0");
const kstStamp = (ms: number) => { const d = new Date(ms + 9 * 3600_000); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}000000`; };

async function getPage(params: Record<string, string>, page: number): Promise<{ items: GovHallRow[]; total: number } | null> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const u = new URL(BILLIARD_HALLS_API);
    u.searchParams.set("pageNo", String(page)); u.searchParams.set("numOfRows", "100"); u.searchParams.set("returnType", "json");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const url = `${u.toString()}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`;
    for (let t = 0; t < 3; t++) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
            const j: any = await r.json();
            const body = j?.response?.body;
            if (body) return { items: body.items?.item ?? [], total: Number(body.totalCount) || 0 };
        } catch { /* 다시 */ }
        await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
}

/** 조건에 맞는 줄 전부(100줄씩). 도중에 못 받으면 받은 데까지와 error */
export async function fetchBilliardHalls(params: Record<string, string>): Promise<{ rows: GovHallRow[]; total: number; error: string | null }> {
    const rows: GovHallRow[] = []; let total = 0;
    for (let page = 1; page <= 400; page++) {
        const p = await getPage(params, page);
        if (!p) return { rows, total, error: `${page}쪽을 못 받음` };
        total = p.total; rows.push(...p.items);
        if (!p.items.length || rows.length >= total) break;
        await new Promise((r) => setTimeout(r, 120));
    }
    return { rows, total, error: null };
}

export interface HallSyncResult { mode: "full" | "recent"; fetched: number; linked: number; inserted: number; refreshed: number; closed: number; error: string | null }

const CHUNK = 300;
async function inChunks<T>(xs: readonly T[], f: (part: readonly T[]) => Promise<void>) { for (let i = 0; i < xs.length; i += CHUNK) await f(xs.slice(i, i + CHUNK)); }

export async function syncBilliardHalls(mode: "full" | "recent", nowMs = Date.now(), opts: { dry?: boolean } = {}): Promise<HallSyncResult> {
    const params: Record<string, string> = mode === "full" ? { "cond[SALS_STTS_CD::EQ]": "01" } : { "cond[DAT_UPDT_PNT::GTE]": kstStamp(nowMs - 3 * 86_400_000) };
    const got = await fetchBilliardHalls(params);
    const govs = got.rows.map(govHallOf).filter((g): g is GovHall => !!g);
    const out: HallSyncResult = { mode, fetched: govs.length, linked: 0, inserted: 0, refreshed: 0, closed: 0, error: got.error };
    // full 인데 반도 못 받았으면 쓰지 않는다(빈 응답으로 아무것도 망가뜨리지 않게)
    if (mode === "full" && (got.error || govs.length < got.total * 0.9)) return { ...out, error: out.error ?? "덜 받음" };
    const ours = rowsOf(await db.execute(sql`select code, name, address, latitude as lat, longitude as lng, source, gov_key from store_listings`));
    const byKey = new Map<string, any>(ours.filter((o) => o.gov_key).map((o) => [String(o.gov_key), o]));
    const known = govs.filter((g) => byKey.has(g.key));
    const fresh = govs.filter((g) => !byKey.has(g.key));
    const unlinked: OurListing[] = ours.filter((o) => !o.gov_key && o.source !== "gov").map((o) => ({ code: o.code, name: o.name, address: o.address, lat: o.lat, lng: o.lng }));
    const link = matchHalls(unlinked, fresh);
    const linkedKeys = new Map([...link].map(([code, key]) => [key, code]));
    const toLink = fresh.filter((g) => linkedKeys.has(g.key));
    const toInsert = fresh.filter((g) => !linkedKeys.has(g.key) && g.status === "open");
    out.closed = govs.filter((g) => g.status === "closed" && byKey.has(g.key)).length;
    if (opts.dry) return { ...out, linked: toLink.length, inserted: toInsert.length, refreshed: known.length };

    const at = new Date(nowMs).toISOString();
    // 1) 이미 이은 곳 — 상태 · 좌표 · 인허가일(인허가 자료로만 들어온 행은 이름 · 주소도)
    await inChunks(known, async (part) => {
        const vals = sql.join(part.map((g) => sql`(${g.key}, ${g.name}, ${g.address}, ${g.lat}::float8, ${g.lng}::float8, ${g.licenseDate}::date, ${g.status}, ${g.closedDate}::date, ${g.phone}::text)`), sql`, `);
        // 전화(2026-10-21): 인허가 자료로만 들어온 행은 새 번호로(없으면 있던 것), 우리 수집 매장은 비어 있을 때만 채운다 · 사장님 인증 매장은 건드리지 않는다
        await db.execute(sql`update store_listings s set
            gov_lat = v.lat, gov_lng = v.lng, license_date = v.lic, gov_status = v.st, gov_closed_date = v.cl, gov_checked_at = ${at}::timestamp,
            phone = case when s.claimed then s.phone when s.source = 'gov' then coalesce(v.tel, s.phone) else coalesce(s.phone, v.tel) end,
            name = case when s.source = 'gov' then v.name else s.name end,
            address = case when s.source = 'gov' then v.addr else s.address end,
            latitude = case when s.source = 'gov' then coalesce(v.lat, s.latitude) else s.latitude end,
            longitude = case when s.source = 'gov' then coalesce(v.lng, s.longitude) else s.longitude end,
            updated_at = case when s.source = 'gov' and (s.name <> v.name or coalesce(s.gov_status, '') <> v.st) then now() else s.updated_at end
            from (values ${vals}) as v(key, name, addr, lat, lng, lic, st, cl, tel) where s.gov_key = v.key`);
    });
    out.refreshed = known.length;
    // 2) 우리 수집 매장과 같은 곳 — gov_* 열만
    await inChunks(toLink, async (part) => {
        const vals = sql.join(part.map((g) => sql`(${linkedKeys.get(g.key)!}, ${g.key}, ${g.lat}::float8, ${g.lng}::float8, ${g.licenseDate}::date, ${g.status}, ${g.closedDate}::date, ${g.phone}::text)`), sql`, `);
        await db.execute(sql`update store_listings s set gov_key = v.key, gov_lat = v.lat, gov_lng = v.lng, license_date = v.lic, gov_status = v.st, gov_closed_date = v.cl, gov_checked_at = ${at}::timestamp,
            phone = case when s.claimed then s.phone else coalesce(s.phone, v.tel) end
            from (values ${vals}) as v(code, key, lat, lng, lic, st, cl, tel) where s.code = v.code and s.gov_key is null`);
    });
    out.linked = toLink.length;
    // 3) 새로 — 영업 중인 곳만, 인허가 자료로만 들어온 행('gov')
    await inChunks(toInsert, async (part) => {
        const vals = sql.join(part.map((g) => sql`(${govHallCode(g.key)}, ${g.name}, ${g.region}, ${g.address}, ${g.lat}::float8, ${g.lng}::float8, 'gov', ${g.key}, ${g.lat}::float8, ${g.lng}::float8, ${g.licenseDate}::date, ${g.status}, ${at}::timestamp, ${g.phone}::text)`), sql`, `);
        await db.execute(sql`insert into store_listings (code, name, region, address, latitude, longitude, source, gov_key, gov_lat, gov_lng, license_date, gov_status, gov_checked_at, phone)
            values ${vals} on conflict (code) do nothing`);
    });
    out.inserted = toInsert.length;
    return out;
}

/**
 * 폐업 · 휴업으로 나온 줄을 우리 수집 매장(아직 안 이은 행)에 잇는다(2026-10-20 — 처음 한 번: 우리 230곳 중 79곳이 폐업 76 · 휴업 3).
 * gov_* 열만 채운다(이름 · 주소 · 좌표 · 요금은 그대로). 폐업한 곳은 storage/listingSql LISTING_LIVE 가 목록 · 지도 · 사이트맵에서 뺀다.
 * 그 뒤로는 매일 크론(recent)이 이은 곳의 상태를 따라간다.
 */
export async function linkClosedHalls(rows: readonly GovHallRow[], nowMs = Date.now(), opts: { dry?: boolean } = {}): Promise<{ linked: number; closed: number; paused: number }> {
    const govs = rows.map(govHallOf).filter((g): g is GovHall => !!g && g.status !== "open");
    const ours = rowsOf(await db.execute(sql`select code, name, address, latitude as lat, longitude as lng from store_listings where source <> 'gov' and gov_key is null`));
    const link = matchHalls(ours.map((o) => ({ code: o.code, name: o.name, address: o.address, lat: o.lat, lng: o.lng })), govs);
    const byKey = new Map(govs.map((g) => [g.key, g]));
    const pairs = [...link].map(([code, key]) => ({ code, g: byKey.get(key)! }));
    const res = { linked: pairs.length, closed: pairs.filter((p) => p.g.status === "closed").length, paused: pairs.filter((p) => p.g.status === "paused").length };
    if (opts.dry || !pairs.length) return res;
    const at = new Date(nowMs).toISOString();
    await inChunks(pairs, async (part) => {
        const vals = sql.join(part.map(({ code, g }) => sql`(${code}, ${g.key}, ${g.lat}::float8, ${g.lng}::float8, ${g.licenseDate}::date, ${g.status}, ${g.closedDate}::date)`), sql`, `);
        await db.execute(sql`update store_listings s set gov_key = v.key, gov_lat = v.lat, gov_lng = v.lng, license_date = v.lic, gov_status = v.st, gov_closed_date = v.cl, gov_checked_at = ${at}::timestamp
            from (values ${vals}) as v(code, key, lat, lng, lic, st, cl) where s.code = v.code and s.gov_key is null`);
    });
    return res;
}
