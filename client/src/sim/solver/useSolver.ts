/**
 * useSolver — 해법 찾기 React 훅. 워커를 게으르게 만들고(첫 solve), 언마운트에 terminate 한다.
 * Worker 가 없으면(SSR·테스트·구형 웹뷰) 메인 스레드에서 같은 탐색을 작은 배치로 돌린다(배치 사이 setTimeout 0).
 * 워커가 스크립트 로드 실패 등으로 error 를 내면 진행 중 요청은 메인 스레드 폴백으로 넘어가고 이후 요청도 폴백을 쓴다.
 *
 *   const solver = useSolver();
 *   const r = await solver.solve({ balls, cueBallId, gameType, rules, params, seed: 1 });   // budgetMs 기본 1500
 *   solver.cancel();     // 돌던 요청을 멈춘다 → 그 solve 의 프로미스는 부분 결과(aborted: true)로 resolve
 *
 * solve 를 다시 부르면 앞 요청은 취소되고(프로미스는 부분 결과로 끝난다) status·progress·result 는 새 요청을 따른다.
 * 프로미스는 reject 되지 않는다 — 탐색 오류만 reject(status "error").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BUDGET_MS, isSolverOutMessage, MAIN_THREAD_BATCH, type SolverInMessage } from "./protocol";
import { runSearchCooperatively } from "./runner";
import type { SolveProgress, SolveRequest, SolveResult } from "./search";

export type SolverStatus = "idle" | "running" | "done" | "error";

export interface UseSolverOptions {
    /** 기본 예산(ms). 요청의 budgetMs 가 우선. 기본 DEFAULT_BUDGET_MS. */
    readonly budgetMs?: number;
    /** 워커 생성기(테스트·주입용). null 을 돌려주면 메인 스레드 폴백. 기본: Worker 가 있으면 모듈 워커. */
    readonly createWorker?: () => Worker | null;
}

export interface Solver {
    readonly solve: (req: SolveRequest) => Promise<SolveResult>;
    readonly cancel: () => void;
    readonly status: SolverStatus;
    readonly progress: SolveProgress | null;
    readonly result: SolveResult | null;
    readonly error: string | null;
    /** 마지막 요청이 워커에서 도는가(false = 메인 스레드 폴백). 표시·디버그용. */
    readonly usedWorker: boolean;
}

interface Pending {
    readonly id: number;
    readonly req: SolveRequest;
    readonly resolve: (r: SolveResult) => void;
    readonly reject: (e: Error) => void;
    cancelled: boolean;
    worker: boolean;
}

/** 워커가 죽어(언마운트) 결과를 받을 수 없을 때 프로미스를 끝내는 빈 결과. */
const ABORTED_EMPTY: SolveResult = { candidates: [], tried: 0, found: 0, elapsedMs: 0, aborted: true, exhausted: false };

export function defaultCreateWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
        return new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    } catch {
        return null;
    }
}

