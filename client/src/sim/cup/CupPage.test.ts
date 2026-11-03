/**
 * CupPage 스모크(jsdom, QueryClientProvider, api 주입) — 월대회(2026-10-12 · 2026-11-03 운영자가 여는 대회).
 * 대회가 아직 없을 때(추천 조건만) · 치르는 중(내 경기: 경기 시각 / 입장 / 대기실 / 진행 중인 판 묻기 / 이어서 치기) · 끝난 뒤(메달) · 대진표의 칸(시각 · 관전).
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
    ({ id: `${kind}-${round}-${slot}`, kind, round, slot, p1Id: p1, p2Id: p2, scheduledMs: NOW + round * DAY, p1Ready: false, p2Ready: false, winnerId: null, outcome: null, matchId: null, matchStatus: null, ...over });
/** 다섯 명 8강 — 1 · 2 · 3번 부전승, 나(4번)는 5번과 8강. 경기는 이틀 뒤 14시(한국) — 아직 입장 시간 전 */
const running = (mine: Partial<CupMine> = {}, games?: CupGameRow[]): CupNow => ({
    id: "cup1", month: "2026-10", gameType: "3c", status: "running", size: 8, rounds: 3,
    entries: [1, 2, 3, 4, 5].map((i) => P(i)),
    games: games ?? [
        G("main", 1, 0, "p1", null, { outcome: "bye", winnerId: "p1" }), G("main", 1, 1, "p4", "p5"), G("main", 1, 2, "p2", null, { outcome: "bye", winnerId: "p2" }), G("main", 1, 3, "p3", null, { outcome: "bye", winnerId: "p3" }),
        G("main", 2, 0, "p1", null), G("main", 2, 1, "p2", "p3"), G("main", 3, 0, null, null), G("third", 3, 0, null, null),
    ],
    mine: { gameId: "main-1-1", opponentId: "p5", waiting: false, scheduledMs: NOW + 2 * DAY - 3_600_000, window: "early", iReady: false, opponentReady: false, opponentPresent: false, matchId: null, matchStatus: null, ...mine },
});
const view = (cup: CupNow | null, me: Partial<CupView["next"]["me"]> = {}): CupView => ({
    nowMs: NOW, cup,
    next: {
        month: "2026-11", daysLeft: 30, minRating: 1000, minMatches: 5, maxEntrants: 16, enterEarlyMin: 10, noShowMin: 15, size: 4,
        entrants: [1, 2, 3].map((i) => ({ ...P(i), matches: 6 })),
        me: { qualified: false, seed: null, rating: 1040, matches: 2, ...me },
    },
});

interface Harness { container: HTMLElement; unmount: () => void; qc: { invalidateQueries: () => Promise<void> }; get: ReturnType<typeof vi.fn>; ready: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; watch: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });
type ReadyAs = CupReady | Error | ((gameId: string, opts?: { forfeitPlaying?: boolean }) => CupReady);
function mount(data: CupView | Error | (() => CupView), readyAs: ReadyAs = { state: "waiting", opponentReady: false }, confirmAs = true) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const get = vi.fn(async () => { if (data instanceof Error) throw data; return typeof data === "function" ? data() : data; });
    const ready = vi.fn(async (gameId: string, opts?: { forfeitPlaying?: boolean }) => { if (readyAs instanceof Error) throw readyAs; return typeof readyAs === "function" ? readyAs(gameId, opts) : readyAs; });
    const api: CupApi = { get, ready };
    const open = vi.fn(), watch = vi.fn(), confirm = vi.fn(async () => confirmAs);
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client: qc },
            React.createElement(CupPage, { onClose: () => undefined, api, onOpenMatch: open, onWatch: watch, confirmForfeit: confirm, onRank: () => undefined, onShelf: () => undefined, pollMs: 0 })));
    });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, qc, get, ready, open, watch, confirm };
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
/** 서버가 409 에 실어 보내는 모양(apiRequest 가 던지는 것) */
const http409 = (code: string) => Object.assign(new Error("409"), { data: { code } });

