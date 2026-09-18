/**
 * 세로 이닝 점수판(2026-09-18 안 A). 당구장 벽 점수판처럼 이닝마다 한 줄, 선수마다 한 칸.
 * jsdom 으로 구조만 본다: 칸 순서(나·상대), 0 은 점, 하이런 강조, 누를 수 없음.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import type { InningRow } from "../inningLog";

const i18n = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/i18n", async () => {
    const { ko: dict } = await import("../../lib/i18n/ko");
    i18n.ctx = { t: (k: string) => dict[k] ?? k, locale: "ko" };
    return { useT: () => i18n.ctx };
});
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

let React: typeof import("react");
let createRoot: typeof import("react-dom/client")["createRoot"];
let Strip: typeof import("./MatchScoreStrip")["MatchScoreStrip"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    const vc = new VirtualConsole();
    vc.on("jsdomError", () => { /* 무시 */ });
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ MatchScoreStrip: Strip } = await import("./MatchScoreStrip"));
});
afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});
const live: Array<() => void> = [];
afterEach(() => { while (live.length) live.pop()!(); });

function mount(rows: InningRow[], order: [number, number]): HTMLElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    React.act(() => { root.render(React.createElement(Strip, { rows, order, balls: ["white", "yellow"] })); });
    live.push(() => { React.act(() => root.unmount()); el.remove(); });
    return el;
}
/** 행마다 [왼칸, 오른칸] 글자 */
const cells = (el: HTMLElement) => Array.from(el.querySelectorAll(".grid.h-\\[22px\\]")).map((row) => Array.from(row.children).map((c) => c.textContent));

// 선수 0: 1, 0, 3 / 선수 1: 2, 0, (아직 안 침)
const rows: InningRow[] = [
    { inning: 1, cells: [1, 2] },
    { inning: 2, cells: [0, 0] },
    { inning: 3, cells: [3, null] },
];

describe("MatchScoreStrip", () => {
    it("칸 순서는 헤더와 같다 — 왼쪽이 나, 오른쪽이 상대", () => {
        expect(cells(mount(rows, [0, 1]))).toEqual([["1", "2"], ["·", "·"], ["3", "·"]]);
        // 내가 게스트(자리 1)면 칸이 뒤집힌다
        expect(cells(mount(rows, [1, 0]))).toEqual([["2", "1"], ["·", "·"], ["·", "3"]]);
    });

    it("0점은 점, 아직 치지 않은 칸은 보이지 않는다", () => {
        const el = mount(rows, [0, 1]);
        const notYet = Array.from(el.querySelectorAll(".grid.h-\\[22px\\]"))[2].children[1];
        expect(notYet.className).toContain("text-transparent");
    });

    it("각자의 하이런(이닝 최고 득점)을 강조한다", () => {
        const el = mount(rows, [0, 1]);
        const r = Array.from(el.querySelectorAll(".grid.h-\\[22px\\]"));
        expect(r[2].children[0].className).toContain("text-brand");   // 나 3점
        expect(r[0].children[1].className).toContain("text-brand");   // 상대 2점
        expect(r[0].children[0].className).not.toContain("text-brand"); // 나 1점은 하이런 아님
    });

    it("누를 수 없다 — 이 자리는 내 차례엔 조작 버튼이 쓴다(2026-09-15 사고)", () => {
        const el = mount(rows, [0, 1]);
        expect((el.firstElementChild as HTMLElement).className).toContain("pointer-events-none");
        expect(el.querySelector("button")).toBeNull();
    });

    it("칸 나눔: 선수 사이 세로선은 한 줄로 끝까지, 이닝 사이는 가로선(첫 줄 제외)", () => {
        const el = mount(rows, [0, 1]);
        expect(el.querySelectorAll(".left-1\\/2.w-px")).toHaveLength(1);
        const r = Array.from(el.querySelectorAll(".grid.h-\\[22px\\]"));
        expect(r.map((x) => x.className.includes("border-t"))).toEqual([false, true, true]);
    });

    it("지금 이닝 수를 머리에 보인다", () => {
        expect(mount(rows, [0, 1]).textContent).toContain("3");
    });
});
