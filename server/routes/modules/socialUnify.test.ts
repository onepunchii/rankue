import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import authRouter from "./auth.js";
import { hiqService } from "../../services/hiqService.js";

/**
 * 통합 로그인(2026-10-07 오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합" — 계정은 하나, 들어오는 문이 여럿).
 *  - 구글 연결·해제: POST·DELETE /social/google/link (카카오 연결과 같은 본인 확인·같은 잠금)
 *  - 전화번호 계정 잇기: POST /social/attach-phone (소셜로 방금 만든 빈 계정 → 기존 전화번호 계정)
 * 서버를 띄우지 않는다(.env 는 운영 DB 다) — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다(lib/kakaoAuth.test.ts 와 같은 방식).
 * 저장소는 메모리 가짜, 구글 토큰 검증도 가짜다. 아래 sub·번호·PIN 은 전부 시험용으로 지어낸 글자다.
 * 시도 횟수 제한은 모듈 메모리에 남으므로 시험마다 다른 회원·번호·IP 를 쓴다.
 */
const mem = vi.hoisted(() => {
    const state = {
        profiles: [] as any[], members: [] as any[],
        /** 기록이 있는 회원(가짜 발자국) */
        footprint: new Set<string>(),
        deleted: [] as string[],
        deleteFails: false,
        /** 구글 토큰 → 신원. 없는 토큰은 검증 실패(null) */
        google: {} as Record<string, { sub: string; email: string | null; name: string | null }>,
        verifyCalls: 0,
        suspended: new Set<string>(),
    };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    type P = keyof typeof col;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: P, sub: string) { return state.profiles.find((p) => p[col[provider]] === sub); },
            // 진짜와 같은 규칙: 비어 있을 때만 붙인다 + 같은 값이 다른 프로필에 있으면 유니크 제약(23505)
            async linkProfileSocialSub(provider: P, profileId: string, sub: string) {
                if (state.profiles.some((p) => p[col[provider]] === sub && p.id !== profileId)) throw Object.assign(new Error("duplicate key"), { code: "23505" });
                const p = state.profiles.find((x) => x.id === profileId);
                if (!p || p[col[provider]]) return false;
                p[col[provider]] = sub;
                return true;
            },
            // 진짜와 같은 규칙: 지금 붙어 있는 그 값일 때만 뗀다
            async unlinkProfileSocialSub(provider: P, profileId: string, sub: string) {
                const p = state.profiles.find((x) => x.id === profileId);
                if (!p || p[col[provider]] !== sub) return false;
                p[col[provider]] = null;
                return true;
            },
            // 진짜와 같은 규칙: 옛 자리에서 그 값일 때만 떼고 새 자리에 비어 있을 때만 붙인다 — 하나라도 안 되면 아무것도 바꾸지 않는다
            async moveProfileSocialSub(provider: P, fromId: string, toId: string, sub: string) {
                const from = state.profiles.find((x) => x.id === fromId);
                const to = state.profiles.find((x) => x.id === toId);
                if (!from || !to || from[col[provider]] !== sub || to[col[provider]]) return false;
                from[col[provider]] = null;
                to[col[provider]] = sub;
                return true;
            },
            async memberHasFootprint(memberId: string) { return state.footprint.has(memberId); },
            async deleteAccount(memberId: string) {
                if (state.deleteFails) throw new Error("connection terminated");
                const m = state.members.find((x) => x.id === memberId);
                state.deleted.push(memberId);
                state.profiles = state.profiles.filter((p) => p.id !== m?.profileId);
                if (m) { m.profileId = null; m.phone = `del-${memberId}`; m.name = "탈퇴회원"; }
                return { profileImageUrl: null };
            },
        },
        async getProfile(id: string) { return state.profiles.find((p) => p.id === id); },
        // PIN 을 맞히면 옛 평문 PIN 을 해시로 바꿔 저장한다(verifyPassword) — 가짜도 받아 준다
        async updateProfile(id: string, data: any) { const p = state.profiles.find((x) => x.id === id); if (p) Object.assign(p, data); return p; },
        async getMemberById(id: string) { return state.members.find((m) => m.id === id); },
        async getMemberByPhone(storeId: string, phone: string) { return state.members.find((m) => m.storeId === storeId && m.phone === phone); },
        async getStoreBySlug(slug: string) { return { id: `${slug}-store`, slug }; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));
