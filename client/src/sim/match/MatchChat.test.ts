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
import { CHAT_QUICK_CODES } from "@shared/sim/chat";
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
    const bar = (p: Record<string, unknown>) => React.createElement(Chat.MatchChatBar, { onSend: noop, onSendCode: noop, quickOpen: false, onQuickOpen: () => undefined, ...p } as never);

    it("입력칸과 보내기 버튼은 스스로 pointer-events-auto 를 켠다 — 부모가 none 이라 상속만으론 안 눌린다", () => {
        const c = mount(bar({ draft: "", onDraft: () => undefined }));
        const input = c.querySelector("input")!;
        expect(input).not.toBeNull();
        expect(opensPointerEvents(input, c)).toBe(true);
        for (const b of Array.from(c.querySelectorAll("button"))) expect(opensPointerEvents(b, c)).toBe(true);
    });

    it("빈 초안이면 보내기가 잠긴다(공백만 있어도)", () => {
        const c = mount(bar({ draft: "   ", onDraft: () => undefined }));
        const send = Array.from(c.querySelectorAll("button")).find((b) => b.textContent === ko["sim.chat.send"])!;
        expect(send.hasAttribute("disabled")).toBe(true);
    });

    it("30자를 넘겨 입력하면 코드포인트 기준으로 잘려서 올라간다", () => {
        const got: string[] = [];
        const c = mount(bar({ draft: "", onDraft: (v: string) => got.push(v) }));
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

describe("빠른 한마디 칩 — 키보드를 아예 안 여는 길", () => {
    const noop = async () => "ok" as const;
    const bar = (p: Record<string, unknown>) => React.createElement(Chat.MatchChatBar, { onSend: noop, onSendCode: noop, quickOpen: false, onQuickOpen: () => undefined, ...p } as never);
    const quickButton = (c: HTMLElement) =>
        Array.from(c.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === ko["sim.chat.quick"])!;

    it("접혀 있으면 칩이 DOM 에 아예 없다 — 자리를 안 쓴다", () => {
        const c = mount(bar({ draft: "", onDraft: () => undefined }));
        const toggle = quickButton(c);
        expect(toggle).toBeDefined();
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(c.textContent).not.toContain(ko["sim.emoji.oops"]);
    });

    it("☺ 를 누르면 밖으로 알린다 — 펼친 동안 대기 카드가 비켜 줘야 해서 상태가 밖에 있다", () => {
        const got: boolean[] = [];
        const c = mount(bar({ draft: "", onDraft: () => undefined, onQuickOpen: (v: boolean) => got.push(v) }));
        React.act(() => { quickButton(c).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
        expect(got).toEqual([true]);
    });

    it("펼치면 여섯 문구가 나오고, 글이 아니라 **코드**로 보낸다", async () => {
        const sent: string[] = [];
        const c = mount(bar({
            draft: "", onDraft: () => undefined, quickOpen: true,
            onSendCode: async (code: string) => { sent.push(code); return "ok" as const; },
        }));
        for (const code of CHAT_QUICK_CODES) expect(c.textContent).toContain(ko[`sim.emoji.${code}`]);
        const oops = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.includes(ko["sim.emoji.oops"]))!;
        await React.act(async () => { oops.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
        // 코드로 보내야 상대 화면에 **상대 언어로** 뜬다. 한국어 문장을 text 로 보내면 그게 깨진다.
        expect(sent).toEqual(["oops"]);
    });

    it("칩도 pointer-events-auto 를 켠다 — 부모가 none 이라 상속만으론 안 눌린다", () => {
        const c = mount(bar({ draft: "", onDraft: () => undefined, quickOpen: true }));
        expect(c.querySelectorAll("button").length).toBeGreaterThan(CHAT_QUICK_CODES.length);
        for (const b of Array.from(c.querySelectorAll("button"))) expect(opensPointerEvents(b, c)).toBe(true);
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
/**
 * 키보드 회피(2026-09-16 오너 제보 "키보드 침범"). 앱은 웹뷰를 일부러 안 줄이므로(setResizeMode "none")
 * bottom 만 주면 입력줄이 키보드 밑에 깔린다. 웹에서는 뷰포트가 줄어 우연히 멀쩡해 보여서 테스트에 안 잡혔다.
 */
describe("키보드 회피", () => {
    const src = () => readFileSync(path.resolve(process.cwd(), "client/src/sim/SimulatorPage.tsx"), "utf8");

    it("입력 띠가 --keyboard-height 만큼 올라간다", () => {
        const s = src();
        const i = s.indexOf("<MatchChatBar");
        const block = s.slice(s.lastIndexOf("<div", i - 2000 > 0 ? i - 2000 : 0), i);
        expect(block).toContain("var(--keyboard-height");
    });

    it("bottom 에 transition 을 걸지 않는다 — 걸면 크로미움이 변수 변경을 반영하지 않는다", () => {
        const s = src();
        const i = s.indexOf('style={{ bottom: "max(0.75rem');
        expect(i).toBeGreaterThan(-1);
        const near = s.slice(i - 600, i + 200);
        expect(near).not.toMatch(/transition-\[?bottom|transition-all/);
    });

    it("대기 카드는 대화창이다 — 헤더와 겹치던 이름·큰 시계를 뺐다(2026-09-18 안 A)", () => {
        const s = src();
        expect(s).toContain("<MatchChatCard");
        // 예전 카드의 큰 시계(56px)가 다시 들어오면 헤더 시계와 두 번 겹친다
        expect(s).not.toMatch(/ShotClock[^>]*size=\{56\}/);
    });

    it("문구판을 펼치면 대기 카드가 비켜 준다 — 칩 두 줄과 카드가 같이 쌓이면 테이블을 덮는다", () => {
        expect(src()).toContain('sim.phase === "waiting" && !bannerVisible && !chatQuickOpen');
    });
});

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


describe("MatchChatCard — 상대 차례 대화창", () => {
    const card = (p: Record<string, unknown>) => React.createElement(Chat.MatchChatCard, { lines: [], myIndex: 0, opponentName: "최영환", away: false, onClaim: null, ...p } as never);

    it("아직 말이 없으면 누구 차례인지 담은 안내 한 줄 — 예전 '상대 차례예요'가 하던 일", () => {
        const c = mount(card({}));
        expect(c.textContent).toContain("최영환");
        expect(c.textContent).toContain(ko["sim.chat.emptyWaiting"].replace("{name}", "최영환"));
    });

    it("최근 네 줄만, 상대는 왼쪽 · 나는 오른쪽", () => {
        const lines = [1, 2, 3, 4, 5].map((n) => line({ id: `c${n}`, seq: n, text: `말${n}`, from: n % 2 }));
        const c = mount(card({ lines }));
        expect(c.textContent).not.toContain("말1");
        for (const n of [2, 3, 4, 5]) expect(c.textContent).toContain(`말${n}`);
        const items = Array.from(c.querySelectorAll("li"));
        const mine = items.find((li) => li.textContent === "말2")!;    // from 0 = 나
        const theirs = items.find((li) => li.textContent === "말3")!;  // from 1 = 상대
        expect(mine.className).toContain("justify-end");
        expect(theirs.className).toContain("justify-start");
    });

    it("키보드가 뜨면 마지막 두 줄만 남는다 — 답을 쓰는 동안 방금 받은 말은 보여야 한다", () => {
        const lines = [1, 2, 3, 4].map((n) => line({ id: `c${n}`, seq: n, text: `말${n}` }));
        const c = mount(card({ lines }));
        const items = Array.from(c.querySelectorAll("li"));
        expect(items.map((li) => li.className.includes("hide-on-keyboard"))).toEqual([true, true, false, false]);
    });

    it("자리 비움·승리 주장은 필요할 때만, 누를 것만 스스로 켠다", () => {
        const none = mount(card({}));
        expect(none.querySelector("button")).toBeNull();
        let claimed = 0;
        const c = mount(card({ away: true, onClaim: () => { claimed += 1; } }));
        expect(c.textContent).toContain(ko["sim.match.opponentAway"]);
        const btn = c.querySelector("button")!;
        expect(opensPointerEvents(btn, c)).toBe(true);
        React.act(() => { btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
        expect(claimed).toBe(1);
    });
});
