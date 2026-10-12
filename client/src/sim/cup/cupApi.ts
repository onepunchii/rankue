/**
 * 월대회 클라이언트(2026-10-12) — GET /sim/cup(대진 화면) · POST /sim/cup/games/:id/ready(기다리기 · 입장).
 * 규칙은 shared/simCup. 대회 판은 초대 방이라, 상대가 먼저 열어 둔 방에는 평소의 참가 주소(POST /sim/matches/:id/join)로 들어간다.
 */
import { apiRequest } from "@/lib/queryClient";
import { TIERS, type TierId } from "@shared/sim/rank";
import type { CupGameKind, CupMedal, CupOutcome } from "@shared/simCup";
import type { DashGameType } from "../dash/dashApi";

export interface CupPerson {
    readonly memberId: string;
    readonly name: string;
    readonly country: string | null;
    /** 지금 등급(배치 전이면 null) */
    readonly tier: TierId | null;
    readonly seed: number;
    /** 확정 때(출전권 미리 보기에서는 지금)의 레이팅 */
    readonly rating: number;
}
export interface CupEntry extends CupPerson {
    readonly place: number | null;
    readonly medal: CupMedal | null;
    readonly forfeit: boolean;
}
export interface CupGameRow {
    readonly id: string;
    readonly kind: CupGameKind;
    readonly round: number;
    readonly slot: number;
    readonly p1Id: string | null;
    readonly p2Id: string | null;
    /** 기한(ms) */
    readonly deadlineMs: number;
    readonly p1Ready: boolean;
    readonly p2Ready: boolean;
    readonly winnerId: string | null;
    readonly outcome: CupOutcome | null;
}
export interface CupMine {
    readonly gameId: string;
    readonly opponentId: string | null;
    /** 상대가 아직 안 정해졌다(앞 판이 안 끝났다) */
    readonly waiting: boolean;
    readonly deadlineMs: number;
    readonly iReady: boolean;
    readonly opponentReady: boolean;
    /** 열려 있는 방 · 치는 중인 판(없으면 null) */
    readonly matchId: string | null;
    readonly matchStatus: "waiting" | "playing" | "finished" | "canceled" | null;
    readonly hosting: boolean;
}
export interface CupNow {
    readonly id: string;
    /** 성적의 달 "2026-10" — 대회는 다음 달 초에 치른다 */
    readonly month: string;
    readonly gameType: DashGameType;
    readonly status: "running" | "finished";
    readonly size: number;
    readonly rounds: number;
    readonly entries: readonly CupEntry[];
    readonly games: readonly CupGameRow[];
    readonly mine: CupMine | null;
}
export interface CupNext {
    readonly month: string;
    /** 다음 대회가 시작하는 때(ms) — 다음 달 1일 0시(한국 시각) */
    readonly startsMs: number;
    readonly daysLeft: number;
    readonly minRating: number;
    readonly minMatches: number;
    readonly maxEntrants: number;
    readonly roundDays: number;
    /** 지금 이대로면 열릴 대진판 크기(3명이 안 되면 0) */
    readonly size: number;
    readonly entrants: readonly (CupPerson & { readonly matches: number })[];
    readonly me: { readonly qualified: boolean; readonly seed: number | null; readonly rating: number | null; readonly matches: number };
}
export interface CupView {
    /** 서버 시각(ms) — 남은 시간을 기기 시계가 아니라 이것으로 센다 */
    readonly nowMs: number;
    readonly cup: CupNow | null;
    readonly next: CupNext;
}
export interface CupReady { readonly matchId: string; readonly state: "playing" | "hosting" | "join" }

export const CUP_QUERY_KEY = ["sim-cup"] as const;
export const CUP_PATH = "/online-game?cup=1";
export const cupUrl = (gameType: DashGameType = "3c"): string => `/api/hiq/sim/cup?gameType=${gameType}`;

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const cc = (v: unknown): string | null => (typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : null);
const tierOrNull = (v: unknown): TierId | null => (typeof v === "string" && TIERS.some((t) => t.id === v) ? (v as TierId) : null);
const ms = (v: unknown): number => { const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : Number.NaN; return Number.isFinite(t) ? t : 0; };
const game = (v: unknown): DashGameType => (v === "4c" ? "4c" : "3c");
const OUTCOMES: readonly CupOutcome[] = ["played", "walkover", "seed", "bye", "void"];
const outcome = (v: unknown): CupOutcome | null => (OUTCOMES.includes(v as CupOutcome) ? (v as CupOutcome) : null);
const medal = (v: unknown): CupMedal | null => (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null);
const person = (r: Record<string, unknown>): CupPerson => ({ memberId: str(r.memberId), name: str(r.name), country: cc(r.country), tier: tierOrNull(r.tier), seed: num(r.seed), rating: num(r.rating, 1000) });

