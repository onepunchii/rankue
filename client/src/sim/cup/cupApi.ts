/**
 * 월대회 클라이언트(2026-10-12 · 2026-11-03 운영자가 여는 대회로) — GET /sim/cup(대진 화면) · POST /sim/cup/games/:id/ready(입장 · 대기실에 있음).
 * 규칙은 shared/simCup. 대회 판은 두 사람이 대기실에 함께 있을 때 서버가 만들고 바로 시작한다 — 화면은 대기실에 있는 동안 5초마다 ready 를 다시 보낸다.
 */
import { apiRequest } from "@/lib/queryClient";
import { TIERS, type TierId } from "@shared/sim/rank";
import type { CupGameKind, CupMedal, CupOutcome } from "@shared/simCup";
import type { CupWindow } from "@shared/simCupTime";
import type { DashGameType } from "../dash/dashApi";

export interface CupPerson {
    readonly memberId: string;
    readonly name: string;
    readonly country: string | null;
    /** 지금 등급(배치 전이면 null) */
    readonly tier: TierId | null;
    readonly seed: number;
    /** 확정 때(추천 미리 보기에서는 지금)의 레이팅 */
    readonly rating: number;
}
export interface CupEntry extends CupPerson {
    readonly place: number | null;
    readonly medal: CupMedal | null;
    readonly forfeit: boolean;
}
type MatchStatus = "waiting" | "playing" | "finished" | "canceled";
export interface CupGameRow {
    readonly id: string;
    readonly kind: CupGameKind;
    readonly round: number;
    readonly slot: number;
    readonly p1Id: string | null;
    readonly p2Id: string | null;
    /** 운영자가 정한 경기 시각(ms) — 없으면 일정 미정 */
    readonly scheduledMs: number | null;
    readonly p1Ready: boolean;
    readonly p2Ready: boolean;
    readonly winnerId: string | null;
    readonly outcome: CupOutcome | null;
    /** 시작된 판(치는 중 · 끝남)의 대전 — 관전 · 다시보기 */
    readonly matchId: string | null;
    readonly matchStatus: MatchStatus | null;
}
export interface CupMine {
    readonly gameId: string;
    readonly opponentId: string | null;
    /** 상대가 아직 안 정해졌다(앞 판이 안 끝났다) */
    readonly waiting: boolean;
    readonly scheduledMs: number | null;
    /** 입장 시간 — 서버 시각 기준(unscheduled · early · open · closed) */
    readonly window: CupWindow;
    readonly iReady: boolean;
    readonly opponentReady: boolean;
    /** 상대가 지금 대기실에 있다 */
    readonly opponentPresent: boolean;
    /** 시작된 판(없으면 null) */
    readonly matchId: string | null;
    readonly matchStatus: MatchStatus | null;
}
export interface CupNow {
    readonly id: string;
    /** 출전자를 뽑은 성적의 달 "2026-10" */
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
    readonly daysLeft: number;
    readonly minRating: number;
    readonly minMatches: number;
    readonly maxEntrants: number;
    readonly enterEarlyMin: number;
    readonly noShowMin: number;
    /** 지금 이대로면 추천되는 인원의 대진판 크기(3명이 안 되면 0) */
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
/** 입장 · 있음의 답 — playing 이면 그 판으로, waiting 이면 대기실에서 상대를 기다린다 */
export type CupReady = { readonly state: "playing"; readonly matchId: string } | { readonly state: "waiting"; readonly opponentReady: boolean };

export const CUP_QUERY_KEY = ["sim-cup"] as const;
export const CUP_PATH = "/online-game?cup=1";
export const cupUrl = (gameType: DashGameType = "3c"): string => `/api/hiq/sim/cup?gameType=${gameType}`;
/** 대기실에 있는 동안 ready 를 다시 보내는 간격 — 서버는 25초 안에 다시 온 사람을 '있다'로 본다(shared/simCupTime CUP_PRESENT_MS) */
export const CUP_PING_MS = 5000;

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const cc = (v: unknown): string | null => (typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : null);
const tierOrNull = (v: unknown): TierId | null => (typeof v === "string" && TIERS.some((t) => t.id === v) ? (v as TierId) : null);
const ms = (v: unknown): number => { const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : Number.NaN; return Number.isFinite(t) ? t : 0; };
const msOrNull = (v: unknown): number | null => (v == null || v === "" ? null : ms(v) || null);
const game = (v: unknown): DashGameType => (v === "4c" ? "4c" : "3c");
const OUTCOMES: readonly CupOutcome[] = ["played", "walkover", "seed", "bye", "void"];
const outcome = (v: unknown): CupOutcome | null => (OUTCOMES.includes(v as CupOutcome) ? (v as CupOutcome) : null);
const medal = (v: unknown): CupMedal | null => (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null);
const matchStatus = (v: unknown): MatchStatus | null => (v === "waiting" || v === "playing" || v === "finished" || v === "canceled" ? v : null);
const WINDOWS: readonly CupWindow[] = ["unscheduled", "early", "open", "closed"];
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
            scheduledMs: msOrNull(g.scheduledAt), p1Ready: g.p1Ready === true, p2Ready: g.p2Ready === true, winnerId: strOrNull(g.winnerId), outcome: outcome(g.outcome),
            matchId: strOrNull(g.matchId), matchStatus: matchStatus(g.matchStatus),
        })),
        mine: str(mine.gameId) ? {
            gameId: str(mine.gameId), opponentId: strOrNull(mine.opponentId), waiting: mine.waiting === true, scheduledMs: msOrNull(mine.scheduledAt),
            window: WINDOWS.includes(mine.window as CupWindow) ? (mine.window as CupWindow) : "unscheduled",
            iReady: mine.iReady === true, opponentReady: mine.opponentReady === true, opponentPresent: mine.opponentPresent === true,
            matchId: strOrNull(mine.matchId), matchStatus: matchStatus(mine.matchStatus),
        } : null,
    } : null;
    return {
        nowMs: ms(o.now) || Date.now(),
        cup,
        next: {
            month: str(n.month), daysLeft: num(n.daysLeft), minRating: num(n.minRating, 1000), minMatches: num(n.minMatches, 5),
            maxEntrants: num(n.maxEntrants, 16), enterEarlyMin: num(n.enterEarlyMin, 10), noShowMin: num(n.noShowMin, 15), size: num(n.size),
            entrants: (Array.isArray(n.entrants) ? n.entrants.map(rec) : []).filter((e) => str(e.memberId)).map((e) => ({ ...person(e), matches: num(e.matches) })),
            me: { qualified: me.qualified === true, seed: me.seed == null ? null : num(me.seed), rating: me.rating == null ? null : num(me.rating), matches: num(me.matches) },
        },
    };
}

