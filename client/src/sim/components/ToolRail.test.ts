/**
 * ToolRail 스모크(jsdom 직접 기동 — SimulatorPage.test 와 같은 방식, 앱 모듈은 vi.mock).
 * 묶음은 순서대로 그려지고 빈 묶음은 건너뛴다 · 토글은 aria-pressed 로 상태를 알리고 켜지면 brand 틴트 ·
 * 값 있는 도구(큐 각)는 캡션을 보인다 · 탭하면 왼쪽에 이름 알약이 떴다가 HINT_MS 뒤 사라진다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";

vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type RailMod = typeof import("./ToolRail");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let ToolRail: RailMod["ToolRail"];
let HINT_MS: RailMod["HINT_MS"];
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
    ({ ToolRail, HINT_MS } = await import("./ToolRail"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void; rerender: (p: RailMod["ToolRailProps"]) => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); vi.useRealTimers(); });

function mount(props: RailMod["ToolRailProps"]): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (p: RailMod["ToolRailProps"]) => React.act(() => { root.render(React.createElement(ToolRail, p)); });
    render(props);
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); }, rerender: render };
    live.push(h);
    return h;
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const labels = (h: Harness) => Array.from(h.container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
const byLabel = (h: Harness, label: string) => Array.from(h.container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === label) ?? null;
const icon = () => React.createElement("svg");

describe("ToolRail", () => {
    it("묶음 순서대로 버튼을 그리고 빈 묶음은 건너뛴다 · 비활성은 disabled", () => {
        const h = mount({
            groups: [
                [{ id: "a", label: "당점", icon: icon(), onPress: () => undefined }, { id: "b", label: "큐 각", icon: icon(), onPress: () => undefined, disabled: true }],
                [],
                [{ id: "x", label: "나가기", icon: icon(), onPress: () => undefined }],
            ],
        });
        expect(labels(h)).toEqual(["당점", "큐 각", "나가기"]);
        expect(byLabel(h, "큐 각")!.disabled).toBe(true);
        // 빈 묶음은 DOM 에도 없다(묶음 사이 간격이 두 번 생기지 않게)
        expect(h.container.firstElementChild!.children).toHaveLength(2);
    });

    it("토글은 aria-pressed 를 내고 켜지면 brand 틴트, 값 있는 도구는 캡션을 보인다", () => {
        const onToggle = vi.fn();
        const h = mount({
            groups: [[
                { id: "view", label: "3D 보기", icon: icon(), toggle: true, active: false, onPress: onToggle },
                { id: "elev", label: "큐 각", icon: icon(), active: true, caption: "10°", onPress: () => undefined },
                { id: "list", label: "이닝 시트", icon: icon(), onPress: () => undefined },
            ]],
        });
        const view = byLabel(h, "3D 보기")!;
        expect(view.getAttribute("aria-pressed")).toBe("false");
        expect(view.getAttribute("title")).toBe("3D 보기");
        expect(view.className).not.toContain("text-brand");
        click(view);
        expect(onToggle).toHaveBeenCalledTimes(1);
        h.rerender({ groups: [[{ id: "view", label: "3D 보기", icon: icon(), toggle: true, active: true, onPress: onToggle }]] });
        const on = byLabel(h, "3D 보기")!;
        expect(on.getAttribute("aria-pressed")).toBe("true");
        expect(on.className).toContain("text-brand");
        // 비토글 도구는 aria-pressed 가 없고 캡션이 있다
        const h2 = mount({ groups: [[{ id: "elev", label: "큐 각", icon: icon(), active: true, caption: "10°", onPress: () => undefined }]] });
        const elev = byLabel(h2, "큐 각")!;
        expect(elev.hasAttribute("aria-pressed")).toBe(false);
        expect(elev.textContent).toContain("10°");
        expect(elev.className).toContain("text-brand");
        expect(byLabel(h, "이닝 시트")).toBeNull(); // rerender 로 사라진 버튼
    });

    it("탭하면 왼쪽에 이름 알약(hint 우선)이 떴다가 HINT_MS 뒤 사라진다", () => {
        vi.useFakeTimers();
        const h = mount({
            groups: [[
                { id: "dia", label: "다이아몬드 시스템 표시", hint: "다이아몬드", icon: icon(), toggle: true, active: false, onPress: () => undefined },
                { id: "list", label: "이닝 시트", icon: icon(), onPress: () => undefined },
            ]],
        });
        const text = () => h.container.textContent ?? "";
        expect(text()).not.toContain("다이아몬드");
        click(byLabel(h, "다이아몬드 시스템 표시")!);
        expect(text()).toContain("다이아몬드");
        expect(text()).not.toContain("다이아몬드 시스템 표시"); // 알약은 짧은 hint
        // 다른 버튼을 누르면 알약이 옮겨 간다
        click(byLabel(h, "이닝 시트")!);
        expect(text()).not.toContain("다이아몬드");
        expect(text()).toContain("이닝 시트");
        React.act(() => { vi.advanceTimersByTime(HINT_MS + 10); });
        expect(text()).not.toContain("이닝 시트");
    });
});
