/**
 * 골프장 날씨(2026-10-05 오너: "기상청 날씨 … 순서대로 하자").
 *
 * 왜: 네이버 검색량으로 재 보니 골프장 이름에 붙여 찾는 말 1위가 '날씨'였다(날씨 100 · 맛집 30 · 그린피 3).
 * 자료: 기상청 단기예보(5km 격자, 오늘~3일 뒤 — 사흘은 한 시간 단위, 나흘째는 세 시간 단위·정성 예보)
 *       + 중기예보(4~10일 뒤 — 하늘·강수확률은 권역, 기온은 시군). 공공누리 1유형(출처 표시) — 저장·게재 가능.
 *       그래서 검색엔진용 화면(server/prerender.ts)에도 같은 숫자를 싣는다.
 * 15일 예보는 기상청에 없다. 열하루(오늘 + 10일)가 끝이다.
 *
 * 여기는 순수 함수만 — 격자 변환, 발표 시각, 응답 파싱, 하루 묶기, 해 뜨고 지는 시각, 문구.
 * 받아 오기·저장은 server/services/golfWeather.ts, 시군 표는 shared/golfWeatherZones.ts.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */

const KST = 9 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 한국 시각의 조각들 */
export function kstParts(ms: number): { y: number; m: number; d: number; h: number; min: number; ymd: string; key: string; dow: number } {
    const k = new Date(ms + KST);
    const y = k.getUTCFullYear(), m = k.getUTCMonth() + 1, d = k.getUTCDate(), h = k.getUTCHours(), min = k.getUTCMinutes();
    return { y, m, d, h, min, ymd: `${y}${pad(m)}${pad(d)}`, key: `${y}-${pad(m)}-${pad(d)}`, dow: k.getUTCDay() };
}
/** "YYYYMMDD" + n일 */
export function addDays(ymd: string, n: number): string {
    const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) + n * 86_400_000;
    const k = new Date(t);
    return `${k.getUTCFullYear()}${pad(k.getUTCMonth() + 1)}${pad(k.getUTCDate())}`;
}
export const ymdToKey = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
/** "YYYYMMDD[HH[mm]]"(한국 시각) → epoch ms */
export function kstToMs(s: string): number {
    return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +(s.slice(8, 10) || 0), +(s.slice(10, 12) || 0)) - KST;
}