export function parseCupReady(raw: unknown): CupReady | null {
    const o = rec(raw);
    if (o.state === "playing" && str(o.matchId)) return { state: "playing", matchId: str(o.matchId) };
    if (o.state === "waiting") return { state: "waiting", opponentReady: o.opponentReady === true };
    return null;
}

/** 서버가 409 에 실어 보내는 까닭(err.data.code) — HAS_PLAYING · CUP_EARLY · CUP_UNSCHEDULED · CUP_CLOSED … */
export function cupErrorCode(err: unknown): string | null {
    const data = rec(rec(err).data);
    return typeof data.code === "string" ? data.code : null;
}

export interface CupApi {
    get(gameType?: DashGameType): Promise<CupView>;
    /** 입장 · 대기실에 있음 — 상대도 있으면 서버가 판을 열고 playing 을 준다. forfeitPlaying = 진행 중인 다른 판을 기권하고 들어간다 */
    ready(gameId: string, opts?: { forfeitPlaying?: boolean }): Promise<CupReady>;
}
export type Request = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export function createCupApi(request: Request): CupApi {
    return {
        async get(gameType = "3c") { return parseCupView(await request(cupUrl(gameType))); },
        async ready(gameId, opts) {
            const r = parseCupReady(await request(`/api/hiq/sim/cup/games/${encodeURIComponent(gameId)}/ready`, { method: "POST", body: opts?.forfeitPlaying ? { forfeitPlaying: true } : {} }));
            if (!r) throw new Error("cup ready: bad response");
            return r;
        },
    };
}
export const cupApi: CupApi = createCupApi((url, options) => apiRequest(url, options));

/** 그 라운드의 이름을 고를 재료 — 시작할 때 남은 인원(16 · 8 · 4 · 2) */
export const roundSize = (round: number, rounds: number): number => Math.pow(2, Math.max(0, rounds - round + 1));

/** 남은 시간 — 하루 넘으면 일 · 시간, 아니면 시간 · 분. 지났으면 null */
export function timeLeft(untilMs: number, nowMs: number): { days: number; hours: number; minutes: number } | null {
    const left = untilMs - nowMs;
    if (!(left > 0)) return null;
    const m = Math.floor(left / 60_000);
    return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 };
}
