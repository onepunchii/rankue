/**
 * 협조적 실행기 — 탐색을 배치로 나눠 돌리고 배치 사이에 양보(yield)한다. 워커와 메인 스레드 폴백이 같은 코드를 쓴다.
 *  - 양보는 주입(yieldFn, 기본 setTimeout 0)한다. 워커에선 양보 사이에 'cancel' 메시지가 처리되고, 메인 스레드에선 프레임이 돈다.
 *  - 진행 알림은 progressIntervalMs 마다(첫 배치 뒤엔 반드시 한 번).
 *  - isCancelled 가 true 가 되면 멈추고 부분 결과(aborted: true)를 돌려준다.
 * DOM 없음 — 테스트는 가짜 시계·가짜 양보로 돌린다.
 */
import { createShotSearch, type SolveProgress, type SolveRequest, type SolveResult } from "./search";
import { PROGRESS_INTERVAL_MS, WORKER_BATCH } from "./protocol";

export interface CooperativeOptions {
    readonly now?: () => number;
    /** 배치 사이 양보. 기본 setTimeout(0). */
    readonly yieldFn?: () => Promise<void>;
    readonly isCancelled?: () => boolean;
    readonly onProgress?: (p: SolveProgress) => void;
    /** 배치당 시뮬레이션 수. 기본 WORKER_BATCH. */
    readonly batch?: number;
    readonly progressIntervalMs?: number;
}

export function macrotaskYield(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runSearchCooperatively(req: SolveRequest, opts: CooperativeOptions = {}): Promise<SolveResult> {
    const now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const yieldFn = opts.yieldFn ?? macrotaskYield;
    const isCancelled = opts.isCancelled ?? (() => false);
    const batch = Math.max(1, opts.batch ?? WORKER_BATCH);
    const interval = opts.progressIntervalMs ?? PROGRESS_INTERVAL_MS;

    const search = createShotSearch(req, { now });
    let lastReport = -Infinity;
    for (;;) {
        const done = search.step(batch);
        const t = now();
        if (opts.onProgress && (t - lastReport >= interval || done)) {
            lastReport = t;
            opts.onProgress(search.progress());
        }
        if (done) return search.result();
        if (isCancelled()) return search.result({ aborted: true });
        await yieldFn();
        if (isCancelled()) return search.result({ aborted: true });
    }
}
