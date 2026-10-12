/**
 * 장식장(2026-10-12 오너: "랭킹을 달로 해야겠지? 그래서 장식장에 보관이 되도록 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 * 달이 끝나면 그 달의 것을 **한 번** 준다 — 그 뒤로는 규칙이 바뀌어도, 레이팅을 다시 계산해도 그대로 둔다(준 것은 준 것이다).
 *
 * 달마다 받는 것 두 가지
 *  - **이달의 랭킹 메달**(month_rank): 종목마다 그 달 1~3등. 다만 **그 달에 점수를 올린 사람만**(monthlyMedal) —
 *    사람이 적은 달에는 점수를 잃고도 3등이 된다(2026-10 3쿠션 3등이 −34 였다). 잃은 달에 메달을 주면 메달이 가벼워진다.
 *  - **그 달의 등급 배지**(month_tier): 그 달에 MONTHLY_MIN_MATCHES 판을 친 사람에게 **달이 끝날 때의 등급** 하나.
 *    두 종목을 다 채웠으면 더 높은 쪽 하나(같으면 3쿠션). 달마다 하나씩 쌓여 "골드 ×3 · 실버 ×2"가 된다.
 *
 * 달이 끝날 때의 레이팅 = 1000 + 그때까지의 변화의 합(shared/simMonthly replayDeltas). 운영 자료로 지금 사다리와 같음을 확인했다(2026-10-12, 14줄 모두).
 * 이 파일이 shared/sim 밖에 있는 까닭은 simMonthly 와 같다(달력 = Date).
 *
 * 월대회 메달(우승~8강)은 대회가 생기면 종류를 더한다(기획 docs/01-plan/features/online-game-monthly-tournament-badges.md).
 */
import { START_RATING } from "./sim/rating.js";
import { TIERS, tierFor, type TierId } from "./sim/rank.js";
import { MONTHLY_MIN_MATCHES, isMonthId, kstMonthOf, kstMonthRange, monthlyBoard, type MatchDelta, type MonthlyGame } from "./simMonthly.js";

/** 장식장은 이 달부터 쌓는다 — 이달의 랭킹을 연 달이다. 그 전의 달은 마감하지 않는다 */
export const SHELF_FIRST_MONTH = "2026-10";

export const SHELF_KINDS = ["month_rank", "month_tier"] as const;
export type ShelfKind = (typeof SHELF_KINDS)[number];
export type MedalRank = 1 | 2 | 3;
export const MEDAL_RANKS: readonly MedalRank[] = [1, 2, 3];
const GAMES: readonly MonthlyGame[] = ["3c", "4c"];

/** 받은 것 하나 */
export interface ShelfAward {
    memberId: string;
    /** "2026-10" */
    month: string;
    kind: ShelfKind;
    gameType: MonthlyGame;
    /** month_rank 일 때 1~3 */
    rank: MedalRank | null;
    /** month_tier 일 때 등급 */
    tier: TierId | null;
    /** 그 달 그 종목의 점수 · 판 · 승 */
    points: number;
    matches: number;
    wins: number;
    /** 달이 끝날 때의 레이팅(그 종목) */
    rating: number;
}

/** 메달이 되는 등수인가 — 1~3등이고 그 달에 점수를 올렸을 때만 */
export function monthlyMedal(rank: number | null | undefined, points: number): MedalRank | null {
    if (rank !== 1 && rank !== 2 && rank !== 3) return null;
    return points > 0 ? rank : null;
}

const tierRank = (id: TierId): number => TIERS.findIndex((t) => t.id === id);

/** 그 시각 전까지의 레이팅 — "회원|종목" → 값. 한 판도 없으면 표에 없다(= START_RATING) */
export function ratingsBefore(deltas: readonly MatchDelta[], untilMs: number): Map<string, number> {
    const out = new Map<string, number>();
    const add = (id: string, g: MonthlyGame, d: number) => { const k = `${id}|${g}`; out.set(k, (out.get(k) ?? START_RATING) + d); };
    for (const d of deltas) {
        if (d.endedMs >= untilMs) continue;
        add(d.hostId, d.gameType, d.delta);
        add(d.guestId, d.gameType, -d.delta);
    }
    return out;
}

/**
 * 한 달의 마감 — 그 달에 주는 것 전부. deltas 는 전 기간의 것을 준다(달이 끝날 때의 레이팅을 세려면 앞 달의 판도 필요하다).
 * 순서: 종목(3쿠션 → 4구) · 메달(1 → 3등) 다음에 등급 배지.
 */
