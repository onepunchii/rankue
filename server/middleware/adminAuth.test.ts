// 관리자 콘솔 가드(2026-10-07 오너: "슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)") — 실제 express 위에서 본다. 프로필 읽기만 가짜.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const m = vi.hoisted(() => ({ getProfile: vi.fn() }));
vi.mock("../storage/index.js", () => ({ storage: { getProfile: m.getProfile } }));

import { checkSuperAdmin } from "./adminAuth";

const PROFILES: Record<string, { id: string; role: string }> = {
    "p-super": { id: "p-super", role: "super_admin" },
    "p-admin": { id: "p-admin", role: "admin" },
    "p-user": { id: "p-user", role: "user" },
    "p-owner": { id: "p-owner", role: "store_owner" },
    "p-manager": { id: "p-manager", role: "booking_manager" },
};
let base = "";
let server: ReturnType<express.Express["listen"]>;
let reached: { method: string; path: string; role: unknown; profileId: unknown }[] = [];

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // 시험에서는 서명 쿠키 대신 머리글로 '누구인지'를 넣는다(서명 검증은 cookie-parser 의 일이다)
    app.use((req: any, _res, next) => { const who = req.headers["x-test-profile"]; req.signedCookies = who ? { hiq_partner_auth: who } : {}; next(); });
    const router = express.Router();
    router.use(checkSuperAdmin);
    router.all("*", (req: any, res) => { reached.push({ method: req.method, path: req.originalUrl, role: req.adminRole, profileId: req.adminProfileId }); res.json({ success: true }); });
    app.use("/api/hiq/admin", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hiq/admin`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
    reached = [];
    m.getProfile.mockReset().mockImplementation(async (id: string) => PROFILES[id]);
});

const call = async (who: string | null, method: string, path: string) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(who ? { "x-test-profile": who } : {}) }, body: method === "GET" || method === "HEAD" ? undefined : "{}" });
    return { status: res.status, json: method === "HEAD" ? null : await res.json() as any };
};
const WRITES: [string, string][] = [
    ["POST", "/members/abc/status"], ["POST", "/members/abc/reset-pin"], ["POST", "/members/abc/sub-admin"], ["POST", "/members/abc/booking-manager"],
    ["PATCH", "/members/abc"], ["DELETE", "/games/abc"], ["POST", "/push"], ["POST", "/reports/action"], ["POST", "/notices"], ["DELETE", "/notices/1"],
    ["POST", "/impersonate/abc"], ["PATCH", "/suggestions/read-all"], ["POST", "/suggestions/1/reply"], ["PATCH", "/membership/orders/1/status"],
    ["PUT", "/golf/courses/nines/abc/pars"], ["POST", "/golf/courses/nines"], ["PUT", "/golf/courses/x/name"], ["PATCH", "/golf/courses/clubs/abc/coords"],
    ["POST", "/golf/courses/x/logo"], ["POST", "/golf/courses/logo/fetch"], ["PATCH", "/golf/courses/x"], ["POST", "/sim/recompute-ratings"],
];
const READS = ["/stats", "/members", "/members/abc/games", "/reports?status=open", "/golf/courses?limit=490", "/golf/courses/x", "/whoami", "/suggestions"];

describe("슈퍼관리자 — 전부 통과", () => {
    it("보기도 고치기도 지나고, 누구인지(역할·프로필)가 요청에 실린다", async () => {
        for (const p of READS) expect((await call("p-super", "GET", p)).status, p).toBe(200);
        for (const [method, p] of WRITES) expect((await call("p-super", method, p)).status, `${method} ${p}`).toBe(200);
        expect(reached).toHaveLength(READS.length + WRITES.length);
        expect(reached.every((r) => r.role === "super_admin" && r.profileId === "p-super")).toBe(true);
    });
});

describe("관리자(admin) — 보기만", () => {
    it("조회(GET·HEAD)는 지난다", async () => {
        for (const p of READS) expect((await call("p-admin", "GET", p)).status, p).toBe(200);
        expect((await call("p-admin", "HEAD", "/stats")).status).toBe(200);
        expect(reached.every((r) => r.role === "admin" && r.profileId === "p-admin")).toBe(true);
    });

    it("고치는 요청은 하나도 지나지 못한다 — 403 과 '보기 전용' 코드, 라우트에 닿지 않는다", async () => {
        for (const [method, p] of WRITES) {
            const r = await call("p-admin", method, p);
            expect(r.status, `${method} ${p}`).toBe(403);
            expect(JSON.stringify(r.json), `${method} ${p}`).toContain("ADMIN_VIEW_ONLY");
            expect(JSON.stringify(r.json), `${method} ${p}`).toContain("보기 전용");
        }
        expect(reached).toHaveLength(0);
    });

    it("조회용 POST 한 가지(검색 수요)만 지난다 — 닮은 주소는 안 된다", async () => {
        expect((await call("p-admin", "POST", "/search-trend")).status).toBe(200);
        expect((await call("p-admin", "POST", "/search-trend?x=1")).status).toBe(200);
        expect((await call("p-admin", "POST", "/search-trend/save")).status).toBe(403);
        expect((await call("p-admin", "PUT", "/search-trend")).status).toBe(403);
        expect(reached.map((r) => r.method)).toEqual(["POST", "POST"]);
    });
});

describe("그 밖 — 콘솔에 들어오지 못한다", () => {
    it("쿠키가 없으면 401, 관리자 역할이 아니면(일반 회원·사장님·부킹매니저·없는 프로필) 403 — 조회도", async () => {
        expect((await call(null, "GET", "/stats")).status).toBe(401);
        for (const who of ["p-user", "p-owner", "p-manager", "p-nobody"]) {
            expect((await call(who, "GET", "/stats")).status, who).toBe(403);
            expect((await call(who, "POST", "/push")).status, who).toBe(403);
        }
        expect(reached).toHaveLength(0);
    });

    it("역할은 요청마다 DB 에서 다시 읽는다 — 해제하면 다음 요청부터 닫힌다", async () => {
        expect((await call("p-admin", "GET", "/stats")).status).toBe(200);
        m.getProfile.mockImplementation(async (id: string) => (id === "p-admin" ? { id, role: "user" } : PROFILES[id]));
        expect((await call("p-admin", "GET", "/stats")).status).toBe(403);
    });
});
