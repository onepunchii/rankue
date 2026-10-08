import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN_PATH, adminEntryOf, adminState, closeTopLayer, nextMove } from "../client/src/pages/admin/adminBack";

/**
 * 관리자 콘솔의 '뒤로'(2026-10-08 오너: "어드민에서 모바일 시 뒤로가기 시 자꾸 랭큐 페이지로 넘어가서 … 뒤로가기 적용 잘해주고,
 * 어드민 나갈 때 어드민 나가겠냐고 창 띄워주면 어때?"). 실제 '뒤로' 동작은 하니스(브라우저)로 봤다 — 여기는 셈과 뼈대를 고정한다.
 * (화면 시험은 shared/ 에 둔다 — vitest 가 client 는 sim·golf 만 돈다.)
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("adminEntryOf · adminState — 히스토리 한 칸에 적는 것", () => {
    it("적은 것을 그대로 읽는다", () => {
        const e = { d: 2, tab: "members", r: "dashboard" };
        expect(adminEntryOf(adminState(e))).toEqual(e);
        // 다른 것이 같이 적혀 있어도(밑바닥 표시 등)
        expect(adminEntryOf({ ...adminState(e), other: 1 })).toEqual(e);
    });

    it("관리자 칸이 아니면 null — 라우터가 쌓은 칸(null)·밑바닥·깨진 값", () => {
        for (const s of [null, undefined, {}, { rkAdminBase: true }, { rkAdmin: null }, { rkAdmin: "x" }, { rkAdmin: { d: -1, tab: "a" } }, { rkAdmin: { d: 1.5, tab: "a" } }, { rkAdmin: { d: 0, tab: "" } }, { rkAdmin: { d: 0 } }, "str", 3]) {
            expect(adminEntryOf(s), JSON.stringify(s)).toBeNull();
        }
    });

    it("첫 화면 메뉴(r)가 안 적힌 옛 칸은 그 칸의 메뉴를 첫 화면으로 본다", () => {
        expect(adminEntryOf({ rkAdmin: { d: 0, tab: "dashboard" } })).toEqual({ d: 0, tab: "dashboard", r: "dashboard" });
    });
});

describe("nextMove — 메뉴를 골랐을 때", () => {
    const at = (d: number, tab: string, r = "dashboard") => ({ d, tab, r });

    it("같은 메뉴면 그대로(칸을 쌓지 않는다)", () => {
        expect(nextMove(at(0, "dashboard"), "dashboard")).toEqual({ kind: "stay" });
        expect(nextMove(at(3, "members"), "members")).toEqual({ kind: "stay" });
    });

    it("다른 메뉴면 한 칸 쌓는다 — '뒤로'는 앞에 보던 메뉴로", () => {
        expect(nextMove(at(0, "dashboard"), "members")).toEqual({ kind: "push", entry: at(1, "members") });
        expect(nextMove(at(1, "members"), "visitors")).toEqual({ kind: "push", entry: at(2, "visitors") });
    });

    it("첫 화면의 메뉴('홈')를 다시 고르면 쌓지 않고 그 칸으로 돌아간다 — 홈에서 '뒤로'는 늘 '나갈까요?'", () => {
        expect(nextMove(at(1, "members"), "dashboard")).toEqual({ kind: "home", back: 1 });
        expect(nextMove(at(4, "visitors"), "dashboard")).toEqual({ kind: "home", back: 4 });
    });

    it("알림으로 들어와 첫 화면이 대시보드가 아닐 때 — 대시보드는 그냥 쌓고, 첫 화면 메뉴로는 돌아간다", () => {
        expect(nextMove(at(0, "moderation", "moderation"), "dashboard")).toEqual({ kind: "push", entry: at(1, "dashboard", "moderation") });
        expect(nextMove(at(2, "members", "moderation"), "moderation")).toEqual({ kind: "home", back: 2 });
    });
});

describe("closeTopLayer — 떠 있는 창이 먼저 '뒤로'를 받는다", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("열린 창이 없으면 아무것도 하지 않는다", () => {
        const dispatchEvent = vi.fn();
        expect(closeTopLayer({ querySelector: () => null, dispatchEvent } as unknown as Document)).toBe(false);
        expect(dispatchEvent).not.toHaveBeenCalled();
    });

    it("열린 창(Radix Dialog·Sheet·AlertDialog)이 있으면 Esc 를 보내 맨 위 것을 닫는다", () => {
        class FakeKey { constructor(public type: string, public init: { key: string }) {} }
        vi.stubGlobal("KeyboardEvent", FakeKey);
        const asked: string[] = []; const sent: FakeKey[] = [];
        const doc = { querySelector: (q: string) => { asked.push(q); return {}; }, dispatchEvent: (e: FakeKey) => { sent.push(e); return true; } } as unknown as Document;
        expect(closeTopLayer(doc)).toBe(true);
        expect(asked[0]).toBe('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe("keydown");
        expect(sent[0].init.key).toBe("Escape");
    });
});

describe("뼈대 — 콘솔에 붙은 모양", () => {
    const hook = code(root("client/src/pages/admin/adminBack.ts"));
    const dash = code(root("client/src/pages/admin/dashboard.tsx"));

    it("들어올 때 밑바닥을 깔고 첫 화면 칸을 쌓는다 — 밑바닥이 있어야 첫 화면의 '뒤로'를 붙잡아 물을 수 있다", () => {
        expect(ADMIN_PATH).toBe("/admin/dashboard");
        expect(hook).toContain("window.history.replaceState({ ...(window.history.state ?? {}), [BASE]: true }, \"\");");
        expect(hook).toContain("cur.current = { d: 0, tab, r: tab };");
        expect(hook.indexOf("[BASE]: true")).toBeLessThan(hook.indexOf("window.history.pushState(adminState(cur.current), \"\");"));
        // 새로고침 — 이미 관리자 칸이면 다시 쌓지 않는다
        expect(hook).toContain("if (st && fx.current.isTab(st.tab)) {");
    });

    it("'뒤로' 순서: 떠났나 → 떠 있는 창 닫기 → 앞 메뉴 → 밑바닥이면 묻기", () => {
        const pop = hook.slice(hook.indexOf("const onPop = () => {"), hook.indexOf('window.addEventListener("popstate", onPop);'));
        const order = ["if (!here()) return;", "closeTopLayer()) { window.history.pushState(adminState(cur.current), \"\"); return; }", "fx.current.show(to.tab); return; }", "fx.current.askLeave()"].map((s) => pop.indexOf(s));
        expect(order.every((i) => i > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // 계속 보기 → 첫 화면 칸을 다시 쌓는다 · 나가기 → 한 번 더 뒤로(갈 곳이 없으면 메뉴로)
        expect(pop).toContain("window.history.back();");
        expect(pop).toContain("if (here()) fx.current.fallback();");
        expect(pop).toContain("if (!here() || leaving.current) return;");
        // 묻는 창이 뜬 채로 또 '뒤로' → 콘솔이 내려갈 때 창을 닫는다(다음 화면에 남지 않게)
        const cleanup = hook.slice(hook.indexOf('window.removeEventListener("popstate", onPop);'));
        expect(cleanup.slice(0, 400)).toContain("if (asking.current) closeTopLayer();");
    });

    it("콘솔: 메뉴 고르기는 전부 back.go 를 지나고, 나갈지는 앱의 확인 창으로 묻는다(브라우저 confirm 금지)", () => {
        expect(dash).toContain("const setTab = back.go;");
        expect(dash).toContain('askLeave: () => appConfirm({ title: "관리자 콘솔을 나갈까요?", message: "랭큐 화면으로 돌아갑니다.", confirmText: "나가기", cancelText: "계속 보기" }),');
        expect(dash).toContain('fallback: () => setLocation("/menu", { replace: true }),');
        expect(dash).not.toMatch(/window\.confirm|[^p]confirm\(/);
        // 화면에 띄우기만 하는 길(setTabState)은 훅과 알림 주소 처리 둘뿐 — 다른 곳에서 부르면 히스토리와 어긋난다
        expect(dash.match(/setTabState\(/g)!.length).toBe(2);
    });

    it("콘솔: 알림으로 들어온 칸은 주소를 정리한 뒤 다시 적고, 훅은 그 effect 보다 뒤에 부른다", () => {
        const eff = dash.indexOf("setLocation(window.location.pathname, { replace: true });");
        expect(dash.slice(eff, eff + 400)).toContain("back.adopt(t);");
        expect(dash.indexOf("}, [search]);")).toBeLessThan(dash.indexOf("const back = useAdminBack<Tab>({"));
    });

    it("콘솔: 메뉴마다 제목이 있다 — 폰에서는 머리줄의 제목이 지금 어느 화면인지 알려 주는 유일한 표시다('뒤로'로 오갈 때 더 그렇다)", () => {
        const menu = dash.slice(dash.indexOf("const MENU_GROUPS"), dash.indexOf("const ALL_TABS"));
        const ids = [...menu.matchAll(/\{ id: "([a-z-]+)", label:/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThanOrEqual(21);
        const titles = dash.slice(dash.indexOf("function getTabTitle("));
        for (const id of ids) expect(titles, id).toContain(`case "${id}": return "`);
    });

    it("콘솔: 묻지 않고 나가는 단추('랭큐로 돌아가기')가 메뉴 맨 아래에 있다", () => {
        expect(dash).toContain("<button data-admin-leave onClick={onLeave}");
        expect(dash).toContain("랭큐로 돌아가기");
        expect(dash.match(/onLeave=\{back\.leave\}/g)).toHaveLength(2);
        expect(hook).toContain("window.history.go(-(cur.current.d + 2));");
    });
});
