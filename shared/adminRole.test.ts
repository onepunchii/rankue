import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
    ADMIN_VIEW_ONLY_CODE, VIEW_ONLY_ALLOWED_POSTS, adminRoleLabel, isConsoleRole, isSuperAdminRole, isViewOnlyAdminRole, subAdminSwitch, viewOnlyAllows,
} from "./adminRole";

/**
 * 관리자 역할의 두 단계(2026-10-07 오너: "내가 다른 회원 어드민 부관리자 설정해줄 거야 … 해당 부관리자는 볼 수만 있어 수정 이런 거는 아직 권한을
 * 안 줄 거야 … 온라인 게임 관리자는 길찾기 모드 — 이건 슈퍼관리자만 … 슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)").
 * 규칙과, 그 규칙이 서버·화면 전체에 이어져 있는지를 본다. '관리자(admin)에게 고치는 길이 하나라도 남아 있지 않은가'가 핵심이다.
 * 가드의 동작은 server/middleware/adminAuth.test.ts, 임명 판정은 server/lib/subAdmin.test.ts.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("역할 규칙", () => {
    it("콘솔에 들어오는 역할은 둘 — 고칠 수 있는 것은 슈퍼관리자뿐", () => {
        for (const r of ["super_admin", "admin"]) expect(isConsoleRole(r), r).toBe(true);
        for (const r of ["user", "store_owner", "booking_manager", "", null, undefined, "ADMIN", "superadmin", 1]) expect(isConsoleRole(r), String(r)).toBe(false);
        expect(isSuperAdminRole("super_admin")).toBe(true);
        for (const r of ["admin", "user", "store_owner", "booking_manager", null, undefined, "SUPER_ADMIN"]) expect(isSuperAdminRole(r), String(r)).toBe(false);
        expect(isViewOnlyAdminRole("admin")).toBe(true);
        expect(isViewOnlyAdminRole("super_admin")).toBe(false);
    });

    it("보기 전용 관리자가 부를 수 있는 요청 — GET·HEAD, 그리고 조회용 POST 한 가지뿐", () => {
        for (const m of ["GET", "get", "HEAD"]) expect(viewOnlyAllows(m, "/api/hiq/admin/members"), m).toBe(true);
        for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", ""]) expect(viewOnlyAllows(m, "/api/hiq/admin/members/1/status"), m).toBe(false);
        expect(viewOnlyAllows("POST", "/api/hiq/admin/search-trend")).toBe(true);
        expect(viewOnlyAllows("POST", "/api/hiq/admin/search-trend?x=1")).toBe(true);
        expect(viewOnlyAllows("POST", "/api/hiq/admin/search-trend/")).toBe(true);
        // 닮은 주소·다른 메서드는 안 된다
        for (const p of ["/api/hiq/admin/search-trend/save", "/api/hiq/admin/push", "/api/hiq/admin/search-trendx", "/api/hiq/admin/golf/courses/logo/fetch", "/admin/search-trend"]) {
            expect(viewOnlyAllows("POST", p), p).toBe(false);
        }
        expect(viewOnlyAllows("DELETE", "/api/hiq/admin/search-trend")).toBe(false);
        expect([...VIEW_ONLY_ALLOWED_POSTS]).toEqual(["/api/hiq/admin/search-trend"]);
        expect(ADMIN_VIEW_ONLY_CODE).toBe("ADMIN_VIEW_ONLY");
    });

    it("임명·해제는 user ↔ admin 사이만", () => {
        expect(subAdminSwitch(true)).toEqual({ from: "user", to: "admin" });
        expect(subAdminSwitch(false)).toEqual({ from: "admin", to: "user" });
    });

    it("이름표 — 슈퍼관리자 · 관리자(보기 전용)", () => {
        expect(adminRoleLabel("super_admin")).toBe("슈퍼관리자");
        expect(adminRoleLabel("admin")).toBe("관리자 · 보기 전용");
        for (const r of ["user", "store_owner", null, undefined]) expect(adminRoleLabel(r)).toBeNull();
    });
});

describe("조회용 POST 는 정말 아무것도 고치지 않는가(소스)", () => {
    it("검색 수요 — 네이버에 묻고 돌려주기만 한다(저장·발송 없음)", () => {
        const admin = code(root("server/routes/modules/admin.ts"));
        const h = admin.slice(admin.indexOf('router.post("/search-trend"'), admin.indexOf('router.get("/whoami"'));
        expect(h).toContain("fetchSearchTrend(clean)");
        expect(h).not.toMatch(/storage\.|db\.|\.insert\(|\.update\(|\.delete\(|sendPush|notify/);
    });
});

describe("관리자 콘솔의 모든 길이 가드를 지난다(소스)", () => {
    it("admin.ts — 고치는 라우트(POST·PUT·PATCH·DELETE)는 하나도 빠짐없이 가드를 단다. 예외는 대리 접속 끝내기 하나", () => {
        const admin = code(root("server/routes/modules/admin.ts"));
        const routes = admin.match(/router\.(get|post|put|patch|delete)\("[^"]+"[^\n]*/g) ?? [];
        expect(routes.length).toBeGreaterThan(40);
        const bare = routes.filter((r) => !r.includes("checkSuperAdmin"));
        expect(bare).toEqual(['router.post("/impersonate/exit", asyncHandler(async (req: any, res: any) => {']);
        // 그 예외도 슈퍼관리자에게만 관리 쿠키를 돌려준다
        const exit = admin.slice(admin.indexOf('router.post("/impersonate/exit"'), admin.indexOf('router.post("/impersonate/:storeId"'));
        expect(exit).toContain("if (!profile || !isSuperAdminRole(profile.role)) {");
    });

    it("골프 관리 라우터들은 index 의 가드 뒤에만 붙는다 · 따로 내보내는 길이 없다", () => {
        const index = code(root("server/routes/modules/adminGolf/index.ts"));
        const guard = index.indexOf("router.use(checkSuperAdmin);");
        expect(guard).toBeGreaterThan(0);
        for (const m of index.match(/router\.use\("\/[a-z-]+", \w+\);/g) ?? []) expect(index.indexOf(m), m).toBeGreaterThan(guard);
        // 골프 관리 라우터 파일은 adminGolf/index.ts 만 가져다 쓴다
        const files = readdirSync(resolve(__dirname, "..", "server/routes/modules/adminGolf")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts");
        for (const f of files) expect(index, f).toContain(`from "./${f.replace(/\.ts$/, ".js")}"`);
    });

    it("가드 — 보기 전용 관리자의 고치는 요청을 코드와 함께 거절한다", () => {
        const guard = code(root("server/middleware/adminAuth.ts"));
        expect(guard).toContain("if (!profile || !isConsoleRole(profile.role)) {");
        expect(guard).toContain('if (!isSuperAdminRole(profile.role) && !viewOnlyAllows(req.method, String(req.originalUrl ?? req.url ?? ""))) {');
        expect(guard).toContain("return sendError(res, 403, ADMIN_VIEW_ONLY_MESSAGE, ADMIN_VIEW_ONLY_CODE);");
    });
});