vi.mock("../../lib/socialAuth.js", () => ({
    verifyGoogleIdToken: async (token: string) => { mem.state.verifyCalls++; return mem.state.google[token] ?? null; },
    verifyAppleIdToken: async () => null,
}));
vi.mock("../../middleware/terms.js", () => ({
    isMemberSuspended: async (id: string) => mem.state.suspended.has(id),
    recordTermsAcceptance: async () => undefined,
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    SUSPENDED_TEXT: "정지된 계정",
}));

/** 시험용 PIN — 지어낸 값. 저장은 옛 평문 꼴로 둔다(verifyPassword 가 평문·해시를 둘 다 받는다). */
const PIN = "4821";
const SOCIAL_KAKAO = "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d";
const SOCIAL_GOOGLE = "social:google:g-new";

type FakeRes = { statusCode: number; body: any; cookies: Record<string, unknown>; cleared: string[] };
function callRoute(method: "post" | "delete", path: string, req: { body?: unknown; ip?: string; userId?: string; json?: boolean }): Promise<FakeRes> {
    const layer = (authRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`시험에 없는 길: ${method} ${path}`);
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
        const request: any = {
            body: req.body ?? {},
            ip: req.ip,
            headers: req.ip ? { "x-forwarded-for": `${req.ip}, 10.0.0.1` } : {},
            signedCookies: req.userId ? { hiq_user_id: req.userId } : {},
            is: (type: string) => (req.json === false ? false : type === "application/json"),
        };
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
    s.profiles = [
        { id: "pa", nickname: "가", phone: "01000000001", password: PIN, googleSub: null, kakaoSub: null, appleSub: null },
        { id: "pb", nickname: "나", phone: "01000000002", password: PIN, googleSub: "g-b", kakaoSub: null, appleSub: null }, // 구글 연결됨
        { id: "pc", nickname: "다", phone: "01000000003", googleSub: null, kakaoSub: null, appleSub: null },                // PIN 없는 프로필
        { id: "pg", nickname: "구", googleSub: "g-new", kakaoSub: null, appleSub: null },                                   // 구글로 가입(빈 계정)
        { id: "pk", nickname: "카", googleSub: null, kakaoSub: "900", appleSub: null },                                     // 카카오로 가입(빈 계정)
        { id: "pd", nickname: "라", phone: "01000000004", password: PIN, googleSub: null, kakaoSub: "400", appleSub: null }, // 전화번호 회원, 카카오 이미 연결
    ];
    s.members = [
        { id: "u-a", profileId: "pa", storeId: "hiq-store", phone: "01000000001", name: "가" },
        { id: "u-b", profileId: "pb", storeId: "hiq-store", phone: "01000000002", name: "나" },
        { id: "u-c", profileId: "pc", storeId: "hiq-store", phone: "01000000003", name: "다" },
        { id: "u-g", profileId: "pg", storeId: "global-store", phone: SOCIAL_GOOGLE, name: "구" },
        { id: "u-k", profileId: "pk", storeId: "global-store", phone: SOCIAL_KAKAO, name: "카" },
        { id: "u-d", profileId: "pd", storeId: "hiq-store", phone: "01000000004", name: "라" },
        { id: "u-nopro", profileId: null, storeId: "hiq-store", phone: "01000000009", name: "매장 등록" },
    ];
    s.footprint = new Set(["u-a", "u-b", "u-d"]);
    s.deleted = [];
    s.deleteFails = false;
    s.google = { "tok-new": { sub: "g-fresh", email: "a@example.com", name: "A" }, "tok-taken": { sub: "g-new", email: null, name: null }, "tok-b": { sub: "g-b", email: null, name: null } };
    s.verifyCalls = 0;
    s.suspended = new Set();
});