// ── 격자 ──────────────────────────────────────────────────────────
/** 위경도 → 기상청 단기예보 격자(Lambert Conformal Conic, 5km). 기상청이 배포한 변환식 그대로. */
export function toGrid(lat: number, lng: number): { nx: number; ny: number } {
    const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
    const DEGRAD = Math.PI / 180.0;
    const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = (re * sf) / Math.pow(ro, sn);
    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = (re * sf) / Math.pow(ra, sn);
    let theta = lng * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;
    return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// ── 발표 시각 ─────────────────────────────────────────────────────
/** 단기예보는 하루 여덟 번(한국 시각). 발표 10분쯤 뒤에 열린다 — 15분 여유를 둔다. */
export const SHORT_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const;
const SHORT_LAG_MIN = 15;
/** 지금 받을 수 있는 가장 새 단기 발표 "YYYYMMDDHHmm". back=1 이면 그 앞 발표(아직 안 열렸을 때 물러설 곳). */
export function latestShortBase(nowMs: number, back = 0): string {
    const t = nowMs - SHORT_LAG_MIN * 60_000;
    let p = kstParts(t);
    let idx = -1;
    for (let i = SHORT_BASE_HOURS.length - 1; i >= 0; i--) if (SHORT_BASE_HOURS[i] <= p.h) { idx = i; break; }
    let ymd = p.ymd;
    if (idx < 0) { ymd = addDays(ymd, -1); idx = SHORT_BASE_HOURS.length - 1; }
    for (let b = 0; b < back; b++) { idx--; if (idx < 0) { ymd = addDays(ymd, -1); idx = SHORT_BASE_HOURS.length - 1; } }
    return `${ymd}${pad(SHORT_BASE_HOURS[idx])}00`;
}
/** 중기예보는 06·18시. 30분 여유. */
export function latestMidBase(nowMs: number, back = 0): string {
    const p = kstParts(nowMs - 30 * 60_000);
    let ymd = p.ymd, h = p.h >= 18 ? 18 : p.h >= 6 ? 6 : -1;
    if (h < 0) { ymd = addDays(ymd, -1); h = 18; }
    for (let b = 0; b < back; b++) { if (h === 18) h = 6; else { h = 18; ymd = addDays(ymd, -1); } }
    return `${ymd}${pad(h)}00`;
}

// ── 하늘 ──────────────────────────────────────────────────────────
export type WxKind = "clear" | "partly" | "cloudy" | "rain" | "sleet" | "snow" | "shower";
export const WX_LABEL: Record<WxKind, string> = { clear: "맑음", partly: "구름많음", cloudy: "흐림", rain: "비", sleet: "비·눈", snow: "눈", shower: "소나기" };
export const isWet = (k: WxKind) => k === "rain" || k === "sleet" || k === "snow" || k === "shower";
/** 단기예보의 하늘(SKY 1·3·4)과 강수형태(PTY 0~4) → 한 낱말. 강수형태가 있으면 그게 이긴다. */
export function kindOf(sky: number, pty: number): WxKind {
    if (pty === 1) return "rain"; if (pty === 2) return "sleet"; if (pty === 3) return "snow"; if (pty === 4) return "shower";
    return sky >= 4 ? "cloudy" : sky >= 3 ? "partly" : "clear";
}
/** 중기예보의 글("구름많고 비", "흐리고 비/눈" …) → 한 낱말 */
export function kindOfText(wf: string | null | undefined): WxKind | null {
    const s = String(wf ?? "").replace(/\s/g, "");
    if (!s) return null;
    if (s.includes("비/눈") || s.includes("눈/비")) return "sleet";
    if (s.includes("소나기")) return "shower";
    if (s.includes("눈")) return "snow";
    if (s.includes("비")) return "rain";
    if (s.includes("흐림") || s.includes("흐리")) return "cloudy";
    if (s.includes("구름")) return "partly";
    return "clear";
}
/** 바람 단계(나흘째 정성 예보): 1 약함(4m/s 미만) · 2 약간 강함(4~9) · 3 강함(9 이상) */
export const WIND_LEVEL: Record<number, string> = { 1: "약함", 2: "약간 강함", 3: "강함" };
const RAIN_LEVEL: Record<number, string> = { 1: "약한 비", 2: "보통 비", 3: "강한 비" };

// ── 단기예보 파싱 ─────────────────────────────────────────────────
export interface KmaItem { category: string; fcstDate: string; fcstTime: string; fcstValue: string }
export interface WxHour {
    /** "YYYYMMDDHH"(한국 시각) */
    t: string;
    tmp: number | null;
    /** 강수확률 % */
    pop: number | null;
    kind: WxKind;
    /** 풍속 m/s — 숫자로 나온 시간만 */
    wsd: number | null;
    /** 바람 단계 1~3 — 숫자 대신 단계로 나오는 먼 시간(나흘째) */
    wq?: number;
    /** 강수량 글("1mm 미만", "1.0mm", "30.0~50.0mm", "약한 비") — 없으면 null */
    pcp: string | null;
}
export interface WxGrid {
    /** 발표 "YYYYMMDDHHmm" */
    base: string;
    hours: WxHour[];
    /** 날짜("YYYYMMDD")별 최저·최고 — 기상청이 준 값(TMN·TMX) */
    minmax: Record<string, { tmn?: number; tmx?: number }>;
}
const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > -900 && n < 900 ? n : null;
};
/** getVilageFcst 의 item[] → 시간별 줄. 모르는 값은 버리지 않고 비워 둔다(틀린 숫자보다 빈칸이 낫다). */
export function parseShort(items: readonly KmaItem[], base: string): WxGrid {
    const byHour = new Map<string, Record<string, string>>();
    const minmax: WxGrid["minmax"] = {};
    for (const it of items) {
        if (it.category === "TMN" || it.category === "TMX") {
            const v = num(it.fcstValue);
            if (v != null) (minmax[it.fcstDate] ??= {})[it.category === "TMN" ? "tmn" : "tmx"] = Math.round(v);
            continue;
        }
        const k = it.fcstDate + it.fcstTime.slice(0, 2);
        let row = byHour.get(k);
        if (!row) byHour.set(k, row = {});
        row[it.category] = it.fcstValue;
    }
    const hours: WxHour[] = [];
    for (const [t, r] of [...byHour].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (r.TMP == null && r.SKY == null) continue;
        const pcpRaw = String(r.PCP ?? "").trim();
        // 먼 시간은 강수량·바람이 숫자가 아니라 단계(0~3)로 온다 — 강수량이 맨숫자 한 글자면 그 줄이다.
        const qual = /^[0-3]$/.test(pcpRaw);
        const pty = num(r.PTY) ?? 0, sky = num(r.SKY) ?? 1;
        const w = num(r.WSD);
        const h: WxHour = {
            t, tmp: num(r.TMP) == null ? null : Math.round(num(r.TMP)!), pop: num(r.POP), kind: kindOf(sky, pty),
            wsd: qual ? null : w,
            pcp: qual ? (RAIN_LEVEL[+pcpRaw] ?? null) : (!pcpRaw || pcpRaw === "강수없음" || pcpRaw === "0" ? null : pcpRaw),
        };
        if (qual && w != null && w >= 1 && w <= 3) h.wq = Math.round(w);
        hours.push(h);
    }
    return { base, hours, minmax };
}