describe("콘솔 밖 운영자 기능은 슈퍼관리자만(소스)", () => {
    it("문의 방의 운영자 · 신고·건의 알림을 받는 사람 · 남의 부킹 글 관리 · 매장 판매자", () => {
        expect(code(root("server/storage/chat.repo.ts"))).toContain('const ADMIN_ROLES: ("super_admin")[] = ["super_admin"];');
        expect(code(root("server/storage/admin.repo.ts"))).toContain('.where(inArray(profiles.role, ["super_admin"]))');
        const golf = code(root("server/routes/modules/golf.ts"));
        expect(golf).toContain('const BOOKING_WRITER_ROLES = ["super_admin", "store_owner", "booking_manager"];');
        const manage = golf.slice(golf.indexOf("async function canManageBooking("), golf.indexOf("const UUID ="));
        expect(manage).toContain('return role === "super_admin";');
        expect(manage).not.toContain('"admin"');
        expect(code(root("shared/adminMemberGolf.ts"))).toContain('export const STORE_SELLER_ROLES: readonly string[] = ["super_admin", "store_owner", "booking_manager"];');
        expect(code(root("shared/chatSupport.ts"))).toContain('staff: r.role === "super_admin",');
    });

    it("화면 — 온라인게임 대전 중 길찾기 · 채팅의 번역·다듬기·회원 찾기는 슈퍼관리자에게만", () => {
        const sim = code(root("client/src/sim/SimulatorPage.tsx"));
        expect(sim).toContain("const isSuperAdmin = isSuperAdminRole(member?.role);");
        expect(sim).toContain("const matchSolverAllowed = isSuperAdmin && isMatch && !pathView;");
        expect(sim).not.toMatch(/role === "admin"/);
        expect(code(root("client/src/pages/hiq/chat-hub.tsx"))).toContain('const isAdmin = (member as any)?.role === "super_admin";');
        expect(code(root("client/src/pages/hiq/chat-room.tsx"))).toContain('const isStaff = (member as any)?.role === "super_admin";');
    });

    it("서버에 'admin 이면 통과'하는 판정이 새로 생기지 않았다 — 남아 있는 곳은 뜻을 아는 곳뿐", () => {
        // role === "admin" 을 '권한 있음'으로 읽는 줄을 찾는다. 허용한 곳: 로그인 규칙(관리자 계정은 PIN 금지 — 두 역할 다 해당), 정지 금지, 이름표·안내 문구
        const allow = new Set([
            "server/lib/adminRole.ts",            // isAdminRole — 번호 + PIN 로그인을 막을 계정(두 역할 다)
            "server/services/hiqService.ts",      // 파트너 번호 폼: 관리자는 매장 없이도 콘솔로 보낸다(로그인은 PIN 규칙이 이미 막는다)
            "server/routes/modules/admin.ts",     // 정지 금지 · 부킹매니저 안내 문구
            "server/storage/admin.repo.ts",       // 신고 큐: 관리자 글에는 정지 단추를 만들지 않는다
        ]);
        const walk = (dir: string): string[] => readdirSync(resolve(__dirname, "..", dir), { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? (e.name === "scripts" || e.name === "node_modules" ? [] : walk(`${dir}/${e.name}`)) : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [`${dir}/${e.name}`] : []);
        const hits = walk("server").filter((f) => /(===|!==)\s*["']admin["']|\[\s*["']admin["']\s*,\s*["']super_admin["']\s*\]/.test(code(root(f))));
        expect(hits.filter((f) => !allow.has(f))).toEqual([]);
    });
});

