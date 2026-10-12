/** GET /sim/rank 클라이언트 + 국가 저장(PATCH /me). 값은 전부 hiq_sim_ratings(온라인 대전 Elo) — 실전 RP 와 무관. */
import { apiRequest } from "@/lib/queryClient";
import type { DashGameType, DashTableId } from "../dash/dashApi";
import { TIERS, type TierId } from "@shared/sim/rank";

export interface RankRow {
    readonly memberId: string;
    readonly name: string;
    readonly country: string | null;
    readonly rating: number;
    readonly matches: number;
    readonly wins: number;
    /** 전역 순위(국가 필터와 무관) */
    readonly rank: number;
    readonly countryRank: number;
}
export interface RankMe {
    readonly rating: number;
    readonly matches: number;
    readonly wins: number;
    readonly country: string | null;
    /** 배치 전엔 null */
    readonly rank: number | null;
    readonly countryRank: number | null;
}
export interface RankLadder {
    readonly rows: readonly RankRow[];
    /** 배치를 마친 선수 수(전체) */
    readonly total: number;
    readonly countries: readonly { country: string | null; players: number }[];
    /** 종목별 등재 인원과 내 대전 수 — 첫 화면을 사람이 있는 종목으로 열고 칩에 인원을 적는다. 예전 서버 응답엔 없다. */
    readonly combos: readonly { readonly gameType: DashGameType; readonly ranked: number; readonly myMatches: number }[];
    readonly me: RankMe;
}
export interface RankQuery {
    readonly gameType: DashGameType;
    /** null = 전체 */
    readonly country: string | null;
}

export const RANK_QUERY_KEY = ["sim-rank"] as const;
export function rankUrl(q: RankQuery): string {
    // 2026-09-12: 대대·중대를 합쳤다(오너) — tableId 는 더 보내지 않는다.
    const p = new URLSearchParams({ gameType: q.gameType });
    if (q.country) p.set("country", q.country);
    return `/api/hiq/sim/rank?${p.toString()}`;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const cc = (v: unknown): string | null => (typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parseRankLadder(raw: unknown): RankLadder {
    const o = rec(raw);
    const rows = Array.isArray(o.rows) ? o.rows.map(rec) : [];
    const countries = Array.isArray(o.countries) ? o.countries.map(rec) : [];
    const me = rec(o.me);
    return {
        rows: rows.filter((r) => typeof r.memberId === "string").map((r) => ({
            memberId: String(r.memberId), name: typeof r.name === "string" ? r.name : "", country: cc(r.country),
            rating: num(r.rating, 1000), matches: num(r.matches), wins: num(r.wins), rank: num(r.rank), countryRank: num(r.countryRank),
        })),
        total: num(o.total),
        countries: countries.map((c) => ({ country: cc(c.country), players: num(c.players) })),
        combos: (Array.isArray(o.combos) ? o.combos.map(rec) : []).map((c) => ({
            gameType: (c.gameType === "4c" ? "4c" : "3c") as DashGameType,
            ranked: num(c.ranked), myMatches: num(c.myMatches),
        })),
        me: { rating: num(me.rating, 1000), matches: num(me.matches), wins: num(me.wins), country: cc(me.country), rank: numOrNull(me.rank), countryRank: numOrNull(me.countryRank) },
    };
}

/* ── 이달의 랭킹(2026-10-12) — 그 달에 올린 점수. 통산 레이팅과 따로, 매월 1일 0 에서 시작한다(shared/simMonthly) ── */

export interface MonthlyRankRow {
    readonly memberId: string;
    readonly name: string;
    readonly country: string | null;
    /** 이달에 올린 점수(잃으면 음수) */
    readonly points: number;
    readonly matches: number;
    readonly wins: number;
    readonly rank: number;
    /** 지금 통산 등급(배치 전이면 null) — 이름 옆 배지 */
    readonly tier: TierId | null;
}
export interface MonthlyRank {
    /** "2026-10" */
    readonly month: string;
    /** 순위에 오르는 최소 판 수 */
    readonly minMatches: number;
    readonly rows: readonly MonthlyRankRow[];
    /** 순위에 오른 사람 수 */
    readonly total: number;
    /** 그 달에 한 판이라도 친 사람 수 */
    readonly players: number;
    readonly me: { readonly points: number; readonly matches: number; readonly wins: number; readonly rank: number | null; readonly tier: TierId | null };
    /** 대전이 있었던 달들(최근 달부터) */
    readonly months: readonly string[];
}
export interface MonthlyQuery { readonly gameType: DashGameType; readonly month?: string }

export function monthlyRankUrl(q: MonthlyQuery): string {
    const p = new URLSearchParams({ gameType: q.gameType });
    if (q.month) p.set("month", q.month);
    return `/api/hiq/sim/rank/monthly?${p.toString()}`;
}

const tierOrNull = (v: unknown): TierId | null => (typeof v === "string" && TIERS.some((t) => t.id === v) ? (v as TierId) : null);
const monthOr = (v: unknown, d: string): string => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : d);

export function parseMonthlyRank(raw: unknown, fallbackMonth = ""): MonthlyRank {
    const o = rec(raw);
    const rows = Array.isArray(o.rows) ? o.rows.map(rec) : [];
    const me = rec(o.me);
    const month = monthOr(o.month, fallbackMonth);
    return {
        month,
        minMatches: num(o.minMatches, 5),
        rows: rows.filter((r) => typeof r.memberId === "string").map((r) => ({
            memberId: String(r.memberId), name: typeof r.name === "string" ? r.name : "", country: cc(r.country),
            points: num(r.points), matches: num(r.matches), wins: num(r.wins), rank: num(r.rank), tier: tierOrNull(r.tier),
        })),
        total: num(o.total),
        players: num(o.players),
        me: { points: num(me.points), matches: num(me.matches), wins: num(me.wins), rank: numOrNull(me.rank), tier: tierOrNull(me.tier) },
        months: (Array.isArray(o.months) ? o.months : []).filter((m): m is string => typeof m === "string" && monthOr(m, "") !== ""),
    };
}

export interface RankApi {
    getLadder(q: RankQuery): Promise<RankLadder>;
    setCountry(code: string): Promise<void>;
    /** 이달의 랭킹. 옛 주입(시험)에는 없을 수 있다 — 없으면 화면이 통산만 보여 준다 */
    getMonthly?(q: MonthlyQuery): Promise<MonthlyRank>;
}

export type Request = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export function createRankApi(request: Request): RankApi {
    return {
        async getLadder(q) { return parseRankLadder(await request(rankUrl(q))); },
        async setCountry(code) { await request("/api/hiq/me", { method: "PATCH", body: { country: code } }); },
        async getMonthly(q) { return parseMonthlyRank(await request(monthlyRankUrl(q)), q.month ?? ""); },
    };
}

export const rankApi: RankApi = createRankApi((url, options) => apiRequest(url, options));
