import { beforeEach, describe, expect, it, vi } from "vitest";
import partnerRouter from "./partner.js";

/**
 * 관리 화면·사장님 화면의 입구(2026-10-07 오너: "어드민에 휴대폰 번호로 진입하는 거 제거해주고 내 계정이면 들어가지게 해줘" ·
 * "가맹점 페이지는 … 휴대폰 번호보다 카카오 로그인 보안이 높으니 바로 들어가지면 되네").
 *  - POST /partner/sso   랭큐에 로그인한 내 계정으로 바로. 관리자 콘솔의 입구는 이 길 하나다.
 *                        번호만으로 들어올 수 있는 계정(PIN 도 소셜 연결도 없다)은 들이지 않는다.
 *  - POST /partner/login 번호 + PIN 폼. 사장님용으로만 남는다 — 관리자 계정은 PIN 을 보기 전에 끊는다.
 * 서버를 띄우지 않는다(.env 는 운영 DB 다) — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다. 저장소는 메모리 가짜다.
 * 아래 번호·PIN 은 시험용으로 지어낸 값이다. 시도 횟수 제한은 모듈 메모리에 남으므로 시험마다 다른 IP 를 쓴다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[], stores: [] as any[], pinChecks: 0 };
    const storage = {
        async getProfile(id: string) { return state.profiles.find((p) => p.id === id); },
        async getProfileByPhone(phone: string) { return state.profiles.find((p) => p.phone === phone); },
        async getMembersByPhone(phone: string) { return state.members.filter((m) => m.phone === phone); },
        async getMemberById(id: string) { return state.members.find((m) => m.id === id); },
        async getStoreByOwnerProfileId(id: string) { return state.stores.find((s) => s.ownerId === id); },
        // PIN 을 맞히면 옛 평문 PIN 을 해시로 바꿔 저장한다(verifyPassword) — 몇 번 대조했는지 여기서 센다
        async updateProfile(id: string, data: any) { state.pinChecks++; const p = state.profiles.find((x) => x.id === id); if (p) Object.assign(p, data); return p; },
    };
    return { state, storage };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));

const PIN = "4821";

type FakeRes = { statusCode: number; body: any; cookies: Record<string, unknown>; cleared: string[] };
function callRoute(path: string, req: { body?: unknown; ip?: string; userId?: string }): Promise<FakeRes> {
    const layer = (partnerRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    if (!layer) throw new Error(`시험에 없는 길: POST ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined, cookies: {}, cleared: [] };
        const res: any = {
            locals: { locale: "ko" },
            headersSent: false,
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
            cookie(name: string, value: unknown) { out.cookies[name] = value; return res; },
            clearCookie(name: string) { out.cleared.push(name); return res; },
        };
        const request: any = { body: req.body ?? {}, ip: req.ip, headers: {}, signedCookies: req.userId ? { hiq_user_id: req.userId } : {} };
        let i = 0;
        const next = (err?: unknown) => {
            if (err) { fail(err); return; }
            const handle = handlers[i++];
            if (handle) handle(request, res, next);
        };
        next();
    });
}

beforeEach(() => {
    const s = mem.state;
    s.pinChecks = 0;
    s.profiles = [
        { id: "p-admin", role: "super_admin", phone: "01000000001", password: PIN, kakaoSub: "k-1", googleSub: null, appleSub: null },
        { id: "p-owner", role: "store_owner", phone: "01000000002", password: PIN, kakaoSub: null, googleSub: null, appleSub: null },
        { id: "p-owner-kakao", role: "store_owner", phone: null, password: null, kakaoSub: "k-2", googleSub: null, appleSub: null },
        { id: "p-owner-bare", role: "store_owner", phone: "01000000004", password: null, kakaoSub: null, googleSub: null, appleSub: null }, // 번호만으로 로그인되는 계정
        { id: "p-admin-bare", role: "admin", phone: "01000000005", password: null, kakaoSub: null, googleSub: null, appleSub: null },
        { id: "p-user", role: "user", phone: "01000000006", password: PIN, kakaoSub: null, googleSub: null, appleSub: null },
    ];
    s.members = [
        { id: "m-admin", profileId: "p-admin", phone: "01000000001" },
        { id: "m-owner", profileId: "p-owner", phone: "01000000002" },
        { id: "m-owner-kakao", profileId: "p-owner-kakao", phone: "social:kakao:x" },
        { id: "m-owner-bare", profileId: "p-owner-bare", phone: "01000000004" },
        { id: "m-admin-bare", profileId: "p-admin-bare", phone: "01000000005" },
        { id: "m-user", profileId: "p-user", phone: "01000000006" },
        { id: "m-noprofile", profileId: null, phone: "01000000007" },
    ];
    s.stores = [
        { id: "s-1", name: "가 당구장", ownerId: "p-owner" },
        { id: "s-2", name: "나 당구장", ownerId: "p-owner-kakao" },
        { id: "s-3", name: "다 당구장", ownerId: "p-owner-bare" },
    ];
});

describe("POST /partner/sso — 랭큐에 로그인한 내 계정으로 바로", () => {
    it("관리자 계정이면 관리 쿠키를 받는다 — 번호도 PIN 도 다시 묻지 않는다", async () => {
        const r = await callRoute("/sso", { userId: "m-admin" });
        expect(r.statusCode).toBe(200);
        expect(r.body.data).toEqual({ success: true, storeName: "관리자", role: "super_admin" });
        expect(r.cookies.hiq_partner_auth).toBe("p-admin");
        // 남아 있던 대리 접속 표시는 지운다
        expect(r.cleared).toContain("hiq_admin_origin");
        expect(mem.state.pinChecks).toBe(0);
    });

    it("사장님 계정도 같다 — PIN 이 있는 번호 계정이든, 카카오로만 쓰는 계정이든", async () => {
        const a = await callRoute("/sso", { userId: "m-owner" });
        expect(a.statusCode).toBe(200);
        expect(a.body.data.storeName).toBe("가 당구장");
        expect(a.cookies.hiq_partner_auth).toBe("p-owner");
        const b = await callRoute("/sso", { userId: "m-owner-kakao" });
        expect(b.statusCode).toBe(200);
        expect(b.cookies.hiq_partner_auth).toBe("p-owner-kakao");
    });

    // 전화번호 로그인은 PIN 없는 계정을 번호만으로 통과시킨다 — 그런 세션은 본인 확인을 거치지 않았다
    it("번호만으로 들어올 수 있는 계정(PIN 도 소셜 연결도 없다)은 들이지 않는다 — 관리자여도, 사장님이어도", async () => {
        for (const userId of ["m-owner-bare", "m-admin-bare"]) {
            const r = await callRoute("/sso", { userId });
            expect(r.statusCode, userId).toBe(403);
            expect(r.body.code, userId).toBe("SSO_UNVERIFIED");
            expect(r.cookies, userId).toEqual({});
        }
        // PIN 을 만들거나 카카오를 연결하면 열린다
        mem.state.profiles.find((p) => p.id === "p-owner-bare").kakaoSub = "k-9";
        expect((await callRoute("/sso", { userId: "m-owner-bare" })).statusCode).toBe(200);
    });

    it("로그인하지 않았으면 401 · 매장도 관리 권한도 없는 계정은 403 — 쿠키를 주지 않는다", async () => {
        const guest = await callRoute("/sso", {});
        expect(guest.statusCode).toBe(401);
        for (const userId of ["m-user", "m-noprofile", "m-none"]) {
            const r = await callRoute("/sso", { userId });
            expect(r.statusCode, userId).toBe(403);
            expect(r.body.code, userId).toBeUndefined();
            expect(r.cookies, userId).toEqual({});
        }
    });
});

describe("POST /partner/login — 번호 + PIN 폼은 사장님용으로만 남는다", () => {
    it("사장님은 예전 그대로 들어온다", async () => {
        const r = await callRoute("/login", { body: { phone: "010-0000-0002", password: PIN }, ip: "203.0.113.1" });
        expect(r.statusCode).toBe(200);
        expect(r.body.data.storeName).toBe("가 당구장");
        expect(r.cookies.hiq_partner_auth).toBe("p-owner");
    });

    it("관리자 계정은 맞는 PIN 이어도 들이지 않는다 — PIN 을 대조하지도 않는다(맞는지 알려 주지 않는다)", async () => {
        const right = await callRoute("/login", { body: { phone: "01000000001", password: PIN }, ip: "203.0.113.2" });
        const wrong = await callRoute("/login", { body: { phone: "01000000001", password: "0000" }, ip: "203.0.113.3" });
        expect(right.statusCode).toBe(401);
        expect(right.cookies).toEqual({});
        // 맞는 PIN 과 틀린 PIN 의 답이 같다
        expect(right.body).toEqual(wrong.body);
        expect(mem.state.pinChecks).toBe(0);
    });

    it("틀린 PIN · 없는 번호 · PIN 없는 계정은 401 — 쿠키를 주지 않는다", async () => {
        for (const [i, body] of [{ phone: "01000000002", password: "0000" }, { phone: "01099990000", password: PIN }, { phone: "01000000004", password: PIN }].entries()) {
            const r = await callRoute("/login", { body, ip: `203.0.113.${10 + i}` });
            expect(r.statusCode, JSON.stringify(body)).toBe(401);
            expect(r.cookies, JSON.stringify(body)).toEqual({});
        }
    });
});
