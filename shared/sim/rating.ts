/**
 * 온라인 대전 레이팅 규칙(2026-09-26 오너 결정) — 대전이 끝날 때(simMatch.repo applyElo)와
 * 전체 다시 계산(simMatch.repo recomputeRatings)이 **같은 함수**를 쓴다. 둘이 다르면 다시 계산한 점수와 평소 점수가 어긋난다.
 *
 * 1. **핸디전만 반영한다.** 다마수를 손으로 넣는 방(맞대결)은 친선전 — 목표를 스스로 정할 수 있어 레이팅에 넣으면
 *    "짠다마"로 점수를 올릴 수 있다. 판 수·승수도 세지 않는다(랭킹 배치에도 안 들어간다).
 * 2. **기대 승률은 50:50.** 핸디전은 두 사람의 온라인 에버리지로 목표를 정해 이길 확률을 이미 맞춘 판이다.
 *    보통 Elo 처럼 점수 차로 기대 승률을 또 매기면 실력 차를 두 번 세게 되어, 고수는 이겨도 조금·져도 많이 잃고
 *    판이 쌓일수록 고수가 내려가고 하수가 올라간다. 그래서 레이팅 = "내 핸디보다 얼마나 잘 쳤나" 지수다.
 * 3. **판이 성립해야 반영한다.** 두 사람 모두 샷을 MIN_SHOTS_EACH 번 이상 쳐야 한다 — 들어오자마자 기권하는
 *    두 계정 주고받기(점수 농사)를 막는다.
 * 4. **같은 상대와 연달아 치면 폭을 줄인다.** 24시간 안에 같은 두 사람이 이미 반영된 판이 n 판이면 1/(n+1).
 * 5. **자리 비움은 귀책이다(2026-09-26 오너: "레이팅까지 해야 자리비움에 대한 귀책사유가 되지").** 시간 초과 세 번(실격패)이나
 *    무응답 승리 주장으로 끝난 판은 샷 수가 모자라도 반영한다 — 단 **진 사람이 한 번이라도 쳤을 때만**(경기에 들어왔던 사람).
 *    한 번도 안 친 사람(방을 열어 두고 떠난 방장, 들어오자마자 나간 게스트)은 노쇼라 반영하지 않는다 — 두 계정으로
 *    "들어왔다 나가기"를 반복해 점수를 옮기는 길을 막는다.
 */

export const ELO_K = 24;
export const START_RATING = 1000;
/** 두 사람 각각 이 수 이상 쳐야 레이팅 판이다. */
export const MIN_SHOTS_EACH = 3;
/** 같은 두 사람 판을 줄여 반영하는 창 */
export const SAME_PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

export type UnratedReason = "manual" | "noGuest" | "tooShort";

/** 자리 비움으로 끝난 판의 endReason — 시간 초과 세 번(실격패)·무응답 승리 주장. */
export const AT_FAULT_END_REASONS: readonly string[] = ["timeout", "claim"];

export interface RatedCheck {
    handicap: boolean;
    hasGuest: boolean;
    /** [방장 샷 수, 게스트 샷 수] */
    shots: readonly [number, number];
    /** 끝난 이유(simMatch endReason). 자리 비움 귀책 판정에 쓴다. */
    endReason?: string | null;
    /** 0 = 방장 승, 1 = 게스트 승, null = 무승부·없음 */
    winner?: 0 | 1 | null;
}

/** 자리 비움 귀책 판: 시간 초과 실격·무응답 주장으로 끝났고, 진 사람이 한 번이라도 쳤다. */
export function isAtFaultLoss(m: Pick<RatedCheck, "endReason" | "winner" | "shots">): boolean {
    if (!m.endReason || !AT_FAULT_END_REASONS.includes(m.endReason)) return false;
    if (m.winner !== 0 && m.winner !== 1) return false;
    const loserShots = m.shots[m.winner === 0 ? 1 : 0];
    return loserShots >= 1;
}

/** 이 판이 레이팅 판인가. 아니면 이유. */
export function ratingEligibility(m: RatedCheck): { rated: true } | { rated: false; reason: UnratedReason } {
    if (!m.hasGuest) return { rated: false, reason: "noGuest" };
    if (!m.handicap) return { rated: false, reason: "manual" };
    if (m.shots[0] >= MIN_SHOTS_EACH && m.shots[1] >= MIN_SHOTS_EACH) return { rated: true };
    if (isAtFaultLoss(m)) return { rated: true };
    return { rated: false, reason: "tooShort" };
}

/**
 * 방장 기준 점수 변화(게스트는 부호 반대). winner: 0 = 방장 승, 1 = 게스트 승, null = 무승부(0).
 * samePairPrior: 24시간 안에 같은 두 사람이 이미 반영된 판 수.
 */
export function ratingDelta(winner: 0 | 1 | null, samePairPrior = 0): number {
    if (winner === null) return 0;
    const s = winner === 0 ? 1 : 0;
    const scale = 1 / (1 + Math.max(0, samePairPrior));
    return Math.round(ELO_K * (s - 0.5) * scale);
}
