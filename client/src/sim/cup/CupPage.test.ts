/**
 * CupPage 스모크(jsdom, QueryClientProvider, api 주입) — 월대회(2026-10-12).
 * 대회가 아직 없을 때(출전 조건만) · 치르는 중(내 경기: 기다리기 / 입장 / 대기 방 / 이어서 치기) · 끝난 뒤(메달) · 대진표의 칸.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

import type { CupApi, CupEntry, CupGameRow, CupMine, CupNow, CupReady, CupView } from "./cupApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Mod = typeof import("./CupPage");
type RQ = typeof import("@tanstack/react-query");
let React: ReactMod; let createRoot: ClientMod["createRoot"]; let CupPage: Mod["CupPage"]; let rq: RQ; let dom: JSDOM;
const globalsSet: string[] = [];
beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ CupPage } = await import("./CupPage"));
    rq = await import("@tanstack/react-query");
});
afterAll(() => { const g = globalThis as unknown as Record<string, unknown>; for (const k of globalsSet) delete g[k]; dom.window.close(); });

const NOW = Date.UTC(2026, 10, 1, 6);   // 한국 시각 11월 1일 15시
const DAY = 86_400_000;
const P = (i: number, over: Partial<CupEntry> = {}): CupEntry => ({ memberId: `p${i}`, name: `선수${i}`, country: "KR", tier: "silver", seed: i, rating: 1130 - i * 10, place: null, medal: null, forfeit: false, ...over });
const G = (kind: "main" | "third", round: number, slot: number, p1: string | null, p2: string | null, over: Partial<CupGameRow> = {}): CupGameRow =>
    ({ id: `${kind}-${round}-${slot}`, kind, round, slot, p1Id: p1, p2Id: p2, deadlineMs: NOW + round * 2 * DAY, p1Ready: false, p2Ready: false, winnerId: null, outcome: null, ...over });
/** 다섯 명 8강 — 1 · 2 · 3번 부전승, 나(4번)는 5번과 8강 */
const running = (mine: Partial<CupMine> = {}, games?: CupGameRow[]): CupNow => ({
    id: "cup1", month: "2026-10", gameType: "3c", status: "running", size: 8, rounds: 3,
    entries: [1, 2, 3, 4, 5].map((i) => P(i)),
    games: games ?? [
        G("main", 1, 0, "p1", null, { outcome: "bye", winnerId: "p1" }), G("main", 1, 1, "p4", "p5"), G("main", 1, 2, "p2", null, { outcome: "bye", winnerId: "p2" }), G("main", 1, 3, "p3", null, { outcome: "bye", winnerId: "p3" }),
        G("main", 2, 0, "p1", null), G("main", 2, 1, "p2", "p3"), G("main", 3, 0, null, null), G("third", 3, 0, null, null),
    ],
    mine: { gameId: "main-1-1", opponentId: "p5", waiting: false, deadlineMs: NOW + 2 * DAY - 3_600_000, iReady: false, opponentReady: false, matchId: null, matchStatus: null, hosting: false, ...mine },
});
const view = (cup: CupNow | null, me: Partial<CupView["next"]["me"]> = {}): CupView => ({
    nowMs: NOW, cup,
    next: {
        month: "2026-11", startsMs: Date.UTC(2026, 10, 30, 15), daysLeft: 30, minRating: 1000, minMatches: 5, maxEntrants: 16, roundDays: 2, size: 4,
        entrants: [1, 2, 3].map((i) => ({ ...P(i), matches: 6 })),
        me: { qualified: false, seed: null, rating: 1040, matches: 2, ...me },
    },
});

