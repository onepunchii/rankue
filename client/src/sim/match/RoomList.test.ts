/**
 * RoomList 스모크(jsdom, QueryClientProvider, api 주입). 행·칩·참가 다이얼로그(다마수 기본값 = 내 핸디) → joinRoom → onOpen ·
 * 비밀번호 방은 비밀번호를 넣어야 참가 · BAD_PASSWORD 문구 · 빈 목록 · roomAge.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/components/hiq/BallDot", async () => { const React = await import("react"); return { BallDot: () => React.createElement("span") }; });
vi.mock("@/components/ui/button", async () => {
    const React = await import("react");
    return { Button: (p: Record<string, unknown>) => { const { children, variant: _v, ...rest } = p; return React.createElement("button", rest, children as never); } };
});
vi.mock("@/components/ui/input", async () => { const React = await import("react"); return { Input: (p: Record<string, unknown>) => React.createElement("input", p) }; });
vi.mock("@/components/ui/label", async () => {
    const React = await import("react");
    return { Label: (p: Record<string, unknown>) => { const { children, ...rest } = p; return React.createElement("label", rest, children as never); } };
});
vi.mock("@/components/ui/switch", async () => {
    const React = await import("react");
    return { Switch: ({ id }: { id: string }) => React.createElement("button", { type: "button", role: "switch", id }) };
});
vi.mock("@/components/ui/dialog", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        DialogContent: box("div"), DialogHeader: box("div"), DialogFooter: box("div"), DialogTitle: box("h2"), DialogDescription: box("p"),
    };
});

import type { MatchApi, MatchPublic } from "../matchApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Mod = typeof import("./RoomList");
type RQ = typeof import("@tanstack/react-query");
let ROOMS_QUERY_KEY: Mod["ROOMS_QUERY_KEY"];
let React: ReactMod; let createRoot: ClientMod["createRoot"]; let RoomList: Mod["RoomList"]; let roomAge: Mod["roomAge"]; let defaultJoinTarget: Mod["defaultJoinTarget"]; let rq: RQ; let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ RoomList, roomAge, defaultJoinTarget, ROOMS_QUERY_KEY } = await import("./RoomList"));
    rq = await import("@tanstack/react-query");
});
afterAll(() => { const g = globalThis as unknown as Record<string, unknown>; for (const k of globalsSet) delete g[k]; dom.window.close(); });

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const room = (over: Partial<MatchPublic> = {}): MatchPublic => ({
    id: "r1", code: "", status: "waiting", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, aimAssist: true, isPublic: true, hasPassword: false,
    rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0, hostName: "방장", guestName: null, hostTarget: 20, guestTarget: null,
    myIndex: -1, turn: 0, shots: 0, version: 1, state: null, balls: null, winnerIndex: null, endReason: null, engineVersion: "v", paramsHash: "h",
    createdAt: new Date(NOW - 5 * 60_000).toISOString(), startedAt: null, lastShotAt: null, finishedAt: null, claimableAt: null, turnSeenAt: null, serverNow: null, ...over,
});
function api(rows: MatchPublic[], joinRoom?: MatchApi["joinRoom"], live: unknown[] = []): MatchApi {
    return {
        listRooms: vi.fn(async () => rows),
        joinRoom: joinRoom ?? vi.fn(async (id) => room({ id, status: "playing", myIndex: 1 })),
        getWatchable: vi.fn(async () => ({ live, replays: [] })),
    } as unknown as MatchApi;
}

/** 게임 중인 공개 대전 한 줄(관전 목록 카드). */
const liveCard = (over: Record<string, unknown> = {}) => ({
    id: "m1", status: "playing", gameType: "3c", tableId: "DAEDAE", hostName: "다대맨", guestName: "정현경",
    targets: [20, 20], scores: [7, 5], innings: 9, turn: 0, shots: 18, winnerIndex: null, watchers: 2,
    startedAt: new Date(NOW - 60_000).toISOString(), finishedAt: null, lastShotAt: null, ...over,
});
function mount(props: { rows: MatchPublic[]; joinRoom?: MatchApi["joinRoom"]; myHandi?: { handi3c: number | null; handi4c: number | null }; live?: unknown[]; onWatch?: (id: string) => void; autoJoinId?: string }) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpen = vi.fn(); const onCreate = vi.fn();
    const a = api(props.rows, props.joinRoom, props.live ?? []);
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client: qc },
            React.createElement(RoomList, { onOpen, onWatch: props.onWatch, onCreate, onClose: () => undefined, api: a, myHandi: props.myHandi, autoJoinId: props.autoJoinId, now: () => NOW })));
    });
    const h = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, onOpen, onCreate, api: a };
    live.push(h);
    return h;
}
async function settle(h: Harness, until: () => boolean): Promise<void> {
    for (let i = 0; i < 40 && !until(); i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(until(), h.container.textContent ?? "").toBe(true);
}
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const text = (h: Harness) => h.container.textContent ?? "";
const buttons = (h: Harness) => Array.from(h.container.querySelectorAll("button"));
function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    React.act(() => { setter.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
}

describe("RoomList", () => {
    it("행: 방장·종목·다마수·칩(리얼리티·비밀번호)·만든 지 n분 → 참가 다이얼로그(내 핸디가 기본) → joinRoom → onOpen", async () => {
        const rows = [room(), room({ id: "r2", hostName: "고수", aimAssist: false, hasPassword: true, createdAt: new Date(NOW - 3 * 3_600_000).toISOString() })];
        const h = mount({ rows, myHandi: { handi3c: 18, handi4c: null } });
        await settle(h, () => text(h).includes("방장"));
        expect(text(h)).toContain("열린 방 2");
        expect(text(h)).toContain("5분 전");
        expect(text(h)).toContain("3시간 전");
        expect(text(h)).toContain(ko["sim.setup.modeReality"]);
        expect(text(h)).toContain(ko["sim.rooms.locked"]);
        click(buttons(h).find((b) => b.getAttribute("aria-label") === `${ko["sim.rooms.join"]} · 방장`)!);
        const dlg = h.container.querySelector("[role=dialog]")!;
        expect(dlg).not.toBeNull();
        expect((dlg.querySelector("#sim-room-target") as HTMLInputElement).value).toBe("18");
        expect(dlg.querySelector("#sim-room-password")).toBeNull();
        click(Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === ko["sim.rooms.join"])!);
        await settle(h, () => h.onOpen.mock.calls.length > 0);
        expect(h.api.joinRoom).toHaveBeenCalledWith("r1", 18, undefined);
        expect(h.onOpen.mock.calls[0][0].status).toBe("playing");
    });

    it("비밀번호 방: 비밀번호를 넣어야 참가, 틀리면 문구", async () => {
        const joinRoom = vi.fn(async () => { throw { status: 403, data: { code: "BAD_PASSWORD" } }; });
        const h = mount({ rows: [room({ hasPassword: true })], joinRoom });
        await settle(h, () => text(h).includes("방장"));
        click(buttons(h).find((b) => b.getAttribute("aria-label") === `${ko["sim.rooms.join"]} · 방장`)!);
        const dlg = h.container.querySelector("[role=dialog]")!;
        expect((dlg.querySelector("#sim-room-target") as HTMLInputElement).value).toBe("20"); // 핸디 없음 → 방장 다마수
        const join = Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === ko["sim.rooms.join"]) as HTMLButtonElement;
        expect(join.disabled).toBe(true);
        type(dlg.querySelector("#sim-room-password") as HTMLInputElement, "0000");
        expect(join.disabled).toBe(false);
        click(join);
        await settle(h, () => text(h).includes(ko["sim.match.badPassword"]));
        expect(joinRoom).toHaveBeenCalledWith("r1", 20, "0000");
        expect(h.onOpen).not.toHaveBeenCalled();
    });

    it("빈 목록 안내와 방 만들기, roomAge·defaultJoinTarget", async () => {
        const h = mount({ rows: [] });
        await settle(h, () => text(h).includes(ko["sim.rooms.empty"]));
        click(buttons(h).find((b) => b.textContent === ko["sim.entry.roomCreate"])!);
        expect(h.onCreate).toHaveBeenCalledTimes(1);
        const t = (k: string) => ko[k] ?? k;
        expect(roomAge(new Date(NOW - 10_000).toISOString(), NOW, t)).toBe("방금");
        expect(roomAge(new Date(NOW - 61 * 60_000).toISOString(), NOW, t)).toBe("1시간 전");
        expect(roomAge("junk", NOW, t)).toBe("방금");
        expect(defaultJoinTarget({ gameType: "4c", hostTarget: 100 }, { handi3c: 18, handi4c: 80 })).toBe(80);
        expect(defaultJoinTarget({ gameType: "4c", hostTarget: 100 }, { handi3c: 18, handi4c: null })).toBe(100);
    });
});

