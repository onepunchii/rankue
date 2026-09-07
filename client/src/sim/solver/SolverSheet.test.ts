/**
 * SolverSheet 스모크 테스트(jsdom 직접 기동, "@" 별칭은 vi.mock — SimSetupDialog.test 와 같은 방식).
 * 검증: 상태 문구 · 상위 3개만 · 조준/세기/당점/쿠션 문구 · 적용 콜백 · 경로 보기 토글(하나만, 닫으면 null) · 중단/다시 찾기.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { ko } from "../../lib/i18n/ko";
import { DEFAULT_PARAMS } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { searchShots, type SolveCandidate } from "./search";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/components/ui/sheet", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) =>
        React.createElement(tag, { className }, children as never);
    return {
        Sheet: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        SheetContent: box("div"), SheetHeader: box("div"), SheetTitle: box("h2"), SheetDescription: box("p"),
    };
});

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type SheetMod = typeof import("./SolverSheet");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let SolverSheet: SheetMod["SolverSheet"];
let aimText: SheetMod["aimText"];
let spinText: SheetMod["spinText"];
let dom: JSDOM;
const globalsSet: string[] = [];
let candidates: SolveCandidate[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ SolverSheet, aimText, spinText } = await import("./SolverSheet"));
    const r = searchShots({
        balls: openingLayout("3c", DEFAULT_PARAMS.table), cueBallId: "white", gameType: "3c",
        rules: DEFAULT_3C_RULES, params: DEFAULT_PARAMS, seed: 1, maxSimulations: 1500, maxCandidates: 5,
    }, { now: () => 0 });
    candidates = r.candidates.slice();
    expect(candidates.length).toBeGreaterThanOrEqual(4);
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

function mountSheet(props: Partial<Parameters<SheetMod["SolverSheet"]>[0]> = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onApply = vi.fn();
    const onPreview = vi.fn();
    const onOpenChange = vi.fn();
    const base = { open: true, onOpenChange, status: "done" as const, progress: { tried: 400, found: 6, phase: "done" as const }, candidates, onApply, onPreview };
    const render = (over: Partial<Parameters<SheetMod["SolverSheet"]>[0]> = {}) =>
        React.act(() => { root.render(React.createElement(SolverSheet, { ...base, ...props, ...over })); });
    render();
    const h = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); } };
    live.push(h);
    const buttons = (label: string) => Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === label);
    return { container, onApply, onPreview, onOpenChange, render, buttons };
}

describe("SolverSheet", () => {
    it("상위 3개만 그리고 상태 문구·조준·세기·당점·쿠션이 들어간다", () => {
        const h = mountSheet();
        expect(h.container.querySelectorAll("li")).toHaveLength(3);
        const text = h.container.textContent ?? "";
        expect(text).toContain(ko["sim.solver.title"]);
        expect(text).toContain("400개 시도 · 해법 5개");
        expect(text).toContain("m/s");
        expect(text).toContain("쿠션 " + candidates[0].outcome.cushionsBeforeSecond + "개");
        expect(text).toContain(aimText(candidates[0].aim, (k) => ko[k] ?? k));
        expect(h.buttons(ko["sim.solver.apply"])).toHaveLength(3);
        expect(h.buttons(ko["sim.solver.preview"])).toHaveLength(3);
        // 중단·찾기 버튼은 콜백이 없으면 없다
        expect(h.buttons(ko["sim.solver.cancel"])).toHaveLength(0);
        expect(h.buttons(ko["sim.solver.retry"])).toHaveLength(0);
    });

    it("적용은 그 줄의 후보를 넘긴다", () => {
        const h = mountSheet();
        React.act(() => { h.buttons(ko["sim.solver.apply"])[1].click(); });
        expect(h.onApply).toHaveBeenCalledTimes(1);
        expect(h.onApply.mock.calls[0][0]).toBe(candidates[1]);
    });

    it("경로 보기는 한 번에 하나, 다시 누르면 null, 닫으면 null", () => {
        const h = mountSheet();
        React.act(() => { h.buttons(ko["sim.solver.preview"])[0].click(); });
        expect(h.onPreview).toHaveBeenLastCalledWith(candidates[0]);
        expect(h.buttons(ko["sim.solver.previewOn"])).toHaveLength(1);
        React.act(() => { h.buttons(ko["sim.solver.preview"])[0].click(); }); // 이제 두 번째 줄이 첫 "경로 보기"
        expect(h.onPreview).toHaveBeenLastCalledWith(candidates[1]);
        expect(h.buttons(ko["sim.solver.previewOn"])).toHaveLength(1);
        React.act(() => { h.buttons(ko["sim.solver.previewOn"])[0].click(); });
        expect(h.onPreview).toHaveBeenLastCalledWith(null);
        expect(h.buttons(ko["sim.solver.previewOn"])).toHaveLength(0);
        // 켜 둔 채 닫으면 null 로 되돌리고 onOpenChange(false)
        React.act(() => { h.buttons(ko["sim.solver.preview"])[2].click(); });
        expect(h.onPreview).toHaveBeenLastCalledWith(candidates[2]);
        h.onPreview.mockClear();
        // 후보 목록이 바뀌면(새 탐색) 경로를 끈다
        h.render({ candidates: candidates.slice(0, 2) });
        expect(h.onPreview).toHaveBeenLastCalledWith(null);
    });

    it("찾는 중이면 진행 문구와 중단, 끝나면 다시 찾기, 없으면 안내", () => {
        const onCancel = vi.fn();
        const onRetry = vi.fn();
        const h = mountSheet({ status: "running", progress: { tried: 123, found: 0, phase: "seed" }, candidates: [], onCancel, onRetry });
        expect(h.container.textContent).toContain("해법 찾는 중… 123개 시도");
        expect(h.buttons(ko["sim.solver.cancel"])).toHaveLength(1);
        expect(h.buttons(ko["sim.solver.retry"])).toHaveLength(0);
        React.act(() => { h.buttons(ko["sim.solver.cancel"])[0].click(); });
        expect(onCancel).toHaveBeenCalledTimes(1);
        h.render({ status: "done", progress: { tried: 900, found: 0, phase: "done" }, candidates: [], onCancel, onRetry });
        expect(h.container.textContent).toContain(ko["sim.solver.none"]);
        expect(h.container.textContent).toContain(ko["sim.solver.noneHint"]);
        expect(h.buttons(ko["sim.solver.retry"])).toHaveLength(1);
        React.act(() => { h.buttons(ko["sim.solver.retry"])[0].click(); });
        expect(onRetry).toHaveBeenCalledTimes(1);
        h.render({ status: "idle", progress: null, candidates: [], onCancel, onRetry });
        expect(h.container.textContent).toContain(ko["sim.solver.idle"]);
        expect(h.buttons(ko["sim.solver.start"])).toHaveLength(1);
        h.render({ status: "error", progress: null, candidates: [], onCancel, onRetry });
        expect(h.container.textContent).toContain(ko["sim.solver.error"]);
    });

    it("문구 헬퍼: 두께·좌우·뱅크·당점", () => {
        const t = (k: string) => ko[k] ?? k;
        expect(aimText({ kind: "ball", id: "red", thickness: 0.5, side: "right" }, t)).toBe("빨간 공 · ½ · 우");
        expect(aimText({ kind: "ball", id: "yellow", thickness: 1, side: "center" }, t)).toBe("노란 공 · 정면");
        expect(aimText({ kind: "ball", id: "red1", thickness: 0.6, side: "left" }, t)).toBe("빨간 공 1 · 60% · 좌");
        expect(aimText({ kind: "bank", cushion: "right" }, t)).toBe("뱅크 먼저 · 오른쪽 쿠션");
        expect(aimText({ kind: "none" }, t)).toBe("직접 조준");
        expect(spinText(0, 0, 0.5, t)).toBe("당점 중앙");
        expect(spinText(0.3, 0.25, 0.5, t)).toBe("우 60% · 상 50%");
        expect(spinText(-0.15, -0.3, 0.5, t)).toBe("좌 30% · 하 60%");
    });
});