export function parseCupView(raw: unknown): CupView {
    const o = rec(raw);
    const c = rec(o.cup), n = rec(o.next), me = rec(n.me), mine = rec(c.mine);
    const status = c.status === "running" || c.status === "finished" ? c.status : null;
    const cup: CupNow | null = status && str(c.id) ? {
        id: str(c.id), month: str(c.month), gameType: game(c.gameType), status, size: num(c.size), rounds: num(c.rounds),
        entries: (Array.isArray(c.entries) ? c.entries.map(rec) : []).filter((e) => str(e.memberId)).map((e) => ({ ...person(e), place: e.place == null ? null : num(e.place), medal: medal(e.medal), forfeit: e.forfeit === true })),
        games: (Array.isArray(c.games) ? c.games.map(rec) : []).filter((g) => str(g.id)).map((g) => ({
            id: str(g.id), kind: g.kind === "third" ? "third" as const : "main" as const, round: num(g.round), slot: num(g.slot), p1Id: strOrNull(g.p1Id), p2Id: strOrNull(g.p2Id),
            deadlineMs: ms(g.deadlineAt), p1Ready: g.p1Ready === true, p2Ready: g.p2Ready === true, winnerId: strOrNull(g.winnerId), outcome: outcome(g.outcome),
        })),
        mine: str(mine.gameId) ? {
            gameId: str(mine.gameId), opponentId: strOrNull(mine.opponentId), waiting: mine.waiting === true, deadlineMs: ms(mine.deadlineAt),
            iReady: mine.iReady === true, opponentReady: mine.opponentReady === true, matchId: strOrNull(mine.matchId),
            matchStatus: mine.matchStatus === "waiting" || mine.matchStatus === "playing" || mine.matchStatus === "finished" || mine.matchStatus === "canceled" ? mine.matchStatus : null,
            hosting: mine.hosting === true,
        } : null,
    } : null;
    return {
        nowMs: ms(o.now) || Date.now(),
        cup,
        next: {
            month: str(n.month), startsMs: ms(n.startsAt), daysLeft: num(n.daysLeft), minRating: num(n.minRating, 1000), minMatches: num(n.minMatches, 5),
            maxEntrants: num(n.maxEntrants, 16), roundDays: num(n.roundDays, 2), size: num(n.size),
            entrants: (Array.isArray(n.entrants) ? n.entrants.map(rec) : []).filter((e) => str(e.memberId)).map((e) => ({ ...person(e), matches: num(e.matches) })),
            me: { qualified: me.qualified === true, seed: me.seed == null ? null : num(me.seed), rating: me.rating == null ? null : num(me.rating), matches: num(me.matches) },
        },
    };
}

export function parseCupReady(raw: unknown): CupReady | null {
    const o = rec(raw);
    const state = o.state === "playing" || o.state === "hosting" || o.state === "join" ? o.state : null;
    return state && str(o.matchId) ? { matchId: str(o.matchId), state } : null;
}

export interface CupApi {
    get(gameType?: DashGameType): Promise<CupView>;
    /** 기다리기 · 입장 — 들어온 것을 적고, 방이 없으면 내가 방장으로 연다 */
    ready(gameId: string): Promise<CupReady>;
    /** 상대가 열어 둔 대회 방에 들어간다(평소의 참가 주소) */
    join(matchId: string): Promise<void>;
}
export type Request = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export function createCupApi(request: Request): CupApi {
    return {
        async get(gameType = "3c") { return parseCupView(await request(cupUrl(gameType))); },
        async ready(gameId) {
            const r = parseCupReady(await request(`/api/hiq/sim/cup/games/${encodeURIComponent(gameId)}/ready`, { method: "POST", body: {} }));
            if (!r) throw new Error("cup ready: bad response");
            return r;
        },
        async join(matchId) { await request(`/api/hiq/sim/matches/${encodeURIComponent(matchId)}/join`, { method: "POST", body: {} }); },
    };
}
export const cupApi: CupApi = createCupApi((url, options) => apiRequest(url, options));

/** 그 라운드의 이름을 고를 재료 — 시작할 때 남은 인원(16 · 8 · 4 · 2) */
export const roundSize = (round: number, rounds: number): number => Math.pow(2, Math.max(0, rounds - round + 1));

/** 남은 시간 — 하루 넘으면 일 · 시간, 아니면 시간 · 분. 지났으면 null */
export function timeLeft(deadlineMs: number, nowMs: number): { days: number; hours: number; minutes: number } | null {
    const left = deadlineMs - nowMs;
    if (!(left > 0)) return null;
    const m = Math.floor(left / 60_000);
    return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 };
}
