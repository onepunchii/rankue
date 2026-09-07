/**
 * 이닝 시트용 샷 기록. 세션 상태(shared/sim/rules)는 점수·이닝 수만 갖고 있어 "몇 이닝에 몇 점"은 화면이
 * 샷마다 쌓아야 한다. useSimulator 의 onOutcome(outcome, sessionAfter) 에서 appendShot 으로 쌓고,
 * 연습 모드 되돌리기(undo)는 popShot, 다시하기·나가기는 EMPTY_LOG 로 비운다. 순수 함수, 테스트 동반.
 *
 * 친 선수는 applyShot 규칙에서 역산한다: 이닝을 소모한 샷이면 턴이 이미 넘어갔으므로 (turn − 1),
 * 득점(이어 치기)·no-shot 이면 그대로 turn. 목표 도달로 끝난 샷도 턴이 안 넘어가므로 turn.
 */
import type { SessionState, ShotOutcome, ShotOutcomeCode } from "@shared/sim/rules";

export interface ShotEntry {
    /** 세션 shotCount(1부터). */
    readonly shot: number;
    /** players 인덱스 */
    readonly player: number;
    /** 그 선수의 이닝 번호(1부터). */
    readonly inning: number;
    readonly code: ShotOutcomeCode;
    readonly points: number;
    readonly cushions: number;
    readonly consumesInning: boolean;
}

export interface InningLog {
    readonly entries: readonly ShotEntry[];
}

export const EMPTY_LOG: InningLog = { entries: [] };

export function shooterIndex(outcome: Pick<ShotOutcome, "consumesInning">, after: Pick<SessionState, "turn" | "players">): number {
    const n = after.players.length;
    if (!outcome.consumesInning) return after.turn;
    return (after.turn + n - 1) % n;
}

export function appendShot(log: InningLog, outcome: ShotOutcome, after: SessionState): InningLog {
    const player = shooterIndex(outcome, after);
    const p = after.players[player];
    // 이닝을 소모했으면 innings 가 이미 올라가 있으니 그 값이 이번 이닝 번호. 아니면 진행 중 이닝 = innings + 1.
    const inning = outcome.consumesInning ? p.innings : p.innings + 1;
    const entry: ShotEntry = {
        shot: after.shotCount, player, inning: Math.max(1, inning),
        code: outcome.code, points: outcome.points, cushions: outcome.cushionsBeforeSecond,
        consumesInning: outcome.consumesInning,
    };
    return { entries: [...log.entries, entry] };
}

export function popShot(log: InningLog): InningLog {
    if (log.entries.length === 0) return log;
    return { entries: log.entries.slice(0, -1) };
}

export interface InningRow {
    readonly inning: number;
    /** 선수별 그 이닝 득점 합. 아직 그 이닝을 치지 않은 선수는 null. */
    readonly cells: readonly (number | null)[];
}

/** 이닝 번호별 행. 진행 중 이닝(득점만 있고 아직 안 끝난)도 포함한다. */
export function inningRows(log: InningLog, playerCount: number): InningRow[] {
    let max = 0;
    for (const e of log.entries) if (e.inning > max) max = e.inning;
    const rows: { inning: number; cells: (number | null)[] }[] = [];
    for (let i = 1; i <= max; i++) rows.push({ inning: i, cells: Array.from({ length: playerCount }, () => null) });
    for (const e of log.entries) {
        if (e.player >= playerCount) continue;
        const cell = rows[e.inning - 1].cells;
        cell[e.player] = (cell[e.player] ?? 0) + e.points;
    }
    return rows;
}

/** 선수별 합계(행의 합 = 세션 score 와 같아야 한다). */
export function totals(rows: readonly InningRow[], playerCount: number): number[] {
    const out = Array.from({ length: playerCount }, () => 0);
    for (const r of rows) r.cells.forEach((c, i) => { if (c !== null) out[i] += c; });
    return out;
}
