/**
 * HUD 토글 스모크(jsdom 직접 기동 — SimulatorPage.test 와 같은 방식, 앱 모듈은 vi.mock).
 * "3D 보기"(view) 토글은 페이지가 view prop 을 넘길 때만(= ThreeRenderer) 그려지고, aria-pressed 로 상태를 알리며 onToggle 을 부른다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type HUDMod = typeof import("./HUD");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let HUD: HUDMod["HUD"];
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
    // vitest 의 JSX 는 클래식 런타임 — 전역 React 가 필요하다(SimulatorPage.test 와 같다)
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ HUD } = await import("./HUD"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void; rerender: (p: HUDMod["HUDProps"]) => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

const base = (): HUDMod["HUDProps"] => ({
    session: null, config: null, phase: "aim", names: [], record: false, offline: false, syncing: false, queued: 0,
    muted: false, onToggleMute: () => undefined,
});

function mount(props: HUDMod["HUDProps"]): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (p: HUDMod["HUDProps"]) => React.act(() => { root.render(React.createElement(HUD, p)); });
    render(props);
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); }, rerender: render };
    live.push(h);
    return h;
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const byLabel = (h: Harness, label: string) => Array.from(h.container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === label) ?? null;

describe("HUD — 3D 보기 토글", () => {
    it("view prop 이 없으면 버튼이 없다(Canvas2D)", () => {
        const h = mount(base());
        expect(byLabel(h, ko["sim.hud.view3d"])).toBeNull();
        expect(byLabel(h, ko["sim.hud.mute"])).not.toBeNull();
    });

    it("view prop 이 있으면 aria-label '3D 보기' 버튼이 생기고 aria-pressed 가 상태를 따르며 onToggle 을 부른다", () => {
        const onToggle = vi.fn();
        const h = mount({ ...base(), view: { on: false, onToggle } });
        const btn = byLabel(h, ko["sim.hud.view3d"]);
        expect(btn).not.toBeNull();
        expect(ko["sim.hud.view3d"]).toBe("3D 보기");
        expect(btn!.getAttribute("aria-pressed")).toBe("false");
        expect(btn!.getAttribute("title")).toBe(ko["sim.hud.view3d"]);
        expect(btn!.className).not.toContain("border-brand");
        click(btn!);
        expect(onToggle).toHaveBeenCalledTimes(1);
        h.rerender({ ...base(), view: { on: true, onToggle } });
        const on = byLabel(h, ko["sim.hud.view3d"])!;
        expect(on.getAttribute("aria-pressed")).toBe("true");
        expect(on.className).toContain("border-brand");
    });

    it("다이아몬드·3D·소리 토글이 함께 있으면 순서는 다이아몬드 → 3D → 소리", () => {
        const h = mount({ ...base(), diamond: { on: false, onToggle: () => undefined }, view: { on: false, onToggle: () => undefined } });
        const labels = Array.from(h.container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
        expect(labels).toEqual([ko["sim.diamond.toggleLabel"], ko["sim.hud.view3d"], ko["sim.hud.mute"]]);
    });
});
