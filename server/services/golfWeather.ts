/**
 * 골프장 날씨 — 기상청 예보를 받아 오고 저장한다(2026-10-05 오너: "기상청 날씨 … 순서대로 하자").
 *
 * 자료: 공공데이터포털 기상청_단기예보(getVilageFcst, 5km 격자) · 기상청_중기예보(getMidLandFcst 권역 · getMidTa 시군).
 *       키는 DATA_GO_KR_KEY(없으면 기능 전체가 조용히 꺼진다 — null). 공공누리 1유형이라 저장·게재할 수 있다.
 *
 * 받아 오는 때 — 서버리스라 상주 프로세스가 없고, 단기예보 한 번이 1초 남짓이라 격자 388개를 한 번에 돌 수 없다.
 *   · 상세를 열 때: 그 격자가 새 발표보다 낡았으면 그 자리에서 한 번 받아 저장한다(getCourseWeather, fetch: true).
 *     같은 격자를 10분 안에 다시 조르지 않는다(발표가 늦어 NO_DATA 가 와도 매 요청마다 두드리지 않게).
 *   · 크론(20분마다): 가장 낡은 격자부터 시간 예산만큼 데워 둔다(warmWeather) — 검색엔진용 화면은 저장된 것만 읽는다.
 *   · 받아 오다 실패하면 가진 것(낡은 예보)을 그대로 쓴다. 지난 시간은 화면에서 빠진다.
 *
 * 판정·파싱은 shared/golfWeather(순수 함수, golfWeather.test.ts). 표는 migrations/golf_weather.sql.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
    buildWeather, landOf, latestMidBase, latestShortBase, parseShort, pickMidLand, pickMidTa, toGrid,
    type CourseWeather, type KmaItem, type MidLand, type MidSaved, type MidTa, type WxGrid,
} from "../../shared/golfWeather.js";
import { weatherPoint } from "../../shared/golfWeatherZones.js";

const SHORT_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const MID_LAND_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";
const MID_TA_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa";
/** 같은 격자·구역을 다시 받아 보기까지 기다리는 시간 */
const RETRY_MS = 10 * 60_000;
/** 이보다 낡은 단기예보는 버린다(시간별이 거의 다 지난 것) */
const SHORT_MAX_AGE_MS = 30 * 3600_000;
const MID_MAX_AGE_MS = 36 * 3600_000;

const rowsOf = (r: any) => (r.rows ?? r) as any[];
export const weatherEnabled = () => !!process.env.DATA_GO_KR_KEY;

/** 공공데이터포털 호출 — 키는 인코딩 안 된 꼴(Decoding)·된 꼴 어느 쪽으로 저장돼 있어도 받는다. 실패는 code 로 돌려준다(던지지 않는다). */
async function kma(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<{ code: string; items: any[] }> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return { code: "NOKEY", items: [] };
    const u = new URL(url);
    for (const [k, v] of Object.entries({ pageNo: 1, dataType: "JSON", ...params })) u.searchParams.set(k, String(v));
    const full = `${u.toString()}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`;
    try {
        const r = await fetch(full, { signal: AbortSignal.timeout(timeoutMs) });
        const j: any = await r.json().catch(() => null); // 키 오류는 XML 로 온다 — 그때는 ERR
        const head = j?.response?.header;
        if (!head) return { code: "ERR", items: [] };
        const item = j.response.body?.items?.item;
        return { code: String(head.resultCode), items: Array.isArray(item) ? item : item ? [item] : [] };
    } catch {
        return { code: "TIMEOUT", items: [] };
    }
}

/** 단기예보 한 격자. 방금 발표가 아직 안 열렸으면(NO_DATA) 그 앞 발표로 물러선다. */
export async function fetchShort(nx: number, ny: number, nowMs: number, timeoutMs = 5000): Promise<WxGrid | null> {
    for (let back = 0; back < 2; back++) {
        const base = latestShortBase(nowMs, back);
        const r = await kma(SHORT_URL, { numOfRows: 1500, base_date: base.slice(0, 8), base_time: base.slice(8, 12), nx, ny }, timeoutMs);
        if (r.code === "00" && r.items.length) {
            const g = parseShort(r.items as KmaItem[], base);
            return g.hours.length ? g : null;
        }
        if (r.code !== "03") return null; // NO_DATA 가 아니면(키·한도·시간 초과) 더 두드리지 않는다
    }
    return null;
}
async function fetchMid<T>(url: string, regId: string, nowMs: number, pick: (row: Record<string, unknown>) => T, timeoutMs = 4000): Promise<MidSaved<T> | null> {
    for (let back = 0; back < 2; back++) {
        const base = latestMidBase(nowMs, back);
        const r = await kma(url, { numOfRows: 10, regId, tmFc: base }, timeoutMs);
        if (r.code === "00" && r.items[0]) return { base, data: pick(r.items[0]) };
        if (r.code !== "03") return null;
    }
    return null;
}
export const fetchMidLand = (regId: string, nowMs: number) => fetchMid<MidLand>(MID_LAND_URL, regId, nowMs, pickMidLand);
export const fetchMidTa = (regId: string, nowMs: number) => fetchMid<MidTa>(MID_TA_URL, regId, nowMs, pickMidTa);