// ── 중기예보 ──────────────────────────────────────────────────────
/** getMidLandFcst 한 줄(rnSt4Am … wf10)·getMidTa 한 줄(taMin4 … taMax10) — 필요한 칸만 저장한다 */
export type MidLand = Record<string, string | number | null>;
export type MidTa = Record<string, number | null>;
export const pickMidLand = (row: Record<string, unknown>): MidLand =>
    Object.fromEntries(Object.entries(row).filter(([k]) => /^(rnSt|wf)\d+(Am|Pm)?$/.test(k))) as MidLand;
export const pickMidTa = (row: Record<string, unknown>): MidTa =>
    Object.fromEntries(Object.entries(row).filter(([k]) => /^ta(Min|Max)\d+$/.test(k)).map(([k, v]) => [k, num(v)])) as MidTa;

/** 기온 구역코드 → 육상(하늘·강수확률) 권역코드와 이름 */
export function landOf(ta: string): { regId: string; label: string } {
    if (ta.startsWith("11B")) return { regId: "11B00000", label: "서울·인천·경기" };
    if (ta.startsWith("11D1")) return { regId: "11D10000", label: "강원 영서" };
    if (ta.startsWith("11D2")) return { regId: "11D20000", label: "강원 영동" };
    if (ta.startsWith("11C1")) return { regId: "11C10000", label: "충북" };
    if (ta.startsWith("11C2")) return { regId: "11C20000", label: "대전·세종·충남" };
    if (/^(11F1|21F1)/.test(ta)) return { regId: "11F10000", label: "전북" };
    if (/^(11F2|21F2)/.test(ta)) return { regId: "11F20000", label: "광주·전남" };
    if (ta.startsWith("11H1")) return { regId: "11H10000", label: "대구·경북" };
    if (ta.startsWith("11H2")) return { regId: "11H20000", label: "부산·울산·경남" };
    return { regId: "11G00000", label: "제주" };
}

