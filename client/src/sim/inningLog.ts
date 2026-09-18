/**
 * 이닝 시트용 샷 기록. 세션 상태(shared/sim/rules)는 점수·이닝 수만 갖고 있어 "몇 이닝에 몇 점"은 화면이
 * 샷마다 쌓아야 한다. useSimulator 의 onOutcome(outcome, sessionAfter) 에서 appendShot 으로 쌓고,
 * 연습 모드 되돌리기(undo)는 popShot, 다시하기·나가기는 EMPTY_LOG 로 비운다. 순수 함수, 테스트 동반.
 *
 * 친 선수는 applyShot 규칙에서 역산한다: 이닝을 소모한 샷이면 턴이 이미 넘어갔으므로 (turn − 1),
 * 득점(이어 치기)·no-shot 이면 그대로 turn. 목표 도달로 끝난 샷도 턴이 안 넘어가므로 turn.
 */
import { applyShot, shotInning, timeoutOutcome, type SessionState, type ShotOutcome, type ShotOutcomeCode } from "@shared/sim/rules";

export interface ShotEntry {
    /** 세션 shotCount(1부터). */
    readonly shot: number;
    /**
     * 대전의 서버 샷 번호(0부터, hiq_sim_match_shots.idx). 대전에서만 있다.
     * 다시 들어왔을 때 서버에서 받은 기록과 그 뒤 화면이 쌓은 기록을 이 번호로 이어 붙인다(withHistory).
     */
    readonly idx?: number;
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

/**
 * shooter 를 넘기면 그대로 쓴다 — 후구(2026-09-12)에서는 득점 샷도 턴을 넘기므로 끝난 상태만으로는 친 사람을 알 수 없다.
 * 안 넘기면 예전처럼 끝난 상태에서 되짚는다(shooterIndex).
 */
export function appendShot(log: InningLog, outcome: ShotOutcome, after: SessionState, shooter?: number, idx?: number | null): InningLog {
    const player = shooter ?? shooterIndex(outcome, after);
    const entry: ShotEntry = {
        shot: after.shotCount,
        ...(typeof idx === "number" && idx >= 0 ? { idx } : {}),
        player,
        // 이닝을 소모했으면 innings 가 이미 올라가 있으니 그 값이 이번 이닝 번호. 아니면 진행 중 이닝 = innings + 1.
        // 서버가 샷 행에 적는 값과 같은 함수다(shared/sim/rules shotInning).
        inning: shotInning(outcome, after.players[player]),
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

/**
 * 이닝 번호별 행. 진행 중 이닝(득점만 있고 아직 안 끝난)도 포함한다.
 *
 * `completed`(선수별 끝낸 이닝 수 = 세션 players[i].innings)를 주면 **샷 없이 끝난 이닝**을 0 으로 채운다.
 * 40초 시간 초과가 그렇다 — 샷 행이 없어 기록에 줄이 안 생기는데, 비워 두면 "아직 안 친 이닝"과 구별이 안 된다.
 * 안 줘도 같은 선수의 더 뒤 이닝 기록이 있으면 그 사이 빈 이닝은 끝난 것이므로 0 으로 채운다.
 */
export function inningRows(log: InningLog, playerCount: number, completed?: readonly number[]): InningRow[] {
    let max = 0;
    const lastInning = Array.from({ length: playerCount }, () => 0);
    for (const e of log.entries) {
        if (e.player >= playerCount) continue;
        if (e.inning > max) max = e.inning;
        if (e.inning > lastInning[e.player]) lastInning[e.player] = e.inning;
    }
    const done = Array.from({ length: playerCount }, (_, i) => Math.max(0, Math.floor(completed?.[i] ?? 0), lastInning[i] - 1));
    for (const d of done) if (d > max) max = d;
    const rows: { inning: number; cells: (number | null)[] }[] = [];
    for (let i = 1; i <= max; i++) rows.push({ inning: i, cells: Array.from({ length: playerCount }, (_, p) => (i <= done[p] ? 0 : null)) });
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

/* ── 다시 들어온 대전: 서버 샷 기록으로 이닝 기록을 되살린다 ───────────────────────────────────────────
 * 2026-09-18 오너: "멀티에서 방 나갔다 다시 이어 하기 하면 이닝별 스코어가 새로 리셋이야? 다 지워져 있네."
 * 이닝 기록은 화면이 샷마다 쌓는 것이라(onOutcome) 화면을 새로 열면 비어 있었다. 서버에는 샷 행이 전부 있다. */

/** 서버 샷 행 중 이닝 기록에 필요한 것(matchApi.MatchShot 의 부분 집합 — 이 모듈이 matchApi 에 기대지 않게). */
export interface HistoryShot {
    readonly idx: number;
    readonly playerIndex: number;
    readonly outcomeCode: string;
    readonly points: number;
    readonly cushions: number;
    /** 서버가 적은 이닝 번호. 2026-09-18 전 샷은 null — 그때는 아래 재생으로 추정한다. */
    readonly inning?: number | null;
}

/** 득점 코드 — 이어 친다(이닝 소모 없음). 서버가 적는 코드는 마무리 규칙까지 반영된 **적용 후** 코드다. */
const SCORED_CODES: ReadonlySet<string> = new Set(["point", "point-bank", "point-3c"]);
/** 두 샷 사이 시간 초과 상한(쓰리아웃이라 한 사람 최대 2번 + 상대 2번). 이상한 기록에서 무한 루프를 막는다. */
const MAX_TIMEOUTS_BETWEEN = 6;

/**
 * 저장된 코드·점수에서 결과를 되살린다. 쿠션 수는 **판정 재현용**이 아니라 표시용이므로, 마무리 규칙(finishSatisfied)이
 * 다시 걸려 득점을 miss-finish 로 바꾸지 않게 조건을 채워 둔다 — 서버가 이미 그 규칙을 적용한 뒤의 코드이기 때문이다.
 */
function storedOutcome(shot: HistoryShot): ShotOutcome {
    const scored = SCORED_CODES.has(shot.outcomeCode);
    return {
        code: shot.outcomeCode as ShotOutcomeCode,
        points: shot.points,
        scored,
        consumesInning: !scored && shot.outcomeCode !== "no-shot",
        cushionsBeforeSecond: scored ? Math.max(3, shot.cushions) : shot.cushions,
        cushionsBeforeFirst: scored ? Number.MAX_SAFE_INTEGER : 0,
        contacts: [],
        kisses: 0,
    };
}

/** 대전 시작 세션(모든 대전은 0번 자리 — 호스트 — 가 개시한다). 규칙·목표는 대전 내내 같으므로 아무 시점의 세션에서 가져온다. */
function openingSession(any: SessionState): SessionState {
    return {
        ...any,
        players: any.players.map((p) => ({ ...p, score: 0, innings: 0, highRun: 0, currentRun: 0 })),
        turn: 0, shotCount: 0, status: "playing", winnerIndex: null, pendingWinner: null,
    };
}

/**
 * 서버 샷 행(idx 오름차순, 0부터)으로 이닝 기록을 다시 만든다. 순수 함수.
 *
 * 이닝 번호는 서버가 적은 값(shot.inning)을 그대로 쓴다. 없는 옛 샷은 **세션을 처음부터 다시 적용해** 센다:
 * 개시 세션에 샷마다 applyShot 을 걸고, 샷을 친 사람이 세션의 차례와 다르면 그 사이에 차례인 사람이 시간 초과로
 * 이닝을 넘긴 것이다(timeoutOutcome 을 끼운다). 후구(선공이 목표에 닿아 이닝 소모 없이 차례가 넘어감)·no-shot 도
 * 같은 applyShot 이 처리하므로 규칙을 여기서 다시 쓰지 않는다.
 * 추정의 한계: 두 사람이 **연달아** 시간 초과하면(같은 사람이 다시 치게 되면) 샷 순서에 흔적이 없다 — 그래서 서버가 이닝을 적는다.
 *
 * `state` 는 이 대전의 아무 시점 세션(규칙·목표·선수 수를 가져온다). 없으면 서버 이닝이 있는 샷만 쓴다.
 * 어떤 입력에도 던지지 않는다 — 기록이 이상하면 그 샷의 차례를 믿고 계속 간다(점수판이 통째로 비는 것보다 낫다).
 */
export function rebuildInningLog(shots: readonly HistoryShot[], state: SessionState | null): InningLog {
    const sorted = [...shots].sort((a, b) => a.idx - b.idx);
    const entries: ShotEntry[] = [];
    let s: SessionState | null = state && state.players.length > 0 ? openingSession(state) : null;
    for (const shot of sorted) {
        const o = storedOutcome(shot);
        const known = typeof shot.inning === "number" && shot.inning >= 1 ? shot.inning : null;
        let inferred: number | null = null;
        let shotCount = entries.length + 1;
        if (s && shot.playerIndex >= 0 && shot.playerIndex < s.players.length) {
            let cur: SessionState = s;
            for (let k = 0; k < MAX_TIMEOUTS_BETWEEN && cur.status === "playing" && cur.turn !== shot.playerIndex; k++) {
                cur = applyShot(cur, timeoutOutcome()).session;
            }
            // 기록이 세션과 어긋났다(끝난 세션 뒤에 샷, 시간 초과 상한 초과) — 이 샷의 친 사람을 믿고 되살려 계속 간다.
            if (cur.status !== "playing" || cur.turn !== shot.playerIndex) {
                cur = { ...cur, status: "playing", turn: shot.playerIndex, winnerIndex: null, pendingWinner: null };
            }
            try {
                const applied = applyShot(cur, o);
                inferred = shotInning(o, applied.session.players[shot.playerIndex]);
                shotCount = applied.session.shotCount;
                s = applied.session;
            } catch {
                s = cur;
            }
        }
        const inning = known ?? inferred;
        if (inning === null) continue;
        entries.push({
            shot: shotCount, idx: shot.idx, player: shot.playerIndex, inning,
            code: o.code, points: shot.points, cushions: shot.cushions, consumesInning: o.consumesInning,
        });
    }
    return { entries };
}

/**
 * 서버 기록(idx < upTo)과 지금 화면이 가진 기록 중 **그 뒤**(idx ≥ upTo)를 이어 붙인다.
 * 기록을 받는 사이에 상대가 쳐서 화면이 이미 한 줄을 쌓았어도 줄이 겹치거나 빠지지 않는다.
 */
export function withHistory(current: InningLog, history: InningLog, upTo: number): InningLog {
    const head = history.entries.filter((e) => e.idx !== undefined && e.idx < upTo);
    const tail = current.entries.filter((e) => e.idx !== undefined && e.idx >= upTo);
    return { entries: [...head, ...tail] };
}

/**
 * 서버 정본으로 갈아탄 순간(샷 수 = upTo): 화면 기록 중 idx ≥ upTo 는 서버가 받지 않은 샷이다(거부된 내 샷 등).
 * 그 순간엔 그런 줄이 정당하게 있을 수 없으므로 버린다. 그 앞 줄은 서버 기록이 도착하면 withHistory 가 바꿔 끼운다.
 */
export function dropFrom(current: InningLog, upTo: number): InningLog {
    const kept = current.entries.filter((e) => e.idx === undefined || e.idx < upTo);
    return kept.length === current.entries.length ? current : { entries: kept };
}
