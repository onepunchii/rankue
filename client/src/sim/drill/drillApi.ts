/**
 * 드릴 래더 API 클라이언트(server/routes/modules/simDrill.ts 계약). 순수 매퍼는 테스트, 네트워크는 apiRequest.
 */
import { apiRequest } from "@/lib/queryClient";
import type { BallState, ShotInput, SimEvent } from "@shared/sim/types";
import type { ShotOutcome } from "@shared/sim/rules";
import type { DrillPattern } from "@shared/sim/drills";

export const DRILL_API_BASE = "/api/hiq/sim/drills";

export interface DrillAttemptRow {
    id: string;
    weekId: string;
    drillId: string;
    success: boolean;
    cushions: number;
    outcomeCode: string;
    createdAt: string;
}

export interface WeekDrill {
    id: string;
    pattern: DrillPattern;
    nameKey: string;
    hintKey: string;
    balls: BallState[];
    attempt: DrillAttemptRow | null;
}

export interface DrillWeek {
    weekId: string;
    tableId: "DAEDAE" | "JUNGDAE_KR";
    drills: WeekDrill[];
}

export interface DrillLadderRow {
    memberId: string;
    name: string;
    successes: number;
    attempts: number;
    cushions: number;
    lastAt: string;
}

export interface DrillAttemptResponse {
    attempt: DrillAttemptRow;
    mismatch: boolean;
    hash: string;
    events: SimEvent[];
    final: BallState[];
    duration: number;
    outcome: ShotOutcome;
}

export type Request = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export function weekUrl(weekId?: string): string {
    return weekId ? `${DRILL_API_BASE}/week?weekId=${encodeURIComponent(weekId)}` : `${DRILL_API_BASE}/week`;
}
export function ladderUrl(weekId?: string): string {
    return weekId ? `${DRILL_API_BASE}/ladder?weekId=${encodeURIComponent(weekId)}` : `${DRILL_API_BASE}/ladder`;
}
export function attemptUrl(drillId: string): string {
    return `${DRILL_API_BASE}/${encodeURIComponent(drillId)}/attempt`;
}

/** 이번 주 진행 요약: 시도한 문제 수·성공 수·남은 문제 수 */
export function weekProgress(week: Pick<DrillWeek, "drills">): { attempted: number; successes: number; remaining: number; total: number } {
    let attempted = 0, successes = 0;
    for (const d of week.drills) {
        if (d.attempt) { attempted++; if (d.attempt.success) successes++; }
    }
    return { attempted, successes, remaining: week.drills.length - attempted, total: week.drills.length };
}

export interface DrillApi {
    getWeek(weekId?: string): Promise<DrillWeek>;
    getLadder(weekId?: string): Promise<{ weekId: string; rows: DrillLadderRow[] }>;
    attempt(drillId: string, input: ShotInput, clientHash?: string): Promise<DrillAttemptResponse>;
}

export function createDrillApi(request: Request): DrillApi {
    return {
        async getWeek(weekId) { return (await request(weekUrl(weekId))) as DrillWeek; },
        async getLadder(weekId) { return (await request(ladderUrl(weekId))) as { weekId: string; rows: DrillLadderRow[] }; },
        async attempt(drillId, input, clientHash) {
            return (await request(attemptUrl(drillId), { method: "POST", body: { input, clientHash } })) as DrillAttemptResponse;
        },
    };
}

export const drillApi: DrillApi = createDrillApi((url, options) => apiRequest(url, options));
