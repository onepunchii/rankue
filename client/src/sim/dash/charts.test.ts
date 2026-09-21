/**
 * 차트 회귀(jsdom — SimDash.test 와 같은 방식).
 *
 * 2026-09-21 오너 제보: "에버리지 추이 차트를 선택한 뒤 3쿠션 중대·대대·4구 중대 탭을 옮기면 화면이 하얗게 먹통".
 * 고른 점 번호(문지르기·방향키)가 남아 있는데 새 탭의 점이 더 적으면 없는 점을 그리려다 렌더가 통째로 죽었다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";

vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
type ChartsMod = typeof import("./charts");

let React: ReactMod;
let createRoot: typeof import("react-dom/client")["createRoot"];
let charts: ChartsMod;
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "KeyboardEvent", "MouseEvent",
        "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    charts = await import("./charts");
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const live: { unmount: () => void }[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

const pts = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ label: `${i + 1}일`, value: from + i }));

function mount(node: unknown) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(node as never); });
    live.push({ unmount: () => { React.act(() => root.unmount()); container.remove(); } });
    return {
        container,
        render: (next: unknown) => { React.act(() => { root.render(next as never); }); },
    };
}

/** 방향키로 점을 고른다(문지르기와 같은 상태를 쓴다 — jsdom 엔 PointerEvent 좌표가 없다). */
function pickLeft(container: HTMLElement, times = 1) {
    const svg = container.querySelector("svg")!;
    for (let i = 0; i < times; i++) {
        React.act(() => {
            svg.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        });
    }
}

describe("차트: 점을 고른 뒤 자료가 바뀌어도(탭 이동) 죽지 않는다", () => {
    it("에버리지 추이 — 고른 점보다 점이 적어져도 그려진다(마지막 점으로 잘린다)", () => {
        const h = mount(React.createElement(charts.TrendLine, { points: pts(8), format: (v: number) => String(v), ariaLabel: "추이", emptyText: "없음" }));
        pickLeft(h.container, 5);            // 8개 중 앞쪽 점을 고른다
        expect(h.container.querySelector("[aria-live]")?.textContent).toContain("3일");
        // 다른 탭: 점 2개짜리 자료
        h.render(React.createElement(charts.TrendLine, { points: pts(2, 10), format: (v: number) => String(v), ariaLabel: "추이", emptyText: "없음" }));
        expect(h.container.querySelector("svg")).not.toBeNull();
        expect(h.container.querySelector("[aria-live]")?.textContent).toContain("2일");
        // 기록이 아예 없는 탭
        h.render(React.createElement(charts.TrendLine, { points: [], format: (v: number) => String(v), ariaLabel: "추이", emptyText: "없음" }));
        expect(h.container.textContent).toContain("없음");
    });

    it("막대(하이런·드릴)도 같다", () => {
        const h = mount(React.createElement(charts.Columns, { points: pts(9), format: (v: number) => String(v), ariaLabel: "하이런", emptyText: "없음" }));
        pickLeft(h.container, 6);
        h.render(React.createElement(charts.Columns, { points: pts(3, 5), format: (v: number) => String(v), ariaLabel: "하이런", emptyText: "없음" }));
        expect(h.container.querySelector("svg")).not.toBeNull();
        expect(h.container.querySelector("[aria-live]")?.textContent).toContain("3일");
    });
});