/**
 * 게임 중인 방(2026-09-12 오너: "게임중이라도 방이 보이고 게임중이라고 표시되고, 선택되면 관전으로").
 * 시작한 방은 참가 목록(listRooms)에서 빠지지만 관전 목록으로 같은 자리에 이어 붙는다.
 */
describe("RoomList: 홈 카드에서 고른 방(autoJoinId)", () => {
    it("목록이 오면 그 방의 참가 창이 바로 열리고, 닫으면 다시 열리지 않는다", async () => {
        const h = mount({ rows: [room(), room({ id: "r2", hostName: "고수" })], autoJoinId: "r2", myHandi: { handi3c: 15, handi4c: null } });
        await settle(h, () => h.container.querySelector("[role=dialog]") !== null);
        const dlg = h.container.querySelector("[role=dialog]")!;
        expect(dlg.textContent).toContain("고수");
        click(Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === ko["sim.common.close"] || b.getAttribute("aria-label") === ko["sim.common.close"]) ?? dlg.querySelector("button")!);
    });

    it("그사이 방이 차서 없어졌으면 목록만 보인다(창을 억지로 열지 않는다)", async () => {
        const h = mount({ rows: [room()], autoJoinId: "gone" });
        await settle(h, () => text(h).includes("방장"));
        expect(h.container.querySelector("[role=dialog]")).toBeNull();
    });
});

