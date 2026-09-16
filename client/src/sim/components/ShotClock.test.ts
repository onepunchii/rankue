/**
 * 40초 시계(2026-09-17 오너: "동그란 시계 말고 네모나게, 줄어들면 색이 달라지게").
 *
 * 색 단계가 이 화면의 안전장치다 — 40초를 세 번 넘기면 실격패인데, 숫자를 읽고 나서야 급한 줄 알면 늦는다.
 * 그래서 단계 경계를 숫자로 못 박는다. 모양(네모/동그라미)도 단언한다: 되돌아가면 오너 요청이 조용히 사라진다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
let React: ReactMod;
let createRoot: typeof import("react-dom/client")["createRoot"];
let Clock: typeof import("./ShotClock");
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    Clock = await import("./ShotClock");
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const live: Array<() => void> = [];
afterEach(() => { while (live.length) live.pop()!(); });

function mount(props: { seconds: number; mine: boolean; size?: number }): HTMLElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(React.createElement(Clock.ShotClock, props)); });
    live.push(() => { React.act(() => root.unmount()); container.remove(); });
    return container;
}

describe("shotClockColor — 숫자를 읽기 전에 색으로 먼저 알아채게", () => {
    it("여유(21초 이상): 내 차례는 강조색, 상대 차례는 조용한 회색", () => {
        expect(Clock.shotClockColor(40, true)).toBe("rgb(var(--brand))");
        expect(Clock.shotClockColor(21, true)).toBe("rgb(var(--brand))");
        expect(Clock.shotClockColor(40, false)).toBe("var(--ink-3)");
    });

    it("주의(11~20초)는 금색 — 내 차례든 아니든 같다", () => {
        expect(Clock.shotClockColor(20, true)).toBe("var(--gold-fill)");
        expect(Clock.shotClockColor(11, false)).toBe("var(--gold-fill)");
    });

    it("급함(10초 이하)은 붉은색 — 세 번 넘기면 실격패다", () => {
        expect(Clock.shotClockColor(10, true)).toBe("var(--ball-red)");
        expect(Clock.shotClockColor(0, false)).toBe("var(--ball-red)");
    });

    it("경계가 정확히 21/11 이다 — 한 칸 어긋나면 안내가 늦는다", () => {
        expect(Clock.shotClockColor(21, false)).not.toBe("var(--gold-fill)");
        expect(Clock.shotClockColor(20, false)).toBe("var(--gold-fill)");
        expect(Clock.shotClockColor(11, false)).toBe("var(--gold-fill)");
        expect(Clock.shotClockColor(10, false)).toBe("var(--ball-red)");
    });
});

describe("ShotClock 그리기", () => {
    it("네모다 — 동그라미로 되돌아가면 실패한다(2026-09-17 오너 요청)", () => {
        const c = mount({ seconds: 34, mine: true });
        expect(c.querySelectorAll("rect").length).toBe(2);   // 바탕 테두리 + 남은 만큼
        expect(c.querySelector("circle")).toBeNull();
        expect(c.textContent).toContain("34");
    });

    it("남은 시간만큼만 테두리를 그린다 — 0초면 0, 40초면 둘레 전부", () => {
        const dash = (sec: number) => {
            const c = mount({ seconds: sec, mine: true });
            const on = c.querySelectorAll("rect")[1].getAttribute("stroke-dasharray")!.split(" ").map(Number);
            return { on: on[0], off: on[1] };
        };
        const full = dash(40);
        expect(full.off).toBeCloseTo(0, 5);
        expect(dash(0).on).toBeCloseTo(0, 5);
        const half = dash(20);
        expect(half.on).toBeCloseTo(full.on / 2, 5);
        // 둘레는 늘 같다 — 켜진 만큼 + 꺼진 만큼
        expect(half.on + half.off).toBeCloseTo(full.on, 5);
    });

    it("범위를 벗어난 값은 잘라서 쓴다 — 시계 오차로 음수·40 초과가 들어온다", () => {
        expect(mount({ seconds: -5, mine: true }).textContent).toContain("0");
        expect(mount({ seconds: 99, mine: true }).textContent).toContain("40");
    });

    it("읽기 도우미: role=timer 와 남은 초를 말로 읽어 준다", () => {
        const c = mount({ seconds: 7, mine: false });
        const timer = c.querySelector('[role="timer"]')!;
        expect(timer).not.toBeNull();
        expect(timer.getAttribute("aria-label")).toBe(ko["sim.match.shotClockLabel"]);
        expect(c.textContent).toContain(ko["sim.match.shotClock"].replace("{n}", "7"));
    });

    it("5초 이하에서만 깜빡인다 — 모션을 끈 사용자는 제외(motion-safe)", () => {
        expect(mount({ seconds: 5, mine: true }).firstElementChild!.className).toContain("motion-safe:animate-pulse");
        expect(mount({ seconds: 6, mine: true }).firstElementChild!.className).not.toContain("animate-pulse");
    });
});
