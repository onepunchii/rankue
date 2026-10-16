/**
 * 항구 브리핑 — 공공 자료 여섯 가지를 받아 한 장으로 엮는다(2026-10-14 오너: "신청한 것에서 모든 정보 다 가지고 와서 조합하자").
 *
 * 자료(공공데이터포털 · 키 DATA_GO_KR_KEY 하나 — 없으면 조용히 null):
 *   국립해양조사원 — 예측 조위(surveyTideLevel · tdlvHgt) · 수온(surveyWaterTemp) · 기온(surveyAirTemp) ·
 *                    해양관측부이(twRecent) · 해무관측소(surveySeafog) · 바다낚시지수(fcstFishingv2)
 *   한국천문연구원 — 출몰시각(getLCRiseSetInfo)
 * 받아 두는 곳: fishing_obs(kind, key). 예측 조위 · 출몰시각은 그날 것을 한 번 받아 그대로 쓰고, 낚시지수는 세 시간, 지금의 바다는 20분마다 다시 받는다.
 * 한 조각을 못 받아도 나머지는 준다(그 칸만 비운다). 조석 곡선을 못 받으면 브리핑을 내지 않는다(null).
 * 읽는 규칙 · 만조/간조 찾기는 shared/fishingPort. 항구 목록은 shared/fishingStations.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { fishingPort, type FishingPort } from "../../shared/fishingStations.js";
import { hmToMin, indexMapOf, isFishingIndexStep, tideTurns, type IndexAllRow, type IndexMap, type PortBrief, type PortIndexRow, type PortNow, type PortSun } from "../../shared/fishingPort.js";
import { fishingKstDay } from "../../shared/fishing.js";
import { noteFeed, type FeedSource } from "./fishingFeedHealth.js";

const KHOA = "https://apis.data.go.kr/1192136";
const KASI = "https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo";
const INDEX_TTL_MS = 3 * 3600_000;
const NOW_TTL_MS = 20 * 60_000;
/** 오늘부터 며칠을 보여 주는가(낚시지수가 엿새치다) */
export const PORT_DAYS = 6;
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const num = (v: unknown): number | null => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return v == null || !Number.isFinite(n) ? null : n; };

async function getJson(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<any | null> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    try {
        const r = await fetch(`${u.toString()}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`, { signal: AbortSignal.timeout(timeoutMs) });
        return await r.json().catch(() => null);
    } catch { return null; }
}
/** 국립해양조사원 한 번 — 정상(00)이면 줄들, 자료 없음(03)이면 빈 배열, 그 밖은 null */
async function khoa(service: string, params: Record<string, string | number>, timeoutMs = 4000): Promise<any[] | null> {
    // 변수의 차례를 지킨다 — numOfRows 가 pageNo 보다 앞에 와야 한다(2026-10-14: 낚시지수를 pageNo 먼저로 불렀더니 5초 뒤 엉뚱한 꼴이 왔다)
    const { pageNo = 1, ...rest } = params;
    const j = await getJson(`${KHOA}/${service}`, { type: "json", ...rest, pageNo }, timeoutMs);
    const code = j?.header?.resultCode;
    // 받기 기록(어드민 › 낚시 › 공공자료) — 00 · 03(자료 없음)은 성공, 그 밖은 실패와 그 까닭
    await noteFeed(`khoa:${service.split("/")[0]}` as FeedSource, code === "00" || code === "03", code ? `결과 코드 ${code}${j?.header?.resultMsg ? ` · ${String(j.header.resultMsg).slice(0, 60)}` : ""}` : "응답 없음(시간 초과 · 꼴이 다름)");
    if (code === "03") return [];
    if (code !== "00") return null;
    const item = j.body?.items?.item;
    return Array.isArray(item) ? item : item ? [item] : [];
}

