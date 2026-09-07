/**
 * 워커 ↔ 페이지 메시지 규약. 워커(solver.worker.ts)와 훅(useSolver.ts)이 같은 타입을 import 한다.
 * 모든 메시지는 요청 id 를 실어 늦게 도착한 옛 요청의 응답을 훅이 버릴 수 있게 한다.
 */
import type { SearchPhase, SolveRequest, SolveResult } from "./search";

/** 페이지 → 워커 */
export type SolverInMessage =
    | { readonly type: "solve"; readonly id: number; readonly req: SolveRequest }
    | { readonly type: "cancel"; readonly id: number };

/** 워커 → 페이지 */
export type SolverOutMessage =
    | { readonly type: "progress"; readonly id: number; readonly tried: number; readonly found: number; readonly phase: SearchPhase }
    | { readonly type: "result"; readonly id: number; readonly result: SolveResult }
    | { readonly type: "error"; readonly id: number; readonly message: string };

/** 기본 벽시계 예산(ms). 워커는 요청에 budgetMs 가 없으면 이 값을 쓴다. */
export const DEFAULT_BUDGET_MS = 1500;
/** 진행 알림 간격(ms). */
export const PROGRESS_INTERVAL_MS = 200;
/** 워커의 한 배치(양보 없이 연속으로 도는 시뮬레이션 수). 샷당 0.03–0.1 ms → 배치당 수 ms~20 ms. */
export const WORKER_BATCH = 200;
/** 메인 스레드 폴백의 배치 — 프레임을 오래 막지 않게 작게. */
export const MAIN_THREAD_BATCH = 60;

export function isSolverOutMessage(x: unknown): x is SolverOutMessage {
    if (!x || typeof x !== "object") return false;
    const m = x as { type?: unknown; id?: unknown };
    if (typeof m.id !== "number") return false;
    return m.type === "progress" || m.type === "result" || m.type === "error";
}
