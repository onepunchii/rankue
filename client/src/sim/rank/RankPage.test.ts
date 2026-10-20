/**
 * RankPage 스모크(jsdom, QueryClientProvider, api 주입). 내 카드(티어·레이팅·순위 / 배치 중) · 목록 행·내 행 강조 · 나라로 나누지 않는다(순위표 하나) ·
 * 내 나라가 없으면 기기 언어로 한 번 저장.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
const authState: { member: { id: string; country: string | null } | null } = { member: { id: "me", country: "KR" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

import type { RankApi, RankLadder } from "./rankApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Mod = typeof import("./RankPage");
type RQ = typeof import("@tanstack/react-query");
let React: ReactMod; let createRoot: ClientMod["createRoot"]; let RankPage: Mod["RankPage"]; let rq: RQ; let dom: JSDOM;
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
    ({ RankPage } = await import("./RankPage"));
    rq = await import("@tanstack/react-query");
});
afterAll(() => { const g = globalThis as unknown as Record<string, unknown>; for (const k of globalsSet) delete g[k]; dom.window.close(); });
interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); authState.member = { id: "me", country: "KR" }; });

const ladder = (over: Partial<RankLadder> = {}): RankLadder => ({
    rows: [
        { memberId: "a", name: "고수", country: "KR", rating: 1480, matches: 20, wins: 15, rank: 1, countryRank: 1, dama: 24 },
        { memberId: "me", name: "나", country: "KR", rating: 1160, matches: 6, wins: 4, rank: 2, countryRank: 2, dama: 12 },
        { memberId: "c", name: "멕시코", country: "MX", rating: 1100, matches: 3, wins: 2, rank: 3, countryRank: 1, dama: null },
    ],
    total: 3, countries: [{ country: "KR", players: 2 }, { country: "MX", players: 1 }],
    me: { rating: 1160, matches: 6, wins: 4, country: "KR", rank: 2, countryRank: 2 }, ...over,
    combos: [{ gameType: "3c" as const, ranked: 3, myMatches: 6 }],
});
function mount(l: RankLadder) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const api: RankApi = { getLadder: vi.fn(async () => l), setCountry: vi.fn(async () => undefined) };
    React.act(() => { root.render(React.createElement(rq.QueryClientProvider, { client: qc }, React.createElement(RankPage, { onClose: () => undefined, api }))); });
    const h = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, api };
    live.push(h);
    return h;
}
async function settle(h: Harness, until: () => boolean): Promise<void> {
    for (let i = 0; i < 40 && !until(); i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(until(), h.container.textContent ?? "").toBe(true);
}
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const text = (h: Harness) => h.container.textContent ?? "";

describe("RankPage", () => {
    it("내 카드: 골드 배지 그림 · 1160 · #2 전체 3명 · 플래티넘까지 90점 · 일곱 등급 사다리, 목록 줄(1~3등 메달 · 등급 배지 그림)", async () => {
        const h = mount(ladder());
        await settle(h, () => text(h).includes("고수"));
        const me = h.container.querySelector("[data-testid=rank-me]")!;
        expect(me.textContent).toContain(ko["sim.rank.tier.gold"]);
        expect(me.querySelector("[data-rating]")!.textContent).toBe("1160");
        expect(me.textContent).toContain("#2 · 전체 3명");
        expect(me.textContent).toContain("플래티넘까지 90점");
        expect(me.textContent).not.toContain("KR #2");   // 나라 순위는 보이지 않는다(2026-10-12 통합)
        expect(me.textContent).toContain("4승 2패");
        // 2026-10-12 진열장 모양(오너: "B 로 가고 … 게임 느낌도 나고 진짜 소유욕이 들게끔") — 내 등급은 그림이다
        const srcs = (el: Element) => Array.from(el.querySelectorAll("img")).map((i) => i.getAttribute("src"));
        expect(srcs(me.querySelector(".hall-emblem")!)).toEqual(["/sim/rank/tier-gold.webp"]);
        // 사다리: 일곱 배지 — 지나온 등급(아이언~골드)은 밝고, 지금(골드)은 표시되고, 아직 못 얻은 등급은 어둡다(갖고 싶게)
        const steps = Array.from(me.querySelectorAll("[role=list] [role=listitem]"));
        expect(steps.map((x) => x.querySelector("img")!.getAttribute("src"))).toEqual(["iron", "bronze", "silver", "gold", "platinum", "diamond", "master"].map((t) => `/sim/rank/tier-${t}.webp`));
        const filt = steps.map((x) => (/filter:\s*([^;]+)/.exec(x.querySelector("img")!.getAttribute("style") ?? "")?.[1] ?? ""));
        expect(filt.map((f) => /grayscale/.test(f))).toEqual([false, false, false, false, true, true, true]);
        // 바로 다음 등급(플래티넘)은 덜 어둡다 — 손에 닿을 듯이. 그 뒤는 실루엣
        expect(filt[4]).toContain("grayscale(0.55)");
        expect(filt[5]).toContain("grayscale(1)");
        expect(steps.map((x) => x.getAttribute("aria-current"))).toEqual([null, null, null, "true", null, null, null]);
        expect(steps[3].querySelector("img")!.getAttribute("alt")).toBe(ko["sim.rank.tier.gold"]);
        // 목록: 1~3등은 메달(등수는 그림 위에 글자로), 줄마다 등급 배지 그림, 내 줄에 "나" 표시
        const rows = h.container.querySelectorAll("ol li");
        expect(rows).toHaveLength(3);
        expect(rows[0].textContent).toContain("고수");
        for (const r of Array.from(rows)) expect(r.className).toContain("hall-row-top");
        expect(srcs(rows[0])).toEqual(["/sim/rank/medal-1.webp", "/sim/rank/tier-master.webp", "/sim/rank/dama-online.svg"]);
        expect(srcs(rows[1])).toEqual(["/sim/rank/medal-2.webp", "/sim/rank/tier-gold.webp", "/sim/rank/dama-online.svg"]);
        expect(srcs(rows[2])).toEqual(["/sim/rank/medal-3.webp", "/sim/rank/tier-silver.webp", "/sim/rank/dama-online.svg"]);
        // 점수 옆 온라인 다마 육각(2026-10-20 오너 시안 B) — 기록이 모자라면 숫자 없는 회색 육각
        expect(Array.from(rows).map((r) => r.querySelector("[data-testid=online-dama]")?.getAttribute("data-target"))).toEqual(["24", "12", ""]);
        expect(rows[0].querySelector("[data-testid=online-dama]")?.getAttribute("aria-label")).toContain("24");
        expect(rows[1].className).toContain("hall-row-mine");
        expect(rows[1].getAttribute("aria-current")).toBe("true");
        expect(rows[1].textContent).toContain(ko["sim.rank.meMark"]);
        expect(rows[0].textContent).toContain(ko["sim.rank.tier.master"]);
        // 머리의 트로피
        expect(h.container.querySelector("header img")!.getAttribute("src")).toBe("/sim/rank/trophy.webp");
        expect(rows[2].textContent).toContain("🇲🇽");            // 국가는 국기로(콤팩트)
        expect(h.api.setCountry).not.toHaveBeenCalled(); // 내 나라가 이미 있다
    });

    it("나라로 나누지 않는다 — 범위 칩이 없고 늘 전체로 묻는다(종목 칩 → 4구도 전체)", async () => {
        // 2026-10-12 오너: "온라인대전 레이팅 랭킹 … 국가별인데 통합하는 건 어때?" — 순위에 오른 사람이 열 명 남짓이라 나라로 거르면 서너 명이 남았다
        const h = mount(ladder());
        await settle(h, () => text(h).includes("고수"));
        expect(h.container.querySelector(`[role=group][aria-label="${ko["sim.rank.scopeAria"]}"]`)).toBeNull();
        // 예전 범위 칩의 글자(전체 · 나라 고르기) — 문구도 사전에서 뺐다(2026-10-12)
        for (const label of ["전체", "나라 고르기"]) expect(Array.from(h.container.querySelectorAll("button, label")).some((b) => b.textContent?.trim() === label)).toBe(false);
        expect(ko["sim.rank.scopePick"]).toBeUndefined();
        expect((h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ gameType: "3c", country: null });
        // 다른 나라 사람도 같은 목록에 있다 — 국기로만 표시한다
        expect(h.container.querySelectorAll("ol li")).toHaveLength(3);
        const combos = h.container.querySelector(`[role=group][aria-label="${ko["sim.dash.filterAria"]}"]`)!;
        click(Array.from(combos.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === ko["sim.setup.type4c"])!);
        await settle(h, () => (h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
        expect((h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual({ gameType: "4c", country: null });
    });

    it("배치 전: '배치 중 1/3'·남은 판 안내, 내 나라 없으면 기기 언어로 저장, 빈 목록 안내", async () => {
        authState.member = { id: "me", country: null };
        // guessCountry 는 전역 navigator 를 본다(Node 의 navigator.language 는 en-US) — 이 테스트 동안만 es-MX
        const nav = globalThis.navigator as Navigator;
        const desc = Object.getOwnPropertyDescriptor(nav, "language");
        Object.defineProperty(nav, "language", { value: "es-MX", configurable: true });
        try {
        const h = mount(ladder({ rows: [], total: 0, countries: [], me: { rating: 1000, matches: 1, wins: 1, country: null, rank: null, countryRank: null } }));
        await settle(h, () => text(h).includes(ko["sim.rank.empty"]));
        expect(text(h)).toContain("배치 중 1/3");
        expect(text(h)).toContain("대전 2판을 더 마치면 랭킹에 올라요");
        expect(text(h)).toContain(ko["sim.rank.unrankedShort"]);
        // 배치 전에는 얻은 배지가 없다 — 내 카드는 어두운 실루엣, 사다리도 전부 어둡다
        const meImg = h.container.querySelector("[data-testid=rank-me] .hall-emblem img")!;
        expect(meImg.getAttribute("src")).toBe("/sim/rank/tier-iron.webp");
        expect(meImg.getAttribute("style")).toMatch(/grayscale/);
        expect(Array.from(h.container.querySelectorAll("[data-testid=rank-me] [role=listitem] img")).every((i) => /grayscale/.test(i.getAttribute("style") ?? ""))).toBe(true);
        expect(h.api.setCountry).toHaveBeenCalledWith("MX");
        // '내 나라' 고르기는 남아 있다(이름 옆 국기에 쓴다)
        expect(h.container.querySelector(`select[aria-label="${ko["sim.rank.countryChange"]}"]`)).not.toBeNull();
        } finally {
            if (desc) Object.defineProperty(nav, "language", desc); else delete (nav as unknown as Record<string, unknown>).language;
        }
    });
});

/**
 * [이달] [통산] 탭(2026-10-12 오너: "랭킹을 달로 해야겠지? … 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 * 통산 등급은 그대로 두고, 그 달에 올린 점수로 겨루는 '이달의 랭킹'을 따로 둔다.
 */
