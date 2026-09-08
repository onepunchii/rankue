/**
 * TopBar 스모크(jsdom 직접 기동 — ToolRail.test 와 같은 방식, 앱 모듈은 vi.mock).
 * 1인: 점수/다마수 · "이닝 n · 에버 x.xx" 와 연습 칩(이름 없음) · 2인(대전): 두 선수 요약 + 차례 점(sr-only "차례") · 드릴: 드릴 이름 ·
 * 뒤로(onBack)는 넘길 때만 · 요약을 누르면 onSummary · 승자는 gold.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";
import { createSession } from "@shared/sim/rules";
import { buildConfig } from "../setupPresets";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type BarMod = typeof import("./TopBar");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let TopBar: BarMod["TopBar"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "MouseEvent", "getComputedStyle",
        "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ TopBar } = await import("./TopBar"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

function mount(props: BarMod["TopBarProps"]): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(React.createElement(TopBar, props)); });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); } };
    live.push(h);
    return h;
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const byLabel = (h: Harness, label: string) => Array.from(h.container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === label) ?? null;

const config = buildConfig({ gameType: "3c", target: 15 });
const base = (): Omit<BarMod["TopBarProps"], "session"> => ({
    config, phase: "aim", names: ["나", "상대"], record: false, offline: false, syncing: false, queued: 0, onSummary: () => undefined,
});

describe("TopBar", () => {
    it("1인: 규칙·테이블 배지, 연습 칩, 점수/다마수 · 이닝 · 에버(이름은 없다 — 360 px 에서 잘렸다) — 요약을 누르면 onSummary", () => {
        const onSummary = vi.fn();
        const session = createSession({ rules: config.rules, players: [{ id: "p1", target: 15 }] });
        const h = mount({ ...base(), session, onSummary });
        const text = h.container.textContent ?? "";
        expect(text).toContain(ko["sim.hud.ruleUmb"]);
        expect(text).toContain(ko["sim.setup.tableDaedae"]);
        expect(text).toContain(ko["sim.top.practice"]);
        expect(text).not.toContain("나");
        expect(text).toContain("0/15");
        // 항목별 독립 칩: 점수 · 이닝 · 에버 — 각각 버튼이고 모두 이닝 시트를 연다
        expect(byLabel(h, ko["sim.top.score"])).not.toBeNull();
        expect(byLabel(h, ko["sim.controls.innings"])!.textContent).toBe(`${ko["sim.hud.inning"]}1`);
        expect(byLabel(h, ko["sim.top.avg"])!.textContent).toBe(`${ko["sim.top.avg"]}0.00`);
        expect(byLabel(h, ko["sim.controls.exit"])).toBeNull(); // 뒤로는 대전에서만
        click(byLabel(h, ko["sim.controls.innings"])!);
        click(byLabel(h, ko["sim.top.score"])!);
        click(byLabel(h, ko["sim.top.avg"])!);
        expect(onSummary).toHaveBeenCalledTimes(3);
    });

    it("기록 세션: 연습 칩 대신 오프라인/동기화 칩", () => {
        const session = createSession({ rules: config.rules, players: [{ id: "p1", target: 15 }] });
        expect(mount({ ...base(), session, record: true, offline: true }).container.textContent).toContain(ko["sim.hud.offline"]);
        expect(mount({ ...base(), session, record: true, queued: 1 }).container.textContent).toContain(ko["sim.hud.syncing"]);
        const plain = mount({ ...base(), session, record: true }).container.textContent ?? "";
        expect(plain).not.toContain(ko["sim.top.practice"]);
        expect(plain).not.toContain(ko["sim.hud.syncing"]);
    });

    it("2인: 두 선수 점수와 차례 점(sr-only '차례') 하나, 뒤로 화살표는 onBack 이 있을 때만", () => {
        const onBack = vi.fn();
        const session = createSession({ rules: config.rules, players: [{ id: "p1", target: 15 }, { id: "p2", target: 3 }] });
        const h = mount({ ...base(), session, onBack });
        const text = h.container.textContent ?? "";
        expect(text).toContain("나");
        expect(text).toContain("상대");
        expect(text).toContain("0/15");
        expect(text).toContain("0/3");
        expect(text.split(ko["sim.hud.turn"]).length - 1).toBe(1);
        const back = byLabel(h, ko["sim.controls.exit"])!;
        expect(back).not.toBeNull();
        click(back);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("드릴: 요약 대신 드릴 이름 · 끝난 경기의 승자는 gold", () => {
        const session = createSession({ rules: config.rules, players: [{ id: "p1", target: 100 }] });
        const h = mount({ ...base(), session, drillName: ko["sim.drill.name.back1"] });
        expect(h.container.textContent).toContain(ko["sim.drill.name.back1"]);
        expect(h.container.textContent).not.toContain("0/100");

        const done = { ...createSession({ rules: config.rules, players: [{ id: "p1", target: 15 }] }), status: "finished" as const, winnerIndex: 0 };
        const w = mount({ ...base(), session: done, phase: "finished" });
        // 1인은 이름이 없으므로 점수에 gold
        const score = Array.from(w.container.querySelectorAll("span")).find((s) => s.textContent === "0/15")!;
        expect(score.className).toContain("text-gold");
    });
});
