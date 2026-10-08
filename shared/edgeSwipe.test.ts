import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDGE_SWIPE, EDGE_SWIPE_OFF_PATH, isEdgeSwipeBack, startsAtEdge } from "./edgeSwipe";
import { viewOnlyAllows } from "./adminRole";

/**
 * 2026-10-08 오너의 세 가지:
 *  ① "아이폰은 … 시스템 뒤로가기 버튼이 없잖아 — 우리 페이지에 뒤로가기 안 되어 있으면 어떻게 돼?" → 갇혔다. 왼쪽 가장자리를 밀면 뒤로.
 *  ② "일반 관리자에 계정 정지나 이런 거 되던 거 같은데 … 일반 관리자는 보기만 가능하게 해야 돼" → 서버는 이미 막고 있었다(운영의 관리자
 *     계정으로 고치는 요청 15가지 전부 403). 화면이 단추를 그대로 보여 준 것 — 숨기고·잠그고·보내기 전에 막는다.
 *  ③ "어드민도 애플일 때 헤더 쪽이랑 사이즈가 안 맞고 뒤로가기 및 불편하던데" → 상태바 여백과 뒤로 단추.
 * 화면은 하니스로 봤다 — 여기는 셈과 뼈대를 고정한다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("① 아이폰 — 밀어서 뒤로", () => {
    const at = (x: number, y: number, t: number) => ({ x, y, t });

    it("왼쪽 가장자리에서 시작해 오른쪽으로 충분히, 빠르게 밀면 뒤로", () => {
        expect(isEdgeSwipeBack(at(8, 400, 0), at(140, 410, 220))).toBe(true);
        expect(isEdgeSwipeBack(at(EDGE_SWIPE.edge, 400, 0), at(EDGE_SWIPE.edge + EDGE_SWIPE.dist, 400, EDGE_SWIPE.maxMs))).toBe(true);
    });

    it("아닌 것 — 가장자리 밖에서 시작 · 짧게 · 세로로 샘(스크롤) · 느리게 끌기 · 왼쪽으로", () => {
        expect(isEdgeSwipeBack(at(40, 400, 0), at(240, 400, 200))).toBe(false);
        expect(isEdgeSwipeBack(at(8, 400, 0), at(60, 400, 200))).toBe(false);
        expect(isEdgeSwipeBack(at(8, 400, 0), at(120, 520, 200))).toBe(false);
        expect(isEdgeSwipeBack(at(8, 400, 0), at(200, 400, 1500))).toBe(false);
        expect(isEdgeSwipeBack(at(8, 400, 0), at(0, 400, 100))).toBe(false);
        expect(startsAtEdge(-1)).toBe(false);
        expect(startsAtEdge(0)).toBe(true);
    });

    it("게임 화면에서는 받지 않는다(가장자리에서 시작하는 조작이 있다) — 닮은 주소는 받는다", () => {
        for (const p of ["/online-game", "/game/abc", "/golf/game/abc", "/golf/game/abc/result", "/golf/play", "/golf/minigolf", "/golf/arcade", "/golf/range"]) expect(EDGE_SWIPE_OFF_PATH.test(p), p).toBe(true);
        for (const p of ["/", "/dashboard", "/golf/courses", "/golf/course/세레니티CC", "/golf/passport", "/gamers", "/admin/dashboard", "/chat/dm/x", "/golf/player"]) expect(EDGE_SWIPE_OFF_PATH.test(p), p).toBe(false);
    });

    it("앱에서는 아이폰에만 걸고, 안드로이드 하드웨어 뒤로가기와 같은 길을 탄다(팝업 → 화면 핸들러 → 히스토리, 갈 곳 없으면 첫 화면)", () => {
        const bridge = code(root("client/src/lib/nativeBridge.ts"));
        expect(bridge).toContain('if (platform() === "ios") initEdgeSwipeBack();');
        const fn = bridge.slice(bridge.indexOf("function initEdgeSwipeBack(): void {"), bridge.indexOf("export function initNativeBridge(): void {"));
        expect(fn.indexOf("if (runBackHandlers()) return;")).toBeGreaterThan(0);
        expect(fn.indexOf("backOrHome();")).toBeGreaterThan(fn.indexOf("if (runBackHandlers()) return;"));
        // 히스토리 한 칸 뒤로, 아무 일도 없으면 첫 화면으로 — 문서 화면의 뒤로 단추와 같은 함수
        const back = bridge.slice(bridge.indexOf("export function backOrHome(): void {"), bridge.indexOf("function initEdgeSwipeBack(): void {"));
        expect(back).toContain("window.history.back();");
        expect(back).toContain('if (!moved && window.location.href === before && window.location.pathname !== "/") navigate("/", { replace: true });');
        expect(fn).toContain('el?.closest("[data-noswipe], canvas, input[type=range], [role=slider]")');
        // 가로로 밀려 있는 목록에서는 받지 않는다(목록을 되감는 손짓이다)
        expect(fn).toContain("if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth + 4) return true;");
        // 스크롤을 막지 않는다
        expect(fn.match(/\{ passive: true \}/g)!.length).toBe(3);
    });

    it("탭도 헤더도 없는 문서 화면에는 뒤로 단추가 있다 — 앱에서는 늘 보이고, 갈 곳이 없으면 첫 화면으로", () => {
        // 화면을 훑어 확인한 막다른 화면 넷 + 이용약관(원래 있었다 — 같은 규칙으로 맞췄다)
        for (const f of ["privacy.tsx", "support.tsx", "account-delete.tsx"]) {
            const s = code(root("client/src/pages/" + f));
            expect(s, f).toContain('<DocBack label="뒤로" />');
            expect(s.indexOf("<DocBack"), f).toBeLessThan(s.indexOf("<h1"));
        }
        const about = code(root("client/src/pages/about.tsx"));
        expect(about.indexOf("<DocBack")).toBeGreaterThan(0);
        expect(about.indexOf("<DocBack")).toBeLessThan(about.indexOf("<header"));
        const terms = code(root("client/src/pages/terms.tsx"));
        expect(terms).toContain("const canGoBack = hasBackTarget();");
        expect(terms).toContain("<button onClick={backOrHome}");

        const doc = code(root("client/src/components/hiq/DocBack.tsx"));
        expect(doc).toContain('typeof window !== "undefined" && (isNativeApp() || window.history.length > 1);');
        expect(doc).toContain("if (!hasBackTarget()) return null;");
        expect(doc).toContain("onClick={backOrHome}");
    });
});

describe("② 관리자 콘솔 — 보기 전용 계정의 화면", () => {
    const A = "client/src/pages/admin/";
    const dash = code(root(A + "dashboard.tsx"));

    it("보기 전용이면 html 에 표시를 걸고, 고치는 요청은 보내기 전에 막는다(서버와 같은 규칙)", () => {
        expect(dash).toContain('document.documentElement.classList.add("admin-viewonly");');
        expect(dash).toContain('document.documentElement.classList.remove("admin-viewonly"); setRequestGate(null);');
        expect(dash).toContain('if (!path.startsWith("/api/hiq/admin/") || viewOnlyAllows(method, path)) return null;');
        // 규칙 자체 — 조회와 조회용 POST 한 가지만 지난다
        expect(viewOnlyAllows("GET", "/api/hiq/admin/members")).toBe(true);
        expect(viewOnlyAllows("POST", "/api/hiq/admin/search-trend")).toBe(true);
        for (const [m, p] of [["POST", "/api/hiq/admin/members/x/status"], ["PATCH", "/api/hiq/admin/members/x"], ["DELETE", "/api/hiq/admin/games/x"], ["PUT", "/api/hiq/admin/golf/courses/x/name"], ["POST", "/api/hiq/admin/push"]]) expect(viewOnlyAllows(m, p), `${m} ${p}`).toBe(false);
        const q = code(root("client/src/lib/queryClient.ts"));
        expect(q).toContain("const refused = requestGate?.(method.toUpperCase(), url);");
        expect(q).toContain('if (refused) throw new ApiError(refused, 403, { code: "ADMIN_VIEW_ONLY" });');
        expect(q.indexOf("const refused = requestGate")).toBeLessThan(q.indexOf("await fetch("));
    });

    it("CSS — 고치는 단추는 숨기고, 값을 보여 주는 고르기·스위치는 잠근다", () => {
        const css = root("client/src/index.css");
        expect(css).toMatch(/html\.admin-viewonly \[data-admin-write\] \{\s*display: none !important;\s*\}/);
        expect(css).toMatch(/html\.admin-viewonly \[data-admin-lock\] \{\s*pointer-events: none !important;/);
    });

    it("화면마다 — 뮤테이션을 부르는 단추에는 표시가 있다(새 단추를 만들고 표시를 빼먹으면 여기서 걸린다)", () => {
        const files = ["GolfOrdersView.tsx", "MemberGamesDialog.tsx", "MemberDetailSheet.tsx", "StoresView.tsx", "ModerationView.tsx", "NoticesView.tsx", "OnlineGameView.tsx", "StoreOnboardingViews.tsx", "SuggestionsView.tsx", "PushView.tsx",
            "golf/GolfOverviewView.tsx", "golf/GolfPhotosView.tsx", "golf/GolfCoursesView.tsx", "golf/GolfListingsView.tsx", "golf/GolfRoundsView.tsx"];
        let tagged = 0;
        for (const f of files) {
            const s = code(root(A + f));
            tagged += (s.match(/data-admin-(write|lock)/g) ?? []).length;
            // 한 줄에 여는 태그와 뮤테이션 호출이 같이 있으면 그 태그에 표시가 있어야 한다
            for (const line of s.split("\n")) {
                if (!/<(Button|button|select|Switch)\b/.test(line) || !/\.mutate(Async)?\(/.test(line)) continue;
                expect(line, `${f}: ${line.trim().slice(0, 90)}`).toMatch(/data-admin-(write|lock)/);
            }
        }
        expect(tagged).toBeGreaterThanOrEqual(45);
    });

    it("회원 상세 — 정보 칸은 보이되 잠기고(fieldset), 정지·PIN·알림은 숨고, 그 자리에 한 줄 안내", () => {
        const s = code(root(A + "MemberDetailSheet.tsx"));
        expect(s).toContain('<fieldset disabled={!access.canWrite} className="min-w-0 space-y-2.5 rounded-2xl bg-white border border-black/[0.07] p-4">');
        expect(s.match(/<\/fieldset>/g)).toHaveLength(1);
        expect(s).toContain("<div data-admin-write>");
        expect(s).toContain("{!access.canWrite && (");
        expect(s).toContain("보기 전용 계정이라 정지 · PIN 초기화 · 알림 보내기 같은 조치는 할 수 없습니다.");
        // 정지 단추·PIN 단추
        const manage = s.slice(s.indexOf(">관리</h3>"));
        expect(manage.match(/<button data-admin-write/g)!.length).toBeGreaterThanOrEqual(2);
        expect(manage.match(/<Switch data-admin-lock/g)!.length).toBe(2);
    });
});

describe("③ 관리자 콘솔 — 아이폰 앱의 상태바와 뒤로 단추", () => {
    const A = "client/src/pages/admin/";
    const dash = code(root(A + "dashboard.tsx"));

    it("머리줄: 전역 여백 규칙에서 빼고(rk-no-safe) 상태바만큼의 윗여백을 직접 — 줄 높이는 안쪽에서 고정", () => {
        expect(dash).toContain('<div className="rk-no-safe md:hidden bg-white border-b border-black/10 sticky top-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)" }}>');
        expect(dash).toContain('<div className="h-14 px-1 flex items-center gap-0.5">');
        // 예전 꼴(높이 고정 + sticky top-0)은 전역 규칙의 윗여백이 56px 상자 안으로 밀고 들어왔다
        expect(dash).not.toContain('md:hidden h-14 bg-white border-b border-black/10 px-2 sticky top-0');
        // 이 화면은 #root 의 내림을 되돌린다 — 흰 머리줄이 상태바 밑까지 이어진다
        expect(dash).toContain('style={{ marginTop: "calc(-1 * env(safe-area-inset-top))" }}');
    });

    it("머리줄 맨 앞에 '뒤로' — 아이폰에는 시스템 뒤로가기가 없다(누르면 관리자 콘솔의 뒤로 규칙을 탄다)", () => {
        const head = dash.slice(dash.indexOf('<div className="h-14 px-1 flex items-center gap-0.5">'));
        expect(head.indexOf('aria-label="뒤로" data-admin-back onClick={() => window.history.back()}')).toBeGreaterThan(0);
        expect(head.indexOf('aria-label="뒤로"')).toBeLessThan(head.indexOf('aria-label="메뉴"'));
    });

    it("머리줄 밑에 붙는 거르기 줄과 옆 시트 — 상태바만큼 내린다(예전의 top-14 · 여백 없는 시트는 가려졌다)", () => {
        const utils = root(A + "adminUtils.tsx");
        expect(utils).toContain('export const ADMIN_STICKY_TOP = "sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0";');
        expect(utils).toContain('export const SHEET_SAFE_TOP = { paddingTop: "env(safe-area-inset-top)" } as const;');
        for (const f of ["MembersView.tsx", "golf/GolfCoursesView.tsx", "golf/GolfRoundsView.tsx", "golf/GolfPhotosView.tsx"]) {
            const s = code(root(A + f));
            expect(s, f).toContain("${ADMIN_STICKY_TOP} z-10");
            expect(s, f).not.toContain("sticky top-14");
        }
        // 옆에서 나오는 시트 여덟(메뉴 서랍 포함) — 전부 윗여백을 받는다
        let sheets = 0, safe = 0;
        for (const f of ["dashboard.tsx", "NoticesView.tsx", "VisitorsView.tsx", "MemberDetailSheet.tsx", "golf/GolfCoursesView.tsx", "golf/GolfRoundsView.tsx", "golf/GolfPhotosView.tsx", "golf/GolfListingsView.tsx"]) {
            const s = code(root(A + f));
            sheets += (s.match(/<SheetContent side="(right|left)"/g) ?? []).length;
            safe += (s.match(/<SheetContent side="(right|left)" style=\{SHEET_SAFE_TOP\}/g) ?? []).length;
        }
        expect(sheets).toBe(8);
        expect(safe).toBe(8);
        // 닫기(X) 단추도 그만큼 내려간다(공용 시트)
        expect(root("client/src/components/ui/sheet.tsx")).toContain('style={side === "left" || side === "right" ? { top: "calc(1rem + env(safe-area-inset-top))" } : undefined}');
    });
});
