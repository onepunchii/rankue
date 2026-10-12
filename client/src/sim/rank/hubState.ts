/**
 * 홈 '온라인 대전' 배너가 그릴 내 상태(2026-10-12 오너: "당구 홈에 혼자 치기 카드 위에 배너 카드를 만들어서 … 대시보드 랭킹 들어가게").
 * 화면(components/hiq/dashboard/OnlineHubBanner)은 이 값만 그린다 — 어느 종목을 보여 줄지, 등급이 있는지, 배치가 몇 판 남았는지는 여기서 정한다.
 *
 * 어느 종목인가
 *  - 고른 종목이 있으면 그 종목(배너의 종목 바꾸기).
 *  - 없으면 **등급이 있는 종목 가운데 대전을 가장 많이 둔 쪽**(같으면 레이팅이 높은 쪽). 바로 아래 '내 온라인 실력' 카드의 기본 탭과 같은 규칙이라
 *    두 카드가 같은 종목으로 열린다. 등급이 하나도 없으면 대전을 가장 많이 둔 종목(배치 중).
 * 등급은 배치(PLACEMENT_MATCHES 판) 뒤에만 있다 — 그 전에는 배지를 주지 않는다(랭킹 화면과 같다).
 *
 * rating 이 없는 판: 기기에 남아 있던 옛 응답(2026-10-12 전)이다. 등급을 지어내지 않고 "waiting" 으로 둔다 — 새 응답이 오면 바뀐다.
 */
import { nextTier, tierFor, tierProgress, type Tier } from "@shared/sim/rank";

export type HubGame = "3c" | "4c";

export interface HubBoard {
    gameType: HubGame;
    rating?: number;
    matches: number;
    wins?: number;
    rank: number | null;
    total: number;
}

export type HubState =
    /** 대전을 한 판도 안 뒀다 — 일곱 등급을 보여 주고 시작을 권한다 */
    | { kind: "fresh"; canSwap: false }
    /** 옛 응답이라 레이팅이 없다 — 등급 자리를 비워 두고 기다린다 */
    | { kind: "waiting"; gameType: HubGame; canSwap: boolean }
    /** 배치 중 — 아직 배지가 없다 */
    | { kind: "placing"; gameType: HubGame; matches: number; left: number; wins: number; losses: number; canSwap: boolean }
    | {
        kind: "ranked"; gameType: HubGame; tier: Tier; rating: number;
        /** 순위표의 내 자리. 표에 못 오른 드문 경우(회원 행이 빠졌을 때) null */
        rank: number | null; total: number;
        wins: number; losses: number;
        /** 다음 등급과 거기까지 남은 점수. 마스터면 둘 다 null */
        next: Tier | null; toNext: number | null;
        /** 막대 길이(0~1) */
        progress: number;
        canSwap: boolean;
    };

const hasRating = (b: HubBoard): b is HubBoard & { rating: number } => typeof b.rating === "number" && Number.isFinite(b.rating);

export function hubStateOf(boards: readonly HubBoard[], placement: number, pick?: HubGame | null): HubState {
    const played = boards.filter((b) => b.matches > 0);
    if (played.length === 0) return { kind: "fresh", canSwap: false };
    // 두 종목 다 둔 사람만 종목을 바꿀 수 있다
    const canSwap = new Set(played.map((b) => b.gameType)).size > 1;
    const placed = played.filter((b) => b.matches >= placement);
    const byMatches = (a: HubBoard, b: HubBoard) => (b.matches - a.matches) || ((b.rating ?? 0) - (a.rating ?? 0)) || (a.gameType === "3c" ? -1 : 1);
    const board = (pick ? played.find((b) => b.gameType === pick) : undefined)
        ?? [...placed].sort(byMatches)[0]
        ?? [...played].sort(byMatches)[0];
    const wins = Math.max(0, Math.min(board.matches, board.wins ?? 0));
    const losses = board.matches - wins;
    if (board.matches < placement) {
        return { kind: "placing", gameType: board.gameType, matches: board.matches, left: placement - board.matches, wins, losses, canSwap };
    }
    if (!hasRating(board)) return { kind: "waiting", gameType: board.gameType, canSwap };
    const next = nextTier(board.rating);
    return {
        kind: "ranked", gameType: board.gameType, tier: tierFor(board.rating), rating: board.rating,
        rank: board.rank, total: board.total, wins, losses,
        next, toNext: next ? next.min - board.rating : null,
        progress: tierProgress(board.rating),
        canSwap,
    };
}

/** 종목 바꾸기 — 지금 보는 종목의 반대쪽 */
export const otherGame = (g: HubGame): HubGame => (g === "3c" ? "4c" : "3c");
