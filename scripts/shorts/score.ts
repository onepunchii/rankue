/**
 * 경기 우선순위(순수) — 2026-10-28 오너: "레이팅 높은 사람끼리, 레이팅 비슷한 대결이 1순위".
 *   강함 = 두 사람 중 낮은 레이팅이 시작값(1000)보다 얼마나 높은가(둘 다 높아야 크다)
 *   비등 = 레이팅 차이가 작을수록 · 접전 = 최종 점수 차가 작을수록
 * 레이팅은 지금 값이라 경기 당시 값과 조금 다를 수 있다.
 */
export function matchScore(ra: number, rb: number, scoreA: number, scoreB: number): number {
    const strong = Math.max(1, Math.min(ra, rb) - 950);
    const gap = Math.abs(ra - rb);
    const margin = Math.abs(scoreA - scoreB) / Math.max(1, scoreA, scoreB);
    return strong * (1 / (1 + gap / 50)) * (1 - 0.5 * margin);
}
