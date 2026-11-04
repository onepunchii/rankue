/**
 * 선구 정하기 — 가위바위보(2026-11-04 오너: "가위바위보 게임 디자인으로 시안" → 두 손 모두 위를 보게 → "응 이렇게 진행하자").
 * 온라인 대전이 시작되면 첫 샷 전에 두 사람이 가위바위보를 하고, **이긴 사람이 초구**(타이밍 게이지 — client/src/sim/breakGauge)를 친다.
 * 예전에는 늘 방장(자리 0)이 초구였다 — 초구 족보(같은 초구 → 같은 판)와 겹쳐 방장 쪽 하이런이 몰렸다(memory sim-break-gauge).
 *
 * 규칙
 *  - 각자 BREAK_RPS_PICK_MS(20초) 안에 낸다. 낸 손은 두 사람이 다 낼 때까지 서버가 쥐고 있다(상대 손은 공개 전까지 안 보인다).
 *  - 한 번 내면 바꿀 수 없다. 비기면 같은 손을 보여 준 뒤 한 번 더(새 20초).
 *  - 20초 안에 한 사람만 냈으면 낸 사람이 초구. 아무도 안 냈으면 예전처럼 방장(자리 0).
 *  - 정해지면 이긴 사람이 흰 공(개시 배치의 수구 자리)을 갖고, 그 사람부터 매 이닝을 연다(SessionState.first).
 *
 * 판정은 서버가 한다(routes/modules/simMatch). 이 파일은 계산만 — shared/sim 이라 Date 를 쓰지 않는다(시각은 ms 숫자로 받는다).
 */
import type { SessionState } from "./rules/session.js";

export type RpsHand = "rock" | "paper" | "scissors";
export const RPS_HANDS: readonly RpsHand[] = ["scissors", "rock", "paper"];
/** 한 판에 내는 시간 */
export const BREAK_RPS_PICK_MS = 20_000;
/** 비겼을 때 같은 손을 보여 주는 시간 — 다음 판의 20초는 이 뒤부터 센다 */
export const BREAK_RPS_TIE_SHOW_MS = 1_500;
/** 정해진 뒤 결과를 보여 주는 시간(화면) — 초구 시계는 서버가 따로 넉넉히 늦춰 건다 */
export const BREAK_RPS_RESULT_MS = 3_000;
/** 비김이 이만큼 이어지면 방장이 초구(끝없이 이어지는 일은 사실상 없지만 상한을 둔다) */
export const BREAK_RPS_MAX_ROUNDS = 10;

