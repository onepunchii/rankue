/**
 * ShelfPage 스모크(jsdom, QueryClientProvider, api 주입) — 장식장(2026-10-12).
 * 주인 카드(지금 등급 · 모은 개수) · 이번 달(지금 끝난다면 받는 것) · 선반 둘(받은 것은 밝게 ×개수, 아직은 어둡게) · 월대회 자리 · 달마다.
 * 새로 받은 것 표시는 내 장식장에서만, 이 기기에서 마지막으로 본 달보다 뒤에 받은 것에.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

import type { Shelf, ShelfApi } from "./shelfApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Mod = typeof import("./ShelfPage");
type RQ = typeof import("@tanstack/react-query");
let React: ReactMod; let createRoot: ClientMod["createRoot"]; let ShelfPage: Mod["ShelfPage"]; let rq: RQ; let dom: JSDOM;
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
    ({ ShelfPage } = await import("./ShelfPage"));
    rq = await import("@tanstack/react-query");
});
afterAll(() => { const g = globalThis as unknown as Record<string, unknown>; for (const k of globalsSet) delete g[k]; dom.window.close(); });
interface Harness { container: HTMLElement; unmount: () => void; get: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; onRank: ReturnType<typeof vi.fn>; onPlay: ReturnType<typeof vi.fn> }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

const award = (month: string, over: Partial<Shelf["awards"][number]>): Shelf["awards"][number] =>
    ({ month, kind: "month_tier", gameType: "3c", rank: null, tier: "silver", points: 22, matches: 7, wins: 5, rating: 1116, ...over });
/** 11월 중순 — 10월 · 9월 것을 받은 사람(금메달 1 · 동메달 1 · 실버 배지 1 · 골드 배지 1) */
const shelf = (over: Partial<Shelf> = {}): Shelf => ({
    member: { id: "me", name: "최정환", country: "KR", mine: true },
    tier: { gameType: "3c", tier: "gold", rating: 1160 },
    awards: [
        award("2026-11", { kind: "month_rank", rank: 1, tier: null, points: 58 }),
        award("2026-11", { tier: "gold", rating: 1174 }),
        award("2026-10", { kind: "month_rank", rank: 3, tier: null, points: 22 }),
        award("2026-10", { tier: "silver", rating: 1116 }),
    ],
    current: { month: "2026-12", daysLeft: 17, minMatches: 5, boards: [{ gameType: "3c", points: 36, matches: 6, wins: 5, rank: 2, total: 4, medal: 2, tier: "gold" }, { gameType: "4c", points: 12, matches: 1, wins: 1, rank: null, total: 0, medal: null, tier: null }] },
    since: "2026-10", closedThrough: "2026-11", ...over,
});
function mount(data: Shelf | Error, opts: { memberId?: string; seenAt?: string; noNav?: boolean; onCup?: () => void } = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const get = vi.fn(async () => { if (data instanceof Error) throw data; return data; });
    const api: ShelfApi = { get };
    const write = vi.fn(); const onRank = vi.fn(); const onPlay = vi.fn();
    const seen = { read: () => opts.seenAt ?? "", write };
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client: qc },
            React.createElement(ShelfPage, { onClose: () => undefined, api, memberId: opts.memberId, seen, onCup: opts.onCup, ...(opts.noNav ? {} : { onRank, onPlay }) })));
    });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, get, write, onRank, onPlay };
    live.push(h);
    return h;
}
async function settle(h: Harness, until: () => boolean): Promise<void> {
    for (let i = 0; i < 40 && !until(); i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(until(), h.container.textContent ?? "").toBe(true);
}
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const q = (h: Harness, sel: string) => h.container.querySelector(sel);
const ready = (h: Harness) => settle(h, () => q(h, "[data-testid=shelf-owner]") !== null);
const srcs = (el: Element) => Array.from(el.querySelectorAll("img")).map((i) => i.getAttribute("src"));

describe("ShelfPage: 내 장식장", () => {
    it("주인 카드: 지금 등급 배지 · 이름 · 레이팅 · 모은 개수", async () => {
        const h = mount(shelf());
        await ready(h);
        expect(h.get).toHaveBeenCalledWith(undefined);
        const owner = q(h, "[data-testid=shelf-owner]")!;
        expect(srcs(owner)).toEqual(["/sim/rank/tier-gold.webp"]);
        expect(owner.textContent).toContain("최정환");
        expect(owner.textContent).toContain(ko["sim.rank.tier.gold"]);
        expect(owner.textContent).toContain("1160");
        expect(q(h, "[data-testid=shelf-counts]")!.textContent).toBe(ko["sim.shelf.counts"].replace("{m}", "2").replace("{b}", "2"));
    });

    it("선반: 받은 것은 개수와 함께 밝게, 아직 못 받은 것은 어둡게 — 메달 셋 · 등급 일곱이 늘 다 보인다", async () => {
        const h = mount(shelf());
        await ready(h);
        const medal = (r: number) => q(h, `[data-medal="${r}"]`)!;
        expect([1, 2, 3].map((r) => medal(r).getAttribute("data-count"))).toEqual(["1", "0", "1"]);
        // 받은 메달은 눌러 볼 수 있고, 못 받은 메달은 흐린 그림일 뿐이다
        expect(medal(1).querySelector("button")).not.toBeNull();
        expect(medal(2).querySelector("button")).toBeNull();
        expect(medal(2).innerHTML).toContain("opacity-30 grayscale");
        const tiers = Array.from(h.container.querySelectorAll("[data-tier]"));
        expect(tiers.map((e) => e.getAttribute("data-tier"))).toEqual(["iron", "bronze", "silver", "gold", "platinum", "diamond", "master"]);
        expect(tiers.map((e) => e.getAttribute("data-count"))).toEqual(["0", "0", "1", "1", "0", "0", "0"]);
        expect(q(h, '[data-tier="master"] img')!.getAttribute("style")).toContain("grayscale(1)");
        expect(q(h, '[data-tier="gold"] img')!.getAttribute("style")).not.toContain("grayscale");
    });

    it("선반의 것을 누르면 언제 받았는지가 나온다 — 다시 누르면 접힌다", async () => {
        const h = mount(shelf());
        await ready(h);
        expect(q(h, "[data-testid=shelf-detail]")).toBeNull();
        click(q(h, '[data-medal="1"] button')!);
        const d = q(h, "[data-testid=shelf-detail]")!;
        expect(d.textContent).toContain("2026년 11월");
        expect(d.textContent).toContain(ko["sim.shelf.rowMedal"].replace("{game}", "3쿠션").replace("{r}", "1").replace("{p}", "+58"));
        click(q(h, '[data-tier="silver"] button')!);
        expect(q(h, "[data-testid=shelf-detail]")!.textContent).toContain("2026년 10월");
        expect(q(h, "[data-testid=shelf-detail]")!.textContent).toContain("1116");
        click(q(h, '[data-tier="silver"] button')!);
        expect(q(h, "[data-testid=shelf-detail]")).toBeNull();
    });

    it("달마다: 최근 달부터, 그 달에 받은 것을 글과 그림으로", async () => {
        const h = mount(shelf());
        await ready(h);
        const rows = Array.from(h.container.querySelectorAll("[data-testid=shelf-months] ol li"));
        expect(rows.map((r) => r.getAttribute("data-month"))).toEqual(["2026-11", "2026-10"]);
        expect(srcs(rows[0])).toEqual(["/sim/rank/medal-1.webp", "/sim/rank/tier-gold.webp"]);
        expect(srcs(rows[1])).toEqual(["/sim/rank/medal-3.webp", "/sim/rank/tier-silver.webp"]);
        expect(rows[1].textContent).toContain(ko["sim.shelf.rowMedal"].replace("{game}", "3쿠션").replace("{r}", "3").replace("{p}", "+22"));
        expect(rows[1].textContent).toContain(ko["sim.shelf.rowBadge"].replace("{tier}", ko["sim.rank.tier.silver"]));
    });

    it("이번 달: 지금 끝난다면 받는 것은 흐리게(아직 받은 것이 아니다) · 5판 전인 종목은 남은 판 수", async () => {
        const h = mount(shelf());
        await ready(h);
        const now = q(h, "[data-testid=shelf-now]")!;
        expect(now.textContent).toContain("2026년 12월");
        expect(now.textContent).toContain(ko["sim.shelf.nowLeft"].replace("{n}", "17"));
        const [c3, c4] = Array.from(now.querySelectorAll("li"));
        expect(c3.textContent).toContain("+36");
        expect(c3.textContent).toContain(ko["sim.rank.rankOf"].replace("{r}", "2").replace("{n}", "4"));
        const preview = c3.querySelector("[data-testid=shelf-now-preview]")!;
        expect(preview.className).toContain("opacity-60");
        expect(preview.getAttribute("aria-label")).toBe(ko["sim.shelf.nowWill"]);
        expect(srcs(preview)).toEqual(["/sim/rank/medal-2.webp", "/sim/rank/tier-gold.webp"]);
        expect(c4.textContent).toContain(ko["sim.rank.monthNeed"].replace("{n}", "1").replace("{m}", "5").replace("{left}", "4"));
        expect(c4.querySelector("[data-testid=shelf-now-preview]")).toBeNull();
        click(q(h, "[data-testid=shelf-to-rank]")!);
        expect(h.onRank).toHaveBeenCalledTimes(1);
        click(q(h, "[data-testid=shelf-play]")!);
        expect(h.onPlay).toHaveBeenCalledTimes(1);
    });

    it("새로 받은 것: 이 기기에서 마지막으로 본 달보다 뒤의 것에만 표시하고, 본 것으로 적는다", async () => {
        const h = mount(shelf(), { seenAt: "2026-10" });
        await ready(h);
        // 11월의 금메달 · 골드 배지 · 달 줄 — 셋
        expect(h.container.querySelectorAll("[data-testid=shelf-new]")).toHaveLength(3);
        expect(q(h, '[data-medal="1"] [data-testid=shelf-new]')).not.toBeNull();
        expect(q(h, '[data-medal="3"] [data-testid=shelf-new]')).toBeNull();
        expect(q(h, '[data-month="2026-11"] [data-testid=shelf-new]')).not.toBeNull();
        expect(h.write).toHaveBeenCalledWith("2026-11");

        const seenAll = mount(shelf(), { seenAt: "2026-11" });
        await ready(seenAll);
        expect(seenAll.container.querySelector("[data-testid=shelf-new]")).toBeNull();
    });

    it("월대회 메달 선반: 다섯 가지(우승 · 준우승 · 3위 · 4위 · 8강) — 받은 것은 개수와 함께, 아직은 어둡게 · 어떻게 받는지 적는다", async () => {
        const h = mount(shelf());
        await ready(h);
        const cups = Array.from(h.container.querySelectorAll("[data-cup]"));
        expect(cups.map((e) => e.getAttribute("data-cup"))).toEqual(["1", "2", "3", "4", "5"]);
        expect(cups.map((e) => e.getAttribute("data-count"))).toEqual(["0", "0", "0", "0", "0"]);
        expect(q(h, '[data-cup="1"] img')!.getAttribute("src")).toBe("/sim/rank/cup-1.webp");
        expect(q(h, '[data-cup="1"] img')!.getAttribute("style")).toContain("grayscale(1)");
        expect(q(h, '[data-cup="1"] button')).toBeNull();
        expect(q(h, "[data-testid=shelf-cup-soon]")!.textContent).toBe(ko["sim.shelf.cupSoon"]);
        // 월대회로 가는 길은 onCup 을 줬을 때만
        expect(q(h, "[data-testid=shelf-to-cup]")).toBeNull();
    });

    it("월대회 메달을 받았으면: 선반에 밝게 놓이고, 모은 메달 수에 들어가고, 그 달의 줄에 적힌다", async () => {
        const onCup = vi.fn();
        const h = mount(shelf({ awards: [award("2026-11", { kind: "cup", rank: 3, tier: null }), ...shelf().awards] }), { seenAt: "2026-10", onCup });
        await ready(h);
        expect(q(h, '[data-cup="3"]')!.getAttribute("data-count")).toBe("1");
        expect(q(h, '[data-cup="3"] img')!.getAttribute("style")).not.toContain("grayscale");
        expect(q(h, '[data-cup="3"] [data-testid=shelf-new]')).not.toBeNull();
        expect(q(h, "[data-testid=shelf-cup-soon]")).toBeNull();
        // 메달 = 이달의 랭킹 메달 2 + 월대회 메달 1
        expect(q(h, "[data-testid=shelf-counts]")!.textContent).toBe(ko["sim.shelf.counts"].replace("{m}", "3").replace("{b}", "2"));
        const nov = q(h, '[data-month="2026-11"]')!;
        expect(nov.textContent).toContain(ko["sim.cup.rowMedal"].replace("{place}", ko["sim.cup.place3"]));
        expect(srcs(nov)).toEqual(["/sim/rank/cup-3.webp", "/sim/rank/medal-1.webp", "/sim/rank/tier-gold.webp"]);
        click(q(h, '[data-cup="3"] button')!);
        expect(q(h, "[data-testid=shelf-detail]")!.textContent).toContain("2026년 11월");
        click(q(h, "[data-testid=shelf-to-cup]")!);
        expect(onCup).toHaveBeenCalledTimes(1);
    });
});

describe("ShelfPage: 아직 빈 장식장 · 남의 장식장 · 실패", () => {
    it("마감된 달이 없으면 무엇이 언제 놓이는지 말한다 · 배치 전이면 배지가 없다(실루엣)", async () => {
        const h = mount(shelf({ tier: null, awards: [], closedThrough: null, current: { month: "2026-10", daysLeft: 20, minMatches: 5, boards: [] } }));
        await ready(h);
        expect(q(h, "[data-testid=shelf-owner] img")!.getAttribute("style")).toContain("grayscale(1)");
        expect(q(h, "[data-testid=shelf-owner]")!.textContent).toContain(ko["sim.rank.unrankedShort"]);
        expect(q(h, "[data-testid=shelf-counts]")!.textContent).toBe(ko["sim.shelf.counts"].replace("{m}", "0").replace("{b}", "0"));
        const months = q(h, "[data-testid=shelf-months]")!;
        expect(months.textContent).toContain(ko["sim.shelf.monthsEmpty"]);
        expect(months.textContent).toContain(ko["sim.shelf.monthsEmptyDesc"].replace("{month}", "2026년 10월"));
        expect(q(h, "[data-testid=shelf-now]")!.textContent).toContain(ko["sim.shelf.nowNone"]);
        // 선반에는 누를 것이 없다
        expect(h.container.querySelectorAll("[data-medal] button, [data-tier] button")).toHaveLength(0);
        expect(h.write).not.toHaveBeenCalled();
    });

    it("남의 장식장: 그 회원 id 로 묻고, '새로 받음' · 한 판 하기가 없고, 본 달을 적지 않는다", async () => {
        const h = mount(shelf({ member: { id: "a", name: "고수", country: "MX", mine: false } }), { memberId: "a", seenAt: "" });
        await ready(h);
        expect(h.get).toHaveBeenCalledWith("a");
        expect(q(h, "[data-testid=shelf-owner]")!.textContent).toContain("고수");
        expect(q(h, "[data-testid=shelf-owner]")!.textContent).not.toContain(ko["sim.rank.meMark"]);
        expect(q(h, "[data-testid=shelf-new]")).toBeNull();
        expect(q(h, "[data-testid=shelf-play]")).toBeNull();
        expect(q(h, "[data-testid=shelf-to-rank]")).not.toBeNull();
        expect(h.write).not.toHaveBeenCalled();
    });

    it("못 불러오면 그렇게 말하고 다시 시도 단추를 둔다 — 빈 선반을 그리지 않는다", async () => {
        const h = mount(new Error("404"));
        await settle(h, () => q(h, "[data-testid=shelf-failed]") !== null);
        expect(q(h, "[data-testid=shelf-failed]")!.textContent).toContain(ko["sim.shelf.failed"]);
        expect(q(h, "[data-testid=shelf-owner]")).toBeNull();
        expect(q(h, "[data-medal]")).toBeNull();
        click(q(h, "[data-testid=shelf-failed] button")!);
        await settle(h, () => h.get.mock.calls.length >= 2);
    });
});
