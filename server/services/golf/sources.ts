/**
 * 골프 랭킹 출처 4곳에서 스냅샷을 받아 온다(2026-09-13). 네트워크만 여기, 해석은 parse.ts(순수).
 *
 *  - OWGR(남자 세계): apiweb.owgr.com 공개 JSON. 주차는 getEventsToDateHeader.
 *  - Rolex(여자 세계): rolexrankings.com/core/rankings/list?count=N JSON(전체 2,000여 명이 한 번에 온다).
 *    이 사이트는 UA 없는 요청을 403 으로 막으니 일반 브라우저와 같은 헤더를 보낸다.
 *  - KPGA: api.kpga.co.kr 공개 JSON(사이트 프런트가 쓰는 것과 같다). 지표는 record/submenu → record/detail.
 *  - KLPGA: klpga.co.kr/load/record/loadPublicRecord POST → HTML 조각. 메뉴 코드는 shared/golfTours.KLPGA_MENUS.
 * 요청 사이 150ms — 상대 서버 예의(PBA 동기화와 같은 규칙).
 */
import { KLPGA_MENUS, type GolfTour } from "../../../shared/golfTours.js";
import type { InsertGolfPlayer } from "../../../shared/schema.js";
import {
    kpgaRankingFromStats, klpgaRankingFromStats, mapKpgaStatRow, mapOwgrRow, mapRolexItem, parseKlpgaRows,
    type KpgaRecordJson, type OwgrRankingJson, type RankRow, type RolexItemJson, type StatRow,
} from "./parse.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const DELAY_MS = 150;
const TIMEOUT_MS = 20_000;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...init, signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8", ...(init.headers as Record<string, string> | undefined) } });
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        return res;
    } finally {
        clearTimeout(timer);
    }
}
async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return (await request(url, { headers: { Accept: "application/json, text/plain, */*", ...headers } })).json() as Promise<T>;
}

export interface StatList { readonly key: string; readonly label: string; readonly unit: string; readonly rows: StatRow[] }
export interface TourSnapshot {
    readonly tour: GolfTour;
    readonly edition: string;          // "2026-09-06"
    readonly editionDate: Date;
    readonly rows: RankRow[];
    readonly players: InsertGolfPlayer[];
    readonly season: string;           // 기록 시즌("2026")
    readonly stats: StatList[];
}

