import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiqService } from "./hiqService.js";
import { hasSocialLogin, isAdminRole } from "../lib/adminRole.js";

/**
 * 관리자 계정은 번호 + PIN 으로 들이지 않는다(2026-10-07 오너: "관리자 계정 핀번호 막자" — server/lib/adminRole).
 * 여기서는 서비스 두 곳을 본다: 전화번호 로그인(login)과 가입으로 프로필에 붙기(register).
 * 잇기(attachSocialToPhone)·바로 들어가기(SSO)·파트너 번호 폼은 routes/modules/socialUnify.test.ts · partnerEntry.test.ts 가 본다.
 * DB 에 붙지 않는다(.env 는 운영 DB 다) — 저장소를 메모리 가짜로 바꾼다. 번호·PIN 은 시험용으로 지어낸 값이다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[], created: [] as any[], profileWrites: [] as any[] };
    const storage = {
        async getStoreBySlug(slug: string) { return { id: `${slug}-store`, slug }; },
        async getMemberByPhone(storeId: string, phone: string) { return state.members.find((m) => m.storeId === storeId && m.phone === phone); },
        async getProfile(id: string) { return state.profiles.find((p) => p.id === id); },
        async getProfileByPhone(phone: string) { return state.profiles.find((p) => p.phone === phone); },
        async updateProfile(id: string, data: any) { state.profileWrites.push({ id, fields: Object.keys(data) }); const p = state.profiles.find((x) => x.id === id); if (p) Object.assign(p, data); return p; },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, ...data }; state.members.push(m); state.created.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));

const PIN = "4821";
const ADMIN_PHONE = "01000000001";

beforeEach(() => {
    const s = mem.state;
    s.created = [];
    s.profileWrites = [];
    s.profiles = [
        { id: "p-admin", role: "super_admin", phone: ADMIN_PHONE, password: PIN, kakaoSub: "k-1", googleSub: null, appleSub: null },
        { id: "p-admin-pinonly", role: "admin", phone: "01000000002", password: PIN, kakaoSub: null, googleSub: null, appleSub: null },
        { id: "p-admin-nopin", role: "admin", phone: "01000000003", password: null, kakaoSub: null, googleSub: "g-3", appleSub: null },
        { id: "p-user", role: "user", phone: "01000000004", password: PIN, kakaoSub: "k-4", googleSub: null, appleSub: null },
    ];
    s.members = [
        { id: "m-admin", profileId: "p-admin", storeId: "hiq-store", phone: ADMIN_PHONE, name: "운영자" },
        { id: "m-admin-pinonly", profileId: "p-admin-pinonly", storeId: "hiq-store", phone: "01000000002", name: "관리자 둘" },
        { id: "m-user", profileId: "p-user", storeId: "hiq-store", phone: "01000000004", name: "회원" },
    ];
});

const rejects = async (run: () => Promise<unknown>) => {
    try { await run(); } catch (e: any) { return { status: e?.status ?? e?.statusCode, message: typeof e?.message === "string" ? e.message : JSON.stringify(e?.message) }; }
    return null;
};

describe("도우미", () => {
    it("관리자 역할은 admin · super_admin 둘뿐 — 사장님(store_owner)·회원은 아니다", () => {
        expect(isAdminRole("admin")).toBe(true);
        expect(isAdminRole("super_admin")).toBe(true);
        for (const r of ["store_owner", "user", "", null, undefined, "ADMIN"]) expect(isAdminRole(r), String(r)).toBe(false);
        expect(hasSocialLogin({ kakaoSub: "k" })).toBe(true);
        expect(hasSocialLogin({ googleSub: null, appleSub: null, kakaoSub: null })).toBe(false);
        expect(hasSocialLogin(null)).toBe(false);
    });
});

describe("전화번호 로그인 — 소셜 로그인이 연결된 관리자 계정", () => {
    it("번호만 보내도(PIN 단계 전) 거절한다 — 'PIN 을 넣으세요'로 넘기지 않는다", async () => {
        const r = await rejects(() => hiqService.login(ADMIN_PHONE, "hiq"));
        expect(r).not.toBeNull();
        expect(r!.message).not.toBe("INVALID_PASSWORD");
    });

    it("맞는 PIN 이어도 거절한다 — 맞는 PIN 과 틀린 PIN 의 답이 같고, PIN 을 대조하지 않는다", async () => {
        const right = await rejects(() => hiqService.login(ADMIN_PHONE, "hiq", PIN));
        const wrong = await rejects(() => hiqService.login(ADMIN_PHONE, "hiq", "0000"));
        expect(right).not.toBeNull();
        expect(right).toEqual(wrong);
        // 틀린 PIN 의 답(INVALID_PASSWORD — 라우트가 실패 횟수로 센다)이 아니다: PIN 이 맞는지 알려 주지 않는다
        expect(right!.message).not.toBe("INVALID_PASSWORD");
        // 맞는 PIN 이면 옛 평문 PIN 을 해시로 바꿔 쓰는데(verifyPassword) 그 쓰기도 없다 = 대조하지 않았다
        expect(mem.state.profileWrites).toEqual([]);
    });

    it("소셜 로그인이 하나도 없는 관리자 계정은 막지 않는다 — 막으면 들어올 길이 없다(관리 화면은 SSO 가 막는다)", async () => {
        const first = await hiqService.login("01000000002", "hiq");
        expect((first as any).requiresPassword).toBe(true);
        const ok = await hiqService.login("01000000002", "hiq", PIN);
        expect((ok as any).member?.id).toBe("m-admin-pinonly");
    });

    it("관리자가 아닌 회원은 예전 그대로 — 카카오를 연결해 둔 전화번호 회원도 번호 + PIN 으로 들어온다", async () => {
        const ok = await hiqService.login("01000000004", "hiq", PIN);
        expect((ok as any).member?.id).toBe("m-user");
        const wrong = await rejects(() => hiqService.login("01000000004", "hiq", "0000"));
        expect(wrong!.message).toBe("INVALID_PASSWORD");
    });
});

describe("가입으로 프로필에 붙기(다른 매장에 같은 번호로 가입) — 관리자 프로필", () => {
    const signup = (phone: string, password: string, storeId = "abc-store") =>
        hiqService.register({ phone, name: "새 회원", storeId, password } as any);

    it("맞는 PIN 이어도 관리자 프로필에 새 회원 행을 붙이지 않는다", async () => {
        const right = await rejects(() => signup(ADMIN_PHONE, PIN));
        const wrong = await rejects(() => signup(ADMIN_PHONE, "0000"));
        expect(right).not.toBeNull();
        expect(right).toEqual(wrong);
        expect(mem.state.created).toEqual([]);
        expect(mem.state.profileWrites).toEqual([]);
    });

    // PIN 없는 프로필에는 가입이 PIN 을 새로 채워 준다(옛 회원용) — 관리자 프로필이면 남이 PIN 을 박고 그 프로필의 세션을 얻는다
    it("PIN 없는 관리자 프로필에 PIN 을 새로 박지 못한다 — 관리자 확인이 'PIN 채우기'보다 먼저다", async () => {
        const r = await rejects(() => signup("01000000003", "9999"));
        expect(r).not.toBeNull();
        expect(mem.state.profiles.find((p) => p.id === "p-admin-nopin").password).toBeNull();
        expect(mem.state.created).toEqual([]);
    });

    it("관리자가 아닌 회원은 예전 그대로 — 맞는 PIN 이면 다른 매장에 붙고, 틀리면 거절", async () => {
        const ok = await signup("01000000004", PIN);
        expect(ok.member.profileId).toBe("p-user");
        const wrong = await rejects(() => signup("01000000004", "0000", "def-store"));
        expect(wrong!.message).toBe("INVALID_PASSWORD");
    });
});
