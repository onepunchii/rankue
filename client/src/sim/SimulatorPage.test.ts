/**
 * SimulatorPage 스모크 테스트(jsdom 직접 기동 — SimSetupDialog.test 와 같은 방식). 앱 모듈("@/...")은 vi.mock 으로 대체하고
 * 훅·컨트롤러·엔진·렌더러는 진짜를 쓴다(캔버스 2D 컨텍스트만 없어 그리기는 no-op).
 * 검증: ?cfg 로 연습 세션이 바로 열린다 · 샷 → 재생(조작 층이 흐려짐) → 시계를 앞당기면 공이 멈추고 결과 배너·이닝 시트에 기록된다 ·
 *      연습 모드는 서버를 부르지 않는다 · cfg 가 없으면 설정 창이 열리고 시작하기로 세션이 열린다 ·
 *      샷이 끝나면 툴바에 공유 버튼이 생긴다 · ?replay= 는 연습 세션을 열어 한 번 자동으로 치고 해시 칩을 보인다 ·
 *      툴바 당점·큐 각 버튼이 시트를 열고 단계 칩이 큐 각을 바꾼다(레이아웃 B).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import { ko } from "../lib/i18n/ko";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES } from "@shared/sim/params";
import { buildConfig } from "./setupPresets";
import { encodePageConfig } from "./pageConfig";
import { paramsFromConfig } from "./simReducer";
import { encodeReplay, replaySource } from "./share/replayLink";

const nav = vi.hoisted(() => ({ search: "", navigate: vi.fn(), apiRequest: vi.fn(), toast: vi.fn() }));

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: nav.apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: nav.toast }) }));
vi.mock("@/hooks/useGameAudio", () => ({ useGameAudio: () => ({ getCtx: () => null }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ member: { nickname: "테스터", handi3c: 15 }, isLoading: false, isLoggedIn: true, isGuest: false }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/online-game", nav.navigate], useSearch: () => nav.search }));
vi.mock("@/lib/icons", async () => {
    const React = await import("react");
    const I = () => React.createElement("span");
    return { ChevronDown: I, ChevronLeft: I, ChevronRight: I, LayoutList: I, LucideUndo2: I, X: I, LucideMinus: I, LucidePlus: I, LucideSparkles: I };
});
vi.mock("@/components/hiq/BallDot", async () => {
    const React = await import("react");
    return { BallDot: () => React.createElement("span") };
});
vi.mock("@radix-ui/react-slider", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return { Root: box("div"), Track: box("div"), Range: box("div"), Thumb: box("div") };
});
vi.mock("@/components/ui/dialog", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        DialogContent: box("div"), DialogHeader: box("div"), DialogFooter: box("div"), DialogTitle: box("h2"), DialogDescription: box("p"),
    };
});
vi.mock("@/components/ui/sheet", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Sheet: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog", "data-sheet": "1" }, children as never) : null),
        SheetContent: box("div"), SheetHeader: box("div"), SheetTitle: box("h2"), SheetDescription: box("p"),
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
        Collapsible: ({ children }: { children?: unknown }) => React.createElement("div", null, children as never),
        CollapsibleTrigger: ({ children }: { children?: unknown }) => children as never,
        CollapsibleContent: ({ children }: { children?: unknown }) => React.createElement("div", null, children as never),
    };
});

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type PageMod = typeof import("./SimulatorPage");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let SimulatorPage: PageMod["SimulatorPage"];
let dom: JSDOM;
const globalsSet: string[] = [];
const realNow = performance.now.bind(performance);

beforeAll(async () => {
    // 캔버스 getContext 미구현 경고를 조용히 삼킨다
    const vc = new VirtualConsole();
    vc.on("jsdomError", () => { /* 무시 */ });
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLCanvasElement", "Element", "Node", "Text", "Event",
        "MouseEvent", "PointerEvent", "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
        "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    if (!("ResizeObserver" in g)) {
        g.ResizeObserver = class { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } };
        globalsSet.push("ResizeObserver");
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ SimulatorPage } = await import("./SimulatorPage"));
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => {
    while (live.length) live.pop()!.unmount();
    performance.now = realNow;
    nav.apiRequest.mockReset();
    nav.navigate.mockReset();
    nav.toast.mockReset();
});

