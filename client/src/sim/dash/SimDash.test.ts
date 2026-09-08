/**
 * SimDash 스모크(jsdom 직접 기동 — MatchLobby.test 와 같은 방식). statsApi·matchApi 를 주입한다.
 * 검증: 큰 숫자(최근 10세션 점수합/이닝합) · 지표 칸 · 차트 svg 둘 + 방향키로 읽기 줄 이동 · 종목 칩으로 숫자 전환 ·
 * 대전 섹션(전적·연속·흐름·내 대전 목록) · 드릴 · 최근 세션 표(10행 → 모두 보기) · 기록 없음 → 연습 시작.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { weekIdFor } from "@shared/sim/drills";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/components/ui/button", async () => {
    const React = await import("react");
    return { Button: (p: Record<string, unknown>) => { const { children, variant: _v, ...rest } = p; return React.createElement("button", rest, children as never); } };
});
vi.mock("@/components/ui/dialog", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        DialogContent: box("div"), DialogHeader: box("div"), DialogFooter: box("div"), DialogTitle: box("h2"), DialogDescription: box("p"),
    };
});

import type { MatchApi, MatchPublic } from "../matchApi";
import type { SimStats, SimSessionSummary } from "./dashApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type DashMod = typeof import("./SimDash");
type RQ = typeof import("@tanstack/react-query");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let SimDash: DashMod["SimDash"];
let rq: RQ;
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "KeyboardEvent", "PointerEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver", "SVGElement"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ SimDash } = await import("./SimDash"));
    rq = await import("@tanstack/react-query");
});

afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of globalsSet) delete g[k];
    dom.window.close();
});

interface Harness { container: HTMLElement; unmount: () => void }
const live: Harness[] = [];
afterEach(() => { while (live.length) live.pop()!.unmount(); });

const NOW = Date.UTC(2026, 8, 8, 12);
const day = (i: number) => new Date(NOW - (40 - i) * 86_400_000).toISOString();
const S = (i: number, o: Partial<SimSessionSummary> = {}): SimSessionSummary => ({
    id: `s${i}`, kind: "solo", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, targetScore: 15, inningCap: 0,
    score: 10, innings: 20, highRun: (i % 4) + 1, shots: 30, status: "finished", startedAt: day(i), finishedAt: day(i), ...o,
});
/** 3쿠션 대대 12세션(첫 둘은 0.10, 나머지 열은 0.50) + 4구 대대 1세션(3.00, 가장 오래돼 기본 칩은 3쿠션) + 진행 중 1 */
function stats(): SimStats {
    const sessions: SimSessionSummary[] = [
        S(1, { score: 2 }), S(2, { score: 2 }),
        ...Array.from({ length: 10 }, (_, k) => S(3 + k)),
        S(0, { gameType: "4c", score: 60, highRun: 9 }),
        S(21, { status: "playing" }),
    ];
    return {
        ratings: [
            { gameType: "3c", tableId: "DAEDAE", sessions: 12, totalScore: 104, totalInnings: 240, bestAvg: 0.5, bestHighRun: 4, simRating: 1024, matches: 3, wins: 2, updatedAt: day(12) },
            { gameType: "4c", tableId: "DAEDAE", sessions: 1, totalScore: 60, totalInnings: 20, bestAvg: 3, bestHighRun: 9, simRating: 1000, matches: 0, wins: 0, updatedAt: day(0) },
        ],
        sessions,
        ranks: [{ gameType: "3c", tableId: "DAEDAE", rank: 3, total: 12 }],
        drillWeeks: [{ weekId: weekIdFor(NOW), attempts: 4, successes: 2, cushions: 9 }, { weekId: weekIdFor(NOW - 7 * 86_400_000), attempts: 5, successes: 5, cushions: 15 }],
        currentWeekId: weekIdFor(NOW),
    };
}
const M = (id: string, o: Partial<MatchPublic>): MatchPublic => ({
    id, code: "ABC123", status: "finished", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, aimAssist: true, fullPreview: false,
    rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0, hostName: "나", guestName: "상대", hostTarget: 15, guestTarget: 15,
    myIndex: 0, turn: 0, shots: 0, version: 0, state: null, balls: null, winnerIndex: 0, endReason: "target", engineVersion: "v", paramsHash: "h",
    createdAt: day(1), startedAt: day(1), lastShotAt: null, finishedAt: day(1), claimableAt: null, turnSeenAt: null, serverNow: null, ...o,
});
function matches(): MatchPublic[] {
    return [
        M("m1", { winnerIndex: 0, finishedAt: day(2) }),                                  // W
        M("m2", { myIndex: 1, winnerIndex: 0, finishedAt: day(3), hostName: "상대", guestName: "나" }), // L
        M("m3", { winnerIndex: 0, finishedAt: day(4) }),                                  // W
        M("m4", { status: "playing", turn: 0, winnerIndex: null, endReason: null, finishedAt: null, createdAt: day(5) }), // 내 차례
    ];
}