// ── 하루 ──────────────────────────────────────────────────────────
export interface WxHalf { kind: WxKind; pop: number | null }
export interface WxDay {
    /** "YYYY-MM-DD"(한국 날짜) */
    date: string;
    /** short = 그 골프장 격자의 단기예보 · mid = 권역·시군 중기예보(더 넓고 덜 정확하다) */
    src: "short" | "mid";
    am: WxHalf | null;
    pm: WxHalf | null;
    tmn: number | null;
    tmx: number | null;
    /** 낮(06~18시) 최대 풍속 m/s */
    wsd: number | null;
    wq?: number;
}
/**
 * 반나절의 하늘. 비·눈은 한 시간이라도 있으면 그것(가장 센 것) — 골퍼에겐 그 한 시간이 정보다.
 * 비가 없으면 가장 잦은 하늘(같으면 더 흐린 쪽) — 한 시간 흐렸다고 반나절을 '흐림'이라 하지 않는다.
 */
function half(hs: WxHour[]): WxHalf | null {
    if (!hs.length) return null;
    const wet: WxKind[] = ["shower", "rain", "sleet", "snow"];
    const dry: WxKind[] = ["clear", "partly", "cloudy"];
    let pop: number | null = null, worst = -1;
    const count: Record<string, number> = {};
    for (const h of hs) {
        if (h.pop != null) pop = Math.max(pop ?? 0, h.pop);
        worst = Math.max(worst, wet.indexOf(h.kind));
        count[h.kind] = (count[h.kind] ?? 0) + 1;
    }
    if (worst >= 0) return { kind: wet[worst], pop };
    let kind: WxKind = "clear", best = 0;
    for (const k of dry) if ((count[k] ?? 0) >= best && count[k]) { kind = k; best = count[k]; }
    return { kind, pop };
}
/** 한 날짜의 시간별 줄 → 하루. 오전 06~11시 · 오후 12~17시(라운드하는 시간). */
export function dayFromHours(ymd: string, hours: readonly WxHour[], mm: { tmn?: number; tmx?: number } | undefined): WxDay | null {
    const hs = hours.filter((h) => h.t.startsWith(ymd));
    if (!hs.length) return null;
    const hr = (h: WxHour) => +h.t.slice(8, 10);
    const am = half(hs.filter((h) => hr(h) >= 6 && hr(h) < 12));
    const pm = half(hs.filter((h) => hr(h) >= 12 && hr(h) < 18));
    if (!am && !pm) return null; // 낮 시간이 하나도 없다(밤만 남은 오늘 · 0시 한 줄만 온 닷새째)
    const temps = hs.map((h) => h.tmp).filter((v): v is number => v != null);
    // 하루치(18시간 이상)가 다 있으면 시간별에서도 잴 수 있다. 기상청이 준 최저·최고가 먼저다.
    const whole = hs.length >= 18 || (hs.length >= 7 && hs.every((h, i, a) => i === 0 || +h.t.slice(8, 10) - +a[i - 1].t.slice(8, 10) === 3));
    const day = hs.filter((h) => hr(h) >= 6 && hr(h) <= 18);
    const winds = day.map((h) => h.wsd).filter((v): v is number => v != null);
    const wqs = day.map((h) => h.wq).filter((v): v is number => v != null);
    const d: WxDay = {
        date: ymdToKey(ymd), src: "short", am, pm,
        tmn: mm?.tmn ?? (whole && temps.length ? Math.min(...temps) : null),
        tmx: mm?.tmx ?? (whole && temps.length ? Math.max(...temps) : null),
        wsd: winds.length ? Math.round(Math.max(...winds) * 10) / 10 : null,
    };
    if (!winds.length && wqs.length) d.wq = Math.max(...wqs);
    return d;
}
/** 저장해 둔 중기예보 한 벌(발표 시각 + 필요한 칸) */
export interface MidSaved<T> { base: string; data: T }
/**
 * 중기예보 → 날짜별 하루. 하늘·강수확률(권역)과 기온(시군)은 따로 받아 오므로 발표 시각이 다를 수 있다 —
 * "n일째"를 각자의 발표일에서 날짜로 풀고 날짜로 합친다.
 */
