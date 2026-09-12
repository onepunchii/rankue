/**
 * RankPage 스모크(jsdom, QueryClientProvider, api 주입). 내 카드(티어·레이팅·순위 / 배치 중) · 목록 행·내 행 강조 · 범위 칩(내 나라 → country 파라미터) ·
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
        { memberId: "a", name: "고수", country: "KR", rating: 1480, matches: 20, wins: 15, rank: 1, countryRank: 1 },
        { memberId: "me", name: "나", country: "KR", rating: 1160, matches: 6, wins: 4, rank: 2, countryRank: 2 },
        { memberId: "c", name: "멕시코", country: "MX", rating: 1100, matches: 3, wins: 2, rank: 3, countryRank: 1 },
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
    it("내 카드: 골드 · 1160 · #2 전체 3명 · 플래티넘까지 90점 · KR #2, 리더보드 줄(1 금 · 2 하늘 · 3 산호)", async () => {
        const h = mount(ladder());
        await settle(h, () => text(h).includes("고수"));
        const me = h.container.querySelector("[data-testid=rank-me]")!;
        expect(me.textContent).toContain(ko["sim.rank.tier.gold"]);
        expect(me.querySelector("[data-rating]")!.textContent).toBe("1160");
        expect(me.textContent).toContain("#2 · 전체 3명");
        expect(me.textContent).toContain("플래티넘까지 90점");
        expect(me.textContent).toContain("KR #2");
        expect(me.textContent).toContain("4승 2패");
        // 리더보드: 순위마다 색이 다른 알약 줄(1 금 · 2 하늘 · 3 산호), 내 줄에 "나" 표시
        const rows = h.container.querySelectorAll("ol li");
        expect(rows).toHaveLength(3);
        expect(rows[0].textContent).toContain("고수");
        expect(rows[0].className).toContain("arc-row-1");
        expect(rows[1].className).toContain("arc-row-2");
        expect(rows[1].getAttribute("aria-current")).toBe("true");
        expect(rows[1].textContent).toContain(ko["sim.rank.meMark"]);
        expect(rows[2].className).toContain("arc-row-3");
        expect(rows[0].textContent).toContain(ko["sim.rank.tier.master"]);
        expect(rows[2].textContent).toContain("🇲🇽");            // 국가는 국기로(콤팩트)
        expect(h.api.setCountry).not.toHaveBeenCalled(); // 내 나라가 이미 있다
    });

    it("내 나라 칩 → country=KR 로 다시 조회, 종목 칩 → 4구", async () => {
        const h = mount(ladder());
        await settle(h, () => text(h).includes("고수"));
        const scope = h.container.querySelector(`[role=group][aria-label="${ko["sim.rank.scopeAria"]}"]`)!;
        click(Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.includes("내 나라"))!);
        await settle(h, () => (h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
        expect((h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual({ gameType: "3c", country: "KR" });
        const combos = h.container.querySelector(`[role=group][aria-label="${ko["sim.dash.filterAria"]}"]`)!;
        click(Array.from(combos.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === ko["sim.setup.type4c"])!);
        await settle(h, () => (h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls.length >= 3);
        expect((h.api.getLadder as ReturnType<typeof vi.fn>).mock.calls[2][0]).toMatchObject({ gameType: "4c", country: "KR" });
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
        expect(h.api.setCountry).toHaveBeenCalledWith("MX");
        const mine = Array.from(h.container.querySelectorAll("button")).find((b) => b.textContent === ko["sim.rank.countryUnset"]) as HTMLButtonElement;
        expect(mine.disabled).toBe(true);
        } finally {
            if (desc) Object.defineProperty(nav, "language", desc); else delete (nav as unknown as Record<string, unknown>).language;
        }
    });
});