export const isRpsHand = (v: unknown): v is RpsHand => v === "rock" || v === "paper" || v === "scissors";
/** a 가 b 를 이기나 */
export const rpsBeats = (a: RpsHand, b: RpsHand): boolean => (a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock");

/**
 * 대전 행(hiq_sim_matches.break_rps)에 저장하는 모양 — [자리 0(방장), 자리 1(게스트)].
 * by: rps = 가위바위보로 · timeout = 한 사람만 내서 · default = 아무도 안 내 방장 · rounds = 비김 상한
 */
export interface BreakRps {
    round: number;
    deadlineMs: number;
    picks: [RpsHand | null, RpsHand | null];
    /** 바로 앞 판(비겼거나 · 정해진 판)의 두 손 — 화면이 보여 준다 */
    last: { round: number; picks: [RpsHand, RpsHand] } | null;
    winner: 0 | 1 | null;
    by: "rps" | "timeout" | "default" | "rounds" | null;
    decidedMs: number | null;
}

export function breakRpsStart(nowMs: number): BreakRps {
    return { round: 1, deadlineMs: nowMs + BREAK_RPS_PICK_MS, picks: [null, null], last: null, winner: null, by: null, decidedMs: null };
}

/** 아직 정하는 중인가(첫 샷 전 — 샷 · 시간 초과 · 시계를 막는다) */
export const breakRpsPending = (s: BreakRps | null | undefined): boolean => !!s && s.winner === null;

const decide = (s: BreakRps, winner: 0 | 1, by: NonNullable<BreakRps["by"]>, nowMs: number): BreakRps => ({ ...s, winner, by, decidedMs: nowMs });

/** 시간이 지났으면 정한다 — 한 사람만 냈으면 그 사람, 아무도 안 냈으면 방장. 정해졌거나 아직 시간이 남았으면 그대로 */
export function breakRpsSettle(s: BreakRps, nowMs: number): BreakRps {
    if (s.winner !== null || nowMs < s.deadlineMs) return s;
    const [a, b] = s.picks;
    if (a && !b) return decide(s, 0, "timeout", nowMs);
    if (!a && b) return decide(s, 1, "timeout", nowMs);
    return decide(s, 0, "default", nowMs);
}

/**
 * seat 가 hand 를 낸다. 이미 냈거나 · 정해졌거나 · 시간이 지났으면(먼저 settle) 바뀌지 않는다.
 * 둘 다 냈으면 바로 가린다 — 비기면 다음 판(같은 손을 BREAK_RPS_TIE_SHOW_MS 보여 준 뒤 새 20초).
 */
export function breakRpsPick(input: BreakRps, seat: 0 | 1, hand: RpsHand, nowMs: number): BreakRps {
    const s = breakRpsSettle(input, nowMs);
    if (s.winner !== null || s.picks[seat] !== null) return s;
    const picks: [RpsHand | null, RpsHand | null] = seat === 0 ? [hand, s.picks[1]] : [s.picks[0], hand];
    const [a, b] = picks;
    if (!a || !b) return { ...s, picks };
    const shown = { round: s.round, picks: [a, b] as [RpsHand, RpsHand] };
    if (a === b) {
        if (s.round >= BREAK_RPS_MAX_ROUNDS) return decide({ ...s, picks, last: shown }, 0, "rounds", nowMs);
        return { ...s, round: s.round + 1, picks: [null, null], last: shown, deadlineMs: nowMs + BREAK_RPS_TIE_SHOW_MS + BREAK_RPS_PICK_MS };
    }
    return decide({ ...s, picks, last: shown }, rpsBeats(a, b) ? 0 : 1, "rps", nowMs);
}

/**
 * 정해진 사람을 세션에 반영한다 — 이긴 사람이 흰 공(개시 배치의 수구)을 갖고, 그 사람부터 친다(turn · first).
 * 방장이 이겼으면 그대로(예전과 같은 세션). 샷이 있으면(이미 시작된 판) 건드리지 않는다.
 */
export function applyBreakWinner(state: SessionState, winner: 0 | 1): SessionState {
    if (winner === 0 || state.players.length !== 2 || state.shotCount > 0) return state;
    const players = state.players.map((p, i) => ({ ...p, cueBallId: i === winner ? "white" as const : "yellow" as const }));
    return { ...state, players, turn: winner, first: winner };
}

/** 화면에 주는 모양 — 보는 사람 기준(나 · 상대). 상대가 이번 판에 낸 손은 공개 전까지 '냈다'만 */
export interface BreakRpsView {
    round: number;
    deadlineMs: number;
    myPick: RpsHand | null;
    opponentPicked: boolean;
    /** 바로 앞 판의 두 손 [나, 상대] */
    last: { round: number; mine: RpsHand; theirs: RpsHand } | null;
    /** 누가 초구인가 — 아직이면 null */
    winner: "me" | "opponent" | null;
    by: BreakRps["by"];
    decidedMs: number | null;
}

/** seat < 0(관전자)이면 자리 0 쪽에서 본 모양으로, 이번 판 손은 둘 다 감춘다 */
export function breakRpsView(s: BreakRps, seat: number): BreakRpsView {
    const me = seat === 1 ? 1 : 0, them = me === 0 ? 1 : 0;
    const watcher = seat !== 0 && seat !== 1;
    return {
        round: s.round, deadlineMs: s.deadlineMs,
        myPick: watcher ? null : s.picks[me],
        opponentPicked: s.picks[them] !== null,
        last: s.last ? { round: s.last.round, mine: s.last.picks[me], theirs: s.last.picks[them] } : null,
        winner: s.winner === null ? null : s.winner === me ? "me" : "opponent",
        by: s.by, decidedMs: s.decidedMs,
    };
}

/** 저장된 값(jsonb)을 읽는다 — 모양이 틀리면 null(가위바위보 없는 옛 대전과 같다) */
export function parseBreakRps(v: unknown): BreakRps | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const hand = (x: unknown) => (isRpsHand(x) ? x : null);
    const picks = Array.isArray(o.picks) && o.picks.length === 2 ? [hand(o.picks[0]), hand(o.picks[1])] as [RpsHand | null, RpsHand | null] : null;
    if (!picks || typeof o.round !== "number" || typeof o.deadlineMs !== "number") return null;
    const l = o.last as Record<string, unknown> | null | undefined;
    const lp = l && Array.isArray(l.picks) && l.picks.length === 2 && isRpsHand(l.picks[0]) && isRpsHand(l.picks[1]) ? [l.picks[0], l.picks[1]] as [RpsHand, RpsHand] : null;
    const by = o.by === "rps" || o.by === "timeout" || o.by === "default" || o.by === "rounds" ? o.by : null;
    return {
        round: o.round, deadlineMs: o.deadlineMs, picks,
        last: l && lp && typeof l.round === "number" ? { round: l.round, picks: lp } : null,
        winner: o.winner === 0 || o.winner === 1 ? o.winner : null, by,
        decidedMs: typeof o.decidedMs === "number" ? o.decidedMs : null,
    };
}
