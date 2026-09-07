/**
 * useSimulator 훅 바인딩 테스트(jsdom 직접 기동, SimSetupDialog.test 와 같은 방식). 컨트롤러·엔진은 진짜를 쓰고
 * 서버 API 만 가짜를 주입한다. 검증: 초기값 · startMatch → 대전 뷰(이름·차례·큐볼·claim) · actions 참조 안정 · exit → setup.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES } from "@shared/sim/params";
import { createSession, DEFAULT_3C_RULES } from "@shared/sim/rules";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import type { MatchApi, MatchPublic } from "./matchApi";
import type { Simulator } from "./useSimulator";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type HookMod = typeof import("./useSimulator");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let useSimulator: HookMod["useSimulator"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "getComputedStyle",
        "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    ({ createRoot } = await import("react-dom/client"));
    ({ useSimulator } = await import("./useSimulator"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const balls = openingLayout("3c", TABLES.DAEDAE, "white");
const state = createSession({
    rules: DEFAULT_3C_RULES,
    players: [{ id: "host", target: 20, cueBallId: "white" }, { id: "guest", target: 15, cueBallId: "yellow" }],
});
function match(over: Partial<MatchPublic> = {}): MatchPublic {
    return {
        id: "m-1", code: "123456", status: "playing",
        gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: "호스트", guestName: "게스트", hostTarget: 20, guestTarget: 15,
        myIndex: 1, turn: 0, shots: 0, version: 1, state, balls,
        winnerIndex: null, endReason: null, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
        createdAt: "2026-09-07T00:00:00.000Z", startedAt: "2026-09-07T00:00:00.000Z", lastShotAt: null, finishedAt: null,
        claimableAt: "2000-01-01T00:00:00.000Z",     // 이미 지났다 → 상대 차례면 claim 가능
        ...over,
    };
}

const matchApi: MatchApi = {
    createMatch: vi.fn(), listMatches: vi.fn(), lookupCode: vi.fn(), joinMatch: vi.fn(),
    getMatch: vi.fn(async () => match()), getShots: vi.fn(async () => []), postShot: vi.fn(), resign: vi.fn(), claim: vi.fn(),
};

interface Harness { latest: () => Simulator; renders: () => number; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

function mount(): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: Simulator | null = null;
    let renders = 0;
    function Host() {
        renders++;
        latest = useSimulator({ api: { createSession: vi.fn(), postShot: vi.fn(), closeSession: vi.fn() }, matchApi, haptics: false });
        return null;
    }
    React.act(() => { root.render(React.createElement(Host)); });
    const h: Harness = {
        latest: () => latest!,
        renders: () => renders,
        unmount: () => { React.act(() => root.unmount()); container.remove(); },
    };
    live.push(h);
    return h;
}

describe("useSimulator", () => {
    it("초기: setup · solo · match null · actions 에 대전 액션이 있다", () => {
        const h = mount();
        const sim = h.latest();
        expect(sim.phase).toBe("setup");
        expect(sim.mode).toBe("solo");
        expect(sim.match).toBeNull();
        expect(sim.replaying).toBe(false);
        expect(typeof sim.actions.startMatch).toBe("function");
        expect(typeof sim.actions.resign).toBe("function");
        expect(typeof sim.actions.claim).toBe("function");
        expect(typeof sim.actions.sync).toBe("function");
    });
    it("startMatch(게스트, 상대 차례) → waiting, 대전 뷰: 이름 순서·내 큐볼·차례·claim 가능·기권 가능", () => {
        const h = mount();
        const actions = h.latest().actions;
        let ok = false;
        React.act(() => { ok = actions.startMatch(match()); });
        expect(ok).toBe(true);
        const sim = h.latest();
        expect(sim.phase).toBe("waiting");
        expect(sim.mode).toBe("match");
        expect(sim.record).toBe(true);
        expect(sim.canUndo).toBe(false);
        expect(sim.canPlace).toBe(false);
        expect(sim.config!.target).toBe(15);
        expect(sim.params!.table).toBe(TABLES.DAEDAE);
        expect(sim.cueBallId).toBe("white");                 // 지금 차례(상대)의 큐볼
        const mv = sim.match!;
        expect(mv.id).toBe("m-1");
        expect(mv.myIndex).toBe(1);
        expect(mv.myCueBallId).toBe("yellow");
        expect(mv.names).toEqual(["호스트", "게스트"]);
        expect(mv.myName).toBe("게스트");
        expect(mv.opponentName).toBe("호스트");
        expect(mv.isMyTurn).toBe(false);
        expect(mv.canClaim).toBe(true);
        expect(mv.canResign).toBe(true);
        expect(mv.opponentShot).toBe(false);
        expect(sim.actions).toBe(actions);                    // 참조 안정
    });
    it("startMatch(호스트, 내 차례) → aim, claim 불가; 참가 전 행은 거부", () => {
        const h = mount();
        let ok = true;
        React.act(() => { ok = h.latest().actions.startMatch(match({ state: null, balls: null, status: "waiting" })); });
        expect(ok).toBe(false);
        expect(h.latest().phase).toBe("setup");
        React.act(() => { ok = h.latest().actions.startMatch(match({ myIndex: 0 })); });
        expect(ok).toBe(true);
        const sim = h.latest();
        expect(sim.phase).toBe("aim");
        expect(sim.match!.isMyTurn).toBe(true);
        expect(sim.match!.canClaim).toBe(false);
        expect(sim.match!.names).toEqual(["호스트", "게스트"]);
        expect(sim.match!.myName).toBe("호스트");
    });
    it("끝난 대전(기권) → finished + 세션 승자 + endReason; exit → setup", async () => {
        const h = mount();
        React.act(() => { h.latest().actions.startMatch(match({ status: "finished", winnerIndex: 1, endReason: "resign", claimableAt: null })); });
        const sim = h.latest();
        expect(sim.phase).toBe("finished");
        expect(sim.session!.winnerIndex).toBe(1);
        expect(sim.match!.endReason).toBe("resign");
        expect(sim.match!.canResign).toBe(false);
        expect(sim.match!.canClaim).toBe(false);
        await React.act(async () => { await h.latest().actions.exit(); });
        expect(h.latest().phase).toBe("setup");
        expect(h.latest().match).toBeNull();
        expect(h.latest().mode).toBe("solo");
    });
});