function mount(): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    // 페이지가 useQueryClient 를 쓰므로(대전 목록 갱신) 앱과 같이 Provider 로 감싼다
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    React.act(() => { root.render(React.createElement(QueryClientProvider, { client: qc }, React.createElement(SimulatorPage))); });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); } };
    live.push(h);
    return h;
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
/** 샷 버튼: 큐대 스트로크(STROKE_MS ≈ 0.18 s) 뒤에 공이 출발한다 — 그만큼 기다려 준다(2026-09-08). */
const shoot = async (h: Harness) => {
    click(byText(h, ko["sim.controls.shoot"])!);
    await React.act(async () => { await new Promise((r) => setTimeout(r, 260)); });
};
const buttons = (h: Harness) => Array.from(h.container.querySelectorAll("button"));
const byText = (h: Harness, text: string) => buttons(h).find((b) => b.textContent === text) ?? null;
const byLabel = (h: Harness, label: string) => buttons(h).find((b) => b.getAttribute("aria-label") === label) ?? null;
const frames = (n: number) => React.act(async () => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 20)); });

describe("SimulatorPage", () => {
    it("?cfg 로 연습 세션이 바로 열리고 상단 띠에 점수·규칙·테이블이 보인다(1인 요약엔 이름이 없다)", () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        expect(h.container.querySelector("[role=dialog]")).toBeNull();
        const text = h.container.textContent ?? "";
        expect(text).not.toContain("테스터");
        expect(text).toContain("0/5");
        expect(text).toContain(ko["sim.hud.ruleUmb"]);
        expect(text).toContain(ko["sim.setup.tableDaedae"]);
        expect(text).toContain(ko["sim.top.practice"]);
        expect(text).toContain(ko["sim.hud.placeHint"]);
        // 렌더러 캔버스가 테이블 래퍼에 얹혔다
        expect(h.container.querySelectorAll("canvas").length).toBeGreaterThanOrEqual(1);
        // 연습 모드: 서버 호출 없음
        expect(nav.apiRequest).not.toHaveBeenCalled();
        // 조작: 샷 활성, 되돌리기는 아직 없음(스택 비어 있음)
        expect(byText(h, ko["sim.controls.shoot"])?.disabled).toBe(false);
        expect(byLabel(h, ko["sim.controls.undo"])).toBeNull();
    });

    it("3쿠션이면 툴바에 다이아몬드 시스템 토글(기본 꺼짐)이 있고, 누르면 켜진다 · 4구엔 없다", () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        const btn = byLabel(h, ko["sim.diamond.toggleLabel"]);
        expect(btn).not.toBeNull();
        expect(btn!.getAttribute("aria-pressed")).toBe("false");
        click(btn!);
        expect(byLabel(h, ko["sim.diamond.toggleLabel"])!.getAttribute("aria-pressed")).toBe("true");
        click(byLabel(h, ko["sim.diamond.toggleLabel"])!);
        expect(byLabel(h, ko["sim.diamond.toggleLabel"])!.getAttribute("aria-pressed")).toBe("false");

        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "4c", target: 5 }), record: false })}`;
        const h4 = mount();
        expect(byLabel(h4, ko["sim.diamond.toggleLabel"])).toBeNull();
    });

    it("\"3D 보기\" 토글은 ThreeRenderer 가 올라왔을 때만 — jsdom 은 WebGL2 가 없어 Canvas2D 라 버튼이 없다", async () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        await frames(3); // three 청크가 오더라도(선택되지 않음) 토글이 생기지 않는다
        expect(byLabel(h, ko["sim.hud.view3d"])).toBeNull();
        expect(byLabel(h, ko["sim.hud.mute"])).not.toBeNull(); // 다른 토글은 그대로
        expect(byLabel(h, ko["sim.diamond.toggleLabel"])).not.toBeNull();
    });

    it("샷 → 재생(잠금 · 조작 층 흐림) → 시계를 앞당기면 정지 · 결과 배너 · 이닝 시트 한 줄 · 되돌리기", async () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        const controls = () => h.container.querySelector("[data-sim-controls=right]")!;
        const dock = () => h.container.querySelector("[role=group][aria-label=\"" + ko["sim.controls.thickness"] + "\"]")!;
        expect(controls().className).not.toContain("opacity-0");
        expect(dock().className).not.toContain("opacity-0");
        await shoot(h);
        // 재생 중: 샷 잠금(빈 원, 비활성) + 빨리감기 안내 + 툴바·큐 슬라이더·두께 독이 흐려지고 포인터를 막는다(상단 띠·칩은 남는다)
        const shot = byLabel(h, ko["sim.controls.shoot"]);
        expect(shot).not.toBeNull();
        expect(shot!.disabled).toBe(true);
        expect(h.container.textContent).toContain(ko["sim.hud.holdToFastForward"]);
        expect(byText(h, ko["sim.controls.shoot"])).toBeNull();
        expect(controls().className).toContain("opacity-0");
        expect(controls().className).toContain("pointer-events-none");
        expect(dock().className).toContain("opacity-0");
        expect(h.container.textContent).toContain(ko["sim.hud.ruleUmb"]);

        // 시계를 1000 초 앞당기면 다음 rAF 에서 재생이 끝난다 → 조작 층이 돌아온다
        performance.now = () => realNow() + 1_000_000;
        await frames(4);
        expect(byText(h, ko["sim.controls.shoot"])).not.toBeNull();
        expect(controls().className).not.toContain("opacity-0");
        expect(dock().className).not.toContain("opacity-0");
        const text = h.container.textContent ?? "";
        const outcomes = ["point", "missNoContact", "missOneBall", "missCushions"].map((k) => ko[`sim.outcome.${k}`].split(" ·")[0]);
        expect(outcomes.some((o) => text.includes(o))).toBe(true);
        // 이닝 시트에 1이닝이 기록됐다
        click(byLabel(h, ko["sim.controls.innings"])!);
        const sheet = h.container.querySelector("[data-sheet]");
        expect(sheet).not.toBeNull();
        expect(sheet!.querySelectorAll("tbody tr")).toHaveLength(1);
        expect(sheet!.textContent).toContain(ko["sim.hud.sheetTotal"]);
        // 연습 모드라 되돌리기가 생겼다 — 두께 독 둘째 줄에(툴바가 아니라)
        const undo = byLabel(h, ko["sim.controls.undo"]);
        expect(undo).not.toBeNull();
        expect(dock().contains(undo)).toBe(true);
        expect(controls().contains(undo)).toBe(false);
        expect(nav.apiRequest).not.toHaveBeenCalled();
    });

    it("파라미터가 없으면 진입 화면(싱글 / 친구와 대전)이 먼저, 싱글을 누르면 설정 창 · 시작하기로 세션 · 나가기는 확인 뒤 대시보드로", async () => {
        nav.search = "";
        const h = mount();
        // 진입 화면: 카드 둘, 설정 창은 아직
        expect(h.container.querySelector("[role=dialog]")).toBeNull();
        expect(h.container.textContent).toContain(ko["sim.entry.groupSolo"]);
        expect(h.container.textContent).toContain(ko["sim.entry.groupTogether"]);
        expect(h.container.textContent).toContain(ko["sim.entry.singleEmpty"]);
        // 그룹 머리는 펼치기, 실제 시작은 펼쳐진 옵션 "연습 시작"(혼자 그룹은 처음부터 펼쳐져 있다)
        click(h.container.querySelector('[data-entry="practice"]')!);
        expect(h.container.querySelector("[role=dialog]")).not.toBeNull();
        expect(h.container.textContent).toContain(ko["sim.setup.title"]);
        // 기록 끄고 시작(서버 없이)
        click(h.container.querySelector("#sim-opt-record")!);
        click(byText(h, ko["sim.setup.start"])!);
        expect(h.container.querySelector("[role=dialog]")).toBeNull();
        expect(h.container.textContent).toContain("0/15");
        // 진입 화면의 기록 읽기(레이팅·대전·드릴·멀티방)만 서버를 부르고, 세션은 만들지 않는다
        expect(nav.apiRequest.mock.calls.filter((c) => !/ratings|matches|drills|rooms/.test(String(c[0])))).toHaveLength(0);

        click(byLabel(h, ko["sim.controls.exit"])!);
        expect(h.container.textContent).toContain(ko["sim.exit.title"]);
        expect(h.container.textContent).toContain(ko["sim.exit.descPractice"]);
        await React.act(async () => { click(byText(h, ko["sim.exit.confirm"])!); await new Promise((r) => setTimeout(r, 10)); });
        expect(nav.navigate).toHaveBeenCalledWith("/dashboard");
    });

    it("샷이 끝나면 왼쪽 위 칩 열에 공유 알약이 생기고(툴바 밖), 누르면 결과 토스트가 뜬다(jsdom 은 캔버스가 없어 실패 문구)", async () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        expect(byLabel(h, ko["sim.share.button"])).toBeNull();
        await shoot(h);
        expect(byLabel(h, ko["sim.share.button"])).toBeNull();   // 재생 중엔 없다
        performance.now = () => realNow() + 1_000_000;
        await frames(4);
        const share = byLabel(h, ko["sim.share.button"]);
        expect(share).not.toBeNull();
        expect(share!.disabled).toBe(false);
        expect(h.container.querySelector("[data-sim-controls=right]")!.contains(share)).toBe(false);
        click(share!);
        await frames(3);
        const titles = nav.toast.mock.calls.map((c) => (c[0] as { title: string }).title);
        expect(titles.some((x) => x === ko["sim.share.failed"] || x === ko["sim.share.copied"])).toBe(true);
        expect(nav.apiRequest).not.toHaveBeenCalled();
    });

    it("?replay= 는 연습 세션을 그 배치로 열어 한 번 자동으로 치고, 해시가 맞으면 리플레이 칩만 보인다", async () => {
        const cfg = buildConfig({ gameType: "3c", target: 15 });
        const result = simulateShot(openingLayout("3c", TABLES.DAEDAE, "white"), { cueBallId: "white", phi: 1.3, V0: 2.8, a: 0.1, b: 0.05, theta: 0 }, paramsFromConfig(cfg));
        nav.search = `replay=${encodeReplay(replaySource(result, cfg))}`;
        const h = mount();
        await frames(2);
        expect(h.container.querySelector("[role=dialog]")).toBeNull();
        expect(h.container.textContent).toContain(ko["sim.top.practice"]);
        expect(h.container.textContent).toContain(ko["sim.share.replayChip"]);
        expect(h.container.textContent).not.toContain(ko["sim.share.replayMismatch"]);
        // 자동 샷이 재생 중이고(샷 버튼 잠금 · 빨리감기 안내) 서버는 부르지 않는다
        expect(byLabel(h, ko["sim.controls.shoot"])!.disabled).toBe(true);
        expect(h.container.textContent).toContain(ko["sim.hud.holdToFastForward"]);
        expect(nav.apiRequest).not.toHaveBeenCalled();
        performance.now = () => realNow() + 1_000_000;
        await frames(4);
        // 재생이 끝나면 보통 연습처럼 이어서 칠 수 있고 공유도 된다
        expect(byText(h, ko["sim.controls.shoot"])).not.toBeNull();
        expect(byLabel(h, ko["sim.share.button"])).not.toBeNull();
        expect(h.container.textContent).toContain(ko["sim.share.replayChip"]);
        // 되돌리면(연습) 리플레이 샷이 사라지므로 칩도 사라진다
        click(byLabel(h, ko["sim.controls.undo"])!);
        expect(h.container.textContent).not.toContain(ko["sim.share.replayChip"]);
    });

    it("툴바 당점 버튼은 당점 탭으로, 큐 각 버튼은 큐 각 탭으로 시트를 열고, 단계 칩을 누르면 툴바에 각도가 보인다", () => {
        nav.search = `cfg=${encodePageConfig({ config: buildConfig({ gameType: "3c", target: 5 }), record: false })}`;
        const h = mount();
        expect(h.container.querySelector("[data-sheet]")).toBeNull();
        click(byLabel(h, ko["sim.controls.spin"])!);
        let sheet = h.container.querySelector("[data-sheet]");
        expect(sheet).not.toBeNull();
        expect(sheet!.textContent).toContain(ko["sim.spin.title"]);
        const tabs = () => Array.from(sheet!.querySelectorAll("[role=tab]"));
        expect(tabs().map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false"]);
        expect(sheet!.textContent).toContain(ko["sim.controls.spinCenter"]);
        // 닫기 → 큐 각 버튼으로 다시 열면 큐 각 탭
        click(byText(h, ko["sim.common.close"])!);
        expect(h.container.querySelector("[data-sheet]")).toBeNull();
        click(byLabel(h, ko["sim.rail.elevation"])!);
        sheet = h.container.querySelector("[data-sheet]");
        expect(sheet).not.toBeNull();
        expect(tabs().map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true"]);
        const chip20 = Array.from(sheet!.querySelectorAll("button")).find((b) => b.textContent === "20°")!;
        expect(chip20.getAttribute("aria-pressed")).toBe("false");
        click(chip20);
        expect(Array.from(h.container.querySelectorAll("[data-sheet] button")).find((b) => b.textContent === "20°")!.getAttribute("aria-pressed")).toBe("true");
        // 툴바의 큐 각 버튼 아래에 "20°" 캡션
        expect(byLabel(h, ko["sim.rail.elevation"])!.textContent).toContain("20°");
        expect(nav.apiRequest).not.toHaveBeenCalled();
    });

    it("해시가 다른 리플레이는 '결과가 달라요' 칩을 함께 보이고, 깨진 리플레이는 설정 창으로 떨어진다", async () => {
        const cfg = buildConfig({ gameType: "4c", target: 80 });
        const result = simulateShot(openingLayout("4c", TABLES.JUNGDAE_KR, "white"), { cueBallId: "white", phi: 1.6, V0: 2.2, a: 0, b: 0, theta: 0 }, paramsFromConfig(cfg));
        nav.search = `replay=${encodeReplay({ ...replaySource(result, cfg), hash: "0000000000000000" })}`;
        const h = mount();
        await frames(2);
        expect(h.container.textContent).toContain(ko["sim.share.replayChip"]);
        expect(h.container.textContent).toContain(ko["sim.share.replayMismatch"]);
        expect(h.container.textContent).toContain(ko["sim.hud.rule4c"]);

        nav.search = "replay=not-a-real-payload";
        const broken = mount();
        expect(broken.container.querySelector("[role=dialog]")).not.toBeNull();
        expect(broken.container.textContent).toContain(ko["sim.setup.title"]);
    });
});
