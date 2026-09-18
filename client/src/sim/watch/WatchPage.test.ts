/**
 * 관전 화면 회귀 테스트(jsdom — SimulatorPage.test 와 같은 방식).
 *
 * 왜 있나: 관전이 "멈춰 있다"는 제보가 세 번 났고(2026-09-13 주기, 09-15 렌더러 재마운트, 09-16 폴링 루프 자살)
 * 셋 다 순수 함수가 아니라 **effect 배선**에서 났다. watchPlan 단위 테스트로는 하나도 안 잡힌다.
 *
 * 여기서 보는 것: 진행 중 대전에서 새 샷이 생기면 getShots 로 받아 **실제로 재생까지 마치고**, 그 뒤 폴링이
 * 같은 샷을 다시 받아오지 않는다. 09-16 버그에서는 setMatch(m) 가 폴링 effect 를 다시 만들어 alive=false 로
 * 바꿔 버려 getShots 응답이 버려졌고, 매 주기마다 같은 from 으로 무한히 다시 받기만 했다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { DEFAULT_CUE, TABLES } from "@shared/sim/params";
import { applyShot, createSession, DEFAULT_3C_RULES, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import type { BallState, ShotInput } from "@shared/sim/types";
import { ko } from "../../lib/i18n/ko";
import type { MatchPublic, MatchShot } from "../matchApi";

const api = vi.hoisted(() => ({ getMatch: vi.fn(), getShots: vi.fn(), navigate: vi.fn() }));
// t 는 **참조가 고정**이어야 한다 — 실제 useT 의 t 는 useCallback 이라 안 바뀐다. 매 렌더 새 함수를 주면
// [matchId, t] 를 의존성으로 둔 첫 조회 effect 가 렌더마다 다시 돌아, 없는 버그를 만들어 낸다(실측).
const i18n = vi.hoisted(() => ({ ctx: null as unknown }));

vi.mock("@/lib/i18n", async () => {
    const { ko: dict } = await import("../../lib/i18n/ko");
    i18n.ctx = { t: (k: string) => dict[k] ?? k, locale: "ko" };
    return { useT: () => i18n.ctx };
});
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/watch", api.navigate] }));
vi.mock("@/components/ui/sheet", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Sheet: ({ open, children }: { open?: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        SheetContent: box("div"), SheetHeader: box("div"), SheetTitle: box("h2"), SheetDescription: box("p"),
    };
});
vi.mock("../matchApi", async (orig) => {
    const real = await orig<typeof import("../matchApi")>();
    return { ...real, matchApi: { ...real.matchApi, getMatch: api.getMatch, getShots: api.getShots } };
});

/* ------------------------------------------------------------ 가짜 대전 */

const PARAMS = { table: TABLES.DAEDAE, cue: DEFAULT_CUE, cushionModel: "han2005" as const, condition: 1 };
const OPENING = openingLayout("3c", TABLES.DAEDAE, "white");
/** 살짝만 미는 샷 — 재생이 짧아야 테스트가 실시간으로 기다릴 수 있다. */
const SOFT: ShotInput = { phi: 1.6, V0: 0.35, a: 0, b: 0, theta: 0, cueBallId: "white" };

function sess(turn: number): SessionState {
    const s = createSession({
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        players: [{ id: "h", target: 20, cueBallId: "white" }, { id: "g", target: 20, cueBallId: "yellow" }],
    });
    return { ...s, turn };
}

function publicMatch(o: { shots: number; balls: readonly BallState[]; turn: number }): MatchPublic {
    return {
        id: "m-1", code: "123456", status: "playing",
        gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, aimAssist: true, fullPreview: false,
        isPublic: true, hasPassword: false, handicap: false,
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: "호스트", guestName: "게스트", hostTarget: 20, guestTarget: 20,
        myIndex: -1, turn: o.turn, shots: o.shots, version: 1 + o.shots,
        state: sess(o.turn), balls: o.balls as BallState[],
        winnerIndex: null, endReason: null, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
        createdAt: "2026-09-16T00:00:00.000Z", startedAt: "2026-09-16T00:00:00.000Z",
        lastShotAt: null, finishedAt: null, claimableAt: null,
        turnSeenAt: null, serverNow: "2026-09-16T00:00:00.000Z",
        opponentAim: null, opponentAway: false, watchers: 1, timeouts: [0, 0], rematch: null,
        serverOffsetMs: 0,
    } as unknown as MatchPublic;
}

function shotRow(): MatchShot {
    const r = simulateShot(OPENING as BallState[], SOFT, PARAMS);
    return {
        idx: 0, playerIndex: 0, preState: OPENING, input: SOFT, hash: r.hash,
        outcomeCode: "miss", points: 0, cushions: 0, createdAt: "2026-09-16T00:00:01.000Z",
    };
}

/* ------------------------------------------------------------ jsdom */

type ReactMod = typeof import("react");
let React: ReactMod;
let createRoot: typeof import("react-dom/client")["createRoot"];
let WatchPage: typeof import("./WatchPage")["default"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    const vc = new VirtualConsole();
    vc.on("jsdomError", () => { /* 캔버스 getContext 미구현 */ });
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLCanvasElement", "Element", "Node", "Text", "Event",
        "MouseEvent", "PointerEvent", "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
        "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    if (!("ResizeObserver" in g)) {
        g.ResizeObserver = class { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } };
        globalsSet.push("ResizeObserver");
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    WatchPage = (await import("./WatchPage")).default;
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => {
    while (live.length) live.pop()!.unmount();
    api.getMatch.mockReset();
    api.getShots.mockReset();
});

