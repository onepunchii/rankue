/**
 * 세션(경기) 상태 기계. 점수·이닝·하이런·턴·종료를 관리한다. 순수 함수 reducer 라
 * 서버(심판)·클라이언트·리플레이가 같은 코드로 같은 결과를 낸다.
 *
 * 점수판 앱의 규약을 그대로 따른다: 다마수 = 선수별 목표 점수(hiqGames.playerNTarget),
 * 마무리 규칙 ruleFinishType none | 3c | bank, 음수 점수 정상(clamp 금지).
 */
import type { Rules, ShotOutcome } from "./types.js";
import type { BallState } from "../types.js";
import { isOpeningLayout } from "../layouts.js";

export type FinishType = "none" | "3c" | "bank";

export interface PlayerState {
    readonly id: string;          // 회원 id 또는 "p1"/"p2"
    readonly cueBallId: "white" | "yellow";
    readonly target: number;
    readonly score: number;
    /** 완료한 이닝 수(진행 중 이닝 제외). 에버리지 = score / max(1, innings) 는 표시 계층에서. */
    readonly innings: number;
    readonly highRun: number;
    readonly currentRun: number;
}

export interface SessionState {
    readonly rules: Rules;
    readonly finishType: FinishType;
    /** 이닝 상한(0 = 없음). 양쪽 모두 이 이닝을 마치면 종료. */
    readonly inningCap: number;
    readonly players: readonly PlayerState[];
    readonly turn: number;        // players 인덱스
    readonly shotCount: number;
    readonly status: "playing" | "finished";
    readonly winnerIndex: number | null;
}

export interface CreateSessionOptions {
    readonly rules: Rules;
    readonly finishType?: FinishType;
    readonly inningCap?: number;
    readonly players: readonly { id: string; target: number; cueBallId?: "white" | "yellow" }[];
}

export function createSession(o: CreateSessionOptions): SessionState {
    if (o.players.length < 1 || o.players.length > 2) throw new RangeError("players must be 1 or 2");
    const players = o.players.map((p, i) => ({
        id: p.id,
        cueBallId: p.cueBallId ?? (i === 0 ? "white" : "yellow"),
        target: p.target,
        score: 0, innings: 0, highRun: 0, currentRun: 0,
    } as PlayerState));
    if (players.length === 2 && players[0].cueBallId === players[1].cueBallId) throw new RangeError("cue balls must differ");
    return {
        rules: o.rules, finishType: o.finishType ?? "none", inningCap: o.inningCap ?? 0,
        players, turn: 0, shotCount: 0, status: "playing", winnerIndex: null,
    };
}

export function currentPlayer(s: SessionState): PlayerState {
    return s.players[s.turn];
}

/** 마무리 규칙: 이 득점으로 목표에 도달한다면 조건을 만족해야 한다. */
function finishSatisfied(s: SessionState, o: ShotOutcome): boolean {
    if (s.finishType === "none") return true;
    if (s.finishType === "3c") return o.cushionsBeforeSecond >= 3;
    return o.cushionsBeforeFirst >= 3; // bank
}

/**
 * 이 샷이 개시 샷인가: 3쿠션이고, 아직 아무도 이닝을 마치거나 득점하지 않았고(첫 샷, 또는 0 파워 샷 뒤), 공이 개시 배치 그대로.
 * 판정(evaluateShot 의 opening — 첫 접촉은 빨간 공)과 기본 조준·두께 버튼의 기준 적구(빨간 공)가 함께 쓴다.
 * 자유 배치(공을 옮긴 연습)·드릴에는 적용되지 않는다. 4구는 항상 false. 서버·클라이언트·해법 찾기가 같은 함수를 쓴다.
 */
export function isOpeningShot(s: SessionState, balls: readonly BallState[]): boolean {
    if (s.rules.gameType !== "3c") return false;
    if (!s.players.every((p) => p.innings === 0 && p.score === 0)) return false;
    return isOpeningLayout(balls, "3c");
}

/** 대전 샷 클럭(초): 차례가 된 사람이 조준 화면에 들어온 뒤 이만큼 안에 쳐야 한다. UMB 40초 룰. */
export const SHOT_CLOCK_S = 40;
/** 상대가 시간 초과를 대신 처리할 수 있기까지의 유예(초) — 치는 사람 쪽 네트워크 지연을 봐준다. */
export const SHOT_CLOCK_GRACE_S = 10;

/** 시간 초과: 샷 없이 이닝을 넘기는 결과(무득점·이닝 소모). applyShot 에 그대로 넣는다. */
export function timeoutOutcome(): ShotOutcome {
    return { code: "foul-timeout", points: 0, scored: false, consumesInning: true, cushionsBeforeSecond: 0, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
}

export interface ApplyResult {
    readonly session: SessionState;
    /** 마무리 규칙 때문에 득점이 무효 처리됐으면 원래 outcome 을 이렇게 바꾼 것 */
    readonly outcome: ShotOutcome;
}

export function applyShot(s: SessionState, raw: ShotOutcome): ApplyResult {
    if (s.status !== "playing") throw new Error("session finished");
    let o = raw;
    const me = s.players[s.turn];

    if (o.scored && me.score + o.points >= me.target && !finishSatisfied(s, o)) {
        o = { ...o, code: "miss-finish", points: 0, scored: false, consumesInning: true };
    }

    if (o.code === "no-shot") {
        return { session: { ...s, shotCount: s.shotCount + 1 }, outcome: o };
    }

    const newScore = me.score + o.points;
    const newRun = o.scored ? me.currentRun + o.points : 0;
    const updatedMe: PlayerState = {
        ...me,
        score: newScore,
        currentRun: o.scored ? newRun : 0,
        highRun: Math.max(me.highRun, newRun),
        innings: o.consumesInning ? me.innings + 1 : me.innings,
    };
    const players = s.players.map((p, i) => (i === s.turn ? updatedMe : p));

    let status: SessionState["status"] = "playing";
    let winnerIndex: number | null = null;
    let turn = s.turn;

    if (o.scored && newScore >= me.target) {
        status = "finished";
        winnerIndex = s.turn;
    } else if (o.consumesInning) {
        turn = (s.turn + 1) % players.length;
        if (s.inningCap > 0 && players.every((p) => p.innings >= s.inningCap)) {
            status = "finished";
            winnerIndex = decideByInningCap(players);
        }
    }
    return {
        session: { ...s, players, turn, shotCount: s.shotCount + 1, status, winnerIndex },
        outcome: o,
    };
}

/** 이닝 상한 종료: 목표 대비 달성률이 높은 쪽. 동률이면 null(무승부). */
function decideByInningCap(players: readonly PlayerState[]): number | null {
    if (players.length === 1) return 0;
    const r0 = players[0].score / players[0].target;
    const r1 = players[1].score / players[1].target;
    if (r0 === r1) return null;
    return r0 > r1 ? 0 : 1;
}