interface Harness { container: HTMLElement; unmount: () => void; qc: { invalidateQueries: () => Promise<void> }; get: ReturnType<typeof vi.fn>; ready: ReturnType<typeof vi.fn>; join: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; lobby: ReturnType<typeof vi.fn> }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });
function mount(data: CupView | Error | (() => CupView), readyAs: CupReady | Error = { matchId: "m1", state: "hosting" }) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const get = vi.fn(async () => { if (data instanceof Error) throw data; return typeof data === "function" ? data() : data; });
    const ready = vi.fn(async () => { if (readyAs instanceof Error) throw readyAs; return readyAs; });
    const join = vi.fn(async () => undefined);
    const api: CupApi = { get, ready, join };
    const open = vi.fn(), lobby = vi.fn();
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client: qc },
            React.createElement(CupPage, { onClose: () => undefined, api, onOpenMatch: open, onLobby: lobby, onRank: () => undefined, onShelf: () => undefined, pollMs: 0 })));
    });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, qc, get, ready, join, open, lobby };
    live.push(h);
    return h;
}
async function settle(h: Harness, until: () => boolean): Promise<void> {
    for (let i = 0; i < 40 && !until(); i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(until(), h.container.textContent ?? "").toBe(true);
}
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const q = (h: Harness, sel: string) => h.container.querySelector(sel);
const loaded = (h: Harness) => settle(h, () => q(h, "[data-testid=cup-next]") !== null);

describe("CupPage: 아직 대회가 없다 — 다음 대회의 출전 조건", () => {
    it("내 조건 두 가지(레이팅 · 이달 판 수)와 지금 이대로면 나가는 사람, 규칙 — 대진표는 없다", async () => {
        const h = mount(view(null));
        await loaded(h);
        expect(h.get).toHaveBeenCalledWith("3c");
        expect(q(h, "[data-testid=cup-bracket]")).toBeNull();
        expect(q(h, "[data-testid=cup-mine]")).toBeNull();
        const qual = q(h, "[data-testid=cup-qual]")!;
        expect(qual.getAttribute("data-qualified")).toBe("0");
        expect(qual.textContent).toContain(ko["sim.cup.qualNo"]);
        // 레이팅 1040 은 채웠고(✓), 이달 2판은 아직
        expect(Array.from(qual.querySelectorAll("li")).map((li) => li.getAttribute("data-ok"))).toEqual(["1", "0"]);
        expect(qual.textContent).toContain(ko["sim.cup.qualRating"].replace("{n}", "1000"));
        expect(qual.textContent).toContain(ko["sim.cup.qualMatchesNow"].replace("{n}", "2"));
        const ent = q(h, "[data-testid=cup-entrants]")!;
        expect(ent.querySelectorAll("ol li")).toHaveLength(3);
        expect(ent.textContent).toContain(ko["sim.cup.entrantsSize"].replace("{n}", "3").replace("{size}", "4"));
        expect(q(h, "[data-testid=cup-rules]")!.querySelectorAll("li")).toHaveLength(5);
        expect(q(h, "[data-testid=cup-rules]")!.textContent).toContain(ko["sim.cup.rule3"]);
    });

    it("조건을 채웠으면 시드와 함께 '출전해요' · 배치 전이면 레이팅 칸에 그렇게 적는다", async () => {
        const h = mount(view(null, { qualified: true, seed: 2, rating: 1104, matches: 7 }));
        await loaded(h);
        const qual = q(h, "[data-testid=cup-qual]")!;
        expect(qual.getAttribute("data-qualified")).toBe("1");
        expect(qual.textContent).toContain(ko["sim.cup.qualYes"].replace("{n}", "2"));
        expect(Array.from(qual.querySelectorAll("li")).map((li) => li.getAttribute("data-ok"))).toEqual(["1", "1"]);
        const fresh = mount(view(null, { rating: null, matches: 0 }));
        await loaded(fresh);
        expect(q(fresh, "[data-testid=cup-qual]")!.textContent).toContain(ko["sim.cup.qualRatingNone"]);
    });

    it("3명이 안 되면 대회가 열리지 않는다고 적는다 · 아무도 없으면 첫 시드를 권한다", async () => {
        const few = view(null); (few.next as { size: number }).size = 0; (few.next as { entrants: unknown[] }).entrants = few.next.entrants.slice(0, 2);
        const h = mount(few);
        await loaded(h);
        expect(q(h, "[data-testid=cup-entrants]")!.textContent).toContain(ko["sim.cup.entrantsFew"].replace("{n}", "2"));
        const none = view(null); (none.next as { size: number }).size = 0; (none.next as { entrants: unknown[] }).entrants = [];
        const h2 = mount(none);
        await loaded(h2);
        expect(q(h2, "[data-testid=cup-entrants]")!.textContent).toContain(ko["sim.cup.entrantsNone"]);
    });
});

describe("CupPage: 치르는 중 — 내 경기", () => {
    it("상대 · 기한 · 남은 시간 · '기다리기' — 누르면 방을 열고(기록이 남는다) 여기 남아 상대를 기다린다", async () => {
        const h = mount(view(running()));
        await loaded(h);
        expect(q(h, "[data-testid=cup-name]")!.textContent).toBe(ko["sim.cup.cupOf"].replace("{month}", "2026년 10월"));
        expect(q(h, "[data-testid=cup-status]")!.textContent).toBe(ko["sim.cup.statusRunning"]);
        const mine = q(h, "[data-testid=cup-mine]")!;
        expect(mine.textContent).toContain(`${ko["sim.cup.myGame"]} · ${ko["sim.cup.roundOf"].replace("{n}", "8")}`);
        expect(mine.textContent).toContain("선수5");
        expect(q(h, "[data-testid=cup-deadline]")!.textContent).toContain(ko["sim.cup.leftDays"].replace("{d}", "1").replace("{h}", "23"));
        const btn = q(h, "[data-testid=cup-ready]")!;
        expect(btn.textContent).toBe(ko["sim.cup.btnWait"]);
        click(btn);
        await settle(h, () => h.ready.mock.calls.length === 1);
        expect(h.ready).toHaveBeenCalledWith("main-1-1");
        expect(h.join).not.toHaveBeenCalled();
        expect(h.open).not.toHaveBeenCalled();
    });

    it("상대가 먼저 방을 열었다 — '입장하기'를 누르면 그 방에 들어가 판으로 간다", async () => {
        const h = mount(view(running({ opponentReady: true, matchId: "m9", matchStatus: "waiting", hosting: false })), { matchId: "m9", state: "join" });
        await loaded(h);
        expect(q(h, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.oppWaiting"]);
        const btn = q(h, "[data-testid=cup-ready]")!;
        expect(btn.textContent).toBe(ko["sim.cup.btnEnter"]);
        click(btn);
        await settle(h, () => h.open.mock.calls.length === 1);
        expect(h.join).toHaveBeenCalledWith("m9");
        expect(h.open).toHaveBeenCalledWith("m9");
    });

    it("내가 방을 열어 두었다 — '대기 방으로' · 치는 중이면 '이어서 치기'", async () => {
        const h = mount(view(running({ iReady: true, matchId: "m1", matchStatus: "waiting", hosting: true })));
        await loaded(h);
        expect(q(h, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.iWaiting"]);
        expect(q(h, "[data-testid=cup-ready]")).toBeNull();
        click(q(h, "[data-testid=cup-room]")!);
        expect(h.lobby).toHaveBeenCalledTimes(1);
        const p = mount(view(running({ iReady: true, opponentReady: true, matchId: "m1", matchStatus: "playing", hosting: true })));
        await loaded(p);
        expect(q(p, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.playing"]);
        click(q(p, "[data-testid=cup-go]")!);
        expect(p.open).toHaveBeenCalledWith("m1");
    });

    it("내가 열어 둔 방에 상대가 들어오면(대기 → 치는 중) 그 판으로 옮겨 간다", async () => {
        let state: CupView = view(running({ iReady: true, matchId: "m1", matchStatus: "waiting", hosting: true }));
        const h = mount(() => state);
        await loaded(h);
        expect(h.open).not.toHaveBeenCalled();
        state = view(running({ iReady: true, opponentReady: true, matchId: "m1", matchStatus: "playing", hosting: true }));
        // '기다리기'를 누른 것처럼 다시 읽게 한다(화면은 몇 초마다 스스로 읽는다 — 시험에서는 꺼 두었다)
        await React.act(async () => { await h.qc.invalidateQueries(); });
        await settle(h, () => h.open.mock.calls.length === 1);
        expect(h.open).toHaveBeenCalledWith("m1");
    });

    it("상대가 아직 안 정해졌으면(부전승 뒤) 기다린다고만 적는다 — 누를 것이 없다", async () => {
        const h = mount(view(running({ gameId: "main-2-0", opponentId: null, waiting: true })));
        await loaded(h);
        const mine = q(h, "[data-testid=cup-mine]")!;
        expect(mine.textContent).toContain(ko["sim.cup.vsWaiting"]);
        expect(mine.querySelector("button")).toBeNull();
    });

    it("들어갈 수 없으면(그 사이에 기한이 지났다) 그렇게 말한다", async () => {
        const h = mount(view(running()), new Error("409"));
        await loaded(h);
        click(q(h, "[data-testid=cup-ready]")!);
        await settle(h, () => q(h, "[data-testid=cup-ready-failed]") !== null);
        expect(q(h, "[data-testid=cup-ready-failed]")!.textContent).toBe(ko["sim.cup.readyFailed"]);
        expect(h.open).not.toHaveBeenCalled();
    });

    it("대진표: 결승부터 아래로 · 부전승은 상대 줄이 없다 · 내 판은 테두리 · 결과가 난 판은 이긴 사람이 굵다", async () => {
        const games = [
            G("main", 1, 0, "p1", null, { outcome: "bye", winnerId: "p1" }), G("main", 1, 1, "p4", "p5", { outcome: "walkover", winnerId: "p4" }),
            G("main", 1, 2, "p2", null, { outcome: "bye", winnerId: "p2" }), G("main", 1, 3, "p3", null, { outcome: "bye", winnerId: "p3" }),
            G("main", 2, 0, "p1", "p4"), G("main", 2, 1, "p2", "p3", { outcome: "played", winnerId: "p3" }), G("main", 3, 0, null, "p3"), G("third", 3, 0, null, "p2"),
        ];
        const h = mount(view(running({ gameId: "main-2-0", opponentId: "p1" }, games)));
        await loaded(h);
        const rows = Array.from(h.container.querySelectorAll("[data-testid=cup-bracket] li[data-game]"));
        expect(rows.map((r) => r.getAttribute("data-game"))).toEqual(["main:3:0", "third:3:0", "main:2:0", "main:2:1", "main:1:0", "main:1:1", "main:1:2", "main:1:3"]);
        const row = (k: string) => rows.find((r) => r.getAttribute("data-game") === k)!;
        expect(row("main:2:0").className).toContain("hall-row-mine");
        expect(row("main:1:0").textContent).toContain(ko["sim.cup.bye"]);
        expect(row("main:1:0").textContent).not.toContain(ko["sim.cup.tbd"]);
        expect(row("main:1:1").textContent).toContain(ko["sim.cup.walkover"]);
        expect(row("main:2:1").textContent).toContain(ko["sim.cup.win"]);
        // 아직 안 정해진 자리는 '미정'
        expect(row("main:3:0").textContent).toContain(ko["sim.cup.tbd"]);
        // 라운드 이름: 결승 · 3·4위전 · 준결승 · 8강
        const text = q(h, "[data-testid=cup-bracket]")!.textContent!;
        for (const k of ["sim.cup.final", "sim.cup.third", "sim.cup.semi"]) expect(text).toContain(ko[k]);
        expect(text).toContain(ko["sim.cup.roundOf"].replace("{n}", "8"));
    });
});

describe("CupPage: 끝난 대회 · 실패", () => {
    it("메달 받은 사람을 순위대로 — 기권으로 떨어진 사람은 없다 · 내 경기 칸은 없다", async () => {
        const cup: CupNow = {
            ...running(), status: "finished", mine: null,
            entries: [P(1, { place: 3, medal: 3 }), P(2, { place: 1, medal: 1 }), P(3, { place: 4, medal: 4 }), P(4, { place: 2, medal: 2 }), P(5, { place: 5, medal: null, forfeit: true })],
        };
        const h = mount(view(cup));
        await loaded(h);
        expect(q(h, "[data-testid=cup-status]")!.textContent).toBe(ko["sim.cup.statusFinished"]);
        expect(q(h, "[data-testid=cup-mine]")).toBeNull();
        const rows = Array.from(h.container.querySelectorAll("[data-testid=cup-result] li"));
        expect(rows.map((r) => r.getAttribute("data-medal"))).toEqual(["1", "2", "3", "4"]);
        expect(rows[0].textContent).toContain(ko["sim.cup.place1"]);
        expect(rows[0].textContent).toContain("선수2");
        expect(rows[0].querySelector("img")!.getAttribute("src")).toBe("/sim/rank/cup-1.webp");
        expect(q(h, "[data-testid=cup-result]")!.textContent).not.toContain("선수5");
    });

    it("못 불러오면 그렇게 말하고 다시 시도 단추를 둔다", async () => {
        const h = mount(new Error("500"));
        await settle(h, () => q(h, "[data-testid=cup-failed]") !== null);
        expect(q(h, "[data-testid=cup-failed]")!.textContent).toContain(ko["sim.cup.failed"]);
        expect(q(h, "[data-testid=cup-next]")).toBeNull();
        click(q(h, "[data-testid=cup-failed] button")!);
        await settle(h, () => h.get.mock.calls.length >= 2);
    });
});
