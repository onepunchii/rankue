/**
 * 싱글(기록) 경기 이어서 치기(2026-09-26 검토).
 * 앱이 꺼지거나(메모리 회수·강제 종료) 새로고침하면 진행 중이던 기록 경기가 사라졌다 — 서버는 playing 세션을 6시간 보관하는데
 * (sim.repo cleanupStale) 다시 여는 길이 없었다. 서버 세션을 열 때 이 기기에 {세션 id, 설정}을 적어 두고, 입구 화면이
 * 서버에서 그 세션(state·balls·shots)을 받아 같은 자리부터 잇는다.
 *  - 정상적으로 나가면(exit·다른 경기 시작) 지운다. 6시간이 지났으면 버린다(서버가 이미 정리했다).
 *  - 서버에서 이미 끝난 판(마지막 샷까지 기록)이면 이을 게 없으므로 완료로 닫고 지운다.
 */
import { apiRequest } from "@/lib/queryClient";
import type { BallState } from "@shared/sim/types";
import type { SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";

const KEY = "rankue.sim.resume.v1";
/** 서버가 playing 세션을 정리하는 시간(sim.repo cleanupStale 6시간)보다 조금 짧게 */
export const RESUME_MAX_AGE_MS = 5.5 * 60 * 60 * 1000;

export interface ResumeRecord {
    readonly id: string;
    readonly config: SimSetupConfig;
    readonly at: number;
}

function storage(): Storage | null {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function saveResume(rec: ResumeRecord): void {
    try { storage()?.setItem(KEY, JSON.stringify(rec)); } catch { /* 저장 불가 */ }
}

export function clearResume(): void {
    try { storage()?.removeItem(KEY); } catch { /* 무시 */ }
}

export function loadResume(now = Date.now()): ResumeRecord | null {
    try {
        const raw = storage()?.getItem(KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as Partial<ResumeRecord>;
        if (!v || typeof v.id !== "string" || typeof v.at !== "number" || !v.config || typeof v.config !== "object") { clearResume(); return null; }
        if (now - v.at > RESUME_MAX_AGE_MS) { clearResume(); return null; }
        return v as ResumeRecord;
    } catch {
        clearResume();
        return null;
    }
}

export interface Resumable {
    readonly id: string;
    readonly config: SimSetupConfig;
    readonly session: SessionState;
    readonly balls: readonly BallState[];
    readonly shotIdx: number;
}

/**
 * 서버에서 세션을 받아 이을 수 있는지 본다. 이을 수 없으면 null(기록도 지운다).
 * 이미 끝난 판이면 완료로 닫는다 — 마지막 샷까지 서버에 있으니 기록은 온전하다.
 */
export async function fetchResumable(rec: ResumeRecord): Promise<Resumable | null> {
    try {
        const r = await apiRequest(`/api/hiq/sim/sessions/${encodeURIComponent(rec.id)}`) as { session?: { status?: string; state?: SessionState; balls?: BallState[]; shots?: number } };
        const row = r?.session;
        if (!row || row.status !== "playing" || !row.state || !Array.isArray(row.balls)) { clearResume(); return null; }
        if (row.state.status === "finished") {
            clearResume();
            await apiRequest(`/api/hiq/sim/sessions/${encodeURIComponent(rec.id)}/close`, { method: "POST", body: { status: "finished" } }).catch(() => undefined);
            return null;
        }
        return { id: rec.id, config: rec.config, session: row.state, balls: row.balls, shotIdx: Number(row.shots ?? 0) };
    } catch (e) {
        // 없는 세션(404 — 다른 계정·이미 정리)은 지운다. 네트워크 실패는 남겨 둔다(다음에 입구를 열 때 다시 본다).
        if ((e as { status?: number } | null)?.status === 404) clearResume();
        return null;
    }
}
