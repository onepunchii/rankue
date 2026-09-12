/**
 * 온라인 다마수(2026-09-12 오너: "다마수에 따른 경기를 해야 합리적이지 않을까").
 *
 * 규칙은 한 줄이다: **두 사람이 비슷한 이닝 수에 끝나도록 각자의 목표를 정한다.**
 *   목표 = 내 에버리지 × 기준 이닝
 * 비율(실력 차)은 에버리지 비율 그대로 들어가고, 경기 길이는 기준 이닝으로 고정된다.
 * 오너가 고른 방식(2026-09-12): "비율 유지, 길이 고정".
 *
 * 왜 다마수를 그대로 쓰지 않나: 당구장 다마수를 그대로 옮기면 고수 판이 300이닝씩 간다. 온라인은 한 판이
 * 20~30분 안에 끝나야 하고, 실력 차는 비율만 지키면 그대로 반영된다.
 *
 * 에버리지는 **온라인 대전 기록으로만** 낸다. 두 가지 이유다:
 *   1) 짠다마 방지 — 자기신고를 받지 않는 것은 실전 핸디와 같은 설계다.
 *   2) 시뮬레이터는 실전 성적(RP·에버리지·핸디)을 읽지도 쓰지도 않는다(sim.guard.test 가 막는다, 2026-08-30 오염 사고).
 *      시뮬 실력과 실제 큐 실력은 다르기도 하다.
 * 기록이 모자라면(이닝 MIN_INNINGS 미만) 종목 기본값으로 시작하고, 치는 대로 곧 제 값을 찾는다.
 *
 * 단위 주의(다마수 스케일 함정): 4구는 1캐롬 = 10점(pointUnit)이라 목표도 10점 단위다. 에버리지는 언제나
 * **캐롬/이닝**으로 센다 — 점수로 세면 4구만 10배가 된다.
 */
import type { GameType } from "./rules/types.js";

/** 한 판의 기준 이닝. 두 사람 모두 대략 이 이닝 안에 목표에 닿도록 목표를 정한다. */
export const TARGET_INNINGS = 18;
/** 이 이닝 이상 쳐야 기록으로 다마를 매긴다(대략 한두 판). 그 전엔 종목 기본값. 판수보다 이닝이 정확하다 — 3이닝짜리 판 다섯 번은 표본이 아니다. */
export const MIN_INNINGS = 15;
/** 다마를 낼 때 보는 최근 대전 수. */
export const RECENT_MATCHES = 10;

/** 종목별 캐롬 목표의 아래·위 한계. 너무 짧으면 운, 너무 길면 지친다. */
export const CAROM_MIN: Record<GameType, number> = { "3c": 3, "4c": 3 };
export const CAROM_MAX: Record<GameType, number> = { "3c": 30, "4c": 40 };
/** 기록이 아예 없을 때 쓰는 에버리지(캐롬/이닝). 초보 기준. */
export const DEFAULT_AVG: Record<GameType, number> = { "3c": 0.2, "4c": 0.35 };

/** 온라인 대전 기록 한 사람 몫. score 는 점수(4구는 10점 단위), innings 는 그 사람이 마친 이닝. */
export interface MatchRecord {
    readonly score: number;
    readonly innings: number;
    readonly matches: number;
}

/** 캐롬/이닝. 이닝이 0이면 null(아직 잴 수 없다). */
export function averageOf(rec: MatchRecord, pointUnit: number): number | null {
    if (rec.innings <= 0) return null;
    const caroms = rec.score / (pointUnit > 0 ? pointUnit : 1);
    return caroms / rec.innings;
}

/**
 * 이 사람의 에버리지. 온라인 기록이 충분하면 그것, 아니면 종목 기본값.
 * 음수 에버리지(파울이 득점보다 많은 기록)는 0 으로 본다 — 목표는 아래 한계가 따로 있다.
 */
export function playerAverage(o: { gameType: GameType; pointUnit: number; record?: MatchRecord | null }): number {
    if (!o.record || !hasEnoughRecord(o.record)) return DEFAULT_AVG[o.gameType];
    const avg = averageOf(o.record, o.pointUnit);
    return avg === null ? DEFAULT_AVG[o.gameType] : Math.max(0, avg);
}

/** 이 기록으로 다마를 매길 수 있나. */
export function hasEnoughRecord(rec: MatchRecord): boolean {
    return rec.innings >= MIN_INNINGS;
}

/**
 * 목표 점수 = 반올림(에버리지 × 기준 이닝) 캐롬 → 점수(4구는 ×10).
 * 아래·위 한계로 자른다. 한계에 걸리면 그만큼 비율이 흐트러지지만, 두 시간짜리 판을 만드는 것보다 낫다.
 */
export function targetFor(avg: number, gameType: GameType, pointUnit: number, innings = TARGET_INNINGS): number {
    const raw = Math.round((Number.isFinite(avg) ? Math.max(0, avg) : 0) * innings);
    const caroms = Math.min(CAROM_MAX[gameType], Math.max(CAROM_MIN[gameType], raw));
    return caroms * (pointUnit > 0 ? pointUnit : 1);
}

/** 두 사람의 목표를 한 번에. 반환은 [방장, 게스트] 점수. */
export function handicapPair(a: number, b: number, gameType: GameType, pointUnit: number, innings = TARGET_INNINGS): [number, number] {
    return [targetFor(a, gameType, pointUnit, innings), targetFor(b, gameType, pointUnit, innings)];
}
