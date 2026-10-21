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

/**
 * 종목별 1캐롬의 점수. 4구는 당구장 관행대로 10점(DEFAULT_4C_RULES.pointUnit), 3쿠션은 1점.
 * **에버리지·하이런은 언제나 캐롬 단위로 읽어 준다** — 점수로 세면 4구만 10배가 되어(에버 200 같은 숫자) 뜻이 없어진다.
 */
export function pointUnitFor(gameType: GameType): number {
    return gameType === "4c" ? FOUR_BALL_POINT_UNIT : 1;
}
export const FOUR_BALL_POINT_UNIT = 10;

/** 점수 → 캐롬 수. */
export function caromsOf(score: number, gameType: GameType): number {
    return (Number.isFinite(score) ? score : 0) / pointUnitFor(gameType);
}

/**
 * 세션 하나의 에버리지(캐롬/이닝). **완료 이닝이 0이어도 1이닝으로 센다** — 한 이닝에 다 쳐서 끝낸 판도
 * 친 판이다(2026-09-12 오너 제보: 4구 999점 목표로 1000점에 끝냈는데 기록이 안 남았다. 이닝 0이라 버려졌다).
 */
export function sessionAverage(score: number, innings: number, gameType: GameType): number {
    return caromsOf(score, gameType) / Math.max(1, Number.isFinite(innings) ? innings : 0);
}

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

/**
 * 랭킹 줄의 온라인 다마수(2026-10-20 오너: 랭킹에 "핸디 점수 보이면 좋을듯" → 점수 옆 큰 육각).
 * 기록이 모자라면(MIN_INNINGS 미만) null — 종목 기본값을 그 사람의 다마처럼 보이면 안 된다(화면은 회색 빈 육각).
 */
export function onlineDamaOf(rec: MatchRecord | null | undefined, gameType: GameType, pointUnit: number): number | null {
    if (!rec || !hasEnoughRecord(rec)) return null;
    return targetFor(playerAverage({ gameType, pointUnit, record: rec }), gameType, pointUnit);
}

/**
 * 친선전(방장이 '내 다마수'를 고른 방)의 게스트 목표(2026-10-21 오너: "내가 15개를 치는데 5개만 놓고 싶으면 3분의 1이니깐 상대도 3분의 1로 다마가 축소되는 거지").
 * 방장이 자기 온라인 핸디의 몇 배를 골랐는지(비율) 그대로 게스트의 온라인 핸디에 곱한다 — 핸디만큼 쳐도 '같은 비율'이면 실력 차는 그대로다.
 * 캐롬 단위로 반올림하고, 한 캐롬 아래 · 999점 위로는 가지 않는다. 비율이 1(방장이 자기 핸디 그대로)이면 핸디전과 같은 목표가 된다.
 */
export function scaledTarget(hostTarget: number, hostHandi: number, guestHandi: number, pointUnit: number): number {
    const unit = pointUnit > 0 ? pointUnit : 1;
    const ratio = hostHandi > 0 && hostTarget > 0 ? hostTarget / hostHandi : 1;
    const caroms = Math.max(1, Math.round((Math.max(0, guestHandi) / unit) * ratio));
    return Math.min(999, caroms * unit);
}

/**
 * 비율을 사람이 읽는 꼴로 — 1 이면 'same', 두 배 · 세 배면 'times', 흔한 분수(분모 4까지)에 2% 안으로 맞으면 { p, q }, 아니면 백분율.
 * 화면은 { p, q } 를 '3분의 1'(ko) · '1/3'(그 밖) 으로 적는다.
 */
export function ratioParts(hostTarget: number, hostHandi: number): { kind: "same" } | { kind: "times"; n: number } | { kind: "frac"; p: number; q: number } | { kind: "pct"; pct: number } {
    if (!(hostHandi > 0) || !(hostTarget > 0)) return { kind: "same" };
    const r = hostTarget / hostHandi;
    if (Math.abs(r - 1) < 0.02) return { kind: "same" };
    if (r > 1.5 && Math.abs(r - Math.round(r)) / r < 0.02) return { kind: "times", n: Math.round(r) };
    for (let q = 2; q <= 4; q++) for (let p = 1; p <= q * 3; p++) if (p % q !== 0 && Math.abs(r - p / q) / r < 0.02) return { kind: "frac", p, q };
    return { kind: "pct", pct: Math.round(r * 100) };
}

/** 두 사람의 목표를 한 번에. 반환은 [방장, 게스트] 점수. */
export function handicapPair(a: number, b: number, gameType: GameType, pointUnit: number, innings = TARGET_INNINGS): [number, number] {
    return [targetFor(a, gameType, pointUnit, innings), targetFor(b, gameType, pointUnit, innings)];
}