export function monthAwards(deltas: readonly MatchDelta[], month: string, minMatches: number = MONTHLY_MIN_MATCHES): ShelfAward[] {
    if (!isMonthId(month)) return [];
    const [, end] = kstMonthRange(month);
    const ratings = ratingsBefore(deltas, end);
    const ratingOf = (id: string, g: MonthlyGame) => ratings.get(`${id}|${g}`) ?? START_RATING;
    const medals: ShelfAward[] = [];
    /** 회원 → 그 달 판 수를 채운 종목들 */
    const eligible = new Map<string, ShelfAward[]>();
    for (const g of GAMES) {
        for (const r of monthlyBoard(deltas, month, g, minMatches)) {
            if (r.rank === null) continue;
            const rating = ratingOf(r.memberId, g);
            const base = { memberId: r.memberId, month, gameType: g, points: r.points, matches: r.matches, wins: r.wins, rating };
            const medal = monthlyMedal(r.rank, r.points);
            if (medal) medals.push({ ...base, kind: "month_rank", rank: medal, tier: null });
            const list = eligible.get(r.memberId) ?? [];
            list.push({ ...base, kind: "month_tier", rank: null, tier: tierFor(rating).id });
            eligible.set(r.memberId, list);
        }
    }
    const badges: ShelfAward[] = [];
    for (const list of eligible.values()) {
        // 더 높은 등급 쪽 하나 — 같으면 3쿠션(목록이 3쿠션부터 들어 있다)
        badges.push([...list].sort((a, b) => tierRank(b.tier!) - tierRank(a.tier!))[0]);
    }
    badges.sort((a, b) => (tierRank(b.tier!) - tierRank(a.tier!)) || (b.rating - a.rating) || (a.memberId < b.memberId ? -1 : 1));
    return [...medals, ...badges];
}

/**
 * 지금 마감할 달들(옛 달부터) — 끝난 달이고, 레이팅 판이 있었고, 아직 마감하지 않았고, SHELF_FIRST_MONTH 이후.
 * 하루 한 번 도는 정리 작업이 이것을 부른다 — 하루를 걸러도 다음 날 밀린 달을 같이 마감한다.
 */
export function monthsToClose(deltas: readonly MatchDelta[], nowMs: number, closed: readonly string[], first: string = SHELF_FIRST_MONTH): string[] {
    const cur = kstMonthOf(nowMs);
    const done = new Set(closed);
    const set = new Set<string>();
    for (const d of deltas) {
        const m = kstMonthOf(d.endedMs);
        if (m < cur && m >= first && !done.has(m)) set.add(m);
    }
    return [...set].sort();
}

/** 장식장의 선반에 놓을 개수 — 메달은 등수마다, 배지는 등급마다 */
export interface ShelfCounts {
    medals: Record<MedalRank, number>;
    tiers: Record<TierId, number>;
    medalTotal: number;
    tierTotal: number;
}

export function shelfCounts(awards: readonly Pick<ShelfAward, "kind" | "rank" | "tier">[]): ShelfCounts {
    const medals: Record<MedalRank, number> = { 1: 0, 2: 0, 3: 0 };
    const tiers = Object.fromEntries(TIERS.map((t) => [t.id, 0])) as Record<TierId, number>;
    for (const a of awards) {
        if (a.kind === "month_rank" && (a.rank === 1 || a.rank === 2 || a.rank === 3)) medals[a.rank] += 1;
        else if (a.kind === "month_tier" && a.tier && a.tier in tiers) tiers[a.tier] += 1;
    }
    return {
        medals, tiers,
        medalTotal: medals[1] + medals[2] + medals[3],
        tierTotal: Object.values(tiers).reduce((a, b) => a + b, 0),
    };
}

/**
 * 이번 달이 지금 끝난다면 받는 것(장식장의 '이번 달' 칸 — 아직 받은 것이 아니다).
 * 등급 배지는 **지금 등급**으로 보여 준다(달이 끝날 때 등급이 될 값이다).
 */
export interface ShelfPreview {
    gameType: MonthlyGame;
    points: number;
    matches: number;
    wins: number;
    /** 그 달 판 수를 채웠을 때만 */
    rank: number | null;
    /** 순위에 오른 사람 수 */
    total: number;
    medal: MedalRank | null;
    tier: TierId | null;
}

export function shelfPreview(deltas: readonly MatchDelta[], month: string, memberId: string, nowMs: number, minMatches: number = MONTHLY_MIN_MATCHES): ShelfPreview[] {
    const ratings = ratingsBefore(deltas, nowMs + 1);
    const out: ShelfPreview[] = [];
    for (const g of GAMES) {
        const board = monthlyBoard(deltas, month, g, minMatches);
        const mine = board.find((r) => r.memberId === memberId);
        if (!mine) continue;
        out.push({
            gameType: g, points: mine.points, matches: mine.matches, wins: mine.wins,
            rank: mine.rank, total: board.filter((r) => r.rank !== null).length,
            medal: monthlyMedal(mine.rank, mine.points),
            tier: mine.rank !== null ? tierFor(ratings.get(`${memberId}|${g}`) ?? START_RATING).id : null,
        });
    }
    return out;
}
