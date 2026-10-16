/**
 * 온라인 대전의 다시 볼 것(2026-10-16 어드민 › 당구 › 온라인 대전). 판정이 아니라 사람이 다시 볼 판을 고르는 체 — 순수 함수.
 *
 * 온라인 판은 샷마다 서버가 다시 계산해 그 결과만 남긴다(점수 · 하이런을 꾸밀 수 없다). 그래서 실전처럼 '한 이닝 고득점'은 보지 않고,
 * 레이팅을 옮기는 길만 본다(운영 기록 실측 10/16 — 끝난 판 257, 앱/서버 계산 어긋남 0, 시간 초과로 끝난 레이팅 판 셋 중 둘이 3번 미만):
 *  - 앱과 서버의 샷 계산이 어긋났다(mismatches — 앱을 고쳐 보냈을 수 있다)
 *  - 레이팅 판인데 진 사람이 세 번도 안 치고 시간 초과 · 무응답으로 끝났다(두 계정으로 점수를 넘기는 길)
 *  - 같은 두 사람이 같은 날 레이팅 판을 네 판 넘게(24시간 안 판은 줄여 반영하지만 다시 본다)
 */
import { AT_FAULT_END_REASONS, MIN_SHOTS_EACH, ratingEligibility } from "./sim/rating.js";

export type OnlineFlagId = "mismatch" | "quickEnd" | "samePair";
export interface OnlineFlag { id: OnlineFlagId; text: string }

export const ONLINE_FLAG_RULES = { samePairPerDay: 4 } as const;

export const END_REASON_LABEL: Readonly<Record<string, string>> = {
    target: "목표 도달", inningCap: "이닝 제한", resign: "기권", claim: "무응답 승리", timeout: "시간 초과 실격",
    stale: "오래 멈춤", cup: "월대회 정리", void: "운영자 무효",
};
export const endReasonLabel = (r: string | null | undefined) => (r ? END_REASON_LABEL[r] ?? r : "끝남");

export interface OnlineFlagInput {
    handicap: boolean;
    hasGuest: boolean;
    /** [방장 샷 수, 게스트 샷 수] */
    shots: readonly [number, number];
    endReason: string | null;
    /** 0 = 방장 승, 1 = 게스트 승, null = 무승부 */
    winner: 0 | 1 | null;
    mismatches: number;
}

/** 레이팅에 반영되는 판인가(shared/sim/rating 과 같은 규칙) */
export const isRatedMatch = (m: OnlineFlagInput) => ratingEligibility(m).rated;

export function onlineFlags(m: OnlineFlagInput, samePairCount = 0): OnlineFlag[] {
    const out: OnlineFlag[] = [];
    const rated = isRatedMatch(m);
    if (m.mismatches > 0) out.push({ id: "mismatch", text: `앱과 서버의 샷 계산이 ${m.mismatches}번 달랐어요` });
    if (rated && m.endReason && AT_FAULT_END_REASONS.includes(m.endReason) && (m.winner === 0 || m.winner === 1)) {
        const loser = m.shots[m.winner === 0 ? 1 : 0];
        if (loser < MIN_SHOTS_EACH) out.push({ id: "quickEnd", text: `진 사람이 ${loser}번 치고 ${endReasonLabel(m.endReason)} — 레이팅이 넘어갔어요` });
    }
    if (rated && samePairCount > ONLINE_FLAG_RULES.samePairPerDay) out.push({ id: "samePair", text: `같은 두 사람이 이날 레이팅 판 ${samePairCount}판` });
    return out;
}

/** GET /admin/billiards/online 의 한 줄 */
export interface AdminOnlineRow {
    id: string;
    endedAt: string;
    gameType: "3c" | "4c";
    /** 핸디전(레이팅 방) */
    handicap: boolean;
    /** 레이팅에 반영된(될) 판 */
    rated: boolean;
    /** 리얼리티 모드(조준 보정 끔) */
    reality: boolean;
    endReason: string | null;
    /** 레이팅 변화(방장 기준) — 10/12 이후 판만 */
    delta: number | null;
    mismatches: number;
    cup: boolean;
    players: { id: string; name: string; score: number; target: number; innings: number; highRun: number; shots: number; winner: boolean }[];
    flags: OnlineFlag[];
    voided: { at: string; reason: string; by: string } | null;
}

/** GET /admin/billiards/online/:id */
export interface AdminOnlineDetail {
    shots: { idx: number; player: 0 | 1; inning: number | null; points: number; cushions: number; mismatch: boolean; at: string }[];
    chats: number;
}

/** 무효 미리보기 · 무효/되살리기 결과 — 레이팅이 바뀌는 사람 */
export interface AdminRatingChange { memberId: string; name: string; gameType: string; before: number | null; after: number | null; matchesBefore: number; matchesAfter: number }

/** GET /admin/billiards/online/ratings 의 한 줄 */
export interface AdminRatingRow { memberId: string; name: string; gameType: "3c" | "4c"; rating: number; matches: number; wins: number; updatedAt: string }
