/**
 * 시뮬레이터 대시보드 API(GET /sim/stats/me) — 성적 행·세션 요약·연습 래더 순위·드릴 주별 집계를 한 번에.
 * 대전 목록은 match/MatchList 와 같은 쿼리(GET /sim/matches, MATCH_LIST_QUERY_KEY)를 쓴다.
 * 여기 값은 전부 hiq_sim_* 테이블의 것 — 실전 RP·에버리지와 무관하다.
 */
import { apiRequest } from "@/lib/queryClient";

export type DashGameType = "3c" | "4c";
export type DashTableId = "DAEDAE" | "JUNGDAE_KR";

export interface SimRatingRow {
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
    readonly sessions: number;
    readonly totalScore: number;
    readonly totalInnings: number;
    readonly bestAvg: number;
    readonly bestHighRun: number;
    /** 대전 Elo(1000 시작) */
    readonly simRating: number;
    readonly matches: number;
    readonly wins: number;
    readonly updatedAt: string;
}

export interface SimSessionSummary {
    readonly id: string;
    readonly kind: "solo" | "drill" | "match";
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
    readonly cushionModel: string;
    readonly condition: number;
    readonly targetScore: number;
    readonly inningCap: number;
    readonly score: number;
    readonly innings: number;
    readonly highRun: number;
    readonly shots: number;
    readonly status: "playing" | "finished" | "abandoned";
    readonly startedAt: string;
    readonly finishedAt: string | null;
}

export interface SimRank {
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
    readonly rank: number;
    readonly total: number;
}

export interface SimDrillWeek {
    readonly weekId: string;
    readonly attempts: number;
    readonly successes: number;
    readonly cushions: number;
}

/** 공식 기록(대전) — 종목별, 대대·중대 통합(2026-09-12). 대시보드의 에버리지·레이팅은 여기서 온다. */
export interface SimMatchRatingRow {
    readonly gameType: DashGameType;
    readonly rating: number;
    readonly matches: number;
    readonly wins: number;
}

/**
 * 온라인 전적 — 종목·테이블별, **끝난 대전 전부**(서버 simMatch.myRecords).
 * 예전에는 대전 목록(최근 20개)으로 세서 새 대전이 생길 때마다 승수가 왔다갔다 했다(2026-09-16 테스터 제보).
 */
export interface SimMatchRecord {
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
    readonly wins: number;
    readonly losses: number;
    readonly draws: number;
    readonly total: number;
}

export interface SimStats {
    readonly ratings: readonly SimRatingRow[];
    readonly matchRatings: readonly SimMatchRatingRow[];
    readonly matchRecords: readonly SimMatchRecord[];
    readonly sessions: readonly SimSessionSummary[];
    readonly ranks: readonly SimRank[];
    readonly drillWeeks: readonly SimDrillWeek[];
    readonly currentWeekId: string;
}

export const SIM_STATS_URL = "/api/hiq/sim/stats/me";
export const SIM_STATS_QUERY_KEY = ["sim-stats"] as const;

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const iso = (v: unknown): string => (typeof v === "string" ? v : v instanceof Date ? v.toISOString() : "");
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);

/** 서버 응답을 느슨하게 정규화한다 — 숫자 문자열·누락 필드가 있어도 화면이 깨지지 않게. */
export function parseSimStats(raw: unknown): SimStats {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
        matchRatings: arr(o.matchRatings).map((r) => ({
            gameType: r.gameType === "4c" ? "4c" as const : "3c" as const,
            rating: num(r.rating, 1000), matches: num(r.matches), wins: num(r.wins),
        })),
        // 옛 서버 응답에는 없다 — 없으면 빈 배열(화면이 예전처럼 목록에서 센다).
        matchRecords: arr(o.matchRecords).map((r) => ({
            gameType: r.gameType === "4c" ? "4c" as const : "3c" as const,
            tableId: r.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" as const : "DAEDAE" as const,
            wins: num(r.wins), losses: num(r.losses), draws: num(r.draws), total: num(r.total),
        })),
        ratings: arr(o.ratings).map((r) => ({
            gameType: r.gameType === "4c" ? "4c" : "3c",
            tableId: r.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" : "DAEDAE",
            sessions: num(r.sessions), totalScore: num(r.totalScore), totalInnings: num(r.totalInnings),
            bestAvg: num(r.bestAvg), bestHighRun: num(r.bestHighRun),
            simRating: num(r.simRating, 1000), matches: num(r.matches), wins: num(r.wins),
            updatedAt: iso(r.updatedAt),
        })),
        sessions: arr(o.sessions).map((s) => ({
            id: str(s.id),
            kind: s.kind === "drill" ? "drill" : s.kind === "match" ? "match" : "solo",
            gameType: s.gameType === "4c" ? "4c" : "3c",
            tableId: s.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" : "DAEDAE",
            cushionModel: str(s.cushionModel, "han2005"), condition: num(s.condition, 1),
            targetScore: num(s.targetScore), inningCap: num(s.inningCap),
            score: num(s.score), innings: num(s.innings), highRun: num(s.highRun), shots: num(s.shots),
            status: s.status === "finished" ? "finished" : s.status === "abandoned" ? "abandoned" : "playing",
            startedAt: iso(s.startedAt), finishedAt: s.finishedAt == null ? null : iso(s.finishedAt),
        })),
        ranks: arr(o.ranks).map((r) => ({
            gameType: r.gameType === "4c" ? "4c" : "3c",
            tableId: r.tableId === "JUNGDAE_KR" ? "JUNGDAE_KR" : "DAEDAE",
            rank: num(r.rank), total: num(r.total),
        })),
        drillWeeks: arr(o.drillWeeks).map((w) => ({ weekId: str(w.weekId), attempts: num(w.attempts), successes: num(w.successes), cushions: num(w.cushions) })),
        currentWeekId: str(o.currentWeekId),
    };
}

export type StatsFetcher = () => Promise<SimStats>;

export const fetchSimStats: StatsFetcher = async () => parseSimStats(await apiRequest(SIM_STATS_URL));