function fakeMatchApi(rows: MatchPublic[]): MatchApi {
    return {
        listMatches: vi.fn(async () => rows),
        resign: vi.fn(async () => ({ status: "finished" as const })),
    } as unknown as MatchApi;
}

function mount(props: Partial<React.ComponentProps<DashMod["SimDash"]>> & { stats?: SimStats; rows?: MatchPublic[] }): Harness & { onPractice: ReturnType<typeof vi.fn> } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onPractice = vi.fn();
    const { stats: st = stats(), rows = matches(), ...rest } = props;
    React.act(() => {
        root.render(React.createElement(rq.QueryClientProvider, { client: qc },
            React.createElement(SimDash, {
                onClose: () => undefined, onOpenMatch: () => undefined, onPractice, onDrills: () => undefined, onLobby: () => undefined,
                statsApi: async () => st, matchApi: fakeMatchApi(rows), now: NOW, ...rest,
            })));
    });
    const h = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); }, onPractice };
    live.push(h);
    return h;
}

async function settle(h: Harness, until: () => boolean, tries = 40): Promise<void> {
    for (let i = 0; i < tries && !until(); i++) {
        await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    }
    expect(until(), h.container.textContent ?? "").toBe(true);
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const text = (h: Harness) => h.container.textContent ?? "";
const hero = (h: Harness) => h.container.querySelector("[data-hero]")?.textContent ?? "";
const buttons = (h: Harness) => Array.from(h.container.querySelectorAll("button"));

describe("SimDash", () => {
    it("큰 숫자·지표·차트·표·대전·드릴이 한 화면에", async () => {
        const h = mount({});
        await settle(h, () => hero(h) !== "");
        // 최근 10세션 = 0.50, 이전 2세션 0.10 → +0.40
        expect(hero(h)).toBe("0.50");
        expect(text(h)).toContain("+0.40");
        expect(text(h)).toContain("전체 에버리지 0.43 · 세션 12");
        // 지표 여섯 칸
        expect(text(h)).toContain("3위");
        expect(text(h)).toContain("12명 중");
        expect(text(h)).toContain("1024");
        expect(text(h)).toContain("2승 1패");
        // 차트 셋
        const trend = h.container.querySelector(`svg[aria-label="${ko["sim.dash.chartTrendAria"]}"]`);
        const runs = h.container.querySelector(`svg[aria-label="${ko["sim.dash.chartRunAria"]}"]`);
        const drill = h.container.querySelector(`svg[aria-label="${ko["sim.dash.chartDrillAria"]}"]`);
        expect(trend && runs && drill).toBeTruthy();
        // 마지막 점 마커 + 값 라벨, 눈금선은 hairline
        expect(trend!.querySelectorAll("circle")).toHaveLength(1);
        expect(trend!.querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
        expect(trend!.textContent).toContain("0.50");
        // 대전 섹션: 전적·연속·내 차례·흐름·내 대전 목록
        expect(text(h)).toContain(ko["sim.dash.matchesTitle"]);
        expect(text(h)).toContain("1연승");
        expect(text(h)).toContain("진행 중 1");
        const strip = h.container.querySelector(`ol[aria-label="${ko["sim.dash.formTitle"].replace("{n}", "3")}"]`)!;
        expect(Array.from(strip.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["승", "패", "승"]);
        expect(text(h)).toContain(ko["sim.match.listTitle"]);
        expect(buttons(h).some((b) => b.getAttribute("aria-label") === ko["sim.match.resign"])).toBe(true);
        // 드릴: 이번 주 2/5, 누적 7/9, 숨긴 표 쌍둥이(8주)
        expect(text(h)).toContain("이번 주 2/5");
        expect(text(h)).toContain("누적 성공 7/9");
        expect(h.container.querySelectorAll("table.sr-only tbody tr")).toHaveLength(8);
        // 표: 12세션 중 10행, 모두 보기
        expect(h.container.querySelectorAll("table:not(.sr-only) tbody tr")).toHaveLength(10);
        click(buttons(h).find((b) => b.textContent === ko["sim.dash.showAll"].replace("{n}", "12"))!);
        expect(h.container.querySelectorAll("table:not(.sr-only) tbody tr")).toHaveLength(12);
        // 화면의 초록 버튼은 없다(연습 시작은 기록 없을 때만)
        expect(buttons(h).some((b) => b.className.includes("bg-brand "))).toBe(false);
    });

    it("방향키로 읽기 줄이 이전 점으로, 종목 칩을 고르면 숫자가 그 종목으로", async () => {
        const h = mount({ rows: [] });
        await settle(h, () => hero(h) !== "");
        const trend = h.container.querySelector(`svg[aria-label="${ko["sim.dash.chartTrendAria"]}"]`) as SVGSVGElement;
        const readout = () => trend.parentElement!.querySelector("[aria-live]")!.textContent ?? "";
        expect(readout()).toContain("0.50");
        // 세 번 왼쪽: 0.50(12) → 11 → 10 → 9 … 모두 0.50, 열 번 더 가면 0.10 인 2번 세션
        React.act(() => { for (let i = 0; i < 11; i++) trend.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
        expect(readout()).toContain("0.10");
        // 칩: 3쿠션·대대(최근 활동) / 4구·대대
        const group = h.container.querySelector(`[role="group"][aria-label="${ko["sim.dash.filterAria"]}"]`)!;
        const chips = Array.from(group.querySelectorAll("button"));
        expect(chips).toHaveLength(2);
        expect(chips[0].getAttribute("aria-pressed")).toBe("true");
        click(chips.find((c) => c.textContent?.includes("4구"))!);
        expect(hero(h)).toBe("3.00");
        expect(text(h)).toContain(ko["sim.dash.deltaNone"]);
        expect(text(h)).toContain("0승 0패");
    });

    it("기록이 없으면 안내와 연습 시작(초록 하나), 대전 섹션은 남는다 · sec=matches 도 안전", async () => {
        const h = mount({ stats: { ratings: [], sessions: [], ranks: [], drillWeeks: [], currentWeekId: "2026-W37" }, rows: [], initialSection: "matches" });
        await settle(h, () => text(h).includes(ko["sim.dash.empty"]));
        const start = buttons(h).find((b) => b.textContent === ko["sim.dash.startPractice"])!;
        expect(start.className).toContain("bg-brand");
        click(start);
        expect(h.onPractice).toHaveBeenCalledTimes(1);
        expect(h.container.querySelector("[data-hero]")).toBeNull();
        expect(text(h)).toContain(ko["sim.match.listEmpty"]);
        expect(text(h)).toContain(ko["sim.dash.drillEmpty"]);
        expect(h.container.querySelector("[role=group]")).toBeNull();
    });

    it("불러오기 실패는 문구와 다시 시도", async () => {
        const h = mount({ statsApi: async () => { throw new Error("boom"); } });
        await settle(h, () => text(h).includes(ko["sim.dash.failed"]));
        expect(buttons(h).some((b) => b.textContent === ko["sim.match.retry"])).toBe(true);
    });
});
