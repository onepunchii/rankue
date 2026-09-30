/**
 * 샷 띠 스모크(jsdom 직접 기동 — TopBar.test 와 같은 방식). 관전·다시보기에서 당구대 **밑**에 뜨는 한 줄:
 * 조준 중(이름·직전 샷 세기) · 샷(당점 문구·세기 %·빨간 점 위치·큐 각 배지) · 빈 상태 안내.
 * 숫자는 선수 화면과 같은 함수(spinReadout·powerPercent)에서 나와야 한다 — 같은 샷이 같은 숫자로 읽히는지 본다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";
import type { ShotInput } from "@shared/sim/types";
import { powerFromPercent } from "../controlsMath";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type StripMod = typeof import("./ShotStrip");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let ShotStrip: StripMod["ShotStrip"];
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
    ({ ShotStrip } = await import("./ShotStrip"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const live: Array<() => void> = [];
afterEach(() => { while (live.length) live.pop()!(); });

function mount(state: Parameters<StripMod["ShotStrip"]>[0]["state"]): HTMLElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(React.createElement(ShotStrip, { state, maxOffset: 0.5 })); });
    live.push(() => { React.act(() => root.unmount()); container.remove(); });
    return container;
}

const input = (over: Partial<ShotInput> = {}): ShotInput => ({
    cueBallId: "yellow", phi: 0, V0: powerFromPercent(62), a: 0.2, b: 0.1, theta: 0, ...over,
});

describe("ShotStrip", () => {
    it("샷: 당점 문구·세기 %가 선수 화면과 같은 눈금으로 나온다(우 40% · 상 20% · 세기 62%)", () => {
        const el = mount({ kind: "shot", name: "박큐", input: input(), playing: false, shotKey: 1 });
        expect(el.textContent).toContain("박큐");
        expect(el.textContent).toContain("우 40%");
        expect(el.textContent).toContain("상 20%");
        expect(el.textContent).toContain("세기 62%");
        expect(el.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("62");
    });

    it("빨간 점은 당점 쪽으로 옮겨 그린다(오른쪽 위 = 왼쪽 값이 중심보다 크고, 위쪽 값이 작다)", () => {
        const el = mount({ kind: "shot", name: "박큐", input: input({ a: 0.25, b: 0.25 }), playing: false, shotKey: 2 });
        const dot = el.querySelector("span.bg-\\[\\#E24B4A\\]") as HTMLElement | null;
        expect(dot).not.toBeNull();
        const left = parseFloat(dot!.style.left), top = parseFloat(dot!.style.top), w = parseFloat(dot!.style.width);
        const center = 34 / 2;
        expect(left + w / 2).toBeGreaterThan(center);
        expect(top + w / 2).toBeLessThan(center);
    });

    it("큐를 5° 이상 세웠을 때만 '큐 N°' 배지가 붙는다", () => {
        const flat = mount({ kind: "shot", name: "박큐", input: input({ theta: (3 * Math.PI) / 180 }), playing: false, shotKey: 3 });
        expect(flat.textContent).not.toContain("큐 3°");
        const raised = mount({ kind: "shot", name: "박큐", input: input({ theta: (20 * Math.PI) / 180 }), playing: false, shotKey: 4 });
        expect(raised.textContent).toContain("큐 20°");
    });

    it("조준 중: 누구 차례인지와 직전 샷 세기를 함께 보여 준다", () => {
        const el = mount({ kind: "aim", name: "김랭큐", seconds: null, last: { input: input() } });
        expect(el.textContent).toContain("김랭큐 조준 중");
        expect(el.textContent).toContain("62%");
    });

    it("빈 상태 안내가 있다", () => {
        const el = mount({ kind: "idle" });
        expect(el.textContent).toContain(ko["sim.watch.stripHint"]);
    });
});
