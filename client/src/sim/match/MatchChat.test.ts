/**
 * 대전 한마디 UI 의 **구조** 테스트(jsdom). 좌표는 못 잰다(getBoundingClientRect 가 전부 0) —
 * 그래서 2026-09-15 계열 사고(보이는데 안 눌리거나, 안 보이는데 눌리는 것)를 잡을 수 있는 형태로만 단언한다:
 *   · 누를 것은 pointer-events-auto 를 **스스로** 켠다(부모가 none 이라 상속만으로는 안 눌린다)
 *   · 읽기만 하는 것은 절대 auto 를 켜지 않는다(조준 드래그가 글자 위 터치도 받아야 한다)
 *   · 채팅 입력은 내 조준(aim) 중에는 **DOM 에 존재하지 않는다**(같은 자리에 두께 독이 있다)
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "fs";
import path from "path";
import { ko } from "../../lib/i18n/ko";
import type { ChatLine } from "../matchApi";

const i18n = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/i18n", async () => {
    const { ko: dict } = await import("../../lib/i18n/ko");
    i18n.ctx = { t: (k: string) => dict[k] ?? k, locale: "ko" };
    return { useT: () => i18n.ctx };
});
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

type ReactMod = typeof import("react");
let React: ReactMod;
let createRoot: typeof import("react-dom/client")["createRoot"];
let Chat: typeof import("./MatchChat");
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    const vc = new VirtualConsole();
    vc.on("jsdomError", () => { /* 무시 */ });
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event",
        "MouseEvent", "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    Chat = await import("./MatchChat");
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

const live: Array<() => void> = [];
afterEach(() => { while (live.length) live.pop()!(); });

/** 왼쪽 위 칩 열과 같은 조건으로 감싼다 — 부모가 pointer-events-none 인 상황을 그대로 재현한다. */
function mount(node: unknown): HTMLElement {
    const container = document.createElement("div");
    container.className = "pointer-events-none";
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => { root.render(node as never); });
    live.push(() => { React.act(() => root.unmount()); container.remove(); });
    return container;
}

const line = (o: Partial<ChatLine> & { id: string; seq: number }): ChatLine => ({
    from: 0, kind: "text", text: "아깝다", at: new Date().toISOString(), ...o,
});

/** el 자신부터 container 까지 올라가며 pointer-events-auto 를 켠 요소가 있나. */
function opensPointerEvents(el: Element, root: Element): boolean {
    for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
        if (n.className.includes("pointer-events-auto")) return true;
    }
    return false;
}

describe("MatchChatBar", () => {
    const noop = async () => "ok" as const;

    it("입력칸과 보내기 버튼은 스스로 pointer-events-auto 를 켠다 — 부모가 none 이라 상속만으론 안 눌린다", () => {
        const c = mount(React.createElement(Chat.MatchChatBar, { draft: "", onDraft: () => undefined, onSend: noop }));
        const input = c.querySelector("input")!;
        const button = c.querySelector("button")!;
        expect(input).not.toBeNull();
        expect(opensPointerEvents(input, c)).toBe(true);
        expect(opensPointerEvents(button, c)).toBe(true);
    });

    it("빈 초안이면 보내기가 잠긴다(공백만 있어도)", () => {
        const c = mount(React.createElement(Chat.MatchChatBar, { draft: "   ", onDraft: () => undefined, onSend: noop }));
        expect(c.querySelector("button")!.hasAttribute("disabled")).toBe(true);
    });

    it("30자를 넘겨 입력하면 코드포인트 기준으로 잘려서 올라간다", () => {
        const got: string[] = [];
        const c = mount(React.createElement(Chat.MatchChatBar, { draft: "", onDraft: (v: string) => got.push(v), onSend: noop }));
        const input = c.querySelector("input")! as HTMLInputElement;
        React.act(() => {
            // React 는 값 변화를 자체 추적기로 판단한다 — input.value 에 직접 넣으면 "안 바뀐 것"으로 보고
            // onChange 를 부르지 않는다. 네이티브 setter 로 넣어야 추적기를 지나간다.
            const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
            setValue.call(input, "가".repeat(40));
            input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        });
        expect(got).toHaveLength(1);
        expect([...got[0]]).toHaveLength(Chat.CHAT_MAX_CHARS);
    });
});

describe("MatchChatLog", () => {
    it("읽기 전용이라 pointer-events-auto 를 절대 켜지 않는다 — 글자 위 터치도 조준으로 지나가야 한다", () => {
        const c = mount(React.createElement(Chat.MatchChatLog, {
            lines: [line({ id: "a", seq: 1 }), line({ id: "b", seq: 2, from: 1 })], myIndex: 0, now: Date.now(),
        }));
        expect(c.textContent).toContain("아깝다");
        expect(c.innerHTML).not.toContain("pointer-events-auto");
        expect(c.querySelector("button")).toBeNull();
    });

    it("최근 두 줄만, 오래된 말은 사라진다", () => {
        const now = Date.now();
        const old = new Date(now - Chat.CHAT_FRESH_MS - 1000).toISOString();
        const c = mount(React.createElement(Chat.MatchChatLog, {
            lines: [
                line({ id: "a", seq: 1, text: "낡은말", at: old }),
                line({ id: "b", seq: 2, text: "둘째" }),
                line({ id: "c", seq: 3, text: "셋째" }),
                line({ id: "d", seq: 4, text: "넷째" }),
            ],
            myIndex: 0, now,
        }));
        expect(c.textContent).not.toContain("낡은말");
        expect(c.textContent).not.toContain("둘째");
        expect(c.textContent).toContain("셋째");
        expect(c.textContent).toContain("넷째");
    });

    it("고정 인사(code)는 보는 사람의 말로 그린다 — 저장된 건 코드뿐이다", () => {
        const c = mount(React.createElement(Chat.MatchChatLog, {
            lines: [line({ id: "a", seq: 1, kind: "code", text: "nice" })], myIndex: 1, now: Date.now(),
        }));
        expect(c.textContent).toContain(ko["sim.emoji.nice"]);
        expect(c.textContent).not.toContain("nice");
    });

    it("보여 줄 말이 없으면 아무것도 그리지 않는다", () => {
        const c = mount(React.createElement(Chat.MatchChatLog, { lines: [], myIndex: 0, now: Date.now() }));
        expect(c.innerHTML).toBe("");
    });
});

/**
 * 좌표를 못 재는 jsdom 에서 하단 겹침을 막을 수 있는 유일한 형태의 단언이다.
 * 입력 띠는 두께 독(bottom-2, 높이 DOCK_HEIGHT)과 **같은 자리**에 있으므로, 내 조준 중에는 DOM 에 있으면 안 된다.
 */
describe("입력 띠는 내 조준 중에 존재하지 않는다", () => {
    it("SimulatorPage 의 마운트 조건이 waiting·shooting 으로 묶여 있다", () => {
        const src = readFileSync(path.resolve(process.cwd(), "client/src/sim/SimulatorPage.tsx"), "utf8");
        const i = src.indexOf("<MatchChatBar");
        expect(i, "MatchChatBar 를 붙인 자리가 없다").toBeGreaterThan(-1);
        // 그 블록을 여는 조건 줄을 거슬러 찾는다
        const head = src.slice(0, i);
        const open = head.lastIndexOf("{isMatch && sim.match && (");
        expect(open).toBeGreaterThan(-1);
        const cond = src.slice(open, src.indexOf("\n", open + 1) + 200);
        expect(cond).toContain('sim.phase === "waiting" || sim.phase === "shooting"');
        expect(cond).not.toContain('sim.phase === "aim"');
    });
});
