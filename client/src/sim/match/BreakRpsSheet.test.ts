/**
 * 선구 가위바위보 화면(2026-11-04, 시안 reports/sim-rps-mockup-1104.png) — 고르기 · 냈어요 · 공개(이김/짐) · 비김 · 3초 뒤 닫기.
 * 서버 응답의 모양(parseBreakRpsView)도 여기서 같이 본다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

import type { BreakRpsView } from "@shared/sim/breakRps";
import { BREAK_RPS_PICK_MS, BREAK_RPS_RESULT_MS } from "@shared/sim/breakRps";
import { parseBreakRpsView } from "../matchApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Mod = typeof import("./BreakRpsSheet");
let React: ReactMod; let createRoot: ClientMod["createRoot"]; let BreakRpsSheet: Mod["BreakRpsSheet"]; let dom: JSDOM;
const globalsSet: string[] = [];
beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "Element", "Node", "Text", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ BreakRpsSheet } = await import("./BreakRpsSheet"));
});
afterAll(() => { const g = globalThis as unknown as Record<string, unknown>; for (const k of globalsSet) delete g[k]; dom.window.close(); });

const NOW = 1_800_000_000_000;
const base: BreakRpsView = { round: 1, deadlineMs: NOW + 17_000, myPick: null, opponentPicked: false, last: null, winner: null, by: null, decidedMs: null };
const live: { unmount: () => void }[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

function mount(rps: BreakRpsView, opts: { now?: () => number; pick?: boolean } = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPick = vi.fn(async () => opts.pick ?? true);
    const onDone = vi.fn();
    const render = (r: BreakRpsView) => React.act(() => {
        root.render(React.createElement(BreakRpsSheet, { rps: r, myName: "나", opponentName: "cem.degerli", isHost: true, serverOffsetMs: 0, onPick, onDone, now: opts.now ?? (() => NOW) }));
    });
    render(rps);
    live.push({ unmount: () => { React.act(() => root.unmount()); container.remove(); } });
    const q = (sel: string) => container.querySelector(sel);
    return { container, q, onPick, onDone, render };
}
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });

describe("선구 가위바위보 화면", () => {
    it("고르기: 가위 · 바위 · 보 · 남은 초 · 상대는 '고르는 중' · 상대 손은 가려져 있다", () => {
        const h = mount(base);
        expect(h.q("[data-testid=break-rps]")!.getAttribute("data-state")).toBe("picking");
        expect(["scissors", "rock", "paper"].map((k) => h.q(`[data-testid=rps-pick-${k}]`)!.textContent)).toEqual([ko["sim.rps.scissors"], ko["sim.rps.rock"], ko["sim.rps.paper"]]);
        expect(h.q("[data-testid=rps-timer]")!.textContent).toBe("17");
        expect(h.container.textContent).toContain(ko["sim.rps.picking"]);
        expect(h.q("[data-testid=rps-opp]")!.textContent).toBe("?");
        expect(h.container.textContent).toContain(ko["sim.rps.noteFirst"].replace("{n}", String(BREAK_RPS_PICK_MS / 1000)));
        expect(h.container.textContent).toContain(ko["sim.rps.host"]);
    });

    it("누르면 바로 내 손이 켜지고 나머지는 잠긴다 — 서버에 한 번 보낸다", async () => {
        const h = mount(base);
        click(h.q("[data-testid=rps-pick-rock]")!);
        expect(h.onPick).toHaveBeenCalledWith("rock");
        expect(h.q("[data-testid=rps-pick-rock]")!.getAttribute("aria-pressed")).toBe("true");
        expect((h.q("[data-testid=rps-pick-paper]") as HTMLButtonElement).disabled).toBe(true);
        expect(h.q("[data-testid=rps-mine]")!.getAttribute("data-hand")).toBe("rock");
        expect(h.container.textContent).toContain(ko["sim.rps.noteWait"]);
        click(h.q("[data-testid=rps-pick-paper]")!);
        expect(h.onPick).toHaveBeenCalledTimes(1);
    });

    it("상대가 냈으면 '냈어요' — 손은 여전히 가려져 있다", () => {
        const h = mount({ ...base, opponentPicked: true });
        expect(h.container.textContent).toContain(ko["sim.rps.picked"]);
        expect(h.q("[data-testid=rps-opp]")!.textContent).toBe("?");
    });

    it("이겼을 때: 두 손 공개 · 내 손에 초록 테두리 · '이겼어요! 내가 초구' · 3초 뒤 닫는다", async () => {
        let t = NOW;
        const won: BreakRpsView = { ...base, winner: "me", by: "rps", decidedMs: NOW, last: { round: 1, mine: "rock", theirs: "scissors" } };
        const h = mount(won, { now: () => t });
        expect(h.q("[data-testid=break-rps]")!.getAttribute("data-state")).toBe("won");
        expect(h.q("[data-testid=rps-mine]")!.getAttribute("data-hand")).toBe("rock");
        expect(h.q("[data-testid=rps-mine]")!.className).toContain("border-[#64dd17]");
        expect(h.q("[data-testid=rps-opp]")!.getAttribute("data-hand")).toBe("scissors");
        const result = h.q("[data-testid=rps-result]")!.textContent!;
        expect(result).toContain(ko["sim.rps.winTitle"]);
        expect(result).toContain(ko["sim.rps.beat"].replace("{a}", ko["sim.rps.rock"]).replace("{b}", ko["sim.rps.scissors"]));
        expect(h.q("[data-testid=rps-timer]")).toBeNull();
        expect(h.onDone).not.toHaveBeenCalled();
        t = NOW + BREAK_RPS_RESULT_MS;
        await React.act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        expect(h.onDone).toHaveBeenCalledTimes(1);
    });

    it("졌을 때: 회색 띠 '상대가 초구를 쳐요' · 시간 안에 안 내서 정해졌으면 그 까닭", () => {
        const lost = mount({ ...base, winner: "opponent", by: "rps", decidedMs: NOW, last: { round: 1, mine: "scissors", theirs: "rock" } });
        expect(lost.q("[data-testid=break-rps]")!.getAttribute("data-state")).toBe("lost");
        expect(lost.q("[data-testid=rps-result]")!.textContent).toContain(ko["sim.rps.oppFirst"]);
        expect(lost.q("[data-testid=rps-result]")!.className).not.toContain("bg-[#64dd17]");
        const late = mount({ ...base, winner: "me", by: "timeout", decidedMs: NOW });
        expect(late.q("[data-testid=rps-result]")!.textContent).toContain(ko["sim.rps.meFirst"]);
        expect(late.q("[data-testid=rps-result]")!.textContent).toContain(ko["sim.rps.byTimeoutMe"]);
    });

    it("비겼을 때: 같은 손을 노란 테두리로 보여 주고 '한 번 더' — 그동안은 누를 것이 없다", () => {
        const tie: BreakRpsView = { ...base, round: 2, deadlineMs: NOW + BREAK_RPS_PICK_MS + 1000, last: { round: 1, mine: "paper", theirs: "paper" } };
        const h = mount(tie);
        expect(h.q("[data-testid=break-rps]")!.getAttribute("data-state")).toBe("tie");
        expect(h.q("[data-testid=rps-tie]")!.textContent).toContain(ko["sim.rps.tie"]);
        expect(h.q("[data-testid=rps-tie]")!.textContent).toContain(ko["sim.rps.tieSub"].replace("{a}", ko["sim.rps.paper"]));
        expect(h.q("[data-testid=rps-pick-rock]")).toBeNull();
        // 보여 주는 시간이 지나면 다시 고르기
        h.render({ ...tie, deadlineMs: NOW + BREAK_RPS_PICK_MS - 1000 });
        expect(h.q("[data-testid=break-rps]")!.getAttribute("data-state")).toBe("picking");
    });
});

describe("서버 응답 읽기(parseBreakRpsView)", () => {
    it("보는 사람 기준 모양을 그대로 · 모르는 손 · 모양이 틀리면 버린다", () => {
        expect(parseBreakRpsView({ round: 2, deadlineMs: 5, myPick: "rock", opponentPicked: true, last: { round: 1, mine: "paper", theirs: "paper" }, winner: null, by: null, decidedMs: null }))
            .toEqual({ round: 2, deadlineMs: 5, myPick: "rock", opponentPicked: true, last: { round: 1, mine: "paper", theirs: "paper" }, winner: null, by: null, decidedMs: null });
        expect(parseBreakRpsView({ round: 1, deadlineMs: 5, myPick: "gun", winner: "me", by: "rps", decidedMs: 9 })).toMatchObject({ myPick: null, winner: "me", by: "rps", decidedMs: 9, last: null });
        expect(parseBreakRpsView(null)).toBeNull();
        expect(parseBreakRpsView({ round: "1" })).toBeNull();
    });
});