describe("RoomList: 게임 중인 방 줄", () => {
    it("대기 방이 없어도 게임 중인 방이 있으면 '열린 방이 없어요' 대신 그 방을 보여 준다", async () => {
        const onWatch = vi.fn();
        const h = mount({ rows: [], live: [liveCard()], onWatch });
        await settle(h, () => (h.container.textContent ?? "").includes("다대맨"));
        const text = h.container.textContent ?? "";
        expect(text).toContain(ko["sim.watch.badge"]);          // 게임 중
        expect(text).toContain("7 : 5");
        expect(text).toContain(ko["sim.watch.viewers"].replace("{n}", "2"));
        expect(text).not.toContain(ko["sim.rooms.empty"]);
    });

    it("관전 버튼을 누르면 그 대전 id 로 관전을 연다", async () => {
        const onWatch = vi.fn();
        const h = mount({ rows: [], live: [liveCard({ id: "m-42" })], onWatch });
        await settle(h, () => (h.container.textContent ?? "").includes("다대맨"));
        const btn = [...h.container.querySelectorAll("button")].find((b) => b.textContent === ko["sim.watch.watch"]);
        expect(btn, h.container.textContent ?? "").toBeTruthy();
        click(btn!);
        expect(onWatch).toHaveBeenCalledWith("m-42");
    });

    it("onWatch 를 안 넘기면 게임 중인 방을 그리지 않는다(관전을 쓰지 않는 화면)", async () => {
        const h = mount({ rows: [], live: [liveCard()] });
        await settle(h, () => (h.container.textContent ?? "").includes(ko["sim.rooms.empty"]));
        expect(h.container.textContent ?? "").not.toContain("다대맨");
    });
});
