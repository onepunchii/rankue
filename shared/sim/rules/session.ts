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
import { isBankShot } from "./evaluate.js";

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
    /**
     * 후구(마지막 동점 이닝) 진행 중이면 먼저 목표에 닿은 사람의 자리. 없으면 null(2026-09-12 테스터 제보 → 오너 결정).
     *
     * 왜 있나: 자리 0 이 매 이닝을 먼저 친다. 그 사람이 목표에 닿는 순간 끝내 버리면 상대는 그 이닝을 못 쳐 본다.
     * 그래서 3쿠션 공식전은 후공에게 한 이닝을 더 줘 이닝 수를 맞춘다 — 그게 후구다. 따라붙으면 무승부.
     * 자리 1 이 목표에 닿았을 때는 이미 이닝이 같으므로 바로 끝난다. 혼자 치는 연습(1인)도 바로 끝난다.
     * 옛 대전 행에는 이 칸이 없다(undefined) — null 과 같게 다룬다.
     */
    readonly pendingWinner?: number | null;
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
        players, turn: 0, shotCount: 0, status: "playing", winnerIndex: null, pendingWinner: null,
    };
}

export function currentPlayer(s: SessionState): PlayerState {
    return s.players[s.turn];
}

/** 마무리 규칙: 이 득점으로 목표에 도달한다면 조건을 만족해야 한다. */
function finishSatisfied(s: SessionState, o: ShotOutcome): boolean {
    if (s.finishType === "none") return true;
    if (s.finishType === "3c") return o.cushionsBeforeSecond >= 3;
    return isBankShot(o); // bank — 점수 판정과 같은 정의(evaluate.ts)
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
/** 접속 중 판정: 대전 화면을 이 시간 안에 폴링·샷했으면 접속 중 → 차례가 넘어오면 시계가 바로(재생 여유 뒤) 시작한다. */
/** 쓰리아웃: 시간 초과가 이만큼 쌓이면 그 사람의 실격패(2026-09-08 오너). */
export const SHOT_CLOCK_STRIKES = 3;
export const PRESENCE_MS = 20_000;
/** 상대 샷을 재생하는 동안은 시계를 안 센다 — 접속 중인 다음 차례의 시계 시작 = 샷 시각 + 이 값. */
export const REPLAY_GRACE_MS = 10_000;
/**
 * 자리를 비운 사람에게 차례가 넘어갔을 때의 시계 시작 유예(2026-09-15 오너: "상대가 앱을 끄면 시간이 아예 안 흘러간다").
 *
 * 예전에는 접속 중이 아니면 시계를 **아예 시작하지 않아서**, 남은 사람은 48시간 무응답 승리 주장 말고는 길이 없었다.
 * 이제는 늦게라도 시작한다 — 차례가 넘어가면 "당신 차례예요" 푸시가 나가므로, 알림을 보고 앱을 여는 데 걸리는
 * 시간만큼만 봐주고(이 값) 그 뒤로는 40초 룰이 똑같이 돈다. 세 번 넘기면 실격패.
 *
 * 비동기 대전(자기 전에 한 샷씩)은 영향이 없다 — 시간 초과는 **화면을 보고 있는 상대가** 올려야 성립하고,
 * 둘 다 자리에 없으면 아무 일도 일어나지 않는다(그때는 예전처럼 48시간 주장이 받는다).
 */
export const ABSENT_GRACE_MS = 60_000;

/* ── 상대 조준 보여 주기(2026-09-16 오너: "멀티가 너무 정적이다") ──
 * 치는 사람이 겨누는 방향을 기다리는 사람 화면에도 큐대로 보여 준다. 실제 당구장에서 상대가 자세 잡는 걸
 * 지켜보는 것과 같다 — 숨은 정보가 아니다(원래 다 보인다). 예상 경로는 주지 않는다: 그건 가락 제한을 무의미하게 만든다.
 */
/** 이 시간이 지난 조준 값은 낡은 것 — 서버가 내보내지 않고 화면도 큐대를 지운다(상대가 앱을 닫은 경우). */
export const AIM_FRESH_MS = 8_000;
/** 조준을 서버에 알리는 최소 간격(ms). 40초를 꽉 채워 조준해도 요청은 서른 번 남짓이다. */
export const AIM_REPORT_MS = 1_200;
/** 이만큼(rad, 약 0.6°) 이상 돌았을 때만 알린다 — 가만히 있으면 요청이 아예 없다. */
export const AIM_EPS_RAD = 0.01;

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
    const pending = s.pendingWinner ?? null;
    let pendingWinner: number | null = pending;

    if (o.scored && newScore >= me.target) {
        if (pending !== null) {
            // 후구에서 후공도 자기 목표에 닿았다 — 이닝 수가 같고 둘 다 다 쳤으니 무승부
            status = "finished";
            winnerIndex = null;
            pendingWinner = null;
        } else if (players.length === 2 && s.turn === 0) {
            // 선공이 먼저 닿았다 — 후공에게 마지막 한 이닝(후구)을 준다. 아직 끝나지 않았다.
            pendingWinner = 0;
            turn = 1;
        } else {
            status = "finished";
            winnerIndex = s.turn;
        }
    } else if (o.consumesInning) {
        if (pending !== null) {
            // 후구를 못 채우고 이닝을 넘겼다 — 먼저 닿은 사람의 승리
            status = "finished";
            winnerIndex = pending;
            pendingWinner = null;
        } else {
            turn = (s.turn + 1) % players.length;
            if (s.inningCap > 0 && players.every((p) => p.innings >= s.inningCap)) {
                status = "finished";
                winnerIndex = decideByInningCap(players);
            }
        }
    }
    return {
        session: { ...s, players, turn, shotCount: s.shotCount + 1, status, winnerIndex, pendingWinner },
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

/* ------------------------------------------------------------------ 고정 인사 */

/**
 * 2026-09-09~2026-09-16 상단 띠의 이모지 인사로 쓰던 여섯 개.
 *
 * **그 기능은 없어졌다**(2026-09-17 헤더 재설계 — 헤더는 "누가 치고 시간이 얼마 남았나"만 말한다).
 * 같은 일은 하단 한마디의 1탭 문구판이 하고, 그쪽은 덮어쓰기 없는 자식 테이블에 줄로 남는다.
 *
 * 이 목록을 남겨 두는 이유는 하나다: `CHAT_CODES` 가 이 여섯을 **하나도 빠짐없이** 담는지 검사하기 위해서다
 * (shared/sim/chat.test.ts). 갈라지면 그때 오간 옛 채팅 줄의 코드가 화면에서 조용히 사라진다.
 */
export const MATCH_EMOJIS = ["hi", "nice", "wow", "hurry", "sorry", "fight"] as const;