describe("임명과 표시(소스)", () => {
    it("임명 라우트 — 판정(슈퍼관리자만·자기 자신 아님·소셜 로그인)을 지난 뒤에만 역할을 바꾼다", () => {
        const admin = code(root("server/routes/modules/admin.ts"));
        const h = admin.slice(admin.indexOf('router.post("/members/:id/sub-admin"'), admin.indexOf('router.delete("/games/:id"'));
        expect(h).toContain("const check = checkSubAdminRequest({ actorRole: req.adminRole, actorProfileId: req.adminProfileId, on: req.body?.on, member, profile: profile as any });");
        expect(h.indexOf("if (!check.ok) return sendError(")).toBeLessThan(h.indexOf("await setSubAdminRole("));
        expect(h).toContain("adminLog(req, on ?");
        // 역할은 '지금 값이 from 일 때만' 한 문장으로 바꾼다(사장님·부킹매니저·슈퍼관리자를 덮지 않는다)
        const store = code(root("server/storage/adminMemberGolf.ts"));
        const fn = store.slice(store.indexOf("export async function setSubAdminRole("));
        expect(fn).toContain(".where(and(eq(profiles.id, profileId), eq(profiles.role, from)))");
    });

    it("화면 — 임명 스위치는 슈퍼관리자에게만 보이고, 전체 메뉴의 콘솔 입구는 두 역할 모두에게 열린다", () => {
        const sheet = code(root("client/src/pages/admin/MemberDetailSheet.tsx"));
        expect(sheet).toContain('{m.profileId && access.canWrite && role !== "super_admin" && (');
        expect(sheet).toContain("apiRequest(`/api/hiq/admin/members/${member!.id}/sub-admin`, { method: \"POST\", body: { on } })");
        expect(sheet).toContain('disabled={!(role === "user" || role === "admin") || toggleSubAdmin.isPending || golfQ.isFetching}');
        expect(sheet).toContain("if (!(await appConfirm({ title: on ? \"관리자 임명\" : \"관리자 해제\"");
        const menu = code(root("client/src/pages/hiq/menu.tsx"));
        expect(menu).toContain('...((member as any)?.role === "admin" || (member as any)?.role === "super_admin"');
        // 콘솔은 보기 전용 표시를 띄운다 — 답이 오기 전에는 '고칠 수 없음'으로 본다
        const dash = code(root("client/src/pages/admin/dashboard.tsx"));
        expect(dash).toContain("{access.viewOnly && (");
        expect(dash).toContain("data-admin-viewonly-banner");
        const access = code(root("client/src/pages/admin/adminAccess.ts"));
        expect(access).toContain("const canWrite = q.data?.canWrite === true;");
        expect(access).toContain("viewOnly: !!q.data && !canWrite");
    });

    it("새 파일에 전화번호·이메일을 적지 않았다 — 사람은 역할 값으로만 가린다", () => {
        for (const f of ["shared/adminRole.ts", "server/lib/subAdmin.ts", "server/middleware/adminAuth.ts", "client/src/pages/admin/adminAccess.ts"]) {
            const src = root(f);
            expect(src, f).not.toMatch(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
            expect(src, f).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
        }
    });
});
