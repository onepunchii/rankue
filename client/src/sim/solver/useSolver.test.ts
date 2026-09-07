/**
 * useSolver 테스트 — jsdom 을 직접 띄워(다른 sim 컴포넌트 테스트와 같은 방식) 훅을 프로브 컴포넌트로 마운트한다.
 *  1. Worker 가 없는 환경(node/jsdom) → 메인 스레드 폴백이 배치로 돌아 결과를 준다(status idle → running → done).
 *  2. cancel() → 부분 결과(aborted) 로 끝난다.
 *  3. 가짜 워커(프로토콜 메시지를 그대로 흉내) → solve/cancel 메시지 왕복, id 로 옛 응답 거르기, 언마운트 terminate.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { DEFAULT_PARAMS } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { runSearchCooperatively } from "./runner";
import type { SolverInMessage, SolverOutMessage } from "./protocol";
import type { SolveRequest, SolveResult } from "./search";
import type { Solver, UseSolverOptions } from "./useSolver";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type HookMod = typeof import("./useSolver");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let useSolver: HookMod["useSolver"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "MessageEvent",
        "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    ({ createRoot } = await import("react-dom/client"));
    ({ useSolver } = await import("./useSolver"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness {
    latest: () => Solver;
    renders: number;
    unmount: () => void;
}
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

function mount(options?: UseSolverOptions): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: Solver | null = null;
    const h: Harness = {
        latest: () => latest!,
        renders: 0,
        unmount: () => { React.act(() => root.unmount()); container.remove(); },
    };
    function Probe() {
        const s = useSolver(options);
        latest = s;
        h.renders++;
        return React.createElement("div", { "data-status": s.status });
    }
    React.act(() => { root.render(React.createElement(Probe)); });
    live.push(h);
    return h;
}

function req(over: Partial<SolveRequest> = {}): SolveRequest {
    return {
        balls: openingLayout("3c", DEFAULT_PARAMS.table), cueBallId: "white", gameType: "3c",
        rules: DEFAULT_3C_RULES, params: DEFAULT_PARAMS, seed: 3, maxSimulations: 400, ...over,
    };
}

/** 워커 프로토콜을 그대로 흉내 내는 가짜 워커(같은 스레드, 같은 실행기). */
class FakeWorker {
    onmessage: ((ev: MessageEvent<SolverOutMessage>) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    readonly posted: SolverInMessage[] = [];
    terminated = false;
    private active: { id: number; cancelled: boolean } | null = null;

    postMessage(msg: SolverInMessage): void {
        this.posted.push(msg);
        if (msg.type === "cancel") {
            if (this.active && this.active.id === msg.id) this.active.cancelled = true;
            return;
        }
        if (this.active) this.active.cancelled = true;
        const me = { id: msg.id, cancelled: false };
        this.active = me;
        void runSearchCooperatively(msg.req, {
            batch: 50,
            isCancelled: () => me.cancelled,
            onProgress: (p) => this.emit({ type: "progress", id: msg.id, tried: p.tried, found: p.found, phase: p.phase }),
        }).then((result) => this.emit({ type: "result", id: msg.id, result }));
    }

    emit(m: SolverOutMessage): void {
        if (this.terminated) return;
        this.onmessage?.({ data: m } as MessageEvent<SolverOutMessage>);
    }

    terminate(): void { this.terminated = true; }
}

describe("useSolver — 메인 스레드 폴백", () => {
    it("Worker 가 없으면 폴백으로 돌아 결과를 주고 status 가 idle → running → done", async () => {
        expect(typeof Worker).toBe("undefined");
        const h = mount();
        expect(h.latest().status).toBe("idle");
        expect(h.latest().usedWorker).toBe(false);
        let result: SolveResult | null = null;
        let p: Promise<SolveResult> | null = null;
        // 동기 act: solve 가 건 상태 갱신(running)이 여기서 플러시된다
        React.act(() => { p = h.latest().solve(req()); });
        expect(h.latest().status).toBe("running");
        // 첫 배치는 solve() 안에서 동기로 돌아 진행이 이미 한 번 보고돼 있다
        expect(h.latest().progress?.phase).toBe("seed");
        expect(h.latest().progress?.tried).toBeGreaterThanOrEqual(0);
        await React.act(async () => { result = await p!; });
        expect(result!.aborted).toBe(false);
        expect(result!.candidates.length).toBeGreaterThanOrEqual(1);
        const s = h.latest();
        expect(s.status).toBe("done");
        expect(s.usedWorker).toBe(false);
        expect(s.result).toBe(result);
        expect(s.progress?.phase).toBe("done");
        expect(s.progress?.tried).toBe(result!.tried);
        expect(s.error).toBeNull();
    });

    it("cancel() 은 부분 결과(aborted)로 끝낸다", async () => {
        const h = mount();
        let result: SolveResult | null = null;
        await React.act(async () => {
            const p = h.latest().solve(req({ maxSimulations: 5000 }));
            // 첫 배치는 동기, 그 뒤 setTimeout 0 양보에서 취소가 보인다
            await new Promise((r) => setTimeout(r, 1));
            h.latest().cancel();
            result = await p;
        });
        expect(result!.aborted).toBe(true);
        expect(result!.tried).toBeLessThan(5000);
        expect(h.latest().status).toBe("done");
        expect(h.latest().result?.aborted).toBe(true);
    });

    it("solve 를 다시 부르면 앞 요청은 부분 결과로 끝나고 화면 상태는 새 요청을 따른다", async () => {
        const h = mount();
        let first: SolveResult | null = null;
        let second: SolveResult | null = null;
        await React.act(async () => {
            const p1 = h.latest().solve(req({ maxSimulations: 5000, seed: 1 }));
            const p2 = h.latest().solve(req({ maxSimulations: 300, seed: 2 }));
            [first, second] = await Promise.all([p1, p2]);
        });
        expect(first!.aborted).toBe(true);
        expect(second!.aborted).toBe(false);
        expect(h.latest().result).toBe(second);
        expect(h.latest().status).toBe("done");
    });

    it("언마운트 뒤에는 상태를 만지지 않고 프로미스는 끝난다", async () => {
        const h = mount();
        let p: Promise<SolveResult> | null = null;
        await React.act(async () => {
            p = h.latest().solve(req({ maxSimulations: 5000 }));
            await Promise.resolve();
        });
        live.pop()!.unmount();
        const r = await p!;
        expect(r.aborted).toBe(true);
    });
});

describe("useSolver — 워커 프로토콜", () => {
    it("solve/progress/result 메시지 왕복, cancel 메시지, 언마운트 terminate", async () => {
        const fake = new FakeWorker();
        const h = mount({ createWorker: () => fake as unknown as Worker, budgetMs: 999 });
        let result: SolveResult | null = null;
        await React.act(async () => {
            result = await h.latest().solve(req());
        });
        expect(fake.posted[0].type).toBe("solve");
        expect(fake.posted[0].type === "solve" && fake.posted[0].req.budgetMs).toBe(999);
        expect(result!.aborted).toBe(false);
        expect(h.latest().usedWorker).toBe(true);
        expect(h.latest().status).toBe("done");
        expect(h.latest().progress?.tried).toBe(result!.tried);

        // 취소: cancel 메시지가 같은 id 로 가고 부분 결과가 온다
        let partial: SolveResult | null = null;
        await React.act(async () => {
            const p = h.latest().solve(req({ maxSimulations: 5000 }));
            await new Promise((r) => setTimeout(r, 1));
            h.latest().cancel();
            partial = await p;
        });
        const cancelMsg = fake.posted.find((m) => m.type === "cancel");
        expect(cancelMsg).toBeTruthy();
        expect(cancelMsg!.id).toBe(fake.posted[1].id);
        expect(partial!.aborted).toBe(true);
        expect(h.latest().status).toBe("done");

        // 옛 요청의 늦은 응답은 화면 상태를 바꾸지 못한다
        const staleResult: SolveResult = { candidates: [], tried: 1, found: 0, elapsedMs: 0, aborted: false, exhausted: false };
        React.act(() => { fake.emit({ type: "result", id: fake.posted[0].id, result: staleResult }); });
        expect(h.latest().result).toBe(partial);

        live.pop()!.unmount();
        expect(fake.terminated).toBe(true);
    });

    it("워커 error 이벤트 → 진행 중 요청은 폴백으로 끝나고 이후 요청도 폴백", async () => {
        const broken = {
            onmessage: null, onerror: null as null | ((e: unknown) => void), terminated: false,
            postMessage() { /* 아무 응답도 하지 않는다(로드 실패 워커) */ },
            terminate() { this.terminated = true; },
        };
        const h = mount({ createWorker: () => broken as unknown as Worker });
        let result: SolveResult | null = null;
        await React.act(async () => {
            const p = h.latest().solve(req());
            await Promise.resolve();
            broken.onerror?.({ message: "boom" });
            result = await p;
        });
        expect(result!.aborted).toBe(false);
        expect(result!.candidates.length).toBeGreaterThanOrEqual(1);
        expect(broken.terminated).toBe(true);
        expect(h.latest().usedWorker).toBe(false);
        let again: SolveResult | null = null;
        await React.act(async () => { again = await h.latest().solve(req({ seed: 9 })); });
        expect(again!.aborted).toBe(false);
        expect(h.latest().usedWorker).toBe(false);
    });

    it("워커 error 메시지 → status error, 프로미스 reject", async () => {
        const fake = {
            onmessage: null as null | ((ev: MessageEvent<SolverOutMessage>) => void), onerror: null, terminated: false,
            postMessage(msg: SolverInMessage) {
                if (msg.type === "solve") setTimeout(() => this.onmessage?.({ data: { type: "error", id: msg.id, message: "bad" } } as MessageEvent<SolverOutMessage>), 0);
            },
            terminate() { this.terminated = true; },
        };
        const h = mount({ createWorker: () => fake as unknown as Worker });
        let err: Error | null = null;
        await React.act(async () => {
            try { await h.latest().solve(req()); } catch (e) { err = e as Error; }
        });
        expect(err?.message).toBe("bad");
        expect(h.latest().status).toBe("error");
        expect(h.latest().error).toBe("bad");
    });
});