const profile = (id: string) => mem.state.profiles.find((p) => p.id === id);

describe("POST /social/google/link — 내 계정에 구글을 붙인다", () => {
    it("로그인하지 않았으면 401 — 토큰을 검증하지도 않는다", async () => {
        const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN } });
        expect(r.statusCode).toBe(401);
        expect(mem.state.verifyCalls).toBe(0);
    });

    it("PIN 이 맞고 토큰이 진짜면 붙인다 — 쿠키는 건드리지 않는다", async () => {
        const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-a" });
        expect(r.statusCode).toBe(200);
        expect(r.body).toEqual({ success: true, data: { linked: true } });
        expect(r.cookies).toEqual({});
        expect(profile("pa").googleSub).toBe("g-fresh");
    });

    // 쿠키만 쥔 사람(빌린 폰)이 자기 구글을 남의 계정에 붙이지 못한다. PIN 을 토큰 검증보다 먼저 본다
    it("PIN 이 틀리면 401 LINK_PIN_WRONG — 구글 검증을 돌리지 않는다", async () => {
        mem.state.members.push({ id: "u-a2", profileId: "pa", storeId: "abc-store", phone: "01000000001" });
        for (const pin of ["0000", "", undefined]) {
            const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin }, userId: "u-a2" });
            expect(r.statusCode, String(pin)).toBe(401);
            expect(r.body.code, String(pin)).toBe("LINK_PIN_WRONG");
        }
        expect(mem.state.verifyCalls).toBe(0);
        expect(profile("pa").googleSub).toBeNull();
    });

    it("PIN 을 다섯 번 틀리면 잠긴다 — 맞는 PIN 도 그동안은 안 된다", async () => {
        mem.state.members.push({ id: "u-guess", profileId: "pa", storeId: "hiq-store", phone: "01000000001" });
        for (let n = 0; n < 5; n++) {
            const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: `000${n}` }, userId: "u-guess" });
            expect(r.statusCode, String(n)).toBe(401);
        }
        const locked = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-guess" });
        expect(locked.statusCode).toBe(429);
        expect(profile("pa").googleSub).toBeNull();
    });

    it("폼 본문은 받지 않는다(남의 사이트의 숨긴 폼) · 토큰이 없으면 400", async () => {
        const form = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-a", json: false });
        expect(form.statusCode).toBe(400);
        const none = await callRoute("post", "/social/google/link", { body: { pin: PIN }, userId: "u-a" });
        expect(none.statusCode).toBe(400);
        expect(mem.state.verifyCalls).toBe(0);
    });

    it("토큰이 가짜면 401 — 붙이지 않는다", async () => {
        mem.state.members.push({ id: "u-a3", profileId: "pa", storeId: "hiq-store", phone: "01000000001" });
        const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-forged", pin: PIN }, userId: "u-a3" });
        expect(r.statusCode).toBe(401);
        expect(r.body.code).toBeUndefined();
        expect(profile("pa").googleSub).toBeNull();
    });

    it("그 구글로 만든 계정이 따로 있으면 409 LINK_TAKEN — 옮기지 않는다(문구가 다음 할 일을 알려 준다)", async () => {
        mem.state.members.push({ id: "u-a4", profileId: "pa", storeId: "hiq-store", phone: "01000000001" });
        const r = await callRoute("post", "/social/google/link", { body: { idToken: "tok-taken", pin: PIN }, userId: "u-a4" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("LINK_TAKEN");
        expect(r.body.message).toContain("Google");
        expect(profile("pa").googleSub).toBeNull();
        expect(profile("pg").googleSub).toBe("g-new");
    });

    it("이미 다른 구글이 붙어 있으면 409 LINK_OTHER_LINKED — 덮어쓰지 않는다. 같은 구글이면 그대로 성공", async () => {
        const other = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-b" });
        expect(other.statusCode).toBe(409);
        expect(other.body.code).toBe("LINK_OTHER_LINKED");
        expect(profile("pb").googleSub).toBe("g-b");
        const same = await callRoute("post", "/social/google/link", { body: { idToken: "tok-b", pin: PIN }, userId: "u-b" });
        expect(same.statusCode).toBe(200);
    });

    it("PIN 없는 계정·프로필 없는 계정에는 붙이지 않는다", async () => {
        const noPin = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-c" });
        expect(noPin.statusCode).toBe(409);
        expect(noPin.body.code).toBe("LINK_PIN_REQUIRED");
        const noProfile = await callRoute("post", "/social/google/link", { body: { idToken: "tok-new", pin: PIN }, userId: "u-nopro" });
        expect(noProfile.statusCode).toBe(409);
        expect(noProfile.body.code).toBe("LINK_NO_PROFILE");
        expect(mem.state.verifyCalls).toBe(0);
    });
});