// ── 저장 ──────────────────────────────────────────────────────────
interface GridRow { base: string; data: WxGrid; fetchedMs: number }
interface MidRow { base: string; data: any; fetchedMs: number }

async function readGrid(nx: number, ny: number): Promise<GridRow | null> {
    const [r] = rowsOf(await db.execute(sql`
        select base, data, (extract(epoch from fetched_at) * 1000)::bigint as ms from golf_weather_grid where nx = ${nx} and ny = ${ny}`));
    return r ? { base: r.base, data: { ...(r.data as WxGrid), base: r.base }, fetchedMs: Number(r.ms) } : null;
}
async function saveGrid(nx: number, ny: number, g: WxGrid): Promise<void> {
    await db.execute(sql`
        insert into golf_weather_grid (nx, ny, base, data, fetched_at)
        values (${nx}, ${ny}, ${g.base}, ${JSON.stringify({ hours: g.hours, minmax: g.minmax })}::jsonb, now())
        on conflict (nx, ny) do update set base = excluded.base, data = excluded.data, fetched_at = now()`);
}
/** 받아 오지 못했다 — 다시 두드릴 때까지의 시간을 재려고 시각만 찍는다(행이 있을 때만) */
async function touchGrid(nx: number, ny: number): Promise<void> {
    await db.execute(sql`update golf_weather_grid set fetched_at = now() where nx = ${nx} and ny = ${ny}`);
}
async function readMid(ids: string[]): Promise<Map<string, MidRow>> {
    const out = new Map<string, MidRow>();
    if (!ids.length) return out;
    const list = `{${ids.map((x) => `"${x.replace(/[^0-9A-Za-z]/g, "")}"`).join(",")}}`;
    for (const r of rowsOf(await db.execute(sql`
        select reg_id, base, data, (extract(epoch from fetched_at) * 1000)::bigint as ms from golf_weather_mid where reg_id = any(${list}::text[])`))) {
        out.set(r.reg_id, { base: r.base, data: r.data, fetchedMs: Number(r.ms) });
    }
    return out;
}
async function saveMid(regId: string, m: MidSaved<unknown>): Promise<void> {
    await db.execute(sql`
        insert into golf_weather_mid (reg_id, base, data, fetched_at) values (${regId}, ${m.base}, ${JSON.stringify(m.data)}::jsonb, now())
        on conflict (reg_id) do update set base = excluded.base, data = excluded.data, fetched_at = now()`);
}

// ── 한 골프장 ─────────────────────────────────────────────────────
export interface WeatherPage { region?: string | null; city?: string | null; lat?: number | null; lng?: number | null }

/** 같은 인스턴스에서 같은 격자를 동시에 두 번 받지 않게 */
const inflight = new Map<string, Promise<WxGrid | null>>();
function refreshGrid(nx: number, ny: number, nowMs: number, had: boolean, timeoutMs = 5000): Promise<WxGrid | null> {
    const k = `${nx},${ny}`;
    let p = inflight.get(k);
    if (!p) {
        p = (async () => {
            const g = await fetchShort(nx, ny, nowMs, timeoutMs);
            if (g) await saveGrid(nx, ny, g); else if (had) await touchGrid(nx, ny);
            return g;
        })().finally(() => inflight.delete(k));
        inflight.set(k, p);
    }
    return p;
}

const cityName = (key: string) => key.split("|")[1]?.replace(/(시|군)$/, "") ?? "";

/**
 * 한 골프장의 날씨. fetch=true 면 낡은 예보를 그 자리에서 새로 받는다(상세 화면), false 면 저장된 것만 읽는다(검색엔진용 화면).
 * 키가 없거나 좌표·구역을 모르거나 받아 둔 게 없으면 null — 화면은 그 구역을 그리지 않는다.
 */
