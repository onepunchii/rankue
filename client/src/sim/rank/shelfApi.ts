/** GET /sim/shelf 클라이언트 — 장식장(달마다 받은 이달의 랭킹 메달 · 등급 배지). 규칙은 shared/simShelf, 값은 온라인 대전의 것(실전 RP 와 무관). */
import { apiRequest } from "@/lib/queryClient";
import { TIERS, type TierId } from "@shared/sim/rank";
import type { MedalRank, ShelfKind } from "@shared/simShelf";
import type { CupMedal } from "@shared/simCup";
import type { DashGameType } from "../dash/dashApi";

export interface ShelfAwardRow {
    /** "2026-10" */
    readonly month: string;
    /** cup = 월대회 메달(2026-10-12) — rank 가 1~5(우승 · 준우승 · 3위 · 4위 · 8강) */
    readonly kind: ShelfKind | "cup";
    readonly gameType: DashGameType;
    /** month_rank 일 때 1~3 · cup 일 때 1~5 */
    readonly rank: MedalRank | CupMedal | null;
    /** month_tier 일 때 등급 */
    readonly tier: TierId | null;
    readonly points: number;
    readonly matches: number;
    readonly wins: number;
    /** 그 달이 끝날 때의 레이팅 */
    readonly rating: number;
}
/** 이번 달이 지금 끝난다면 받는 것(아직 받은 것이 아니다) */
export interface ShelfPreviewRow {
    readonly gameType: DashGameType;
    readonly points: number;
    readonly matches: number;
    readonly wins: number;
    readonly rank: number | null;
    readonly total: number;
    readonly medal: MedalRank | null;
    readonly tier: TierId | null;
}
export interface Shelf {
    readonly member: { readonly id: string; readonly name: string; readonly country: string | null; readonly mine: boolean };
    /** 지금 등급(배치 전이면 null) */
    readonly tier: { readonly gameType: DashGameType; readonly tier: TierId; readonly rating: number } | null;
    /** 받은 것 — 최근 달부터 */
    readonly awards: readonly ShelfAwardRow[];
    readonly current: { readonly month: string; readonly daysLeft: number; readonly minMatches: number; readonly boards: readonly ShelfPreviewRow[] };
    /** 장식장이 쌓이기 시작한 달 */
    readonly since: string;
    /** 마지막으로 마감한 달(아직 없으면 null) */
    readonly closedThrough: string | null;
}

export const SHELF_QUERY_KEY = ["sim-shelf"] as const;
export const shelfUrl = (memberId?: string | null): string => (memberId ? `/api/hiq/sim/shelf?memberId=${encodeURIComponent(memberId)}` : "/api/hiq/sim/shelf");
/** 화면 주소 — 2026-10-16 부터 큐 케이스의 '메달 · 배지' 칸(/cue-case?sec=medals[&m=]). 옛 /online-game?shelf=1 은 SimulatorPage 가 여기로 돌려보낸다 */
export const shelfPath = (memberId?: string | null): string => (memberId ? `/cue-case?m=${encodeURIComponent(memberId)}&sec=medals` : "/cue-case?sec=medals");

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const cc = (v: unknown): string | null => (typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : null);
const tierOrNull = (v: unknown): TierId | null => (typeof v === "string" && TIERS.some((t) => t.id === v) ? (v as TierId) : null);
const medalOrNull = (v: unknown): MedalRank | null => (v === 1 || v === 2 || v === 3 ? v : null);
const cupOrNull = (v: unknown): CupMedal | null => (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null);
const monthOr = (v: unknown, d: string): string => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : d);
const game = (v: unknown): DashGameType => (v === "4c" ? "4c" : "3c");

export function parseShelf(raw: unknown): Shelf {
    const o = rec(raw);
    const m = rec(o.member);
    const tier = rec(o.tier);
    const cur = rec(o.current);
    const tierId = tierOrNull(tier.tier);
    return {
        member: { id: typeof m.id === "string" ? m.id : "", name: typeof m.name === "string" ? m.name : "", country: cc(m.country), mine: m.mine === true },
        tier: tierId ? { gameType: game(tier.gameType), tier: tierId, rating: num(tier.rating, 1000) } : null,
        // 종류와 값이 맞지 않는 줄(메달인데 등수가 없다 등)은 버린다 — 빈 그림을 그리지 않는다
        awards: (Array.isArray(o.awards) ? o.awards.map(rec) : []).map((a): ShelfAwardRow | null => {
            const month = monthOr(a.month, "");
            const kind = a.kind === "month_rank" ? "month_rank" : a.kind === "month_tier" ? "month_tier" : a.kind === "cup" ? "cup" : null;
            const rank = kind === "cup" ? cupOrNull(a.rank) : medalOrNull(a.rank), t = tierOrNull(a.tier);
            if (!month || !kind || (kind !== "month_tier" && !rank) || (kind === "month_tier" && !t)) return null;
            return { month, kind, gameType: game(a.gameType), rank: kind === "month_tier" ? null : rank, tier: kind === "month_tier" ? t : null, points: num(a.points), matches: num(a.matches), wins: num(a.wins), rating: num(a.rating, 1000) };
        }).filter((a): a is ShelfAwardRow => a !== null),
        current: {
            month: monthOr(cur.month, ""), daysLeft: num(cur.daysLeft), minMatches: num(cur.minMatches, 5),
            boards: (Array.isArray(cur.boards) ? cur.boards.map(rec) : []).map((b) => ({
                gameType: game(b.gameType), points: num(b.points), matches: num(b.matches), wins: num(b.wins),
                rank: numOrNull(b.rank), total: num(b.total), medal: medalOrNull(b.medal), tier: tierOrNull(b.tier),
            })),
        },
        since: monthOr(o.since, ""),
        closedThrough: monthOr(o.closedThrough, "") || null,
    };
}

export interface ShelfApi { get(memberId?: string | null): Promise<Shelf> }
export type Request = (url: string) => Promise<unknown>;
export const createShelfApi = (request: Request): ShelfApi => ({ async get(memberId) { return parseShelf(await request(shelfUrl(memberId))); } });
export const shelfApi: ShelfApi = createShelfApi((url) => apiRequest(url));

/* ── '새로 받은 것' 표시 — 이 기기에서 장식장을 마지막으로 본 달을 기억한다(받은 달이 그보다 뒤면 새것이다) ── */
export const SHELF_SEEN_KEY = "rankue.sim.shelf-seen";
type Store = Pick<Storage, "getItem" | "setItem">;
const deviceStore = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function readShelfSeen(store: Store | null = deviceStore()): string {
    try { return monthOr(store?.getItem(SHELF_SEEN_KEY), ""); } catch { return ""; }
}
export function writeShelfSeen(month: string, store: Store | null = deviceStore()): void {
    if (!monthOr(month, "")) return;
    try { if (month > readShelfSeen(store)) store?.setItem(SHELF_SEEN_KEY, month); } catch { /* 저장소를 못 쓰는 기기 — 표시만 남는다 */ }
}
/** 그 달에 받은 것이 아직 못 본 것인가 */
export const isShelfNew = (latest: string | null | undefined, seen: string): boolean => !!latest && monthOr(latest, "") !== "" && latest > seen;