describe("DELETE /social/google/link — 구글을 뗀다", () => {
    it("PIN 이 맞으면 뗀다 — 전화번호+PIN 이라는 다른 길이 남는다", async () => {
        const r = await callRoute("delete", "/social/google/link", { body: { pin: PIN }, userId: "u-b" });
        expect(r.statusCode).toBe(200);
        expect(r.body.data).toEqual({ linked: false });
        expect(profile("pb").googleSub).toBeNull();
    });

    it("PIN 이 틀리면 401 — 그대로다", async () => {
        mem.state.members.push({ id: "u-b2", profileId: "pb", storeId: "hiq-store", phone: "01000000002" });
        const r = await callRoute("delete", "/social/google/link", { body: { pin: "0000" }, userId: "u-b2" });
        expect(r.statusCode).toBe(401);
        expect(r.body.code).toBe("LINK_PIN_WRONG");
        expect(profile("pb").googleSub).toBe("g-b");
    });

    it("구글로 가입한 계정은 뗄 수 없다 — 떼면 들어올 길이 없다", async () => {
        const r = await callRoute("delete", "/social/google/link", { body: { pin: PIN }, userId: "u-g" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("LINK_SIGNUP_ACCOUNT");
        expect(profile("pg").googleSub).toBe("g-new");
    });
});

describe("POST /social/attach-phone — 소셜로 방금 만든 빈 계정을 기존 전화번호 계정에 잇는다", () => {
    it("번호와 PIN 이 맞으면: 로그인 수단을 옮기고 · 빈 계정을 지우고 · 쿠키를 기존 계정으로 바꾼다", async () => {
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.1" });
        expect(r.statusCode).toBe(200);
        expect(r.body.data.attached).toBe("kakao");
        expect(r.body.data.member.id).toBe("u-a");
        expect(r.cookies.hiq_user_id).toBe("u-a");
        expect(profile("pa").kakaoSub).toBe("900");
        expect(mem.state.deleted).toEqual(["u-k"]);
        expect(profile("pk")).toBeUndefined();
        // 다음부터는 카카오로 들어와도 기존 계정이다 — 그 카카오의 주인이 pa 다
        expect((await mem.storage.users.getProfileBySocialSub("kakao", "900"))?.id).toBe("pa");
    });

    it("구글로 만든 빈 계정도 같다", async () => {
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-g", ip: "198.51.100.2" });
        expect(r.statusCode).toBe(200);
        expect(r.body.data.attached).toBe("google");
        expect(profile("pa").googleSub).toBe("g-new");
        expect(mem.state.deleted).toEqual(["u-g"]);
    });

    it("PIN 이 틀리면 401 ATTACH_PIN_WRONG — 아무것도 바뀌지 않고, 로그인과 같은 잠금에 센다(다섯 번이면 잠긴다)", async () => {
        for (let n = 0; n < 5; n++) {
            const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: `111${n}` }, userId: "u-k", ip: "198.51.100.3" });
            expect(r.statusCode, String(n)).toBe(401);
            expect(r.body.code, String(n)).toBe("ATTACH_PIN_WRONG");
        }
        const locked = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.3" });
        expect(locked.statusCode).toBe(429);
        expect(profile("pa").kakaoSub).toBeNull();
        expect(profile("pk").kakaoSub).toBe("900");
        expect(mem.state.deleted).toEqual([]);
        expect(locked.cookies).toEqual({});
    });

    it("없는 번호는 404 ATTACH_NO_ACCOUNT · 자리표시자를 번호로 보내면 400", async () => {
        const none = await callRoute("post", "/social/attach-phone", { body: { phone: "01099990000", pin: PIN }, userId: "u-k", ip: "198.51.100.4" });
        expect(none.statusCode).toBe(404);
        expect(none.body.code).toBe("ATTACH_NO_ACCOUNT");
        const placeholder = await callRoute("post", "/social/attach-phone", { body: { phone: SOCIAL_GOOGLE, pin: PIN }, userId: "u-k", ip: "198.51.100.4" });
        expect(placeholder.statusCode).toBe(400);
        expect(mem.state.deleted).toEqual([]);
    });

    it("PIN 없는 계정(매장에서 번호만으로 등록)에는 잇지 않는다 — 본인임을 확인할 방법이 없다", async () => {
        for (const phone of ["01000000003", "01000000009"]) {
            const r = await callRoute("post", "/social/attach-phone", { body: { phone, pin: PIN }, userId: "u-k", ip: "198.51.100.5" });
            expect(r.statusCode, phone).toBe(409);
            expect(r.body.code, phone).toBe("ATTACH_NO_PIN");
        }
        expect(mem.state.deleted).toEqual([]);
    });

    it("전화번호 계정에서는 쓸 수 없다(전화번호 계정끼리는 잇지 않는다) — 수단이 둘 붙은 계정도 '방금 만든 계정'이 아니다", async () => {
        const phoneAccount = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-b", ip: "198.51.100.6" });
        expect(phoneAccount.statusCode).toBe(409);
        expect(phoneAccount.body.code).toBe("ATTACH_NOT_SOCIAL");
        profile("pk").googleSub = "g-extra";
        const two = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.6" });
        expect(two.body.code).toBe("ATTACH_NOT_SOCIAL");
        expect(mem.state.deleted).toEqual([]);
    });

    it("지금 계정에 기록이 있으면 409 ATTACH_NOT_EMPTY — 기록이 있는 계정은 지우지 않는다", async () => {
        mem.state.footprint.add("u-k");
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.7" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("ATTACH_NOT_EMPTY");
        expect(profile("pk").kakaoSub).toBe("900");
        expect(profile("pa").kakaoSub).toBeNull();
        expect(mem.state.deleted).toEqual([]);
        expect(r.cookies).toEqual({});
    });

    it("기존 계정에 같은 종류의 다른 로그인이 이미 붙어 있으면 409 ATTACH_OTHER_LINKED — 덮어쓰지 않는다. PIN 이 틀리면 이 사실도 말하지 않는다", async () => {
        const wrong = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000004", pin: "0000" }, userId: "u-k", ip: "198.51.100.8" });
        expect(wrong.body.code).toBe("ATTACH_PIN_WRONG");
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000004", pin: PIN }, userId: "u-k", ip: "198.51.100.8" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("ATTACH_OTHER_LINKED");
        expect(profile("pd").kakaoSub).toBe("400");
        expect(mem.state.deleted).toEqual([]);
    });

    it("폼 본문은 받지 않는다(쿠키가 바뀌는 길 — 로그인 CSRF) · 로그인하지 않았으면 401", async () => {
        const form = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.9", json: false });
        expect(form.statusCode).toBe(400);
        const anon = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, ip: "198.51.100.9" });
        expect(anon.statusCode).toBe(401);
        expect(profile("pa").kakaoSub).toBeNull();
    });

    it("기존 계정이 정지 상태면 들이지 않는다(403) — 쿠키를 지운다", async () => {
        mem.state.suspended.add("u-a");
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.10" });
        expect(r.statusCode).toBe(403);
        expect(r.cleared).toContain("hiq_user_id");
        expect(r.cookies).toEqual({});
    });

    it("빈 계정 지우기가 실패해도 잇기는 끝난다 — 수단은 이미 옮겨졌고, 남은 빈 계정에는 들어올 길이 없다", async () => {
        mem.state.deleteFails = true;
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = await callRoute("post", "/social/attach-phone", { body: { phone: "01000000001", pin: PIN }, userId: "u-k", ip: "198.51.100.11" });
        expect(r.statusCode).toBe(200);
        expect(r.cookies.hiq_user_id).toBe("u-a");
        expect(profile("pa").kakaoSub).toBe("900");
        expect(profile("pk").kakaoSub).toBeNull();
        err.mockRestore();
    });
});

