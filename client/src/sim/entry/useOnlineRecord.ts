/**
 * 온라인 대전 기록 한 묶음 — 온라인게임 진입 화면(SimEntry)과 홈 '내 온라인 실력' 카드가 같은 계산을 쓴다(2026-10-04).
 *  - 전적은 서버 합계(랭킹 보드)로 본다 — 대전 목록은 최근 20개뿐이라 새 대전이 생길 때마다 승수가 흔들렸다
 *    (2026-09-16 테스터 제보: "17승 2패 → 18승 2패 → 17승 1패"). 진행 중·내 차례 수는 지금 상태라 목록이 맞다.
 *    무승부는 서버 wins 에 이미 포함돼 있다(오너 규칙: 둘 다 승).
 *  - 순위는 두 판(3쿠션·4구) 중 가장 높은 쪽(숫자가 작은 쪽), 같으면 사람이 많은 판. 배치 전이면 배치 중 n/m.
 * 엔진을 끌어오지 않는 작은 모듈만 가져온다(홈 번들).
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { matchRecord, type EntryMatchRow, type MatchRecord } from "./entryStats";

/** rating 은 2026-10-12 부터 온다(홈 배너의 등급 배지). 기기에 남아 있던 옛 응답에는 없을 수 있다 — 없으면 배너가 등급을 그리지 않고 기다린다. */
export interface RankBoard { gameType: "3c" | "4c"; rating?: number; matches: number; wins?: number; rank: number | null; total: number }
/** 장식장에 모은 개수와 가장 최근에 받은 달(2026-10-12 — 홈 배너의 장식장 칸). 옛 응답에는 없다 */
export interface ShelfSummary { medals: number; badges: number; latest: string | null }
/** 치르는 중인 월대회에서 내가 칠 판(2026-10-12 — 홈 배너의 한 줄). 없으면 null */
export interface CupSummary { month: string; gameType: "3c" | "4c"; deadlineAt: string; waiting: boolean }
export interface RankMe { placement: number; boards: RankBoard[]; shelf?: ShelfSummary | null; cup?: CupSummary | null }

export interface OnlineRecord {
    record: MatchRecord;
    /** 순위가 매겨진 판 중 가장 높은 순위 */
    bestBoard: RankBoard | null;
    /** 배치 중이면 지금까지 둔 판 수(가장 많은 판 기준) */
    placingMatches: number;
    placement: number;
    /** 종목별 판(3쿠션·4구) — 홈 '내 온라인 실력' 카드의 3쿠션|4구 탭 */
    boards: RankBoard[];
    /** 내 순위 응답을 받았는가(실패도 받은 것으로 친다) — 받기 전에 "아직 대전을 안 했다"고 그리지 않으려고 */
    ready: boolean;
    /** 장식장에 모은 것 — 못 받았으면 null */
    shelf: ShelfSummary | null;
    /** 월대회에서 내가 칠 판 — 없으면 null */
    cup: { deadlineMs: number; waiting: boolean } | null;
}

export function useOnlineRecord(): OnlineRecord {
    const { member } = useAuth();
    const matches = useQuery<EntryMatchRow[]>({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: (q) => ((q.state.data ?? []).some((m) => m.status === "playing") ? MATCH_LIST_REFETCH_MS * 3 : false),
    });
    const myRank = useQuery<RankMe>({
        queryKey: ["/api/hiq/sim/rank/me"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/rank/me")) ?? { placement: 3, boards: [] },
        enabled: !!member,
        staleTime: 30_000,
    });

    const listRecord = matchRecord(Array.isArray(matches.data) ? matches.data : []);
    const boards = Array.isArray(myRank.data?.boards) ? myRank.data!.boards : [];
    const totals = boards.reduce((a, b) => ({ w: a.w + (b.wins ?? 0), m: a.m + (b.matches ?? 0) }), { w: 0, m: 0 });
    const record: MatchRecord = totals.m > 0
        ? { ...listRecord, wins: totals.w, losses: Math.max(0, totals.m - totals.w) }
        : listRecord;
    const bestBoard = boards
        .filter((b) => b.rank !== null)
        .sort((a, b) => (a.rank! - b.rank!) || (b.total - a.total))[0] ?? null;
    const placingMatches = Math.max(0, ...boards.map((b) => b.matches));
    const cp = myRank.data?.cup;
    const cupMs = cp && typeof cp.deadlineAt === "string" ? new Date(cp.deadlineAt).getTime() : Number.NaN;
    const cup = cp && Number.isFinite(cupMs) ? { deadlineMs: cupMs, waiting: cp.waiting === true } : null;
    const sh = myRank.data?.shelf;
    const shelf: ShelfSummary | null = sh && typeof sh === "object"
        ? { medals: Number(sh.medals) || 0, badges: Number(sh.badges) || 0, latest: typeof sh.latest === "string" ? sh.latest : null }
        : null;
    return { record, bestBoard, placingMatches, placement: myRank.data?.placement ?? 3, boards, ready: myRank.data !== undefined || myRank.isError, shelf, cup };
}
