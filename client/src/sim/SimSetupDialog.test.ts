/**
 * SimSetupDialog 스모크 테스트. vitest 설정에 "@" 별칭이 없어(vitest.config.ts 는 @shared 만) 앱 모듈은
 * vi.mock 으로 대체하고, DOM 은 jsdom 을 직접 띄워 전역에 얹는다(환경 전환 없이 node 환경 유지 —
 * jsdom 환경에선 별칭 미해결 import 가 변환 단계에서 실패한다). UI 프리미티브는 뜻이 같은 얇은 대역이다.
 * 검증: 다마수를 비우면 시작이 잠긴다 · 4구로 바꾸면 규칙 스위치 두 개 · onStart 가 buildConfig 와 같은 설정을 받는다 ·
 * 늦게 온 핸디는 손대기 전까지만 반영된다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../lib/i18n/ko";
import { buildConfig, CONDITION_DEFAULT } from "./setupPresets";

const auth = vi.hoisted(() => ({ member: null as null | { handi3c?: number; handi4c?: number } }));

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ member: auth.member, isLoading: false, isLoggedIn: !!auth.member, isGuest: !auth.member }) }));
vi.mock("@/lib/icons", async () => {
    const React = await import("react");
    return { ChevronDown: () => React.createElement("span") };
});
vi.mock("@/components/hiq/BallDot", async () => {
    const React = await import("react");
    return { BallDot: () => React.createElement("span") };
});
vi.mock("@/components/ui/dialog", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) =>
        React.createElement(tag, { className }, children as never);
    return {
        Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        DialogContent: box("div"), DialogHeader: box("div"), DialogFooter: box("div"),
        DialogTitle: box("h2"), DialogDescription: box("p"),
    };
});
vi.mock("@/components/ui/button", async () => {
    const React = await import("react");
    return { Button: (p: Record<string, unknown>) => { const { children, variant: _v, ...rest } = p; return React.createElement("button", rest, children as never); } };
});
vi.mock("@/components/ui/input", async () => {
    const React = await import("react");
    return { Input: (p: Record<string, unknown>) => React.createElement("input", p) };
});
vi.mock("@/components/ui/label", async () => {
    const React = await import("react");
    return { Label: (p: Record<string, unknown>) => { const { children, ...rest } = p; return React.createElement("label", rest, children as never); } };
});
vi.mock("@/components/ui/switch", async () => {
    const React = await import("react");
    return {
        Switch: ({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (v: boolean) => void }) =>
            React.createElement("button", { type: "button", role: "switch", id, "aria-checked": checked, onClick: () => onCheckedChange(!checked) }),
    };
});
vi.mock("@/components/ui/collapsible", async () => {
    const React = await import("react");
    return {
        Collapsible: ({ open, children }: { open: boolean; children?: unknown }) => React.createElement("div", { "data-open": open }, children as never),
        CollapsibleTrigger: ({ children }: { children?: unknown }) => children as never,
        CollapsibleContent: ({ children }: { children?: unknown }) => React.createElement("div", null, children as never),
    };
});

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type Dialog = typeof import("./SimSetupDialog");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let SimSetupDialog: Dialog["SimSetupDialog"];
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event",
        "MouseEvent", "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
        "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g)) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    if (!("ResizeObserver" in g)) {
        g.ResizeObserver = class { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } };
        globalsSet.push("ResizeObserver");
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    // vitest 설정엔 react 플러그인이 없어 JSX 가 고전 런타임(React.createElement)으로 변환된다 — 전역 React 를 대준다.
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ SimSetupDialog } = await import("./SimSetupDialog"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const live: Harness[] = [];
beforeEach(() => { auth.member = null; });
// 실패한 테스트가 루트를 남기면 act 큐가 더러워져 다음 테스트의 렌더가 막힌다 — 항상 정리한다.
afterEach(() => { while (live.length) live.pop()!.unmount(); });

interface Harness {
    container: HTMLElement;
    onStart: ReturnType<typeof vi.fn>;
    rerender: (open?: boolean) => void;
    unmount: () => void;
}

function mount(open = true): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onStart = vi.fn();
    const render = (o: boolean) =>
        React.act(() => { root.render(React.createElement(SimSetupDialog, { open: o, onOpenChange: () => undefined, onStart })); });
    render(open);
    const h: Harness = {
        container, onStart,
        rerender: (o = true) => render(o),
        unmount: () => { React.act(() => root.unmount()); container.remove(); },
    };
    live.push(h);
    return h;
}

const startButton = (h: Harness) => Array.from(h.container.querySelectorAll("button")).find((b) => b.textContent === ko["sim.setup.start"])!;
const targetInput = (h: Harness) => h.container.querySelector<HTMLInputElement>("#sim-target")!;
const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const setInput = (input: HTMLInputElement, value: string) => React.act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
});
/** 세그먼트 버튼 찾기. 두 줄 세그먼트(테이블·규칙)는 제목 뒤에 설명이 붙으므로 정확히 같은 것 → 제목으로 시작하는 것 순. */
const segment = (h: Harness, text: string) => {
    const all = Array.from(h.container.querySelectorAll("button[aria-pressed]"));
    const found = all.find((b) => b.textContent === text) ?? all.find((b) => (b.textContent ?? "").startsWith(text));
    if (!found) throw new Error(`segment not found: ${text}`);
    return found;
};

