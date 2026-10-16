/**
 * 어드민 › 당구 › 월대회(2026-10-16 어드민 전수 조사 — "11/1 첫 대회 전에 대진 보기 · 결과 바꾸기 · 판 무효 · 다시 굴리기").
 * 대진의 규칙은 shared/simCup 그대로 — 여기는 운영자가 손대도 되는 때를 가리는 순수 함수와 화면에 주는 모양.
 *
 *  - 기한 늘리기: 아직 안 가려진 판(기한 하루 전 알림도 다시 나간다)
 *  - 결과 정하기: 아직 안 가려졌고 두 사람이 앉은 판 — A 승 · B 승(진 쪽 기권 여부) · 둘 다 기권
 *  - 결과 바꾸기: 가려진 판(부전승 말고) 가운데, 이 판에 기대는 다음 판(다음 본선 칸 · 준결승이면 3·4위전)이 아직 시작 전일 때만.
 *    바꾸면 다음 판의 그 자리는 굴림(cupSettle)이 새 사람으로 다시 앉힌다 — 여기서는 그 자리의 '들어옴'과 기한만 새로 한다
 *  - 끝난 대회는 건드리지 않는다(메달이 이미 장식장에 놓였다 — 한 번 준 것은 고치지 않는다)
 */
import { cupNext, cupRounds, type CupGame, type CupOutcome } from "./simCup.js";

export const CUP_OUTCOME_LABEL: Readonly<Record<CupOutcome, string>> = {
    played: "쳐서 가림", walkover: "기권승", seed: "시드로 가림", bye: "부전승", void: "둘 다 기권",
};

type G = Pick<CupGame, "kind" | "round" | "slot" | "p1Id" | "p2Id" | "outcome" | "matchId" | "winnerId">;

/** 이 판의 결과에 기대는 판 — 다음 본선 칸(앉을 쪽), 준결승이면 3·4위전(진 사람이 앉는 쪽) */
export function downstreamOf<T extends G>(g: T, games: readonly T[]): { game: T; side: "p1" | "p2"; takes: "winner" | "loser" }[] {
    if (g.kind !== "main") return [];
    const rounds = cupRounds(games as unknown as CupGame[]);
    const out: { game: T; side: "p1" | "p2"; takes: "winner" | "loser" }[] = [];
    const n = cupNext(g, rounds);
    if (n) { const next = games.find((x) => x.kind === "main" && x.round === n.round && x.slot === n.slot); if (next) out.push({ game: next, side: n.side, takes: "winner" }); }
    if (g.round === rounds - 1) { const third = games.find((x) => x.kind === "third"); if (third) out.push({ game: third, side: g.slot === 0 ? "p1" : "p2", takes: "loser" }); }
    return out;
}

/** 결과를 바꿀 수 있는가 */
export function canChangeResult<T extends G>(g: T, games: readonly T[], cupRunning: boolean): { ok: true } | { ok: false; why: string } {
    if (!cupRunning) return { ok: false, why: "끝난 대회는 바꾸지 않아요(메달이 이미 나갔어요)" };
    if (!g.outcome) return { ok: false, why: "아직 가려지지 않은 판이에요" };
    if (g.outcome === "bye") return { ok: false, why: "부전승은 바꿀 수 없어요" };
    if (!g.p1Id || !g.p2Id) return { ok: false, why: "두 사람이 앉은 판만 바꿀 수 있어요" };
    for (const d of downstreamOf(g, games)) if (d.game.outcome || d.game.matchId) return { ok: false, why: "다음 판이 이미 시작됐어요" };
    return { ok: true };
}

/** 결과를 정할 수 있는가(아직 안 가려진 판) */
export function canDecide(g: G, cupRunning: boolean): { ok: true } | { ok: false; why: string } {
    if (!cupRunning) return { ok: false, why: "치르는 중인 대회가 아니에요" };
    if (g.outcome) return { ok: false, why: "이미 가려진 판이에요" };
    if (!g.p1Id || !g.p2Id) return { ok: false, why: "두 사람이 다 앉아야 정할 수 있어요" };
    return { ok: true };
}

/** 운영자가 정한 결과의 이름 — 승자가 없으면 둘 다 기권, 진 쪽이 기권이면 기권승(메달 · 3·4위전 자격이 없다), 아니면 시드로 가린 것과 같다 */
export const adminOutcome = (winnerId: string | null, loserForfeit: boolean): CupOutcome => (winnerId === null ? "void" : loserForfeit ? "walkover" : "seed");

/** 운영 기록 한 줄(hiq_sim_cup_games.admin_note 배열) */
export interface AdminCupNote { at: string; by: string; action: "extend" | "decide" | "change"; reason: string; text: string }

export interface AdminCupPerson { id: string; name: string; seed: number | null; rating: number | null }
export interface AdminCupGameView {
    id: string | null;
    kind: "main" | "third"; round: number; slot: number;
    p1: AdminCupPerson | null; p2: AdminCupPerson | null;
    deadlineAt: string; p1Ready: boolean; p2Ready: boolean;
    winnerId: string | null; outcome: CupOutcome | null; decidedAt: string | null;
    match: { id: string; status: string; score: [number, number] | null; endReason: string | null } | null;
    notes: AdminCupNote[];
    change: { ok: boolean; why?: string };
    decide: { ok: boolean; why?: string };
}
export interface AdminCupSummary { id: string; month: string; gameType: string; status: string; size: number; startsAt: string; finishedAt: string | null; games: number; decided: number }
export interface AdminCupDetail {
    cup: AdminCupSummary; rounds: number;
    entries: { memberId: string; name: string; seed: number; rating: number; matches: number; points: number; place: number | null; medal: number | null; forfeit: boolean }[];
    games: AdminCupGameView[];
}
/** 다음 대회 — 이번 달 성적이 이대로면 */
export interface AdminCupNext { month: string; gameType: string; startsAt: string; size: number; entrants: { memberId: string; name: string; seed: number; rating: number; matches: number; points: number }[]; games: AdminCupGameView[] }
export interface AdminCups { cups: AdminCupSummary[]; next: AdminCupNext[]; rules: { minRating: number; minMatches: number; maxEntrants: number; roundDays: number } }
