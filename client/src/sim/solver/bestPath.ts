/**
 * 길 찾기 카드가 쓰는 순수 계산(화면 별칭을 타지 않는다 — 테스트가 그대로 부른다).
 */
import type { SolveCandidate } from "./search";

/** 성공 확률이 가장 높은 후보(오차 허용 우선, 같으면 점수). 오차 허용을 못 잰 후보는 뒤로. */
export function bestCandidate(candidates: readonly SolveCandidate[]): SolveCandidate | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((x, y) => (y.robustness ?? -1) - (x.robustness ?? -1) || y.score - x.score)[0];
}

/** 성공 확률 순으로 상위 n개(오른쪽 바의 "길 1·2·3"). 못 잰 후보는 뒤로. */
export function rankedPaths(candidates: readonly SolveCandidate[], n = 3): readonly SolveCandidate[] {
    return [...candidates].sort((x, y) => (y.robustness ?? -1) - (x.robustness ?? -1) || y.score - x.score).slice(0, n);
}

/** 쿠션 수 — 시트와 같은 값(판정이 센 값). */
export function cushionCount(c: SolveCandidate): number {
    return c.outcome.cushionsBeforeSecond;
}

/** 성공 확률 표시값(%). 못 쟀으면 null. */
export function successPct(c: SolveCandidate): number | null {
    return c.robustness === null ? null : Math.round(c.robustness * 100);
}
