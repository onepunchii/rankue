/**
 * 점수판 훅(useGameScore)을 진짜로 돌려 본다 — 2026-10-06 오너 제보 "종료하기 버튼이 안 눌러진다"의 재현과 고친 뒤의 동작.
 * 규칙(줄·옵션)의 논리와 소스 검사는 shared/gameMutationQueue.test.ts 에 있고, 여기서는 그 규칙이 훅 안에서 실제로 맞물려 도는지 본다.
 *
 * jsdom 을 직접 띄운다(client/src/sim/useSimulator.test 와 같은 방식). 훅·QueryClient(@tanstack/react-query)·요청 줄은 진짜를 쓰고,
 * 서버로 가는 요청(apiRequest)과 화면 주변(소리·문구·토스트·이동·로그인)만 가짜를 준다.
 * 화면 코드의 시험이지만 shared 에 둔다 — vitest 는 client/src 에서 sim·golf 만 읽는다(vitest.config include).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { DISCARD_TIMEOUT_MS, SAVE_TIMEOUT_MS } from "./gameMutationQueue.js";

const h = vi.hoisted(() => {
    class ApiError extends Error {
        status: number;
        data: any;
        constructor(message: string, status: number, data?: any) { super(message); this.name = "ApiError"; this.status = status; this.data = data; }
    }
    return {
        ApiError,
        /** 서버로 가는 요청 — 시험마다 답을 바꾼다 */
        respond: (_url: string, _opts?: any): Promise<any> => Promise.resolve({ success: true }),
        calls: [] as Array<{ url: string; method: string; opts: any }>,
        setLocation: vi.fn(),
        toast: vi.fn(),
        speak: vi.fn(),
        playEffect: vi.fn(),
    };
});

vi.mock("@/lib/queryClient", () => ({
    ApiError: h.ApiError,
    apiRequest: (url: string, opts?: any) => {
        h.calls.push({ url, method: opts?.method ?? "GET", opts });
        return h.respond(url, opts);
    },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/game/g1", h.setLocation] }));
vi.mock("@/hooks/useGameHistory", async () => await import("../client/src/hooks/useGameHistory"));
vi.mock("@/hooks/useGameAudio", () => ({ useGameAudio: () => ({ speak: h.speak, playEffect: h.playEffect }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ member: { id: "me" } }) }));
vi.mock("@/types/game", () => ({}));
vi.mock("@dnd-kit/sortable", () => ({ arrayMove: <T,>(a: T[]) => a }));

type ReactMod = typeof import("react");
type RQ = typeof import("@tanstack/react-query");
type HookMod = typeof import("../client/src/hooks/useGameScore");
type Score = ReturnType<HookMod["useGameScore"]>;

let React: ReactMod;
let createRoot: typeof import("react-dom/client")["createRoot"];
let rq: RQ;
let useGameScore: HookMod["useGameScore"];
let dom: JSDOM;
const globalsSet: string[] = [];
/** 화면이 보이는가 — 앱을 다른 화면으로 넘겼다 돌아오는 것을 흉내 낸다 */
let visibility: "visible" | "hidden" = "visible";

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/game/g1" });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "getComputedStyle",
        "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver"]) {
        if (!(k in g) || g[k] === undefined) {
            Object.defineProperty(g, k, { value: k === "window" ? dom.window : w[k], configurable: true, writable: true });
            globalsSet.push(k);
        }
    }
    Object.defineProperty(dom.window.document, "visibilityState", { configurable: true, get: () => visibility });
    g.IS_REACT_ACT_ENVIRONMENT = true;
    // 창이 생긴 뒤에 불러온다 — query-core 는 불러올 때 창이 있는지 보고 브라우저로 동작할지 정한다(isServer)
    React = await import("react");
    ({ createRoot } = await import("react-dom/client"));
    rq = await import("@tanstack/react-query");
    ({ useGameScore } = await import("../client/src/hooks/useGameScore"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

/** 진행 중인 4구 경기 — 내가 호스트(player1), 상대는 게스트 */
function gameRow(over: Record<string, unknown> = {}) {
    return {
        id: "g1", storeId: null, gameMode: "match", gameType: "4c", status: "playing_base", sportCategory: "BILLIARDS",
        player1Id: "me", player2Id: null, player3Id: null, player4Id: null,
        player1Name: "rankue", player2Name: "게스트 2", player3Name: null, player4Name: null,
        player1Target: 31, player2Target: 15, player3Target: 0, player4Target: 0,
        player1Score: 0, player2Score: 0, player3Score: 0, player4Score: 0,
        player1HighRun: 0, player2HighRun: 0, player3HighRun: 0, player4HighRun: 0,
        player1Innings: [], player2Innings: [], player3Innings: [], player4Innings: [], totalInnings: 0,
        isRanked: false, ruleFinishType: "none", finishTargetCount: 0, usePbaRule: false, finishProgress: {},
        ...over,
    };
}

function hanging<T = unknown>() {
    let ok!: (v: T) => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { ok = res; fail = rej; });
    return { promise, ok, fail };
}

type Client = InstanceType<RQ["QueryClient"]>;
interface Harness { latest: () => Score; client: Client; unmount: () => void }
const live: Harness[] = [];
const ONGOING = ["/api/hiq/game/ongoing/mine"];
const ROW = ["/api/hiq/game/g1"];
/** 서버에 있는 경기 행 — 들어올 때마다 새로 받는 값(mount 가 바꾼다) */
let serverRow: Record<string, unknown> = {};

/** 서버가 만든 오류 답 — { success: false, message, code? }(server/utils/response.ts 의 sendError) */
const serverError = (message: string, status: number, code?: string) => new h.ApiError(message, status, { success: false, message, code });
/** 웹 서비스워커가 네트워크 실패를 바꿔 준 가짜 404(client/public/sw.js) — 본문이 없어 apiRequest 는 statusText 를 message 로 쓴다 */
const swStub = () => new h.ApiError("Network Unavailable", 404, { message: "Network Unavailable" });

/** shared 를 주면 같은 세션에서 다시 들어온 것이다(앱의 QueryClient 는 하나다 — 앞 화면이 남긴 요청·캐시가 그대로 있다) */
function mount(row: Record<string, unknown> = gameRow(), shared?: Client): Harness {
    serverRow = row;
    const client = shared ?? new rq.QueryClient({
        defaultOptions: {
            queries: {
                retry: false, staleTime: Infinity,
                queryFn: async ({ queryKey }) => (String(queryKey[0]) === ROW[0] ? serverRow : { id: "me", name: "rankue" }),
            },
            mutations: { retry: false }, // 앱과 같다(client/src/lib/queryClient.ts)
        },
    });
    // 홈에서 '이어서'로 들어왔다 — 배너의 답이 캐시에 있다
    client.setQueryData(ONGOING, row);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: Score | null = null;
    function Host() { latest = useGameScore("g1"); return null; }
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client }, React.createElement(Host)));
    });
    let mounted = true;
    const hn: Harness = {
        latest: () => latest!,
        client,
        unmount: () => { if (!mounted) return; mounted = false; React.act(() => root.unmount()); container.remove(); },
    };
    live.push(hn);
    return hn;
}