async function readObs<T>(kind: string, key: string): Promise<{ data: T; ms: number } | null> {
    const [row] = rowsOf(await db.execute(sql`select data, (extract(epoch from fetched_at) * 1000)::bigint as ms from fishing_obs where kind = ${kind} and key = ${key}`));
    return row ? { data: row.data as T, ms: Number(row.ms) } : null;
}
async function saveObs(kind: string, key: string, data: unknown): Promise<void> {
    await db.execute(sql`
        insert into fishing_obs (kind, key, data, fetched_at) values (${kind}, ${key}, ${JSON.stringify(data)}::jsonb, now())
        on conflict (kind, key) do update set data = excluded.data, fetched_at = now()`);
}
const ymd = (day: string) => day.replace(/-/g, "");
const clock = (s: unknown): string | null => { const m = String(s ?? "").match(/(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : null; };

/** 그날의 예측 조위 — [분, cm] 10분 간격. 예측이라 한 번 받으면 그대로 쓴다 */
async function tideDay(port: FishingPort, day: string): Promise<[number, number][] | null> {
    const key = `${port.code}:${day}`;
    const have = await readObs<[number, number][]>("tide", key);
    if (have?.data?.length) return have.data;
    const rows = await khoa("surveyTideLevel/GetSurveyTideLevelApiService", { obsCode: port.code, reqDate: ymd(day), min: 10, numOfRows: 200 });
    if (!rows) return null;
    const points: [number, number][] = [];
    for (const r of rows) {
        const t = String(r.obsrvnDt ?? "").match(/(\d{2}):(\d{2})/), cm = num(r.tdlvHgt);
        if (t && cm != null) points.push([Number(t[1]) * 60 + Number(t[2]), Math.round(cm * 10) / 10]);
    }
    // 하루의 대부분이 와야 곡선이다 — 덜 온 날은 받아 두지 않는다(다음에 다시 받는다)
    if (points.length < 100) return points.length ? points : null;
    await saveObs("tide", key, points).catch(() => {});
    return points;
}

/** 해 · 달의 출몰 — 천문연은 좌표에 가장 가까운 등록 지점의 값을 준다(그 이름을 같이 준다) */
async function sunDay(port: FishingPort, day: string): Promise<PortSun | null> {
    const key = `${port.code}:${day}`;
    const have = await readObs<PortSun>("sun", key);
    if (have?.data) return have.data;
    const j = await getJson(KASI, { locdate: ymd(day), longitude: port.lng.toFixed(2), latitude: port.lat.toFixed(2), dnYn: "Y", _type: "json" }, 4000);
    await noteFeed("kasi:riseSet", !!j?.response?.body, j ? null : "응답 없음");
    const item = j?.response?.body?.items?.item;
    const it = Array.isArray(item) ? item[0] : item;
    if (!it) return null;
    const sun: PortSun = { rise: hmToMin(it.sunrise), set: hmToMin(it.sunset), moonrise: hmToMin(it.moonrise), moonset: hmToMin(it.moonset), dawn: hmToMin(it.civilm), dusk: hmToMin(it.civile), at: typeof it.location === "string" ? it.location.trim() : null };
    if (sun.rise == null || sun.set == null) return null;
    await saveObs("sun", key, sun).catch(() => {});
    return sun;
}

/** 바다낚시지수 엿새치(가까운 지점) — 세 시간마다 다시 받는다. 못 받으면 가진 것을 쓴다 */
async function indexFor(point: string, nowMs: number): Promise<PortIndexRow[] | null> {
    const have = await readObs<PortIndexRow[]>("index", point);
    if (have && nowMs - have.ms < INDEX_TTL_MS) return have.data;
    const rows = await khoa("fcstFishingv2/GetFcstFishingApiServicev2", { gubun: "갯바위", placeName: point, numOfRows: 300 });
    if (!rows) return have?.data ?? null;
    const pair = (a: unknown, b: unknown): [number, number] | null => { const x = num(a), y = num(b); return x == null || y == null ? null : [Math.min(x, y), Math.max(x, y)]; };
    const out: PortIndexRow[] = [];
    for (const r of rows) {
        const day = String(r.predcYmd ?? ""), part = String(r.predcNoonSeCd ?? "");
        // 대상어가 없는 지점(먼 앞바다)은 어종 칸이 "-" 다 — 어종 없이 '종합'으로 싣는다(파고 · 바람 예보는 그대로 쓸모 있다)
        const fish = String(r.seafsTgfshNm ?? "").trim().replace(/^-$/, "") || "종합";
        // 지점 이름이 부분 일치로 걸러져 올 수 있다 — 같은 이름만
        if (String(r.seafsPstnNm ?? "") !== point || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !isFishingIndexStep(r.totalIndex)) continue;
        if (part !== "오전" && part !== "오후" && part !== "일") continue;
        out.push({ day, part, fish, index: r.totalIndex, wave: pair(r.minWvhgt, r.maxWvhgt), wind: pair(r.minWspd, r.maxWspd), wtemp: pair(r.minWtem, r.maxWtem), tide: typeof r.tdlvHrCn === "string" && r.tdlvHrCn ? r.tdlvHrCn : null });
    }
    if (!out.length) return have?.data ?? [];
    await saveObs("index", point, out).catch(() => {});
    return out;
}

/** 지금의 바다 — 수온 · 기온 · 가까운 부이 · 해무관측소. 20분마다 다시 받는다 */
async function nowFor(port: FishingPort, day: string, nowMs: number): Promise<PortNow | null> {
    const have = await readObs<PortNow>("now", port.code);
    if (have && nowMs - have.ms < NOW_TTL_MS) return have.data;
    const last = <T>(rows: any[] | null, pick: (r: any) => T | null): T | null => { if (!rows) return null; for (let i = rows.length - 1; i >= 0; i--) { const v = pick(rows[i]); if (v != null) return v; } return null; };
    const [wt, at, buoy, fog] = await Promise.all([
        khoa("surveyWaterTemp/GetSurveyWaterTempApiService", { obsCode: port.code, reqDate: ymd(day), min: 60, numOfRows: 30 }),
        khoa("surveyAirTemp/GetSurveyAirTempApiService", { obsCode: port.code, reqDate: ymd(day), min: 60, numOfRows: 30 }),
        port.buoy ? khoa("twRecent/GetTWRecentApiService", { obsCode: port.buoy.code, numOfRows: 1 }) : Promise.resolve(null),
        port.fog ? khoa("surveySeafog/GetSurveySeafogApiService", { obsCode: port.fog.code, numOfRows: 1 }) : Promise.resolve(null),
    ]);
    const b = buoy?.[0], f = fog?.[0];
    const now: PortNow = {
        wtemp: last(wt, (r) => num(r.wtem)), atemp: last(at, (r) => num(r.artmp)),
        buoy: port.buoy && b ? { name: port.buoy.name, km: port.buoy.km, wave: num(b.wvhgt), wind: num(b.wspd), windDir: num(b.wndrct), wtemp: num(b.wtem), at: clock(b.obsrvnDt) } : null,
        fog: port.fog && f ? { name: port.fog.name, km: port.fog.km, visM: num(f.dtvsbM20kLen), at: clock(f.obsrvnDt) } : null,
    };
    // 아무것도 못 받았으면 받아 두지 않는다 — 가진 것이 있으면 그것을 준다
    if (now.wtemp == null && now.atemp == null && !now.buoy && !now.fog) return have?.data ?? null;
    await saveObs("now", port.code, now).catch(() => {});
    return now;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function getPortBrief(code: string, wantDay: string | null, nowMs = Date.now()): Promise<PortBrief | null> {
    const port = fishingPort(code);
    if (!port || !process.env.DATA_GO_KR_KEY) return null;
    const today = fishingKstDay(nowMs);
    const days = Array.from({ length: PORT_DAYS }, (_, i) => addDays(today, i));
    const day = wantDay && days.includes(wantDay) ? wantDay : today;
    const [points, sun, index, now] = await Promise.all([
        tideDay(port, day).catch(() => null),
        sunDay(port, day).catch(() => null),
        port.index ? indexFor(port.index.name, nowMs).catch(() => null) : Promise.resolve(null),
        day === today ? nowFor(port, day, nowMs).catch(() => null) : Promise.resolve(null),
    ]);
    if (!points || points.length < 12) return null;
    const rows = (index ?? []).filter((r) => r.day === day);
    return {
        port: { code: port.code, name: port.name, area: port.area }, day, days, points,
        turns: tideTurns(points.map(([min, cm]) => ({ min, cm }))),
        sun, now,
        index: port.index && rows.length ? { point: port.index.name, km: port.index.km, rows } : null,
    };
}

/**
 * 낚시지수 지도 — 지점 마흔아홉 곳 · 엿새치 전부(1,400줄쯤 · 300줄씩 다섯 쪽). 세 시간마다 다시 받는다.
 * 한 쪽씩 띄워서 받는다. 다 못 받았으면 받아 두지 않고 가진 것을 쓴다(반쪽 지도를 온 것처럼 보이지 않게).
 */
async function indexAll(nowMs: number, cachedOnly = false): Promise<IndexAllRow[] | null> {
    const have = await readObs<IndexAllRow[]>("indexall", "all");
    if (have && nowMs - have.ms < INDEX_TTL_MS) return have.data;
    // 조과를 적을 때는 받으러 가지 않는다 — 다섯 쪽을 받느라 저장이 늦어졌다(2026-10-17). 받아 둔 것(낡았어도)만, 데우기는 매시 크론이 한다
    if (cachedOnly) return have?.data ?? null;
    const pair = (a: unknown, b: unknown): [number, number] | null => { const x = num(a), y = num(b); return x == null || y == null ? null : [Math.min(x, y), Math.max(x, y)]; };
    const out: IndexAllRow[] = [];
    for (let pageNo = 1; pageNo <= 8; pageNo++) {
        const rows = await khoa("fcstFishingv2/GetFcstFishingApiServicev2", { gubun: "갯바위", numOfRows: 300, pageNo }, 5000);
        if (!rows) return have?.data ?? null;
        for (const r of rows) {
            const day = String(r.predcYmd ?? ""), part = String(r.predcNoonSeCd ?? ""), point = String(r.seafsPstnNm ?? "").trim();
            const lat = num(r.lat), lng = num(r.lot);
            if (!point || lat == null || lng == null || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !isFishingIndexStep(r.totalIndex)) continue;
            if (part !== "오전" && part !== "오후" && part !== "일") continue;
            out.push({ point, lat, lng, day, part, fish: String(r.seafsTgfshNm ?? "").trim().replace(/^-$/, "") || "종합", index: r.totalIndex, wave: pair(r.minWvhgt, r.maxWvhgt), wind: pair(r.minWspd, r.maxWspd), wtemp: pair(r.minWtem, r.maxWtem), tide: typeof r.tdlvHrCn === "string" && r.tdlvHrCn ? r.tdlvHrCn : null });
        }
        if (rows.length < 300) break;
        await new Promise((r) => setTimeout(r, 150));
    }
    if (out.length < 200) return have?.data ?? null;
    await saveObs("indexall", "all", out).catch(() => {});
    return out;
}

export async function getIndexMap(wantDay: string | null, nowMs = Date.now(), opts: { cachedOnly?: boolean } = {}): Promise<IndexMap | null> {
    if (!process.env.DATA_GO_KR_KEY) return null;
    const rows = await indexAll(nowMs, opts.cachedOnly === true).catch(() => null);
    if (!rows?.length) return null;
    const today = fishingKstDay(nowMs);
    const days = [...new Set(rows.map((r) => r.day))].filter((d) => d >= today).sort().slice(0, PORT_DAYS);
    if (!days.length) return null;
    const day = wantDay && days.includes(wantDay) ? wantDay : days[0];
    const map = indexMapOf(rows, day, days);
    return map.spots.length ? map : null;
}