export async function getCourseWeather(page: WeatherPage, opts: { fetch: boolean; nowMs?: number }): Promise<CourseWeather | null> {
    if (!weatherEnabled()) return null;
    const point = weatherPoint(page);
    if (!point) return null;
    const nowMs = opts.nowMs ?? Date.now();
    const { nx, ny } = toGrid(point.lat, point.lng);
    const land = landOf(point.zone.ta);

    const [gridRow, mids] = await Promise.all([readGrid(nx, ny), readMid([land.regId, point.zone.ta])]);
    let grid: WxGrid | null = gridRow?.data ?? null;
    let landRow = mids.get(land.regId) ?? null, taRow = mids.get(point.zone.ta) ?? null;

    if (opts.fetch) {
        const due = (base: string | undefined, fetchedMs: number | undefined, latest: string) =>
            (!base || base < latest) && (!fetchedMs || nowMs - fetchedMs > RETRY_MS);
        const latestMid = latestMidBase(nowMs);
        const [g, l, t] = await Promise.all([
            due(gridRow?.base, gridRow?.fetchedMs, latestShortBase(nowMs)) ? refreshGrid(nx, ny, nowMs, !!gridRow).catch(() => null) : null,
            due(landRow?.base, landRow?.fetchedMs, latestMid) ? fetchMidLand(land.regId, nowMs).catch(() => null) : null,
            due(taRow?.base, taRow?.fetchedMs, latestMid) ? fetchMidTa(point.zone.ta, nowMs).catch(() => null) : null,
        ]);
        if (g) grid = g;
        if (l) { landRow = { base: l.base, data: l.data, fetchedMs: nowMs }; await saveMid(land.regId, l).catch(() => {}); }
        if (t) { taRow = { base: t.base, data: t.data, fetchedMs: nowMs }; await saveMid(point.zone.ta, t).catch(() => {}); }
    }
    if (!grid) return null;
    const age = (base: string) => nowMs - (Date.UTC(+base.slice(0, 4), +base.slice(4, 6) - 1, +base.slice(6, 8), +base.slice(8, 10)) - 9 * 3600_000);
    if (age(grid.base) > SHORT_MAX_AGE_MS) return null;
    const fresh = <T,>(r: MidRow | null): MidSaved<T> | null => (r && age(r.base) <= MID_MAX_AGE_MS ? { base: r.base, data: r.data as T } : null);
    return buildWeather({
        grid, land: fresh<MidLand>(landRow), ta: fresh<MidTa>(taRow), midArea: `${land.label} · ${cityName(point.zone.key)}`,
        at: { lat: Math.round(point.lat * 1000) / 1000, lng: Math.round(point.lng * 1000) / 1000 }, nowMs,
        approx: point.approx ? cityName(point.zone.key) : null,
    });
}

// ── 데워 두기(크론) ────────────────────────────────────────────────
async function pool<T>(items: T[], size: number, until: number, work: (x: T) => Promise<boolean>): Promise<{ ok: number; fail: number; left: number }> {
    let i = 0, ok = 0, fail = 0;
    const run = async () => {
        while (i < items.length && Date.now() < until) {
            const x = items[i++];
            try { (await work(x)) ? ok++ : fail++; } catch { fail++; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
    return { ok, fail, left: items.length - ok - fail };
}

/**
 * 모든 골프장의 격자·구역 가운데 낡은 것을 시간 예산만큼 새로 받는다. 없는 것 먼저, 그다음 가장 오래된 것.
 * 한 번에 다 못 돌아도 된다 — 다음 크론이 이어서 돌고, 사람이 여는 골프장은 그 자리에서 새로 받는다.
 */
export async function warmWeather(pages: WeatherPage[], opts: { budgetMs?: number; nowMs?: number } = {}): Promise<Record<string, number | string>> {
    if (!weatherEnabled()) return { skipped: "DATA_GO_KR_KEY 없음" };
    const nowMs = opts.nowMs ?? Date.now();
    const until = Date.now() + (opts.budgetMs ?? 6000);
    const grids = new Map<string, { nx: number; ny: number }>();
    const midIds = new Map<string, "land" | "ta">();
    for (const p of pages) {
        const pt = weatherPoint(p);
        if (!pt) continue;
        const g = toGrid(pt.lat, pt.lng);
        grids.set(`${g.nx},${g.ny}`, g);
        midIds.set(landOf(pt.zone.ta).regId, "land"); midIds.set(pt.zone.ta, "ta");
    }

    // 중기(하루 두 번 발표, 한 번에 40ms 남짓) — 먼저 끝낸다
    const latestMid = latestMidBase(nowMs);
    const midRows = await readMid([...midIds.keys()]);
    const midDue = [...midIds].filter(([id]) => { const r = midRows.get(id); return !r || (r.base < latestMid && nowMs - r.fetchedMs > RETRY_MS); });
    const mid = await pool(midDue, 8, until, async ([id, kind]) => {
        const m = kind === "land" ? await fetchMidLand(id, nowMs) : await fetchMidTa(id, nowMs);
        if (!m) return false;
        await saveMid(id, m);
        return true;
    });

    const latest = latestShortBase(nowMs);
    const have = new Map<string, { base: string; ms: number }>();
    for (const r of rowsOf(await db.execute(sql`select nx, ny, base, (extract(epoch from fetched_at) * 1000)::bigint as ms from golf_weather_grid`))) {
        have.set(`${r.nx},${r.ny}`, { base: r.base, ms: Number(r.ms) });
    }
    const due = [...grids].filter(([k]) => { const h = have.get(k); return !h || (h.base < latest && nowMs - h.ms > RETRY_MS); })
        .sort((a, b) => (have.get(a[0])?.ms ?? 0) - (have.get(b[0])?.ms ?? 0));
    // 한 번에 2.5초까지만 기다린다 — 예산이 끝날 무렵 시작한 호출이 서버리스 시간 제한까지 끌고 가지 않게(크론이 그만큼 남겨 둔다)
    const short = await pool(due, 8, until, async ([k, g]) => !!(await refreshGrid(g.nx, g.ny, nowMs, have.has(k), 2500)));

    return {
        grids: grids.size, gridDue: due.length, gridOk: short.ok, gridFail: short.fail, gridLeft: short.left,
        mids: midIds.size, midDue: midDue.length, midOk: mid.ok, midFail: mid.fail, base: latest,
    };
}