describe("CupPage: 아직 대회가 없다 — 다음 대회의 추천 조건", () => {
    it("내 조건 두 가지(레이팅 · 이달 판 수)와 지금 이대로면 추천되는 사람, 규칙 — 대진표는 없다", async () => {
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
        // 규칙 여섯 줄 — 입장 10분 전 · 15분 뒤 기권 · 관전
        const rules = q(h, "[data-testid=cup-rules]")!;
        expect(rules.querySelectorAll("li")).toHaveLength(6);
        expect(rules.textContent).toContain(ko["sim.cup.rule2"].replace("{e}", "10"));
        expect(rules.textContent).toContain(ko["sim.cup.rule3"].replace("{m}", "15"));
        expect(rules.textContent).toContain(ko["sim.cup.rule6"]);
        expect(rules.textContent).not.toMatch(/이틀|\{/);
    });

    it("조건을 채웠으면 시드와 함께 '추천돼요' · 배치 전이면 레이팅 칸에 그렇게 적는다", async () => {
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

    it("3명이 안 되면 그렇게 적는다 · 아무도 없으면 없다고만", async () => {
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
    it("입장 시간 전: 상대 · 경기 시각 · 남은 시간 — '입장하기'는 잠겨 있고 몇 분 전부터인지 적는다", async () => {
        const h = mount(view(running()));
        await loaded(h);
        expect(q(h, "[data-testid=cup-name]")!.textContent).toBe(ko["sim.cup.cupOf"].replace("{month}", "2026년 10월"));
        expect(q(h, "[data-testid=cup-status]")!.textContent).toBe(ko["sim.cup.statusRunning"]);
        const mine = q(h, "[data-testid=cup-mine]")!;
        expect(mine.getAttribute("data-window")).toBe("early");
        expect(mine.textContent).toContain(`${ko["sim.cup.myGame"]} · ${ko["sim.cup.roundOf"].replace("{n}", "8")}`);
        expect(mine.textContent).toContain("선수5");
        expect(q(h, "[data-testid=cup-when]")!.textContent).toContain(ko["sim.cup.leftDays"].replace("{d}", "1").replace("{h}", "23"));
        const btn = q(h, "[data-testid=cup-enter]") as HTMLButtonElement;
        expect(btn.textContent).toBe(ko["sim.cup.btnEnter"]);
        expect(btn.disabled).toBe(true);
        expect(mine.textContent).toContain(ko["sim.cup.enterSoon"].replace("{n}", "10"));
        expect(mine.textContent).toContain(ko["sim.cup.readyHint"].replace("{e}", "10").replace("{m}", "15"));
    });

    it("시각이 아직 없으면 운영자가 정한다고만 — 누를 것이 없다", async () => {
        const h = mount(view(running({ scheduledMs: null, window: "unscheduled" })));
        await loaded(h);
        expect(q(h, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.unscheduled"]);
        expect(q(h, "[data-testid=cup-when]")).toBeNull();
        expect(q(h, "[data-testid=cup-mine]")!.querySelector("button")).toBeNull();
    });

    it("입장 시간: '입장하기' → 대기실(상대 접속 표시 · 나가기) — 판이 열리면 그 판으로 옮겨 간다", async () => {
        let state: CupView = view(running({ window: "open", scheduledMs: NOW + 5 * 60_000 }));
        const h = mount(() => state);
        await loaded(h);
        expect(q(h, "[data-testid=cup-when]")!.textContent).toContain(ko["sim.cup.enterOpen"].replace("{n}", "15"));
        click(q(h, "[data-testid=cup-enter]")!);
        await settle(h, () => q(h, "[data-testid=cup-room]") !== null);
        expect(h.ready).toHaveBeenCalledWith("main-1-1");
        expect(q(h, "[data-testid=cup-opp-presence]")!.getAttribute("data-present")).toBe("0");
        expect(q(h, "[data-testid=cup-room]")!.textContent).toContain(ko["sim.cup.oppOffline"]);
        expect(h.open).not.toHaveBeenCalled();
        // 상대가 들어와 서버가 판을 열었다(화면은 몇 초마다 스스로 읽는다 — 시험에서는 꺼 두었다)
        state = view(running({ window: "open", scheduledMs: NOW + 5 * 60_000, iReady: true, opponentReady: true, opponentPresent: true, matchId: "m1", matchStatus: "playing" }));
        await React.act(async () => { await h.qc.invalidateQueries(); });
        await settle(h, () => h.open.mock.calls.length === 1);
        expect(h.open).toHaveBeenCalledWith("m1");
    });

    it("대기실에서 나가면 입장 단추로 돌아간다", async () => {
        const h = mount(view(running({ window: "open" })));
        await loaded(h);
        click(q(h, "[data-testid=cup-enter]")!);
        await settle(h, () => q(h, "[data-testid=cup-room]") !== null);
        click(q(h, "[data-testid=cup-leave]")!);
        await settle(h, () => q(h, "[data-testid=cup-room]") === null && q(h, "[data-testid=cup-enter]") !== null);
    });

    it("상대가 대기실에 있으면 그렇게 알리고, 누르면 서버가 연 판으로 바로 간다", async () => {
        const h = mount(view(running({ window: "open", opponentReady: true, opponentPresent: true })), { state: "playing", matchId: "m9" });
        await loaded(h);
        expect(q(h, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.oppPresent"]);
        click(q(h, "[data-testid=cup-enter]")!);
        await settle(h, () => h.open.mock.calls.length === 1);
        expect(h.open).toHaveBeenCalledWith("m9");
        expect(q(h, "[data-testid=cup-room]")).toBeNull();
    });

    it("진행 중인 다른 판이 있으면 묻고, 고르면 기권하고 들어간다 · 안 고르면 그대로", async () => {
        const answer = (_id: string, opts?: { forfeitPlaying?: boolean }): CupReady => { if (!opts?.forfeitPlaying) throw http409("HAS_PLAYING"); return { state: "waiting", opponentReady: false }; };
        const h = mount(view(running({ window: "open" })), answer);
        await loaded(h);
        click(q(h, "[data-testid=cup-enter]")!);
        await settle(h, () => q(h, "[data-testid=cup-room]") !== null);
        expect(h.confirm).toHaveBeenCalledTimes(1);
        expect(h.ready.mock.calls.map((c) => c[1])).toEqual([undefined, { forfeitPlaying: true }]);
        const no = mount(view(running({ window: "open" })), answer, false);
        await loaded(no);
        click(q(no, "[data-testid=cup-enter]")!);
        await settle(no, () => no.confirm.mock.calls.length === 1 && q(no, "[data-testid=cup-ready-failed]") !== null);
        expect(no.ready).toHaveBeenCalledTimes(1);
        expect(q(no, "[data-testid=cup-room]")).toBeNull();
    });

    it("치는 중이면 '이어서 치기' · 입장 시간이 지났으면 판정을 기다린다고만", async () => {
        const p = mount(view(running({ window: "open", iReady: true, opponentReady: true, matchId: "m1", matchStatus: "playing" })));
        await loaded(p);
        expect(q(p, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.playing"]);
        click(q(p, "[data-testid=cup-go]")!);
        expect(p.open).toHaveBeenCalledWith("m1");
        const c = mount(view(running({ window: "closed", scheduledMs: NOW - 20 * 60_000 })));
        await loaded(c);
        expect(q(c, "[data-testid=cup-state]")!.textContent).toBe(ko["sim.cup.closedWait"]);
        expect(q(c, "[data-testid=cup-enter]")).toBeNull();
    });

    it("상대가 아직 안 정해졌으면(부전승 뒤) 기다린다고만 적는다 — 누를 것이 없다", async () => {
        const h = mount(view(running({ gameId: "main-2-0", opponentId: null, waiting: true })));
        await loaded(h);
        const mine = q(h, "[data-testid=cup-mine]")!;
        expect(mine.textContent).toContain(ko["sim.cup.vsWaiting"]);
        expect(mine.querySelector("button")).toBeNull();
    });

    it("들어갈 수 없으면 까닭대로 말한다 — 입장 시간 전 · 지났다 · 그 밖", async () => {
        for (const [err, key] of [[http409("CUP_CLOSED"), "sim.cup.closedWait"], [http409("CUP_EARLY"), "sim.cup.enterSoon"], [new Error("500"), "sim.cup.readyFailed"]] as const) {
            const h = mount(view(running({ window: "open" })), err);
            await loaded(h);
            click(q(h, "[data-testid=cup-enter]")!);
            await settle(h, () => q(h, "[data-testid=cup-ready-failed]") !== null);
            expect(q(h, "[data-testid=cup-ready-failed]")!.textContent).toBe(ko[key].replace("{n}", "10"));
            expect(h.open).not.toHaveBeenCalled();
        }
    });

    it("대진표: 결승부터 아래로 · 부전승은 상대 줄이 없다 · 내 판은 테두리 · 경기 시각 · 시작된 판은 '관전'", async () => {
        const games = [
            G("main", 1, 0, "p1", null, { outcome: "bye", winnerId: "p1" }), G("main", 1, 1, "p4", "p5", { outcome: "walkover", winnerId: "p4" }),
            G("main", 1, 2, "p2", null, { outcome: "bye", winnerId: "p2" }), G("main", 1, 3, "p3", null, { outcome: "bye", winnerId: "p3" }),
            G("main", 2, 0, "p1", "p4", { scheduledMs: null }), G("main", 2, 1, "p2", "p3", { matchId: "m7", matchStatus: "playing" }), G("main", 3, 0, null, null), G("third", 3, 0, null, null),
        ];
        const h = mount(view(running({ gameId: "main-2-0", opponentId: "p1", scheduledMs: null, window: "unscheduled" }, games)));
        await loaded(h);
        const rows = Array.from(h.container.querySelectorAll("[data-testid=cup-bracket] li[data-game]"));
        expect(rows.map((r) => r.getAttribute("data-game"))).toEqual(["main:3:0", "third:3:0", "main:2:0", "main:2:1", "main:1:0", "main:1:1", "main:1:2", "main:1:3"]);
        const row = (k: string) => rows.find((r) => r.getAttribute("data-game") === k)!;
        expect(row("main:2:0").className).toContain("hall-row-mine");
        expect(row("main:2:0").textContent).toContain(ko["sim.cup.unscheduledShort"]);
        expect(row("main:1:0").textContent).toContain(ko["sim.cup.bye"]);
        expect(row("main:1:0").textContent).not.toContain(ko["sim.cup.tbd"]);
        expect(row("main:1:1").textContent).toContain(ko["sim.cup.walkover"]);
        // 치는 중인 판 — 누구나 관전
        expect(row("main:2:1").textContent).toContain(ko["sim.cup.playing"]);
        click(row("main:2:1").querySelector("[data-testid=cup-watch]")!);
        expect(h.watch).toHaveBeenCalledWith("m7");
        expect(row("main:2:0").querySelector("[data-testid=cup-watch]")).toBeNull();
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
