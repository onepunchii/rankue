/**
 * 길 찾기 카드가 쓰는 순수 계산(화면 별칭을 타지 않는다 — 테스트가 그대로 부른다).
 */
import type { SolveCandidate } from "./search";

/** 성공 확률이 가장 높은 후보(오차 허용 우선, 같으면 점수). 오차 허용을 못 잰 후보는 뒤로. */
export function bestCandidate(candidates: readonly SolveCandidate[]): SolveCandidate | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((x, y) => (y.robustness ?? -1) - (x.robustness ?? -1) || y.score - x.score)[0];
}

const byMargin = (x: SolveCandidate, y: SolveCandidate) => (y.robustness ?? -1) - (x.robustness ?? -1) || y.score - x.score;

/** 적구 먼저 길에 남겨 두는 최소 자리 수 — 무작위 배치에선 뱅크가 후보를 거의 다 차지한다(실측 58/60). */
export const BALL_FIRST_QUOTA = 2;

/**
 * 여유 순으로 상위 n개. 다만 적구 먼저 길이 있으면 최소 BALL_FIRST_QUOTA 자리를 준다 —
 * 쿠션은 표적이 크고 적구는 작아서, 여유만으로 줄 세우면 목록이 전부 뱅크가 된다.
 */
export function rankedPaths(candidates: readonly SolveCandidate[], n = 3): readonly SolveCandidate[] {
    const sorted = [...candidates].sort(byMargin);
    const ballFirst = sorted.filter((c) => c.aim.kind !== "bank");
    const picked: SolveCandidate[] = ballFirst.slice(0, Math.min(BALL_FIRST_QUOTA, n));
    for (const c of sorted) {
        if (picked.length >= n) break;
        if (!picked.includes(c)) picked.push(c);
    }
    return picked.sort(byMargin);
}

/** 쿠션 수 — 시트와 같은 값(판정이 센 값). */
export function cushionCount(c: SolveCandidate): number {
    return c.outcome.cushionsBeforeSecond;
}

/** 성공 확률 표시값(%). 못 쟀으면 null. */
export function successPct(c: SolveCandidate): number | null {
    return c.robustness === null ? null : Math.round(c.robustness * 100);
}

/** 여유 등급 — 넉넉(30 % 이상) · 보통(15~29 %) · 까다로움(그 아래). 못 잰 후보는 null. */
export type MarginLevel = "wide" | "mid" | "tight";
export function marginLevel(c: SolveCandidate): MarginLevel | null {
    const pct = successPct(c);
    if (pct === null) return null;
    return pct >= 30 ? "wide" : pct >= 15 ? "mid" : "tight";
}

/** 최대 옆당점을 몇 팁으로 볼지(한국 당구 표기: 1~3팁). */
export const MAX_TIPS = 3;

export interface TipSpot {
    /** 좌/우 옆당점 팁 수(0 = 중앙) */
    readonly tips: number;
    readonly side: "left" | "right" | null;
    /** 위아래: 상단 · 중단 · 하단 */
    readonly vertical: "high" | "mid" | "low";
}

/** 당점(a, b)을 팁 표기로. maxOffset 이 3팁이다. 아주 작은 값은 중앙으로 본다. */
export function tipSpot(a: number, b: number, maxOffset: number): TipSpot {
    const ax = Math.abs(a) / maxOffset;
    const tips = Math.min(MAX_TIPS, Math.round(ax * MAX_TIPS));
    const side = tips === 0 ? null : a > 0 ? "right" : "left";
    const by = b / maxOffset;
    const vertical = by > 0.2 ? "high" : by < -0.2 ? "low" : "mid";
    return { tips, side, vertical };
}
