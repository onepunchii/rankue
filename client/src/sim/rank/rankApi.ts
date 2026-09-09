/** GET /sim/rank 클라이언트 + 국가 저장(PATCH /me). 값은 전부 hiq_sim_ratings(온라인 대전 Elo) — 실전 RP 와 무관. */
import { apiRequest } from "@/lib/queryClient";
import type { DashGameType, DashTableId } from "../dash/dashApi";

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
    /** 조합(종목×테이블)별 등재 인원과 내 대전 수 — 첫 화면을 사람이 있는 조합으로 열고 칩에 인원을 적는다. 예전 서버 응답엔 없다. */
    readonly combos: readonly { readonly gameType: DashGameType; readonly tableId: DashTableId; readonly ranked: number; readonly myMatches: number }[];
    readonly me: RankMe;
}
export interface RankQuery {
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
    /** null = 전체 */
    readonly country: string | null;
}

export const RANK_QUERY_KEY = ["sim-rank"] as const;
export function rankUrl(q: RankQuery): string {
    const p = new URLSearchParams({ gameType: q.gameType, tableId: q.tableId });
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
            tableId: (c.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" : "DAEDAE") as DashTableId,
            ranked: num(c.ranked), myMatches: num(c.myMatches),
        })),
        me: { rating: num(me.rating, 1000), matches: num(me.matches), wins: num(me.wins), country: cc(me.country), rank: numOrNull(me.rank), countryRank: numOrNull(me.countryRank) },
    };
}

export interface RankApi {
    getLadder(q: RankQuery): Promise<RankLadder>;
    setCountry(code: string): Promise<void>;
}

export type Request = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export function createRankApi(request: Request): RankApi {
    return {
        async getLadder(q) { return parseRankLadder(await request(rankUrl(q))); },
        async setCountry(code) { await request("/api/hiq/me", { method: "PATCH", body: { country: code } }); },
    };
}

export const rankApi: RankApi = createRankApi((url, options) => apiRequest(url, options));
