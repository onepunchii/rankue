/**
 * 샷 결과 코드 → 화면 문구·톤. 문구는 전부 i18n 키(`sim.outcome.*`)라 화면이 t 를 넘긴다.
 * 3쿠션 미스(쿠션 부족)는 밟은 쿠션 수를 같이 보여준다("쿠션 2개"). 이모지 없음.
 */
import type { ShotOutcome, ShotOutcomeCode } from "@shared/sim/rules";

export type T = (key: string) => string;

export const OUTCOME_KEYS: Readonly<Record<ShotOutcomeCode, string>> = {
    "point": "sim.outcome.point",
    "point-bank": "sim.outcome.pointBank",
    "point-3c": "sim.outcome.point3c",
    "miss-no-contact": "sim.outcome.missNoContact",
    "miss-one-ball": "sim.outcome.missOneBall",
    "miss-cushions": "sim.outcome.missCushions",
    "miss-finish": "sim.outcome.missFinish",
    "foul-opponent": "sim.outcome.foulOpponent",
    "foul-truncated": "sim.outcome.foulTruncated",
    "foul-opening": "sim.outcome.foulOpening",
    "foul-timeout": "sim.outcome.foulTimeout",
    "no-shot": "sim.outcome.noShot",
};

export function outcomeMessage(t: T, outcome: Pick<ShotOutcome, "code" | "cushionsBeforeSecond">): string {
    const text = t(OUTCOME_KEYS[outcome.code]);
    if (outcome.code === "miss-cushions") return text.replace("{n}", String(outcome.cushionsBeforeSecond));
    return text;
}

/** 득점 변화 라벨. 0 이면 null(미스는 점수 표시 없음). 음수는 부호 그대로. */
export function outcomePointsLabel(outcome: Pick<ShotOutcome, "points">): string | null {
    if (outcome.points === 0) return null;
    return outcome.points > 0 ? `+${outcome.points}` : String(outcome.points);
}

export type OutcomeTone = "score" | "miss" | "foul";

export function outcomeTone(outcome: Pick<ShotOutcome, "code" | "scored">): OutcomeTone {
    if (outcome.scored) return "score";
    return outcome.code.startsWith("foul") ? "foul" : "miss";
}
