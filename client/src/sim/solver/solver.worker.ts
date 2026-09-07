/**
 * 해법 찾기 모듈 워커. 페이지는 useSolver 가 `new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" })` 로 띄운다.
 *  - 'solve' 를 받으면 runSearchCooperatively 로 배치 사이에 setTimeout(0) 양보를 하며 돈다 — 그 사이 'cancel' 이 처리된다.
 *  - 진행은 약 200 ms 마다 {tried, found, phase}, 끝나면 SolveResult(취소면 aborted: true 부분 결과).
 *  - 새 'solve' 가 오면 돌던 요청은 취소된다(그 요청의 부분 결과도 자기 id 로 보낸다 — 훅이 id 로 거른다).
 * tsconfig 가 lib dom 이라 webworker lib 를 참조하지 않고(중복 선언 충돌) self 를 좁은 타입으로 본다.
 */
import { DEFAULT_BUDGET_MS, type SolverInMessage, type SolverOutMessage } from "./protocol";
import { runSearchCooperatively } from "./runner";
import type { SolveRequest } from "./search";

interface WorkerScope {
    postMessage(message: SolverOutMessage): void;
    onmessage: ((ev: MessageEvent<SolverInMessage>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let active: { readonly id: number; cancelled: boolean } | null = null;

function post(msg: SolverOutMessage): void {
    scope.postMessage(msg);
}

async function run(id: number, req: SolveRequest): Promise<void> {
    if (active) active.cancelled = true;
    const me = { id, cancelled: false };
    active = me;
    try {
        const result = await runSearchCooperatively(
            { ...req, budgetMs: req.budgetMs ?? DEFAULT_BUDGET_MS },
            {
                now: () => performance.now(),
                isCancelled: () => me.cancelled,
                onProgress: (p) => post({ type: "progress", id, tried: p.tried, found: p.found, phase: p.phase }),
            },
        );
        post({ type: "result", id, result });
    } catch (e) {
        post({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
    } finally {
        if (active === me) active = null;
    }
}

scope.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "cancel") {
        if (active && active.id === msg.id) active.cancelled = true;
        return;
    }
    if (msg.type === "solve") void run(msg.id, msg.req);
};