function mount(): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(React.createElement(WatchPage, { matchId: "m-1" })); });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); } };
    live.push(h);
    return h;
}

/**
 * 네트워크처럼 **한 박자 늦게** 답한다. 이게 이 테스트의 핵심이다 — 즉시 resolve 되는 가짜 API 는
 * 마이크로태스크 안에서 끝나 React 리렌더보다 먼저 도착하고, 그러면 09-16 버그(리렌더가 폴링 effect 를
 * 갈아치워 응답을 버리던 것)가 재현되지 않는다. 실제 fetch 는 항상 리렌더보다 늦다.
 */
const slow = <T,>(v: T, ms = 30) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/**
 * 실시간을 ms 만큼 흘린다 — **짧은 act 를 여러 번** 돌린다. 한 번의 긴 act 로 감싸면 React 가 그 안의 상태 변경을
 * act 가 끝날 때까지 모아 두어 렌더·effect 정리가 미뤄지고, "리렌더가 폴링 effect 를 갈아치운다" 는 종류의
 * 버그가 원리적으로 재현되지 않는다(실측: 긴 act 에서는 effect 설치가 2번뿐이었다). 실제 브라우저는 계속 흘린다.
 */
const wait = async (ms: number) => {
    for (let left = ms; left > 0; left -= 20) {
        // eslint-disable-next-line no-await-in-loop
        await React.act(async () => { await new Promise((r) => setTimeout(r, Math.min(20, left))); });
    }
};

/* ------------------------------------------------------------ 테스트 */

describe("WatchPage 진행 중 관전", () => {
    it("새 샷을 받아 재생을 마치고, 그 뒤 폴링은 같은 샷을 다시 받지 않는다", async () => {
        const row = shotRow();
        const after = simulateShot(OPENING as BallState[], SOFT, PARAMS).final;
        // 첫 응답은 샷 0개, 그 뒤로는 계속 1개(상대가 한 번 쳤다)
        api.getMatch
            .mockImplementationOnce(() => slow(publicMatch({ shots: 0, balls: OPENING, turn: 0 })))
            .mockImplementation(() => slow(publicMatch({ shots: 1, balls: after, turn: 1 })));
        api.getShots.mockImplementation(() => slow([row]));

        const h = mount();
        await wait(50);
        expect(api.getShots).not.toHaveBeenCalled();

        // 폴링 한 주기(2 s) + 재생 시간
        await wait(2600);
        expect(api.getShots).toHaveBeenCalledTimes(1);
        expect(api.getShots).toHaveBeenCalledWith("m-1", 0);

        // 재생이 끝났으면 playedShots 가 1 이 되어 다음 주기엔 다시 받지 않는다.
        // 버그가 있던 동안에는 여기서 2, 3, ... 으로 계속 늘었다(같은 from=0 을 무한 재요청).
        await wait(4200);
        expect(api.getShots).toHaveBeenCalledTimes(1);
    }, 20_000);
});

describe("WatchPage 중간에 들어온 관전자(2026-09-18)", () => {
    it("앞 이닝 점수가 다 보인다 — 여태 친 샷을 한 번에 받아 이닝 시트를 채운다(재생은 안 한다)", async () => {
        // 호스트 1이닝 1점·미스 → 게스트 1이닝 미스 → 호스트 2이닝 1점(진행 중)
        const out = (code: ShotOutcome["code"], points: number): ShotOutcome =>
            ({ code, points, scored: points > 0, consumesInning: points === 0, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: [], kisses: 0 });
        const seq: [number, ShotOutcome][] = [[0, out("point", 1)], [0, out("miss-cushions", 0)], [1, out("miss-cushions", 0)], [0, out("point", 1)]];
        let state = sess(0);
        const rows: MatchShot[] = [];
        for (const [player, o] of seq) {
            const r = applyShot(state, o);
            const p = r.session.players[player];
            rows.push({ ...shotRow(), idx: rows.length, playerIndex: player, outcomeCode: o.code, points: o.points, inning: o.consumesInning ? p.innings : p.innings + 1 });
            state = r.session;
        }
        const m = { ...publicMatch({ shots: rows.length, balls: OPENING, turn: state.turn }), state } as MatchPublic;
        api.getMatch.mockImplementation(() => slow(m));
        api.getShots.mockImplementation(() => slow(rows));

        const h = mount();
        await wait(120);
        expect(api.getShots).toHaveBeenCalledWith("m-1", 0);
        // 머리줄을 눌러 이닝 시트를 연다
        const summary = h.container.querySelector<HTMLButtonElement>(`button[aria-label*="${ko["sim.controls.innings"]}"]`);
        expect(summary).not.toBeNull();
        React.act(() => { summary!.click(); });
        const body = h.container.querySelector('[role="dialog"] tbody');
        const cells = Array.from(body?.querySelectorAll("tr") ?? []).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent));
        expect(cells).toEqual([["1", "1", "0"], ["2", "1", "–"]]);
    }, 10_000);
});
