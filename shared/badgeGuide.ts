/**
 * 배지 안내 팝업의 재료(2026-10-12 오너: "이거 누르면 팝업창으로 배지 나오면서 무슨 배지가 있고 간략하게 보여주는 팝업창 필요해 · 온라인게임 배지랑 실전 배지 다").
 * 등급마다의 구간을 **규칙에서 읽어** 만든다 — 팝업에 숫자를 따로 적지 않는다(표나 구간이 바뀌면 안내도 같이 바뀐다).
 *  - 실전(둥근 다마 메달): 그 종목의 내 다마 → 등급(shared/realTier). 구간은 다마 표(shared/realHandicap)의 눈금으로 적는다.
 *  - 온라인(방패): 온라인 대전 레이팅 → 등급(shared/sim/rank).
 */
import { TIERS, type TierId } from "./sim/rank.js";
import { REAL_TIERS, realHandiSteps, realTierFor, type RealGame, type RealTierId } from "./realTier.js";

export interface RealTierRange {
    id: RealTierId;
    /** 이 등급의 가장 낮은 다마 · 가장 높은 다마(다마 표의 눈금). 맨 위 등급은 to 가 null(그 이상) */
    from: number;
    to: number | null;
}

/** 실전 등급의 다마 구간(낮은 등급부터). 다마 표에 그 등급의 눈금이 하나도 없으면 뺀다 */
export function realTierRanges(game: RealGame): RealTierRange[] {
    const steps = realHandiSteps(game);
    const out: RealTierRange[] = [];
    REAL_TIERS[game].forEach((tier, i, all) => {
        const mine = steps.filter((h) => realTierFor(h, game)?.id === tier.id);
        if (mine.length === 0) return;
        out.push({ id: tier.id, from: mine[0], to: i === all.length - 1 ? null : mine[mine.length - 1] });
    });
    return out;
}

export interface OnlineTierRange {
    id: TierId;
    /** 이 등급이 시작되는 레이팅. 맨 아래 등급은 null(그 미만) */
    from: number | null;
    /** 이 등급의 끝(다음 등급 바로 아래). 맨 위 등급은 null(그 이상) */
    to: number | null;
}

/** 온라인 대전 등급의 레이팅 구간(낮은 등급부터) */
export function onlineTierRanges(): OnlineTierRange[] {
    return TIERS.map((tier, i) => ({
        id: tier.id,
        from: i === 0 ? null : tier.min,
        to: i === TIERS.length - 1 ? null : TIERS[i + 1].min - 1,
    }));
}