/** 시계를 앞당기고(디바운스 400ms · 알림 묶음) 그사이 끝난 약속을 화면에 반영한다 */
const flush = async (ms = 0) => { await React.act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
/** 들어와서 서버 행을 받아 되살린 뒤, 첫 자동 저장이 나갈 때까지 */
const enter = async (row?: Record<string, unknown>, shared?: Client) => { const hn = mount(row, shared); await flush(0); await flush(400); return hn; };
const tap = async (hn: Harness, zone: "top" | "bottom" = "top") => { React.act(() => { hn.latest().handleCardTap(1, zone); }); await flush(400); };
const fire = async (target: "window" | "document", name: string) => {
    const Ev = (dom.window as any).Event;
    React.act(() => { (target === "window" ? dom.window : dom.window.document).dispatchEvent(new Ev(name, { bubbles: true })); });
    await flush(0);
};
const sent = (method: string) => h.calls.filter((c) => c.method === method);

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.calls.length = 0;
    h.respond = () => Promise.resolve({ success: true });
    h.setLocation.mockClear();
    h.toast.mockClear();
    visibility = "visible";
});

afterEach(async () => {
    while (live.length) live.pop()!.unmount();
    await vi.advanceTimersByTimeAsync(0);
    // 네트워크 상태를 되돌린다(onlineManager 는 모듈 하나를 시험끼리 같이 쓴다 — 화면이 떨어지면 창의 online 신호도 듣지 않는다)
    rq.onlineManager.setOnline(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useGameScore — 종료하기(버리기)", () => {
    it("들어오면 받은 점수를 되살려 한 번 저장한다(예전 그대로) — 저장은 10초 타임아웃으로 나간다", async () => {
        const hn = await enter(gameRow({ player1Score: 7, player1Innings: [3, 4], totalInnings: 3 }));
        expect(hn.latest().gameState.p1Score).toBe(7);
        expect(sent("PATCH")).toHaveLength(1);
        const save = sent("PATCH")[0];
        expect(save.url).toBe("/api/hiq/game/g1/score");
        expect(save.opts.timeoutMs).toBe(SAVE_TIMEOUT_MS);
        expect(save.opts.body).toMatchObject({ player1Score: 7, player1Innings: [3, 4], totalInnings: 3, status: "playing_base" });
    });

    it("저장이 응답 없이 매달려 있어도 종료는 곧바로 나가고, 지워지면 홈으로 — '이어서' 배너의 답은 낡은 것으로 표시된다", async () => {
        h.respond = (_url, opts) => (opts?.method === "PATCH" ? new Promise(() => {}) : Promise.resolve({ discarded: true }));
        const hn = await enter();
        await tap(hn); // 매달린 저장 뒤에 저장이 하나 더 선다
        expect(sent("PATCH")).toHaveLength(1);
        expect(hn.latest().discardMutation.isPending).toBe(false);

        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);

        const del = sent("DELETE");
        expect(del).toHaveLength(1);
        expect(del[0].url).toBe("/api/hiq/game/g1");
        expect(del[0].opts).toEqual({ method: "DELETE", timeoutMs: DISCARD_TIMEOUT_MS });
        expect(h.setLocation).toHaveBeenCalledTimes(1);
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
        expect(h.toast).not.toHaveBeenCalled();
        expect(hn.client.getQueryState(ONGOING)?.isInvalidated).toBe(true);

        // 버린 뒤의 점수 변화는 저장하지 않는다(지운 경기를 건드리지 않는다)
        await tap(hn);
        await fire("window", "online");
        expect(sent("PATCH")).toHaveLength(1);
    });

    it("가는 동안 isPending — 화면이 단추를 잠그는 근거. 그동안의 점수 변화는 저장하지 않는다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "DELETE" ? gate.promise : Promise.resolve({ success: true }));
        const hn = await enter();
        expect(sent("PATCH")).toHaveLength(1);

        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);
        expect(hn.latest().discardMutation.isPending).toBe(true);
        expect(h.setLocation).not.toHaveBeenCalled();
        await tap(hn);
        expect(sent("PATCH")).toHaveLength(1);

        gate.ok({ discarded: true });
        await flush(0);
        expect(hn.latest().discardMutation.isPending).toBe(false);
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
    });

    it("오프라인 — 멈추지 않고 곧바로 실패한다: 왜 남았는지 알리고 홈으로, 배너는 새로 받게 한다", async () => {
        const hn = await enter();
        await fire("window", "offline");
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));

        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);

        expect(sent("DELETE")).toHaveLength(1);
        expect(hn.latest().discardMutation.isPaused).toBe(false);
        expect(h.toast).toHaveBeenCalledTimes(1);
        expect(h.toast).toHaveBeenCalledWith({
            title: "gameScoreboard.exitFailTitle",
            description: "gameScoreboard.exitFailDesc",
            variant: "destructive",
        });
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
        expect(hn.client.getQueryState(ONGOING)?.isInvalidated).toBe(true);
    });

    it("서버가 이유를 들어 거절하면(4xx) 그 이유를, 서버 오류(5xx)면 다시 하는 길을 보여 준다", async () => {
        const hn = await enter();
        // 방금 만든 경기 — 홈의 배너는 '진행 중 없음'을 알고 있다
        hn.client.setQueryData(ONGOING, null);
        h.respond = (_url, opts) => (opts?.method === "DELETE"
            ? Promise.reject(serverError("끝난 경기는 지울 수 없어요", 409)) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);
        expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "gameScoreboard.exitFailTitle", description: "끝난 경기는 지울 수 없어요" }));
        // 거절당한 경기(이미 끝남)는 배너에 넣지 않는다 — '이어서 하기'로 들어갈 경기가 아니다
        expect(hn.client.getQueryData(ONGOING)).toBeNull();
        expect(hn.client.getQueryState(ONGOING)?.isInvalidated).toBe(true);

        h.respond = (_url, opts) => (opts?.method === "DELETE"
            ? Promise.reject(new h.ApiError("Internal Server Error", 500, { message: "Internal Server Error" })) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);
        expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: "gameScoreboard.exitFailDesc" }));
        expect(h.setLocation).toHaveBeenCalledTimes(2);
    });

    it("방금 만든 경기를 못 지웠다 — 알림이 가리키는 '이어서 하기'가 홈에 있게 배너의 답으로 넣고, 낡은 것으로 표시한다", async () => {
        const row = gameRow();
        const hn = await enter(row);
        // 홈에서 '진행 중 없음'을 받고 새 경기를 만들어 들어왔다(경기 만들기는 이 답을 고치지 않는다)
        hn.client.setQueryData(ONGOING, null);
        // 응답이 매달려 12초에 놓았다
        h.respond = (_url, opts) => (opts?.method === "DELETE"
            ? Promise.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardGame(); });
        await flush(0);
        expect(h.toast).toHaveBeenCalledWith({ title: "gameScoreboard.exitFailTitle", description: "gameScoreboard.exitFailDesc", variant: "destructive" });
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
        expect(hn.client.getQueryData(ONGOING)).toEqual(row);
        // 서버는 지웠을 수도 있다 — 홈이 붙으면 새로 받는다
        expect(hn.client.getQueryState(ONGOING)?.isInvalidated).toBe(true);
    });

    it("이미 없는 경기(서버가 그렇게 답한 404)는 지워진 것이다 — 알림 없이 홈으로", async () => {
        const hn = await enter();
        h.respond = (_url, opts) => (opts?.method === "DELETE"
            ? Promise.reject(serverError("경기를 찾을 수 없어요", 404, "GAME_NOT_FOUND")) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);
        expect(h.toast).not.toHaveBeenCalled();
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
        expect(hn.latest().discardMutation.isSuccess).toBe(true);
        expect(hn.client.getQueryState(ONGOING)?.isInvalidated).toBe(true);
        // 지워진 경기에는 더 저장하지 않는다
        await tap(hn);
        expect(sent("PATCH")).toHaveLength(1);
    });

    // 웹/PWA: 서비스워커(client/public/sw.js)가 네트워크 실패를 본문 없는 404 로 돌려준다 — '이미 없는 경기'가 아니다
    it("서비스워커의 가짜 404(네트워크 실패)는 지워진 것이 아니다 — 못 지웠다고 알리고, 그 문구(\"Network Unavailable\")를 까닭으로 보여 주지 않는다", async () => {
        const row = gameRow();
        const hn = await enter(row);
        hn.client.setQueryData(ONGOING, null);
        h.respond = (_url, opts) => (opts?.method === "DELETE" ? Promise.reject(swStub()) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardGame(); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(1);
        expect(hn.latest().discardMutation.isError).toBe(true);
        expect(h.toast).toHaveBeenCalledTimes(1);
        expect(h.toast).toHaveBeenCalledWith({ title: "gameScoreboard.exitFailTitle", description: "gameScoreboard.exitFailDesc", variant: "destructive" });
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
        // 경기는 서버에 그대로 있다 — 배너로 다시 들어올 수 있다
        expect(hn.client.getQueryData(ONGOING)).toEqual(row);
        // 저장 차단이 풀렸다 — 떠날 때 남은 점수를 민다
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        hn.unmount();
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2);
    });

    it("못 지웠으면 저장 차단을 푼다 — 화면을 떠날 때 남은 점수를 한 번 민다", async () => {
        const hn = await enter();
        h.respond = (_url, opts) => (opts?.method === "DELETE" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().discardMutation.mutate(); });
        await flush(0);
        // 디바운스가 돌기 전에 화면을 떠난다
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        hn.unmount();
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2);
        expect(sent("PATCH")[1].opts.body.player1Score).toBe(1);
    });
});