function isoDate(s: string | null | undefined): string | null {
    const m = String(s ?? "").match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
}
function seasonNow(): string { return String(new Date().getFullYear()); }
/** 오늘(KST) — 투어 랭킹 스냅샷의 회차 이름 */
export function todayKst(now = new Date()): string {
    return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ── OWGR ── */
const OWGR = "https://apiweb.owgr.com/api/owgr";

export async function fetchOwgr(): Promise<TourSnapshot> {
    const head = await getJson<{ weekNumber?: number; endDate?: string }>(`${OWGR}/events/getEventsToDateHeader`);
    const edition = isoDate(head?.endDate);
    if (!edition) throw new Error("OWGR 주차 헤더에 날짜가 없다");
    const rows: RankRow[] = [];
    for (let page = 1; page <= 20; page++) {
        const j = await getJson<{ rankingsList?: OwgrRankingJson[]; totalNumberOfPages?: number }>(
            `${OWGR}/rankings/getRankings?regionId=0&pageSize=1000&pageNumber=${page}&countryId=0&sortString=Rank+ASC`);
        for (const r of j.rankingsList ?? []) { const m = mapOwgrRow(r); if (m) rows.push(m); }
        if (!j.rankingsList?.length || page >= (j.totalNumberOfPages ?? 1)) break;
        await sleep(DELAY_MS);
    }
    if (rows.length < 100) throw new Error(`OWGR 행 수 비정상: ${rows.length}`);
    const players: InsertGolfPlayer[] = rows.map((r) => ({
        tour: "owgr", playerId: r.playerId, name: r.playerName, nameEn: r.playerName, country: r.country,
        birthDate: (r.extra?.birthDate as string | null) ?? null, extra: { isAmateur: !!r.extra?.isAmateur, weekNumber: head.weekNumber ?? null },
    }));
    return { tour: "owgr", edition, editionDate: new Date(edition + "T00:00:00Z"), rows, players, season: seasonNow(), stats: [] };
}

/* ── Rolex ── */
export async function fetchRolex(): Promise<TourSnapshot> {
    const j = await getJson<{ week?: Record<string, unknown>; list?: { items?: RolexItemJson[] } }>(
        "https://www.rolexrankings.com/core/rankings/list?count=5000", { Referer: "https://www.rolexrankings.com/rankings" });
    const items = j.list?.items ?? [];
    const rows = items.map(mapRolexItem).filter((r): r is RankRow => !!r);
    if (rows.length < 100) throw new Error(`Rolex 행 수 비정상: ${rows.length}`);
    // 회차: week.publish_date("2026-09-07", 실측) → 없으면 랭킹 페이지의 "as of" 문구 → 그것도 없으면 이번 주 월요일.
    const week = (j.week ?? {}) as { publish_date?: string; end_date?: string };
    let edition = isoDate(week.publish_date) ?? isoDate(week.end_date);
    if (!edition) {
        try {
            const html = await (await request("https://www.rolexrankings.com/rankings", { headers: { Accept: "text/html" } })).text();
            edition = html.match(/as of\s+(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
        } catch { /* 아래 폴백 */ }
    }
    if (!edition) {
        const d = new Date(); const day = (d.getUTCDay() + 6) % 7;   // 월=0
        d.setUTCDate(d.getUTCDate() - day); edition = d.toISOString().slice(0, 10);
    }
    const players: InsertGolfPlayer[] = rows.map((r) => ({ tour: "rolex", playerId: r.playerId, name: r.playerName, nameEn: r.playerName, country: r.country }));
    return { tour: "rolex", edition, editionDate: new Date(edition + "T00:00:00Z"), rows, players, season: seasonNow(), stats: [] };
}

/* ── KPGA ── */
const KPGA = "https://api.kpga.co.kr";
const KPGA_TOUR_ID = 11;   // 코리안투어
const KPGA_HEADERS = { Referer: "https://www.kpga.co.kr/", Origin: "https://www.kpga.co.kr" };
interface KpgaSubmenu { tabs?: Array<{ tabKey?: string; subMenus?: Array<{ menuId: number; metricKey?: string; label?: string; unit?: string; isDesc?: boolean }> }> }

export async function fetchKpga(year = seasonNow()): Promise<TourSnapshot> {
    const sub = await getJson<KpgaSubmenu>(`${KPGA}/record/submenu?year=${year}&tourId=${KPGA_TOUR_ID}`, KPGA_HEADERS);
    const menus = (sub.tabs ?? []).flatMap((t) => t.subMenus ?? []);
    if (!menus.length) throw new Error("KPGA 지표 메뉴가 비었다");
    const stats: StatList[] = [];
    for (const m of menus) {
        await sleep(DELAY_MS);
        try {
            const d = await getJson<{ records?: KpgaRecordJson[] }>(`${KPGA}/record/detail?tourId=${KPGA_TOUR_ID}&year=${year}&menuId=${m.menuId}`, KPGA_HEADERS);
            const rows = (d.records ?? []).map(mapKpgaStatRow).filter((r): r is StatRow => !!r);
            if (!rows.length) continue;
            // 라벨은 상세 응답의 title 이 맞다(submenu 의 label 은 metricKey 와 어긋나 있었다, 2026-09 실측)
            stats.push({ key: String(m.menuId), label: (d.records?.[0]?.title || m.label || `#${m.menuId}`).trim(), unit: (m.unit ?? "").trim(), rows });
        } catch (e) {
            console.warn(`[golf] KPGA menu ${m.menuId} 실패:`, (e as Error)?.message);
        }
    }
    const main = stats.find((s) => s.key === "1");
    if (!main || main.rows.length < 30) throw new Error("KPGA 제네시스 포인트 목록이 비정상");
    const rows = kpgaRankingFromStats(main.rows);
    const seen = new Map<string, InsertGolfPlayer>();
    for (const s of stats) for (const r of s.rows) {
        if (!seen.has(r.playerId)) seen.set(r.playerId, {
            tour: "kpga", playerId: r.playerId, name: r.playerName, nameKo: r.playerName, nameEn: (r.extra?.nameEn as string | null) ?? null,
            country: String(r.extra?.country || "KOR").toUpperCase(), extra: { sponsor: r.extra?.sponsor ?? null },
        });
    }
    return { tour: "kpga", edition: todayKst(), editionDate: new Date(todayKst() + "T00:00:00Z"), rows, players: [...seen.values()], season: year, stats };
}

/* ── KLPGA ── */
export async function fetchKlpga(season = seasonNow()): Promise<TourSnapshot> {
    const stats: StatList[] = [];
    for (const m of KLPGA_MENUS) {
        await sleep(DELAY_MS);
        try {
            const res = await request("https://klpga.co.kr/load/record/loadPublicRecord", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: "https://klpga.co.kr/web/record/publicRecordDetail", Accept: "text/html, */*" },
                body: `season=${encodeURIComponent(season)}&menu1=${m.menu1}&menu2=${m.menu2}`,
            });
            const rows = parseKlpgaRows(await res.text());
            if (rows.length) stats.push({ key: m.menu2, label: m.label, unit: m.unit, rows });
        } catch (e) {
            console.warn(`[golf] KLPGA ${m.menu1}/${m.menu2} 실패:`, (e as Error)?.message);
        }
    }
    const main = stats.find((s) => s.key === "Klpga");
    if (!main || main.rows.length < 30) throw new Error("KLPGA 대상포인트 목록이 비정상");
    const rows = klpgaRankingFromStats(main.rows);
    const seen = new Map<string, InsertGolfPlayer>();
    for (const s of stats) for (const r of s.rows) {
        if (!seen.has(r.playerId)) seen.set(r.playerId, { tour: "klpga", playerId: r.playerId, name: r.playerName, nameKo: r.playerName, country: "KOR" });
    }
    return { tour: "klpga", edition: todayKst(), editionDate: new Date(todayKst() + "T00:00:00Z"), rows, players: [...seen.values()], season, stats };
}

export const FETCHERS: Record<GolfTour, () => Promise<TourSnapshot>> = { owgr: fetchOwgr, rolex: fetchRolex, kpga: () => fetchKpga(), klpga: () => fetchKlpga() };