describe("hiqService — 통합 로그인 규칙(라우트 밖에서 불러도 같다)", () => {
    it("linkSocial: 유니크 제약(23505)으로 진 경합은 'taken' 으로 답한다", async () => {
        // 조회와 쓰기 사이에 다른 프로필이 같은 구글을 가져갔다
        const real = mem.storage.users.getProfileBySocialSub;
        mem.storage.users.getProfileBySocialSub = async () => undefined;
        try {
            expect(await hiqService.linkSocial("u-a", "google", { sub: "g-new", email: null, name: null })).toBe("taken");
        } finally { mem.storage.users.getProfileBySocialSub = real; }
        expect(profile("pa").googleSub).toBeNull();
    });

    it("attachSocialToPhone: 자기 자신의 자리표시자·같은 회원으로는 잇지 않는다", async () => {
        expect((await hiqService.attachSocialToPhone("u-k", SOCIAL_KAKAO, PIN)).kind).toBe("no-account");
        expect((await hiqService.attachSocialToPhone("u-none", "01000000001", PIN)).kind).toBe("not-social");
    });
});

describe("규칙이 코드에 남아 있는가", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

    it("서버 사전 — 새 오류 문구는 다섯 언어 전부, {provider} 자리도 같다", () => {
        const keys = ["linkNoProfile", "linkPinRequired", "linkPinWrong", "linkTaken", "linkOtherLinked", "linkUnlinkSignup",
            "attachPinWrong", "attachNoAccount", "attachNoPin", "attachNotSocial", "attachNotEmpty", "attachOtherLinked"];
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const src = root(`shared/i18n/${l}.ts`);
            for (const k of keys) {
                const m = new RegExp(`"err\\.auth\\.${k}": "([^"\\n]+)"`).exec(src);
                expect(m, `${l} ${k}`).not.toBeNull();
                if (["linkTaken", "linkOtherLinked", "linkUnlinkSignup"].includes(k)) expect(m![1], `${l} ${k}`).toContain("{provider}");
            }
        }
    });

    it("빈 계정 확인(memberHasFootprint)이 당구·골프·채팅·글을 다 본다 — 표를 빼면 기록 있는 계정이 지워질 수 있다", () => {
        const src = root("server/storage/user.repo.ts");
        const body = src.slice(src.indexOf("async memberHasFootprint"), src.indexOf("async getMemberByProfileId"));
        for (const t of ["hiq_game_history", "hiq_games", "hiq_crew_members", "hiq_chat_messages", "hiq_community_posts", "hiq_sim_matches",
            "hiq_sim_sessions", "hiq_listing_chats", "golf_bookings", "golf_joins", "golf_join_requests", "golf_match_sessions", "golf_players",
            "golf_round_checkins", "golf_round_photos"]) expect(body, t).toContain(`from ${t} `);
    });

    it("옮기기(moveProfileSocialSub)는 한 트랜잭션 — 떼기가 먼저고, 둘 중 하나라도 0줄이면 되돌린다", () => {
        const src = root("server/storage/user.repo.ts");
        const body = src.slice(src.indexOf("async moveProfileSocialSub"), src.indexOf("async memberHasFootprint"));
        expect(body).toContain("db.transaction");
        expect(body.indexOf("eq(col, sub)")).toBeLessThan(body.indexOf("isNull(col)"));
        expect(body.match(/throw new Abort\(\)/g)?.length).toBe(2);
    });
});
