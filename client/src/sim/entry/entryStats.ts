/**
 * 진입 화면(싱글 / 친구와 대전) 카드에 붙는 기록 한 줄 — 순수 함수, 테스트 동반.
 * 실전 전적(RP·에버리지)이 아니라 시뮬레이터 테이블(hiq_sim_*)의 값만 다룬다.
 */
export interface EntryMatchRow {
    readonly status: "waiting" | "playing" | "finished" | "canceled";
    readonly myIndex: number;
    readonly turn: number;
    readonly winnerIndex: number | null;
}

export interface MatchRecord {
    readonly wins: number;
    readonly losses: number;
    /** 진행 중이고 내 차례인 대전 수 */
    readonly myTurn: number;
    /** 진행 중(대기 포함) 대전 수 */
    readonly active: number;
}

/** 끝난 대전만 승·패로 센다(승자 없음 = 무효). 진행 중은 active, 그중 내 차례는 myTurn. */
export function matchRecord(rows: readonly EntryMatchRow[]): MatchRecord {
    let wins = 0, losses = 0, myTurn = 0, active = 0;
    for (const m of rows) {
        if (m.status === "finished") {
            if (m.winnerIndex === null) continue;
            if (m.winnerIndex === m.myIndex) wins++; else losses++;
        } else if (m.status === "playing" || m.status === "waiting") {
            active++;
            if (m.status === "playing" && m.turn === m.myIndex) myTurn++;
        }
    }
    return { wins, losses, myTurn, active };
}

export interface EntryRating {
    readonly sessions: number;
    readonly bestAvg: number;
}

/** 연습 요약: 세션 합과 최고 에버리지. 세션이 없으면 null(카드는 "아직 기록이 없어요"). */
export function practiceSummary(ratings: readonly EntryRating[]): { readonly sessions: number; readonly bestAvg: number } | null {
    let sessions = 0, bestAvg = 0;
    for (const r of ratings) {
        sessions += r.sessions;
        if (r.bestAvg > bestAvg) bestAvg = r.bestAvg;
    }
    return sessions > 0 ? { sessions, bestAvg } : null;
}

/** 에버리지 표기: 소수 둘째 자리 고정("0.62"). */
export function formatAvg(avg: number): string {
    return (Number.isFinite(avg) ? avg : 0).toFixed(2);
}

export type EntryChoice = "single" | "multi" | "rooms";
export const ENTRY_LAST_KEY = "rankue.sim.entry";
const ENTRY_DEFAULT: readonly EntryChoice[] = ["single", "multi", "rooms"];

/** 마지막에 고른 카드가 위, 나머지는 기본 순서(싱글 · 친구와 대전 · 멀티방). 저장값이 없거나 이상하면 기본 순서. */
export function entryOrder(last: string | null | undefined): readonly EntryChoice[] {
    const pick = ENTRY_DEFAULT.find((k) => k === last);
    return pick ? [pick, ...ENTRY_DEFAULT.filter((k) => k !== pick)] : ENTRY_DEFAULT;
}