describe("useGameScore — 점수 저장", () => {
    it("오프라인이어도 멈추지 않는다 — 실패한 저장은 online 때 최신 상태로 한 번 다시 보낸다(되풀이하지 않는다)", async () => {
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));
        const hn = await enter();
        await fire("window", "offline");
        await tap(hn);
        await tap(hn);
        // 들어올 때 한 번 + 점수 두 번 — 오프라인인데도 셋 다 시도했고(멈추지 않았다), 실패했다
        expect(sent("PATCH")).toHaveLength(3);
        // 가만히 두면 다시 보내지 않는다
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(3);

        h.respond = () => Promise.resolve({ success: true });
        await fire("window", "online");
        // 다시 보낸 저장 + 확인 저장 한 번 — 답 없이 끝난 저장은 서버에 닿았을 수도 있다(늦게 닿으면 뒤의 저장을 덮는다)
        expect(sent("PATCH")).toHaveLength(5);
        expect(sent("PATCH")[3].opts.body).toMatchObject({ player1Score: 2, status: "playing_base" });
        expect(sent("PATCH")[4].opts.body).toMatchObject({ player1Score: 2, status: "playing_base" });
        // 보냈으면 끝 — 같은 신호가 또 와도 보내지 않는다
        await fire("window", "online");
        await fire("document", "visibilitychange");
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(5);
        // 답을 받은 실패(서버가 거절)는 늦게 닿을 것이 없다 — 그 뒤의 성공에는 확인 저장이 붙지 않는다
        h.respond = () => Promise.reject(serverError("서버 오류", 500));
        await tap(hn);
        expect(sent("PATCH")).toHaveLength(6);
        h.respond = () => Promise.resolve({ success: true });
        await fire("window", "online");
        expect(sent("PATCH")).toHaveLength(7);
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(7);
    });

    it("화면이 다시 보일 때도 다시 보낸다 — 가려질 때는 아무것도 하지 않는다. 멈춘 요청도 그때 깨운다", async () => {
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));
        const hn = await enter();
        expect(sent("PATCH")).toHaveLength(1);
        const wake = vi.spyOn(hn.client.getMutationCache(), "resumePausedMutations");

        visibility = "hidden";
        await fire("document", "visibilitychange");
        expect(sent("PATCH")).toHaveLength(1);
        expect(wake).not.toHaveBeenCalled();

        h.respond = () => Promise.resolve({ success: true });
        visibility = "visible";
        await fire("document", "visibilitychange");
        expect(sent("PATCH")).toHaveLength(3); // 다시 보낸 저장 + 확인 저장
        expect(wake).toHaveBeenCalled();
    });

    it("화면을 떠나면 신호를 듣지 않는다 — 떠날 때 못 보낸 변경을 한 번 밀 뿐이다", async () => {
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));
        const hn = await enter();
        expect(sent("PATCH")).toHaveLength(1);
        hn.unmount();
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2); // 떠날 때 한 번
        await fire("window", "online");
        await fire("document", "visibilitychange");
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(2);
    });

    it("매달린 저장 뒤에는 하나만 선다 — 누른 만큼 쌓이지 않고, 줄 선 저장이 나가는 순간의 최신 점수를 보낸다", async () => {
        const gates: Array<ReturnType<typeof hanging>> = [];
        h.respond = () => { const g = hanging(); gates.push(g); return g.promise; };
        const hn = await enter();
        await tap(hn);
        await tap(hn);
        await tap(hn);
        expect(hn.latest().gameState.p1Score).toBe(3);
        expect(sent("PATCH")).toHaveLength(1); // 들어올 때의 저장이 매달려 있다
        const pending = () => hn.client.getMutationCache().getAll().filter((m) => m.state.status === "pending").length;
        expect(pending()).toBe(2);

        gates[0].fail(new Error("timeout"));
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2);
        expect(sent("PATCH")[1].opts.body.player1Score).toBe(3);

        // 앞의 저장은 답 없이 끝났다(놓았을 뿐 서버에 늦게 닿을 수 있다) — 이 성공 뒤에 확인 저장이 한 번 더 나간다
        gates[1].ok({ success: true });
        await flush(0);
        expect(sent("PATCH")).toHaveLength(3);
        expect(sent("PATCH")[2].opts.body.player1Score).toBe(3);
        expect(pending()).toBe(1);
        gates[2].ok({ success: true });
        await flush(0);
        expect(pending()).toBe(0);
        expect(sent("PATCH")).toHaveLength(3);
        // 줄이 비었으니 다음 변화는 바로 나간다
        await tap(hn, "bottom");
        expect(sent("PATCH")).toHaveLength(4);
        expect(sent("PATCH")[3].opts.body.player1Score).toBe(2);
    });

    it("확인 저장은 점수판이 떠 있을 때만 — 떠난 화면의 옛 점수가 다시 들어온 화면의 저장 뒤에 서지 않는다", async () => {
        const gates: Array<ReturnType<typeof hanging>> = [];
        h.respond = () => { const g = hanging(); gates.push(g); return g.promise; };
        const hn = await enter();   // 들어올 때의 저장이 매달려 있다
        await tap(hn);              // 그 뒤에 하나 선다
        hn.unmount();               // 떠난다 — 밀 것이 없다(디바운스는 이미 돌았고 실패도 아직 없다)
        await flush(0);
        expect(sent("PATCH")).toHaveLength(1);

        gates[0].fail(new Error("timeout")); // 떠난 뒤에 앞의 저장이 답 없이 끝났다 → 줄 선 저장이 나간다
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2);
        gates[1].ok({ success: true });
        await flush(0);
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(2);
        expect(hn.client.getMutationCache().getAll().filter((m) => m.state.status === "pending")).toHaveLength(0);
    });

    it("같은 세션에서 다시 들어오면 서버에서 새로 받은 행으로 되살린다 — 메모리에 남은 옛 행의 점수를 다시 저장하지 않는다", async () => {
        const hn = await enter(); // 0:0 으로 들어왔다
        await tap(hn);
        await tap(hn);
        await tap(hn);
        expect(sent("PATCH")).toHaveLength(4);
        expect(sent("PATCH")[3].opts.body.player1Score).toBe(3);
        hn.unmount(); // 뒤로가기 — 홈으로
        await flush(0);
        // 떠나면 행을 캐시에서 뺀다
        expect(hn.client.getQueryCache().find({ queryKey: ROW })).toBeUndefined();

        // 서버에는 3점이 있다 — 홈의 '이어서'로 다시 들어온다(같은 QueryClient)
        const again = await enter(gameRow({ player1Score: 3, player1Innings: [], totalInnings: 1 }), hn.client);
        expect(again.latest().gameState.p1Score).toBe(3);
        expect(sent("PATCH")).toHaveLength(5);
        expect(sent("PATCH")[4].opts.body).toMatchObject({ player1Score: 3, status: "playing_base" });
    });

    it("앞 화면이 남긴 멈춘 저장은 들어올 때 깨운다 — 줄 맨 앞에 남아 이 화면의 저장·FINISH 를 붙잡지 않게", async () => {
        const gates: Array<ReturnType<typeof hanging>> = [];
        h.respond = () => { const g = hanging(); gates.push(g); return g.promise; };
        const first = await enter(); // 저장 A 가 가는 중(매달려 있다)
        // 앱의 QueryClient 는 뿌리에 붙어 있어 점수판을 떠나도 화면 복귀·online 신호를 듣는다
        first.client.mount();
        React.act(() => { first.latest().handleCardTap(1, "top"); });
        first.unmount(); // 한 점 누르고 곧바로 뒤로 — 떠나며 저장 B 를 A 뒤에 세운다
        await flush(0);
        expect(sent("PATCH")).toHaveLength(1);
        const paused = () => first.client.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
        expect(paused()).toBe(1);

        // 앱이 가려진 사이 A 가 끝났다 — B 는 깨어나지 못한다(화면이 보일 때만 이어 간다)
        visibility = "hidden";
        await fire("document", "visibilitychange");
        gates[0].fail(new Error("timeout"));
        await flush(0);
        expect(sent("PATCH")).toHaveLength(1);

        // 오프라인으로 돌아왔다 — 라이브러리는 온라인일 때만 깨우고, 점수판의 리스너는 떠날 때 떼어졌다
        rq.onlineManager.setOnline(false);
        visibility = "visible";
        await fire("document", "visibilitychange");
        expect(sent("PATCH")).toHaveLength(1);
        expect(paused()).toBe(1);

        // 홈의 '이어서'로 다시 들어온다 — 들어오면서 깨운다: B 가 앞 화면의 마지막 점수로 나가고 줄이 빈다
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));
        mount(gameRow(), first.client);
        await flush(0);
        expect(sent("PATCH")).toHaveLength(2);
        expect(sent("PATCH")[1].opts.body.player1Score).toBe(1);
        expect(paused()).toBe(0);
        expect(first.client.getMutationCache().getAll().filter((m) => m.state.status === "pending")).toHaveLength(0);
        first.client.unmount();
    });
});