export function useSolver(options: UseSolverOptions = {}): Solver {
    const [status, setStatus] = useState<SolverStatus>("idle");
    const [progress, setProgress] = useState<SolveProgress | null>(null);
    const [result, setResult] = useState<SolveResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [usedWorker, setUsedWorker] = useState(false);

    const workerRef = useRef<Worker | null>(null);
    const workerBrokenRef = useRef(false);
    /** 진행 중(취소돼서 결과를 기다리는 것 포함) 요청. */
    const flightRef = useRef(new Map<number, Pending>());
    /** 화면 상태가 따르는 요청 id. */
    const currentIdRef = useRef<number | null>(null);
    const nextIdRef = useRef(1);
    const mountedRef = useRef(true);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const settle = useCallback((p: Pending, r: SolveResult | null, message?: string) => {
        flightRef.current.delete(p.id);
        const isCurrent = currentIdRef.current === p.id;
        if (isCurrent) currentIdRef.current = null;
        if (isCurrent && mountedRef.current) {
            if (r) {
                setResult(r);
                setProgress({ tried: r.tried, found: r.found, phase: "done" });
                setStatus("done");
            } else {
                setError(message ?? "solver error");
                setStatus("error");
            }
        }
        if (r) p.resolve(r);
        else p.reject(new Error(message ?? "solver error"));
    }, []);

    /** 메인 스레드 폴백: 같은 탐색을 작은 배치로, 배치 사이 setTimeout 0. */
    const runFallback = useCallback((p: Pending) => {
        p.worker = false;
        if (mountedRef.current && currentIdRef.current === p.id) setUsedWorker(false);
        runSearchCooperatively(p.req, {
            batch: MAIN_THREAD_BATCH,
            isCancelled: () => p.cancelled,
            onProgress: (pr) => { if (mountedRef.current && currentIdRef.current === p.id) setProgress(pr); },
        }).then((r) => settle(p, r), (e: unknown) => settle(p, null, e instanceof Error ? e.message : String(e)));
    }, [settle]);

    const ensureWorker = useCallback((): Worker | null => {
        if (workerBrokenRef.current) return null;
        if (workerRef.current) return workerRef.current;
        const create = optionsRef.current.createWorker ?? defaultCreateWorker;
        const w = create();
        if (!w) { workerBrokenRef.current = true; return null; }
        w.onmessage = (ev: MessageEvent<unknown>) => {
            const msg = ev.data;
            if (!isSolverOutMessage(msg)) return;
            const p = flightRef.current.get(msg.id);
            if (!p) return; // 이미 끝난 요청
            if (msg.type === "progress") {
                if (mountedRef.current && currentIdRef.current === p.id) setProgress({ tried: msg.tried, found: msg.found, phase: msg.phase });
            } else if (msg.type === "result") {
                settle(p, msg.result);
            } else {
                settle(p, null, msg.message);
            }
        };
        w.onerror = () => {
            // 워커 스크립트 실패(로드·런타임): 진행 중 요청은 폴백으로, 워커는 버린다
            workerBrokenRef.current = true;
            w.terminate();
            if (workerRef.current === w) workerRef.current = null;
            for (const p of flightRef.current.values()) if (p.worker) runFallback(p);
        };
        workerRef.current = w;
        return w;
    }, [settle, runFallback]);

    const cancel = useCallback(() => {
        const id = currentIdRef.current;
        const p = id === null ? undefined : flightRef.current.get(id);
        if (!p || p.cancelled) return;
        p.cancelled = true;
        if (p.worker) {
            const msg: SolverInMessage = { type: "cancel", id: p.id };
            workerRef.current?.postMessage(msg);
        }
    }, []);

    const solve = useCallback((reqIn: SolveRequest): Promise<SolveResult> => {
        cancel(); // 앞 요청이 있으면 취소(부분 결과로 끝난다)
        const req: SolveRequest = { ...reqIn, budgetMs: reqIn.budgetMs ?? optionsRef.current.budgetMs ?? DEFAULT_BUDGET_MS };
        const id = nextIdRef.current++;
        return new Promise<SolveResult>((resolve, reject) => {
            const p: Pending = { id, req, resolve, reject, cancelled: false, worker: false };
            flightRef.current.set(id, p);
            currentIdRef.current = id;
            if (mountedRef.current) {
                setStatus("running");
                setProgress({ tried: 0, found: 0, phase: "seed" });
                setResult(null);
                setError(null);
            }
            const w = ensureWorker();
            if (!w) { runFallback(p); return; }
            p.worker = true;
            if (mountedRef.current) setUsedWorker(true);
            const msg: SolverInMessage = { type: "solve", id, req };
            try {
                w.postMessage(msg);
            } catch {
                // 구조적 복제 실패 등 — 이 요청부터 폴백
                workerBrokenRef.current = true;
                runFallback(p);
            }
        });
    }, [cancel, ensureWorker, runFallback]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            const w = workerRef.current;
            workerRef.current = null;
            w?.terminate();
            // 워커에 있던 요청은 결과가 올 수 없으니 빈 부분 결과로 끝내고, 폴백 요청은 취소 플래그로 스스로 끝난다
            for (const p of Array.from(flightRef.current.values())) {
                p.cancelled = true;
                if (p.worker) { flightRef.current.delete(p.id); p.resolve(ABORTED_EMPTY); }
            }
            currentIdRef.current = null;
        };
    }, []);

    return useMemo<Solver>(
        () => ({ solve, cancel, status, progress, result, error, usedWorker }),
        [solve, cancel, status, progress, result, error, usedWorker],
    );
}
