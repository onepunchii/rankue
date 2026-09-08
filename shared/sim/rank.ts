/**
 * 온라인 대전 랭킹(2026-09-08 오너: "랭킹제 · 국가별 · 랭커 게임처럼") — 순수 규칙.
 * 레이팅은 hiq_sim_ratings.simRating(Elo, 1000 시작, K=24, 종목·테이블별). 실전 RP 와 무관.
 *  - 배치: 대전 PLACEMENT_MATCHES 판을 마쳐야 랭킹에 오른다(그 전엔 "배치 중 n/3").
 *  - 티어: 레이팅 구간. 마스터는 상한 없음.
 */
export type TierId = "iron" | "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";

export interface Tier {
    readonly id: TierId;
    /** 이 티어의 최소 레이팅 */
    readonly min: number;
    readonly nameKey: string;
}

export const START_RATING = 1000;
export const PLACEMENT_MATCHES = 3;

/** 낮은 티어부터. min 은 오름차순. */
export const TIERS: readonly Tier[] = [
    { id: "iron", min: Number.NEGATIVE_INFINITY, nameKey: "sim.rank.tier.iron" },
    { id: "bronze", min: 950, nameKey: "sim.rank.tier.bronze" },
    { id: "silver", min: 1050, nameKey: "sim.rank.tier.silver" },
    { id: "gold", min: 1150, nameKey: "sim.rank.tier.gold" },
    { id: "platinum", min: 1250, nameKey: "sim.rank.tier.platinum" },
    { id: "diamond", min: 1350, nameKey: "sim.rank.tier.diamond" },
    { id: "master", min: 1450, nameKey: "sim.rank.tier.master" },
];

export function tierFor(rating: number): Tier {
    let t = TIERS[0];
    for (const tier of TIERS) if (rating >= tier.min) t = tier;
    return t;
}

export function nextTier(rating: number): Tier | null {
    for (const tier of TIERS) if (rating < tier.min) return tier;
    return null;
}

export function isPlaced(matches: number): boolean {
    return matches >= PLACEMENT_MATCHES;
}

export interface RankStatus {
    readonly placed: boolean;
    /** 배치 전엔 null */
    readonly tier: Tier | null;
    /** 다음 티어까지 남은 점수(최고 티어·배치 전엔 null) */
    readonly toNext: number | null;
    /** 배치까지 남은 판 수(배치 뒤엔 0) */
    readonly placementLeft: number;
}

export function rankStatus(rating: number, matches: number): RankStatus {
    const placed = isPlaced(matches);
    if (!placed) return { placed: false, tier: null, toNext: null, placementLeft: PLACEMENT_MATCHES - Math.max(0, matches) };
    const next = nextTier(rating);
    return { placed: true, tier: tierFor(rating), toNext: next ? next.min - rating : null, placementLeft: 0 };
}