describe("useGameScore — FINISH", () => {
    const atTarget = () => gameRow({ player1Score: 31, player1Innings: [], totalInnings: 1 });

    it("저장과 같은 줄 — 앞의 저장이 끝난 뒤에 나간다(기본 타임아웃). 그 뒤로는 진행 중 저장을 보내지 않는다", async () => {
        const gates: Array<ReturnType<typeof hanging>> = [];
        h.respond = (_url, opts) => {
            if (opts?.method === "PATCH") { const g = hanging(); gates.push(g); return g.promise; }
            return Promise.resolve({ game: { id: "g1", status: "finished" } });
        };
        const hn = await enter(atTarget());
        expect(sent("PATCH")).toHaveLength(1);

        React.act(() => { hn.latest().handleCardTap(1, "top"); }); // 목표에 닿은 사람의 위쪽 탭 = FINISH
        await flush(0);
        expect(hn.latest().finishMutation.isPending).toBe(true);
        expect(sent("POST")).toHaveLength(0);

        gates[0].ok({ success: true });
        await flush(0);
        const fin = sent("POST");
        expect(fin).toHaveLength(1);
        expect(fin[0].url).toBe("/api/hiq/game/g1/finish");
        expect(fin[0].opts.timeoutMs).toBeUndefined();
        expect(fin[0].opts.body).toMatchObject({ player1Score: 31, winnerId: "me" });
        expect(h.setLocation).toHaveBeenCalledWith("/game/result?id=g1");
        await fire("window", "online");
        await flush(400);
        expect(sent("PATCH")).toHaveLength(1);
    });

    // 실패 알림은 점수판 안의 띠다(finishFailure 를 화면이 그린다) — 세로로 든 폰에서 토스트는 점수판 상자 밑에 깔려 보이지 않는다
    it("오프라인 — 멈추지 않고 실패를 알린다(점수판 안의 띠). 저장 차단이 풀려 다시 누를 수 있다", async () => {
        const hn = await enter(atTarget());
        expect(hn.latest().finishFailure).toBeNull();
        await fire("window", "offline");
        h.respond = () => Promise.reject(new TypeError("Failed to fetch"));
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(1);
        expect(hn.latest().finishMutation.isPending).toBe(false);
        expect(hn.latest().finishBusy).toBe(false);
        expect(hn.latest().finishFailure).toBe("gameScoreboard.finishFailDesc");
        expect(h.toast).not.toHaveBeenCalled();
        expect(h.setLocation).not.toHaveBeenCalled();

        // 띠를 눌러 닫을 수 있다
        React.act(() => { hn.latest().dismissFinishFailure(); });
        await flush(0);
        expect(hn.latest().finishFailure).toBeNull();

        h.respond = () => Promise.resolve({ game: { id: "g1", status: "finished" } });
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(2);
        expect(hn.latest().finishFailure).toBeNull();
        expect(h.setLocation).toHaveBeenCalledWith("/game/result?id=g1");
    });

    it("실패의 까닭 — 서버가 답한 것은 그 말을, 서비스워커의 가짜 404 는 번역된 안내를(\"Network Unavailable\" 이 아니다). 다시 누르면 띠가 사라진다", async () => {
        const hn = await enter(atTarget());
        h.respond = (_url, opts) => (opts?.method === "POST" ? Promise.reject(swStub()) : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(hn.latest().finishFailure).toBe("gameScoreboard.finishFailDesc");

        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "POST" ? gate.promise : Promise.resolve({ success: true }));
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(hn.latest().finishFailure).toBeNull(); // 가는 중
        expect(hn.latest().finishBusy).toBe(true);
        gate.fail(serverError("이미 끝난 경기예요", 409));
        await flush(0);
        expect(hn.latest().finishFailure).toBe("이미 끝난 경기예요");
        expect(h.toast).not.toHaveBeenCalled();
    });

    it("점수판을 떠난 뒤에 끝난 실패는 토스트로 알린다 — 띠를 그릴 점수판이 없다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "POST" ? gate.promise : Promise.resolve({ success: true }));
        const hn = await enter(atTarget());
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(1);
        hn.unmount();
        await flush(0);
        gate.fail(new TypeError("Failed to fetch"));
        await flush(0);
        expect(h.toast).toHaveBeenCalledTimes(1);
        expect(h.toast).toHaveBeenCalledWith({ title: "gameScoreboard.finishFailTitle", description: "gameScoreboard.finishFailDesc", variant: "destructive" });
    });

    it("버리는 중인 경기는 끝내지 않는다 — 종료가 가는 동안의 FINISH 탭은 나가지 않는다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "DELETE" ? gate.promise : Promise.resolve({ success: true }));
        const hn = await enter(atTarget());
        React.act(() => { hn.latest().discardGame(); });
        await flush(0);
        expect(hn.latest().discardMutation.isPending).toBe(true);
        expect(hn.latest().discardBusy).toBe(true);

        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(0);
        expect(hn.latest().finishMutation.isPending).toBe(false);
        // 버리기도 두 번 나가지 않는다
        React.act(() => { hn.latest().discardGame(); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(1);

        gate.ok({ discarded: true });
        await flush(0);
        expect(hn.latest().discardBusy).toBe(false);
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
    });

    it("끝나는 중인 경기는 버리지 않는다 — FINISH 가 가는(줄 선) 동안의 종료는 나가지 않는다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "POST" ? gate.promise : Promise.resolve({ success: true }));
        const hn = await enter(atTarget());
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(hn.latest().finishBusy).toBe(true);
        React.act(() => { hn.latest().discardGame(); });
        // 같은 손놀림에 한 번 더 눌러도 FINISH 는 하나다
        React.act(() => { hn.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(0);
        expect(sent("POST")).toHaveLength(1);
        gate.ok({ game: { id: "g1", status: "finished" } });
        await flush(0);
        expect(h.setLocation).toHaveBeenCalledWith("/game/result?id=g1");
    });
});

// 서로 막기는 이 화면이 보낸 요청이 아니라 이 경기의 요청을 본다 — 요청은 화면을 떠나도 캐시에서 계속 가고,
// 뒤로 나갔다가 홈의 '이어서'로 다시 들어온 화면의 옵저버(isPending)는 앞 화면이 남긴 것을 모른다.
describe("useGameScore — 다시 들어온 화면(같은 세션)", () => {
    const atTarget = () => gameRow({ player1Score: 31, player1Innings: [], totalInnings: 1 });

    it("앞 화면이 남긴 FINISH 가 가는 중이면 종료(버리기)는 나가지 않는다 — 단추를 잠그는 근거(finishBusy)도 켜진다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "POST" ? gate.promise : Promise.resolve({ success: true }));
        const first = await enter(atTarget());
        React.act(() => { first.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(1);
        first.unmount(); // 기기의 뒤로가기 — FINISH 는 캐시에서 계속 간다
        await flush(0);

        const again = await enter(atTarget(), first.client);
        expect(again.latest().finishMutation.isPending).toBe(false); // 이 화면이 보낸 것이 아니다
        expect(again.latest().finishBusy).toBe(true);
        expect(again.latest().discardBusy).toBe(false);
        React.act(() => { again.latest().discardGame(); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(0);
        // FINISH 도 한 번 더 나가지 않는다
        React.act(() => { again.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(1);

        gate.ok({ game: { id: "g1", status: "finished" } });
        await flush(0);
        expect(again.latest().finishBusy).toBe(false);
        expect(h.setLocation).toHaveBeenCalledWith("/game/result?id=g1");
    });

    it("앞 화면이 남긴 버리기가 가는 중이면 FINISH 는 나가지 않는다", async () => {
        const gate = hanging();
        h.respond = (_url, opts) => (opts?.method === "DELETE" ? gate.promise : Promise.resolve({ success: true }));
        const first = await enter(atTarget());
        React.act(() => { first.latest().discardGame(); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(1);
        first.unmount();
        await flush(0);

        const again = await enter(atTarget(), first.client);
        expect(again.latest().discardMutation.isPending).toBe(false);
        expect(again.latest().discardBusy).toBe(true);
        React.act(() => { again.latest().handleCardTap(1, "top"); });
        await flush(0);
        expect(sent("POST")).toHaveLength(0);
        React.act(() => { again.latest().discardGame(); });
        await flush(0);
        expect(sent("DELETE")).toHaveLength(1);

        gate.ok({ discarded: true });
        await flush(0);
        expect(again.latest().discardBusy).toBe(false);
        expect(h.setLocation).toHaveBeenCalledWith("/dashboard");
    });

    it("줄 선 FINISH 뒤에는 확인 저장을 세우지 않는다 — 끝난 경기에 진행 중 저장이 뒤늦게 닿지 않게", async () => {
        const gates: Array<ReturnType<typeof hanging>> = [];
        h.respond = (_url, opts) => {
            if (opts?.method === "PATCH") { const g = hanging(); gates.push(g); return g.promise; }
            return Promise.resolve({ game: { id: "g1", status: "finished" } });
        };
        const hn = await enter(atTarget());
        gates[0].fail(new Error("timeout")); // 들어올 때의 저장이 답 없이 끝났다
        await flush(0);
        await fire("window", "online");      // 다시 보낸다(매달려 있다)
        expect(sent("PATCH")).toHaveLength(2);

        React.act(() => { hn.latest().handleCardTap(1, "top"); }); // FINISH — 그 저장 뒤에 선다
        await flush(0);
        expect(sent("POST")).toHaveLength(0);
        expect(hn.latest().finishBusy).toBe(true);

        gates[1].ok({ success: true });
        await flush(0);
        expect(sent("POST")).toHaveLength(1);
        expect(h.setLocation).toHaveBeenCalledWith("/game/result?id=g1");
        await flush(60_000);
        expect(sent("PATCH")).toHaveLength(2);
    });
});