export function midDays(land: MidSaved<MidLand> | null, ta: MidSaved<MidTa> | null): WxDay[] {
    const byDate = new Map<string, WxDay>();
    const slot = (date: string) => { let d = byDate.get(date); if (!d) byDate.set(date, d = { date, src: "mid", am: null, pm: null, tmn: null, tmx: null, wsd: null }); return d; };
    const one = (wf: unknown, rn: unknown): WxHalf | null => {
        const kind = kindOfText(wf as string);
        return kind ? { kind, pop: num(rn) } : null;
    };
    if (land) for (let n = 4; n <= 10; n++) {
        const L = land.data;
        const am = one(L[`wf${n}Am`], L[`rnSt${n}Am`]) ?? one(L[`wf${n}`], L[`rnSt${n}`]);
        const pm = one(L[`wf${n}Pm`], L[`rnSt${n}Pm`]) ?? one(L[`wf${n}`], L[`rnSt${n}`]);
        if (!am && !pm) continue;
        const d = slot(ymdToKey(addDays(land.base.slice(0, 8), n)));
        d.am = am; d.pm = pm;
    }
    if (ta) for (let n = 4; n <= 10; n++) {
        const tmn = num(ta.data[`taMin${n}`]), tmx = num(ta.data[`taMax${n}`]);
        if (tmn == null && tmx == null) continue;
        const d = slot(ymdToKey(addDays(ta.base.slice(0, 8), n)));
        d.tmn = tmn; d.tmx = tmx;
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── 한 골프장의 날씨 ──────────────────────────────────────────────
export interface CourseWeather {
    /** 단기 발표 "YYYYMMDDHHmm"(한국 시각) */
    base: string;
    /** 중기 발표 — 없으면 단기만 */
    midBase: string | null;
    /** 지금 이후의 시간별(지난 시간은 뺀다) */
    hours: WxHour[];
    /** 오늘부터 최대 열하루 */
    days: WxDay[];
    /** 중기예보가 어느 권역·시군 것인지(화면 각주) — "서울·인천·경기 · 용인" */
    midArea: string | null;
    /** 예보 지점(해 뜨고 지는 시각을 재는 데도 쓴다) */
    at: { lat: number; lng: number };
    /** 골프장 좌표가 없거나 믿기 어려워 이 시군 중심으로 잡았다 — 화면에 "○○ 기준"이라고 적는다 */
    approx?: string;
}
export const WX_MAX_DAYS = 11;
/** 저장해 둔 단기·중기 → 한 골프장의 날씨(순수 함수). 지난 시간·지난 날은 뺀다. */
export function buildWeather(input: {
    grid: WxGrid; land: MidSaved<MidLand> | null; ta: MidSaved<MidTa> | null; midArea: string | null;
    at: { lat: number; lng: number }; nowMs: number; approx?: string | null;
}): CourseWeather | null {
    const { grid, nowMs } = input;
    const now = kstParts(nowMs);
    const nowKey = `${now.ymd}${pad(now.h)}`;
    const hours = grid.hours.filter((h) => h.t >= nowKey);
    const days: WxDay[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
        const ymd = addDays(now.ymd, i);
        // 오늘은 남은 시간으로만 묶는다(지나간 오전의 비를 오늘 날씨라고 하지 않는다). 최저·최고는 기상청이 준 하루 값.
        const d = dayFromHours(ymd, i === 0 ? hours : grid.hours, grid.minmax[ymd]);
        if (d) { days.push(d); seen.add(d.date); }
    }
    for (const d of midDays(input.land, input.ta)) {
        if (seen.has(d.date) || d.date < now.key) continue;
        days.push(d); seen.add(d.date);
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    // 날이 이어지는 데까지만 — 가운데가 빈 채로 뒷날을 보여 주면 하루를 건너뛴 것처럼 읽힌다.
    const out: WxDay[] = [];
    const tomorrow = ymdToKey(addDays(now.ymd, 1));
    for (const d of days) {
        if (!out.length) { if (d.date !== now.key && d.date !== tomorrow) break; }
        else if (ymdToKey(addDays(out[out.length - 1].date.replace(/-/g, ""), 1)) !== d.date) break;
        out.push(d);
        if (out.length >= WX_MAX_DAYS) break;
    }
    if (!out.length) return null;
    return {
        base: grid.base, midBase: input.land?.base ?? input.ta?.base ?? null, hours, days: out, midArea: input.midArea, at: input.at,
        ...(input.approx ? { approx: input.approx } : {}),
    };
}

// ── 해 ────────────────────────────────────────────────────────────
/** 해 뜨고 지는 시각(한국 시각 "HH:MM") — NOAA 근사식, 1~2분 안쪽. 첫 티·마지막 티를 가늠하는 데 쓴다. */
export function sunTimes(lat: number, lng: number, dateKey: string): { rise: string; set: string } | null {
    const [y, m, d] = dateKey.split("-").map(Number);
    const rad = Math.PI / 180;
    const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
    const calc = (rising: boolean): string | null => {
        const lngHour = lng / 15;
        const t = n + ((rising ? 6 : 18) - lngHour) / 24;
        const M = 0.9856 * t - 3.289;
        let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
        L = ((L % 360) + 360) % 360;
        let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
        RA = ((RA % 360) + 360) % 360;
        RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
        const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
        const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
        if (cosH > 1 || cosH < -1) return null;
        const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
        const T = H + RA - 0.06571 * t - 6.622;
        const local = (((T - lngHour + 9) % 24) + 24) % 24;
        const hh = Math.floor(local), mm = Math.round((local - hh) * 60);
        return mm === 60 ? `${pad((hh + 1) % 24)}:00` : `${pad(hh)}:${pad(mm)}`;
    };
    const rise = calc(true), set = calc(false);
    return rise && set ? { rise, set } : null;
}

// ── 문구 ──────────────────────────────────────────────────────────
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** "10/6(화)" */
export function dayLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}
export const dowOf = (dateKey: string) => { const [y, m, d] = dateKey.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
/** 발표 시각 글 — "10/5 11시" */
export const baseLabel = (base: string) => `${+base.slice(4, 6)}/${+base.slice(6, 8)} ${+base.slice(8, 10)}시`;
/** 하루의 하늘 한마디 — 오전·오후가 같으면 한 낱말, 다르면 "맑다가 비" */
export function daySky(d: Pick<WxDay, "am" | "pm">): string {
    const a = d.am?.kind, p = d.pm?.kind;
    if (a && p && a !== p) return `오전 ${WX_LABEL[a]} · 오후 ${WX_LABEL[p]}`;
    const k = a ?? p;
    return k ? WX_LABEL[k] : "";
}
export const dayPop = (d: Pick<WxDay, "am" | "pm">): number | null => {
    const v = [d.am?.pop, d.pm?.pop].filter((x): x is number => x != null);
    return v.length ? Math.max(...v) : null;
};
/** 검색엔진용 한 줄 — "10/6(화) 맑음 · 10°~21° · 강수확률 20% · 바람 최대 3m/s" */
export function dayLine(d: WxDay): string {
    const pop = dayPop(d);
    const temp = d.tmn != null && d.tmx != null ? `${d.tmn}°~${d.tmx}°` : d.tmx != null ? `최고 ${d.tmx}°` : d.tmn != null ? `최저 ${d.tmn}°` : "";
    const wind = d.wsd != null ? `바람 최대 ${d.wsd}m/s` : d.wq ? `바람 ${WIND_LEVEL[d.wq]}` : "";
    return [`${dayLabel(d.date)} ${daySky(d)}`.trim(), temp, pop != null ? `강수확률 ${pop}%` : "", wind].filter(Boolean).join(" · ");
}
