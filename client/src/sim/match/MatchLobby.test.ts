/**
 * MatchLobby / MatchList 스모크 테스트(jsdom 직접 기동 — SimSetupDialog.test 와 같은 방식, "@" 별칭은 vi.mock).
 * 대전 API 는 props 로 가짜를 주입한다. 검증: 만들기 → 코드 표시 → 폴링으로 playing 이 되면 onStarted · 취소는 resign ·
 * 코드 6자리 입력 → 조회 → 호스트 다마수가 기본값 → 참가 → onStarted · 404 는 문구 · 목록은 정렬·배지·탭.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));
vi.mock("@/components/hiq/BallDot", async () => {
    const React = await import("react");
    return { BallDot: () => React.createElement("span") };
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
vi.mock("@/components/ui/dialog", async () => {
    const React = await import("react");
    const box = (tag: string) => ({ children, className }: { children?: unknown; className?: string }) => React.createElement(tag, { className }, children as never);
    return {
        Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? React.createElement("div", { role: "dialog" }, children as never) : null),
        DialogContent: box("div"), DialogHeader: box("div"), DialogFooter: box("div"), DialogTitle: box("h2"), DialogDescription: box("p"),
    };
});
vi.mock("@/components/ui/switch", async () => {
    const React = await import("react");
    return {
        Switch: ({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (v: boolean) => void }) =>
            React.createElement("button", { type: "button", role: "switch", id, "aria-checked": checked, onClick: () => onCheckedChange(!checked) }),
    };
});

import type { MatchApi, MatchPublic } from "../matchApi";

type ReactMod = typeof import("react");
type ClientMod = typeof import("react-dom/client");
type LobbyMod = typeof import("./MatchLobby");
type ListMod = typeof import("./MatchList");
type RQ = typeof import("@tanstack/react-query");

let React: ReactMod;
let createRoot: ClientMod["createRoot"];
let MatchLobby: LobbyMod["MatchLobby"];
let MatchList: ListMod["MatchList"];
let rq: RQ;
let dom: JSDOM;
const globalsSet: string[] = [];

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    const g = globalThis as unknown as Record<string, unknown>;
    for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event", "MouseEvent",
        "KeyboardEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "MutationObserver"]) {
        if (!(k in g) || g[k] === undefined) { g[k] = k === "window" ? dom.window : w[k]; globalsSet.push(k); }
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    if (!("React" in g)) { g.React = React; globalsSet.push("React"); }
    ({ createRoot } = await import("react-dom/client"));
    ({ MatchLobby } = await import("./MatchLobby"));
    ({ MatchList } = await import("./MatchList"));
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

function match(over: Partial<MatchPublic> = {}): MatchPublic {
    return {
        id: "m-1", code: "123456", status: "waiting",
        gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: "호스트", guestName: null, hostTarget: 20, guestTarget: null,
        myIndex: 0, turn: 0, shots: 0, version: 1, state: null, balls: null,
        winnerIndex: null, endReason: null, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
        createdAt: "2026-09-07T00:00:00.000Z", startedAt: null, lastShotAt: null, finishedAt: null, claimableAt: null,
        ...over,
    };
}

function fakeApi(over: Partial<MatchApi> = {}): MatchApi {
    return {
        createMatch: vi.fn(async () => match()),
        listMatches: vi.fn(async () => []),
        lookupCode: vi.fn(async () => match({ myIndex: -1 })),
        joinMatch: vi.fn(async () => match({ status: "playing", myIndex: 1, guestName: "나", guestTarget: 20 })),
        getMatch: vi.fn(async () => match()),
        getShots: vi.fn(async () => []),
        postShot: vi.fn(),
        resign: vi.fn(async () => ({ status: "canceled" as const })),
        claim: vi.fn(),
        listRooms: vi.fn(async () => []),
        joinRoom: vi.fn(async () => match({ status: "playing", myIndex: 1 })),
        invite: vi.fn(async () => ({ name: "홍길동" })),
        listOpponents: vi.fn(async () => [{ id: "op-1", name: "홍길동", handi3c: 20, handi4c: 80 }, { id: "op-2", name: "김철수", handi3c: null, handi4c: null }]),
        // 2026-09-12 핸디전: 방 만들기 화면이 "내 다마수" 를 물어본다
        getMyHandicap: vi.fn(async () => ({ minInnings: 20, innings: 18, boards: [
            { gameType: "3c" as const, avg: 0.4, target: 7, matches: 8, innings: 40, fromRecord: true },
            { gameType: "4c" as const, avg: 0.35, target: 60, matches: 8, innings: 40, fromRecord: true },
        ] })),
        ...over,
    };
}

function mountEl(el: React.ReactElement): Harness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    // 화면이 react-query 로 내 다마수를 읽는다(2026-09-12) — 테스트에도 클라이언트가 있어야 한다.
    const qc = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    React.act(() => { root.render(React.createElement(rq.QueryClientProvider, { client: qc }, el)); });
    const h: Harness = { container, unmount: () => { React.act(() => root.unmount()); container.remove(); qc.clear(); } };
    live.push(h);
    return h;
}

const click = (el: Element) => React.act(() => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
const buttons = (h: Harness) => Array.from(h.container.querySelectorAll("button"));
const byText = (h: Harness, text: string) => buttons(h).find((b) => b.textContent === text) ?? null;
const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const wait = (ms: number) => React.act(async () => { await new Promise((r) => setTimeout(r, ms)); });
function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    React.act(() => {
        setter.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
}

describe("MatchLobby · 만들기", () => {
    it("기본 폼(3쿠션·대대·15) → 대전 만들기 → 코드가 크게 보이고, 폴링으로 playing 이 되면 onStarted", async () => {
        const playing = match({ status: "playing", guestName: "게스트", guestTarget: 15, startedAt: "2026-09-07T00:01:00.000Z" });
        let polls = 0;
        const api = fakeApi({ getMatch: vi.fn(async () => (++polls >= 2 ? playing : match())) });
        const onStarted = vi.fn();
        const h = mountEl(React.createElement(MatchLobby, { onStarted, onClose: () => undefined, api, pollMs: 5 }));
        expect(h.container.textContent).toContain(ko["sim.entry.create"]);
        click(byText(h, ko["sim.match.create"])!);
        await flush();
        expect(api.createMatch).toHaveBeenCalledTimes(1);
        const cfg = (api.createMatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(cfg).toMatchObject({ gameType: "3c", tableId: "DAEDAE", target: 15, inningCap: 0, cushionModel: "han2005", condition: 1 });
        expect(cfg.rules).toEqual(DEFAULT_3C_RULES);
        expect(h.container.querySelector("[data-testid=lobby-waiting]")).not.toBeNull();
        expect(h.container.textContent).toContain("123 456");
        expect(h.container.textContent).toContain(ko["sim.match.waitingGuest"]);
        expect(byText(h, ko["sim.match.copy"])).not.toBeNull();
        expect(byText(h, ko["sim.match.shareLink"])).not.toBeNull();   // 공유 = 링크 공유(코드 복사와 다른 일)
        await wait(30);
        expect(polls).toBeGreaterThanOrEqual(2);
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(onStarted.mock.calls[0][0].status).toBe("playing");
    });
    it("4구로 바꾸면 중대·80·3쿠션 2배 스위치, 취소는 resign 을 부르고 폼으로 돌아온다", async () => {
        const api = fakeApi();
        const h = mountEl(React.createElement(MatchLobby, { onStarted: vi.fn(), onClose: () => undefined, api, pollMs: 1000 }));
        click(byText(h, ko["sim.setup.type4c"])!);
        // 2026-09-12: 기본이 핸디전이라 다마수 입력이 없다 — 맞대결로 바꿔야 나온다
        expect(h.container.querySelector("#sim-match-target")).toBeNull();
        click(h.container.querySelector("#sim-match-handicap")!);
        // 3쿠션 2배 스위치는 세부 설정 안(접힘) — 펼쳐야 보인다
        expect(h.container.querySelectorAll("[role=switch]")).toHaveLength(2);   // 핸디전 + 멀티방으로 열기
        click(Array.from(h.container.querySelectorAll("button")).find((b) => b.textContent?.startsWith(ko["sim.setup.advanced"]))!);
        // 2026-09-12: '미리보기 전체' 를 대전에서 뺐다(랭킹이 섞인다) — 남은 스위치는 핸디전 + 멀티방 + 3쿠션 2배
        expect(h.container.querySelectorAll("[role=switch]")).toHaveLength(3);
        expect((h.container.querySelector("#sim-match-target") as HTMLInputElement).value).toBe("80");
        click(byText(h, ko["sim.match.create"])!);
        await flush();
        const cfg = (api.createMatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(cfg).toMatchObject({ gameType: "4c", tableId: "JUNGDAE_KR", target: 80 });
        expect(cfg.matchPreview ?? "short").toBe("short");   // 대전 미리보기는 언제나 짧다
        click(byText(h, ko["sim.match.cancelWait"])!);
        await flush();
        expect(api.resign).toHaveBeenCalledWith("m-1");
        expect(h.container.querySelector("[data-testid=lobby-waiting]")).toBeNull();
        expect(byText(h, ko["sim.match.create"])).not.toBeNull();
    });
    it("기본은 핸디전 — 다마수를 안 적고, 내 다마수를 보여 주고, 만들 때 handicap 이 켜져 나간다", async () => {
        const api = fakeApi();
        const h = mountEl(React.createElement(MatchLobby, { onStarted: vi.fn(), onClose: () => undefined, api, pollMs: 1000 }));
        await flush();
        expect(h.container.querySelector("#sim-match-target")).toBeNull();
        expect(h.container.textContent).toContain(ko["sim.match.myHandicap"]);
        expect(h.container.textContent).toContain("7");                       // 3쿠션 내 다마수(fakeApi)
        click(byText(h, ko["sim.match.create"])!);
        await flush();
        expect((api.createMatch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ handicap: true });
    });

    it("맞대결에서 다마수를 비우면 만들기가 잠긴다", () => {
        const h = mountEl(React.createElement(MatchLobby, { onStarted: vi.fn(), onClose: () => undefined, api: fakeApi() }));
        click(h.container.querySelector("#sim-match-handicap")!);   // 핸디전 끄기 → 다마수 입력이 나온다
        type(h.container.querySelector("#sim-match-target") as HTMLInputElement, "");
        expect(byText(h, ko["sim.match.create"])!.disabled).toBe(true);
        expect(h.container.textContent).toContain(ko["sim.setup.targetRange"]);
    });
});

describe("MatchLobby · 코드로 참가", () => {
    it("6자리가 차면 조회 → 호스트·종목·다마수, 내 다마수 기본값 = 호스트 다마수 → 참가하기 → onStarted", async () => {
        const api = fakeApi();
        const onStarted = vi.fn();
        const h = mountEl(React.createElement(MatchLobby, { onStarted, onClose: () => undefined, api, initialTab: "join" }));
        const input = h.container.querySelector("#sim-match-code") as HTMLInputElement;
        expect(input).not.toBeNull();
        type(input, "12-34");
        expect(input.value).toBe("1234");
        expect(api.lookupCode).not.toHaveBeenCalled();
        type(input, "123456");
        expect(h.container.textContent).toContain(ko["sim.match.lookingUp"]);
        await flush();
        expect(api.lookupCode).toHaveBeenCalledWith("123456");
        expect(h.container.querySelector("[data-testid=lobby-found]")).not.toBeNull();
        expect(h.container.textContent).toContain("호스트");
        expect(h.container.textContent).toContain(ko["sim.setup.type3c"]);
        expect(h.container.textContent).toContain(ko["sim.hud.ruleUmb"]);
        expect((h.container.querySelector("#sim-match-guest-target") as HTMLInputElement).value).toBe("20");
        // 다마수 칩으로 바꾼다
        click(buttons(h).find((b) => b.textContent === "15" && b.getAttribute("aria-pressed") !== null)!);
        click(byText(h, ko["sim.match.join"])!);
        await flush();
        expect(api.joinMatch).toHaveBeenCalledWith("123456", 15);
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(onStarted.mock.calls[0][0].myIndex).toBe(1);
    });
    it("없는 코드는 문구로, 지우면 사라진다; 참가 실패(409)도 문구", async () => {
        const api = fakeApi({
            lookupCode: vi.fn(async (code: string) => { if (code === "000000") throw { status: 404 }; return match({ myIndex: -1 }); }),
            joinMatch: vi.fn(async () => { throw { status: 409 }; }),
        });
        const h = mountEl(React.createElement(MatchLobby, { onStarted: vi.fn(), onClose: () => undefined, api, initialTab: "join" }));
        const input = h.container.querySelector("#sim-match-code") as HTMLInputElement;
        type(input, "000000");
        await flush();
        expect(h.container.textContent).toContain(ko["sim.match.notFound"]);
        expect(h.container.querySelector("[data-testid=lobby-found]")).toBeNull();
        type(input, "00000");
        expect(h.container.textContent).not.toContain(ko["sim.match.notFound"]);
        type(input, "123456");
        await flush();
        click(byText(h, ko["sim.match.join"])!);
        await flush();
        expect(h.container.textContent).toContain(ko["sim.match.alreadyStarted"]);
    });
    it("탭 전환과 닫기", () => {
        const onClose = vi.fn();
        const h = mountEl(React.createElement(MatchLobby, { onStarted: vi.fn(), onClose, api: fakeApi(), showTabs: true }));
        expect(h.container.querySelector("#sim-match-code")).toBeNull();
        click(byText(h, ko["sim.match.tabJoin"])!);
        expect(h.container.querySelector("#sim-match-code")).not.toBeNull();
        click(byText(h, ko["sim.common.close"])!);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("MatchList", () => {
    it("정렬(내 차례 먼저)·배지·탭 → onOpen, 대기 중 대전은 코드를 보여 준다", async () => {
        const list = [
            match({ id: "fin", status: "finished", guestName: "게스트", winnerIndex: 1 }),
            match({ id: "their", status: "playing", guestName: "게스트", turn: 1 }),
            match({ id: "wait" }),
            match({ id: "mine", status: "playing", guestName: "친구", turn: 0 }),
        ];
        const api = fakeApi({ listMatches: vi.fn(async () => list) });
        const onOpen = vi.fn();
        const client = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
        const h = mountEl(React.createElement(rq.QueryClientProvider, { client }, React.createElement(MatchList, { onOpen, api })));
        expect(h.container.textContent).toContain(ko["sim.match.listLoading"]);
        await flush();
        await flush();
        // 행 버튼만(기권·취소 버튼은 aria-label 이 있다)
        const rows = buttons(h).filter((b) => !b.getAttribute("aria-label"));
        expect(rows).toHaveLength(4);
        // 진행 중 두 건은 기권, 내가 연 대기 방은 취소 버튼이 붙는다
        expect(buttons(h).filter((b) => b.getAttribute("aria-label") === ko["sim.match.resign"])).toHaveLength(2);
        expect(buttons(h).filter((b) => b.getAttribute("aria-label") === ko["sim.match.cancelShort"])).toHaveLength(1);
        expect(rows[0].textContent).toContain("친구");
        expect(rows[0].textContent).toContain(ko["sim.match.statusMyTurn"]);
        expect(rows[1].textContent).toContain(ko["sim.match.statusTheirTurn"]);
        expect(rows[2].textContent).toContain(ko["sim.match.opponentPending"]);
        expect(rows[2].textContent).toContain("123 456");
        expect(rows[3].textContent).toContain(ko["sim.match.statusLost"]);
        click(rows[0]);
        expect(onOpen).toHaveBeenCalledWith(list[3]);
        client.clear();
    });
    it("빈 목록·실패 문구", async () => {
        const client = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
        const h = mountEl(React.createElement(rq.QueryClientProvider, { client }, React.createElement(MatchList, { onOpen: vi.fn(), api: fakeApi() })));
        await flush();
        await flush();
        expect(h.container.textContent).toContain(ko["sim.match.listEmpty"]);
        client.clear();
        const bad = fakeApi({ listMatches: vi.fn(async () => { throw new TypeError("Failed to fetch"); }) });
        const client2 = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
        const h2 = mountEl(React.createElement(rq.QueryClientProvider, { client: client2 }, React.createElement(MatchList, { onOpen: vi.fn(), api: bad })));
        await flush();
        await flush();
        expect(h2.container.textContent).toContain(ko["sim.match.listFailed"]);
        expect(byText(h2, ko["sim.match.retry"])).not.toBeNull();
        client2.clear();
    });
});

describe("MatchLobby · 멀티방·비밀번호·친구 초대(2026-09-08)", () => {
    it("멀티방으로 열기 + 비밀번호 → createMatch 에 방 옵션, 대기 화면은 공개 문구·칩, 친구에게 보내기 → 초대 푸시", async () => {
        const api = fakeApi({ createMatch: vi.fn(async () => match({ isPublic: true, hasPassword: true })) });
        const h = mountEl(React.createElement(MatchLobby, { onStarted: () => undefined, onClose: () => undefined, api, pollMs: 1000 }));
        expect(h.container.querySelector("#sim-match-password")).toBeNull();
        click(h.container.querySelector("#sim-match-public")!);
        const pw = h.container.querySelector("#sim-match-password") as HTMLInputElement;
        expect(pw).not.toBeNull();
        type(pw, "12");
        expect(h.container.textContent).toContain(ko["sim.match.passwordInvalid"]);
        expect((byText(h, ko["sim.match.create"]) as HTMLButtonElement).disabled).toBe(true);
        type(pw, "1234");
        expect((byText(h, ko["sim.match.create"]) as HTMLButtonElement).disabled).toBe(false);
        click(byText(h, ko["sim.match.create"])!);
        await flush();
        expect(api.createMatch).toHaveBeenCalledTimes(1);
        expect((api.createMatch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ isPublic: true, handicap: true, password: "1234" });
        expect(h.container.textContent).toContain(ko["sim.match.publicWaiting"]);
        expect(h.container.textContent).toContain(ko["sim.match.publicLocked"]);
        // 친구에게 보내기
        click(byText(h, ko["sim.match.invite"])!);
        await flush();
        const dlg = h.container.querySelector("[role=dialog]")!;
        expect(dlg).not.toBeNull();
        expect(api.listOpponents).toHaveBeenCalledTimes(1);
        expect(dlg.textContent).toContain("홍길동");
        expect(dlg.textContent).toContain("김철수");
        click(Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent?.includes("홍길동"))!);
        await flush();
        expect(api.invite).toHaveBeenCalledWith("m-1", "op-1");
        expect(h.container.textContent).toContain(ko["sim.match.inviteSent"].replace("{name}", "홍길동"));
    });

    it("멀티방 토글 없이 만들면 방 옵션은 비공개·비밀번호 없음, initialPublic 은 켜진 채 시작", async () => {
        const api = fakeApi();
        const h = mountEl(React.createElement(MatchLobby, { onStarted: () => undefined, onClose: () => undefined, api, pollMs: 1000 }));
        click(byText(h, ko["sim.match.create"])!);
        await flush();
        expect((api.createMatch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ isPublic: false, handicap: true, password: undefined });
        const h2 = mountEl(React.createElement(MatchLobby, { onStarted: () => undefined, onClose: () => undefined, api: fakeApi(), pollMs: 1000, initialPublic: true }));
        expect(h2.container.querySelector("#sim-match-password")).not.toBeNull();
    });

    it("코드가 채워진 참가 화면(initialCode): 비밀번호 방이면 비밀번호를 넣어야 참가 → joinMatch(code, 다마수, 비밀번호)", async () => {
        const api = fakeApi({ lookupCode: vi.fn(async () => match({ myIndex: -1, hasPassword: true })) });
        const onStarted = vi.fn();
        const h = mountEl(React.createElement(MatchLobby, { onStarted, onClose: () => undefined, api, initialTab: "join", initialCode: "123456" }));
        await flush();
        expect(api.lookupCode).toHaveBeenCalledWith("123456");
        expect(h.container.querySelector("[data-testid=lobby-found]")).not.toBeNull();
        const join = byText(h, ko["sim.match.join"]) as HTMLButtonElement;
        expect(join.disabled).toBe(true);
        type(h.container.querySelector("#sim-match-join-password") as HTMLInputElement, "abcd");
        expect(join.disabled).toBe(false);
        click(join);
        await flush();
        expect(api.joinMatch).toHaveBeenCalledWith("123456", 20, "abcd");
        expect(onStarted).toHaveBeenCalledTimes(1);
    });
});