describe("RankPage: 이달 · 통산", () => {
    const NOW = Date.UTC(2026, 9, 12, 6);   // 한국 시각 2026-10-12 15시
    const monthly = (month: string): import("./rankApi").MonthlyRank => month === "2026-09"
        ? { month, minMatches: 5, rows: [{ memberId: "a", name: "고수", country: "KR", points: 94, matches: 13, wins: 12, rank: 1, tier: "master", dama: 24 }], total: 1, players: 4, me: { points: 0, matches: 0, wins: 0, rank: null, tier: "gold" }, months: ["2026-10", "2026-09"] }
        : {
            month, minMatches: 5, total: 2, players: 5, months: ["2026-10", "2026-09"],
            rows: [
                { memberId: "a", name: "고수", country: "KR", points: 47, matches: 9, wins: 7, rank: 1, tier: "master", dama: 24 },
                { memberId: "me", name: "나", country: "KR", points: -12, matches: 6, wins: 2, rank: 2, tier: "gold", dama: null },
            ],
            me: { points: -12, matches: 6, wins: 2, rank: 2, tier: "gold" },
        };
    function mountM(opts: { initialScope?: "month" | "all"; me?: import("./rankApi").MonthlyRank["me"]; onShelf?: (memberId?: string) => void } = {}) {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
        const getMonthly = vi.fn(async (q: { gameType: string; month?: string }) => { const m = monthly(q.month ?? "2026-10"); return opts.me ? { ...m, me: opts.me, rows: m.rows.filter((r) => r.memberId !== "me") } : m; });
        const api: RankApi = { getLadder: vi.fn(async () => ladder()), setCountry: vi.fn(async () => undefined), getMonthly };
        const realNow = Date.now;
        Date.now = () => NOW;
        React.act(() => { root.render(React.createElement(rq.QueryClientProvider, { client: qc }, React.createElement(RankPage, { onClose: () => undefined, api, initialScope: opts.initialScope, onShelf: opts.onShelf }))); });
        const h = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); Date.now = realNow; }, api, getMonthly };
        live.push(h);
        return h;
    }
    const tab = (h: Harness, k: "month" | "all") => h.container.querySelector(`[data-testid=rank-scope-${k}]`)!;

    it("처음은 이달 탭 — 이달 점수(부호) · 순위 · 전적, 목록의 점수는 +/− 로", async () => {
        const h = mountM();
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        expect(tab(h, "month").getAttribute("aria-selected")).toBe("true");
        expect(h.getMonthly).toHaveBeenCalledWith({ gameType: "3c", month: "2026-10" });
        const me = h.container.querySelector("[data-testid=rank-monthly-me]")!;
        expect(me.querySelector("[data-points]")!.textContent).toBe("−12");
        expect(me.textContent).toContain(ko["sim.rank.rankOf"].replace("{r}", "2").replace("{n}", "2"));
        expect(me.textContent).toContain("2승 4패");
        expect(me.textContent).toContain(ko["sim.rank.monthHint"]);
        const rows = h.container.querySelectorAll("[data-testid=rank-monthly] ol li");
        expect(Array.from(rows).map((r) => r.textContent)).toEqual([expect.stringContaining("+47"), expect.stringContaining("−12")]);
        expect(rows[1].className).toContain("hall-row-mine");
        // 이름 옆 배지는 통산 등급이다
        expect(Array.from(rows[0].querySelectorAll("img")).map((i) => i.getAttribute("src"))).toEqual(["/sim/rank/medal-1.webp", "/sim/rank/tier-master.webp", "/sim/rank/dama-online.svg"]);
        // 이달 탭에도 점수 옆 온라인 다마 육각(2026-10-20) — 나는 기록이 모자라 빈 육각
        expect(Array.from(rows).map((r) => r.querySelector("[data-testid=online-dama]")?.getAttribute("data-target"))).toEqual(["24", ""]);
        // 통산의 내 카드(레이팅)는 이 탭에 없다
        expect(h.container.querySelector("[data-testid=rank-me]")).toBeNull();
        expect(h.container.querySelector("[data-testid=rank-month-label]")!.textContent).toContain("2026");
        expect(text(h)).toContain(ko["sim.rank.monthDaysLeft"].replace("{n}", "20"));
    });

    it("통산 탭으로 바꾸면 예전의 레이팅 사다리 — initialScope=all 이면 처음부터", async () => {
        const h = mountM();
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        click(tab(h, "all"));
        await settle(h, () => h.container.querySelector("[data-testid=rank-me]") !== null);
        expect(h.container.querySelector("[data-testid=rank-monthly]")).toBeNull();
        expect(h.container.querySelector("[data-testid=rank-me] [data-rating]")!.textContent).toBe("1160");
        const h2 = mountM({ initialScope: "all" });
        await settle(h2, () => h2.container.querySelector("[data-testid=rank-me]") !== null);
        expect(tab(h2, "all").getAttribute("aria-selected")).toBe("true");
        expect(h2.getMonthly).not.toHaveBeenCalled();
    });

    it("그 달 5판 전에는 순위가 없다 — 남은 판 수를 말한다", async () => {
        const h = mountM({ me: { points: 24, matches: 3, wins: 3, rank: null, tier: null } });
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        const me = h.container.querySelector("[data-testid=rank-monthly-me]")!;
        expect(me.querySelector("[data-points]")!.textContent).toBe("+24");
        expect(me.textContent).toContain(ko["sim.rank.monthNeed"].replace("{n}", "3").replace("{m}", "5").replace("{left}", "2"));
        // 배치 전이면 배지가 없다(실루엣)
        expect(me.querySelector("img")!.getAttribute("style")).toContain("grayscale(1)");
    });

    it("지난 달로 넘겨 본다 — 마감된 달, 이번 달보다 뒤로는 못 간다", async () => {
        const h = mountM();
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        const btn = (label: string) => Array.from(h.container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === label) as HTMLButtonElement;
        expect(btn(ko["sim.rank.monthNext"]).disabled).toBe(true);
        click(btn(ko["sim.rank.monthPrev"]));
        // '마감된 달'은 달을 넘기자마자 뜬다 — 그 달의 답이 올 때까지 기다린다
        await settle(h, () => text(h).includes("+94"));
        expect(text(h)).toContain(ko["sim.rank.monthClosed"]);
        expect(h.getMonthly).toHaveBeenLastCalledWith({ gameType: "3c", month: "2026-09" });
        expect(text(h)).toContain(ko["sim.rank.monthPointsClosed"]);
        expect(text(h)).not.toContain(ko["sim.rank.monthHint"]);
        // 대전이 있었던 가장 옛 달이라 더 앞으로는 못 간다
        expect(btn(ko["sim.rank.monthPrev"]).disabled).toBe(true);
        expect(btn(ko["sim.rank.monthNext"]).disabled).toBe(false);
    });

    it("메달 그림은 장식장에 놓이는 메달과 같은 규칙 — 점수를 잃은 2등은 메달 대신 숫자", async () => {
        const h = mountM();
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        const rows = h.container.querySelectorAll("[data-testid=rank-monthly] ol li");
        // 2등이지만 −12 — 메달이 없다(등급 배지 그림만) · 줄의 금빛 강조도 없다
        expect(Array.from(rows[1].querySelectorAll("img")).map((i) => i.getAttribute("src"))).toEqual(["/sim/rank/tier-gold.webp", "/sim/rank/dama-online.svg"]);
        expect(rows[0].className).toContain("hall-row-top");
        expect(rows[1].className).not.toContain("hall-row-top");
        // 내 카드도 메달이 아니라 내 등급 배지
        expect(h.container.querySelector("[data-testid=rank-monthly-me] img")!.getAttribute("src")).toBe("/sim/rank/tier-gold.webp");
    });

    it("장식장으로: 내 카드의 줄은 내 장식장 · 순위표의 줄은 그 사람의 장식장 — onShelf 를 안 주면 입구가 없다", async () => {
        const onShelf = vi.fn();
        const h = mountM({ onShelf });
        await settle(h, () => h.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        click(h.container.querySelector("[data-testid=rank-monthly-shelf]")!);
        expect(onShelf).toHaveBeenLastCalledWith();
        const rowBtn = h.container.querySelector("[data-testid=rank-monthly] ol li button")!;
        expect(rowBtn.getAttribute("aria-label")).toBe(ko["sim.shelf.open"].replace("{name}", "고수"));
        click(rowBtn);
        expect(onShelf).toHaveBeenLastCalledWith("a");
        // 통산 탭도 같다
        click(tab(h, "all"));
        await settle(h, () => h.container.querySelector("[data-testid=rank-me]") !== null);
        click(h.container.querySelector("[data-testid=rank-shelf]")!);
        expect(onShelf).toHaveBeenLastCalledWith();
        const allRows = h.container.querySelectorAll("ol li");
        // 줄의 강조(1~3등 · 내 줄)는 그대로 li 에 있다
        expect(allRows[1].className).toContain("hall-row-mine");
        click(allRows[2].querySelector("button")!);
        expect(onShelf).toHaveBeenLastCalledWith("c");

        const plain = mountM();
        await settle(plain, () => plain.container.querySelector("[data-testid=rank-monthly-me]") !== null);
        expect(plain.container.querySelector("[data-testid=rank-monthly-shelf]")).toBeNull();
        expect(plain.container.querySelector("[data-testid=rank-monthly] ol li button")).toBeNull();
    });

    it("이달의 랭킹을 주지 않는 api(옛 주입)면 탭 없이 통산만", async () => {
        const h = mount(ladder());
        await settle(h, () => h.container.querySelector("[data-testid=rank-me]") !== null);
        expect(h.container.querySelector("[role=tablist]")).toBeNull();
    });
});