describe("SimSetupDialog", () => {
    it("열리면 3쿠션·대대·기본 다마수 15 로 시작하고, 다마수를 비우면 시작이 잠긴다", () => {
        const h = mount();
        expect(h.container.querySelector("[role=dialog]")).not.toBeNull();
        expect(targetInput(h).value).toBe("15");
        expect(startButton(h).disabled).toBe(false);
        setInput(targetInput(h), "");
        expect(startButton(h).disabled).toBe(true);
        expect(targetInput(h).getAttribute("aria-invalid")).toBe("true");
        expect(h.container.textContent).toContain(ko["sim.setup.targetRange"]);
        setInput(targetInput(h), "1000"); // 범위 밖
        expect(startButton(h).disabled).toBe(true);
        setInput(targetInput(h), "20");
        expect(startButton(h).disabled).toBe(false);
    });

    it("4구로 바꾸면 규칙 스위치 두 개가 보이고 테이블·다마수가 4구 기본으로 바뀐다", () => {
        const h = mount();
        // 고급 섹션의 '기록하기' 스위치 하나는 항상 있다(Collapsible 대역은 접힘을 무시하고 내용을 그린다)
        expect(h.container.querySelectorAll("[role=switch]")).toHaveLength(1);
        expect(h.container.querySelector("#sim-opt-record")).not.toBeNull();
        click(segment(h, ko["sim.setup.type4c"]));
        const switches = h.container.querySelectorAll("[role=switch]");
        expect(switches).toHaveLength(3);
        expect(h.container.textContent).toContain(ko["sim.setup.opt3cDouble"]);
        expect(h.container.textContent).toContain(ko["sim.setup.optPassiveFoul"]);
        expect(targetInput(h).value).toBe("80");
        expect(segment(h, ko["sim.setup.tableJungdae"]).getAttribute("aria-pressed")).toBe("true");
    });

    it("onStart 는 buildConfig 와 같은 설정을 받는다(3쿠션 PBA · 4구 옵션)", () => {
        const h = mount();
        click(segment(h, "25"));
        click(segment(h, ko["sim.setup.rulePba"]));
        click(segment(h, ko["sim.setup.inningN"].replace("{n}", "20")));
        click(startButton(h));
        expect(h.onStart).toHaveBeenCalledTimes(1);
        expect(h.onStart.mock.calls[0][0]).toEqual(buildConfig({
            gameType: "3c", tableId: "DAEDAE", target: 25, inningCap: 20, cushionModel: "han2005", condition: CONDITION_DEFAULT,
            rules: { ruleSet: "pba" },
        }));
        // 기록하기는 기본 켜짐
        expect(h.onStart.mock.calls[0][1]).toEqual({ record: true });

        click(segment(h, ko["sim.setup.type4c"]));
        click(h.container.querySelector("#sim-opt-3c-double")!);
        // 기록하기를 끄면 연습 모드로 시작한다
        click(h.container.querySelector("#sim-opt-record")!);
        click(startButton(h));
        expect(h.onStart).toHaveBeenCalledTimes(2);
        expect(h.onStart.mock.calls[1][0]).toEqual(buildConfig({
            gameType: "4c", tableId: "JUNGDAE_KR", target: 80, inningCap: 20, cushionModel: "han2005", condition: CONDITION_DEFAULT,
            rules: { threeCushionDouble: true, passiveOpponentContactIsFoul: false },
        }));
        expect(h.onStart.mock.calls[1][1]).toEqual({ record: false });
    });

    it("늦게 온 핸디는 손대기 전까지만 반영되고, 안내 문구는 값이 핸디와 같을 때만 보인다", () => {
        const h = mount();
        expect(targetInput(h).value).toBe("15");
        expect(h.container.textContent).not.toContain(ko["sim.setup.targetFromHandicap"]);
        auth.member = { handi3c: 22, handi4c: 100 };
        h.rerender();
        expect(targetInput(h).value).toBe("22");
        expect(h.container.textContent).toContain(ko["sim.setup.targetFromHandicap"]);
        click(segment(h, "30"));
        expect(targetInput(h).value).toBe("30");
        expect(h.container.textContent).not.toContain(ko["sim.setup.targetFromHandicap"]);
        auth.member = { handi3c: 24, handi4c: 100 };
        h.rerender();
        expect(targetInput(h).value).toBe("30"); // 손댄 뒤엔 덮어쓰지 않는다
        // 종목을 바꾸면 그 종목 핸디로 다시 채운다
        click(segment(h, ko["sim.setup.type4c"]));
        expect(targetInput(h).value).toBe("100");
        expect(h.container.textContent).toContain(ko["sim.setup.targetFromHandicap"]);
        // 닫았다 열면 다시 핸디
        setInput(targetInput(h), "50");
        h.rerender(false);
        h.rerender(true);
        expect(targetInput(h).value).toBe("100");
    });
});

describe("플레이 모드", () => {
    it("리얼리티를 고르면 마타반 2010 · 컨디션 1.10 · mode reality 로 시작한다(기본은 일반)", () => {
        const h = mount();
        setInput(targetInput(h), "20");
        const realityBtn = Array.from(h.container.querySelectorAll("button")).find((b) => b.textContent?.includes(ko["sim.setup.modeReality"]))!;
        expect(realityBtn).toBeTruthy();
        // 메인엔 설명이 없고, 버튼을 누르면 그림 설명 팝업이 열린다 → 팝업의 초록 버튼이 정한다
        expect(h.container.textContent).not.toContain(ko["sim.setup.modeRealityHint"]);
        click(realityBtn);
        expect(h.container.textContent).toContain(ko["sim.setup.modeRealityHint"]);
        expect(h.container.textContent).toContain(ko["sim.modeInfo.title"]);
        click(Array.from(h.container.querySelectorAll("button")).find((b) => b.textContent === ko["sim.modeInfo.pickReality"])!);
        expect(h.container.textContent).not.toContain(ko["sim.modeInfo.title"]);
        click(startButton(h));
        expect(h.onStart).toHaveBeenCalledTimes(1);
        expect(h.onStart.mock.calls[0][0]).toMatchObject({ mode: "reality", cushionModel: "mathavan2010", condition: 1.1, target: 20 });
    });
});
