import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiqService } from "./hiqService.js";
import { resolveJoinStore } from "../lib/joinStore.js";
import { pickLoginMember } from "../lib/loginMember.js";

/**
 * 매장 QR 로 가입하면 그 매장의 회원이 된다(2026-10-07 오너: "QR 은 사장님이 직접 자기 매장 포스터에 자기 매장 QR 을 통해 유저가 가입하면
 * 해당 매장 고객으로 인식되는 부분" · "보통 가입하려고 매장 포스터 QR 을 찍지, 이미 가입한 사람이 QR 을 다시 찍을까?").
 *  - 새 계정이 만들어질 때만 그 매장 소속으로(소셜 가입). 이미 계정이 있는 사람의 소속은 바뀌지 않는다.
 *  - 화면이 보낸 매장은 그대로 믿지 않는다 — 실제 파트너 매장(사장님이 있는 매장)일 때만.
 *  - 그 매장 소속 전화번호 회원은 기본 입구로 로그인해도 '새 회원'으로 판정되지 않는다(가입 화면으로 보내면 회원 행이 하나 더 생긴다).
 * DB 에 붙지 않는다(.env 는 운영 DB 다) — 저장소를 메모리 가짜로 바꾼다. 아래 번호·PIN·sub 는 시험용으로 지어낸 값이다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[], stores: [] as any[], storeFails: false };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: keyof typeof col, sub: string) { return state.profiles.find((p) => p[col[provider]] === sub); },
            // 진짜(user.repo)와 같은 규칙 함수를 쓴다 — 본 사이트(hiq) → 글로벌 → 가장 오래된 것
            async getLoginMemberByProfileId(profileId: string) {
                const { pickLoginMember: pick } = await import("../lib/loginMember.js");
                return pick(state.members.filter((m) => m.profileId === profileId)
                    .map((m) => ({ member: m, storeSlug: state.stores.find((s) => s.id === m.storeId)?.slug ?? null, createdAt: m.createdAt })));
            },
        },
        async getStoreBySlug(slug: string) { if (state.storeFails) throw new Error("connection terminated"); return state.stores.find((s) => s.slug === slug); },
        async getProfile(id: string) { return state.profiles.find((p) => p.id === id); },
        async getProfileByPhone(phone: string) { return state.profiles.find((p) => p.phone === phone); },
        async updateProfile(id: string, data: any) { const p = state.profiles.find((x) => x.id === id); if (p) Object.assign(p, data); return p; },
        async getMemberByPhone(storeId: string, phone: string) { return state.members.find((m) => m.storeId === storeId && m.phone === phone); },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, createdAt: new Date(), ...data }; state.members.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("./handle.js", () => ({ generateHandle: async () => "player_0001" }));
vi.mock("../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));

const PIN = "4821";

beforeEach(() => {
    const s = mem.state;
    s.storeFails = false;
    s.stores = [
        { id: "hiq-id", slug: "hiq", ownerId: null },
        { id: "global-id", slug: "global", ownerId: null },
        { id: "store-a", slug: "c00012", ownerId: "p-owner" },       // 파트너 매장(사장님 있음)
        { id: "store-x", slug: "noowner", ownerId: null },            // 주인 없는 매장
    ];
    s.profiles = [
        { id: "p-old", phone: null, password: null, googleSub: "g-old", kakaoSub: null, appleSub: null, nickname: "기존" },
        { id: "p-phone", phone: "01000000009", password: PIN, googleSub: null, kakaoSub: null, appleSub: null, nickname: "매장 회원" },
    ];
    s.members = [
        { id: "m-old", profileId: "p-old", storeId: "global-id", phone: "social:google:g-old", name: "기존", createdAt: new Date("2026-01-01") },
        // 매장 QR 로 전화번호 가입한 회원 — 파트너 매장 소속, 기본 매장(hiq)에는 행이 없다
        { id: "m-phone", profileId: "p-phone", storeId: "store-a", phone: "01000000009", name: "매장 회원", createdAt: new Date("2026-10-07") },
    ];
});

describe("resolveJoinStore — 화면이 보낸 가입 매장을 그대로 믿지 않는다", () => {
    it("사장님이 있는 실제 매장이면 그 매장", async () => {
        expect(await resolveJoinStore("c00012")).toEqual({ id: "store-a", slug: "c00012" });
    });

    it("시스템 매장 · 주인 없는 매장 · 없는 매장 · 이상한 값은 null — 예전처럼 기본·글로벌 매장으로 가입한다", async () => {
        for (const v of ["hiq", "global", "noowner", "nope", "", "a b", "../x", "x".repeat(60), undefined, null, 12, { slug: "c00012" }]) {
            expect(await resolveJoinStore(v), JSON.stringify(v)).toBeNull();
        }
    });

    it("매장 조회가 실패해도 가입을 막지 않는다 — null", async () => {
        mem.state.storeFails = true;
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(await resolveJoinStore("c00012")).toBeNull();
        warn.mockRestore();
    });
});

describe("소셜 가입 — 매장 QR 로 온 새 계정은 그 매장 소속", () => {
    it("새 계정: 가입 매장이 실제 파트너 매장이면 그 매장의 회원 행으로 만든다", async () => {
        const r = await hiqService.socialLogin("kakao", { sub: "k-new", email: null, name: "새 손님" }, undefined, "KR", "c00012");
        expect(r.isNew).toBe(true);
        expect(r.member.storeId).toBe("store-a");
        // 다음에 카카오로 들어와도 그 행이다(프로필의 회원 행이 하나뿐이다)
        const again = await hiqService.socialLogin("kakao", { sub: "k-new", email: null, name: "새 손님" }, undefined, "KR");
        expect(again.isNew).toBe(false);
        expect(again.member.id).toBe(r.member.id);
        expect(again.member.storeId).toBe("store-a");
    });

    it("가입 매장이 없거나 쓸 수 없는 값이면 예전처럼 글로벌", async () => {
        for (const [i, slug] of [undefined, "hiq", "noowner", "nope", "a b"].entries()) {
            const r = await hiqService.socialLogin("google", { sub: `g-${i}`, email: null, name: "손님" }, undefined, "KR", slug);
            expect(r.member.storeId, String(slug)).toBe("global-id");
        }
    });

    // 오너: "이미 가입한 사람이 QR 을 다시 찍을까?" — 찍어도 소속은 그대로다
    it("이미 계정이 있는 사람은 QR 을 찍고 로그인해도 소속이 바뀌지 않는다 — 회원 행도 늘지 않는다", async () => {
        const before = mem.state.members.length;
        const r = await hiqService.socialLogin("google", { sub: "g-old", email: null, name: "기존" }, undefined, "KR", "c00012");
        expect(r.isNew).toBe(false);
        expect(r.member.id).toBe("m-old");
        expect(r.member.storeId).toBe("global-id");
        expect(mem.state.members).toHaveLength(before);
    });
});

describe("전화번호 로그인 — 다른 매장 소속 회원을 기본 입구에서 '새 회원'으로 보지 않는다", () => {
    it("기본 입구(hiq): 그 번호의 계정이 파트너 매장에 있으면 그 회원으로 이어 준다 — PIN 은 그대로 묻는다", async () => {
        const first = await hiqService.login("01000000009", "hiq");
        expect((first as any).isNew).toBe(false);
        expect((first as any).requiresPassword).toBe(true);
        const ok = await hiqService.login("01000000009", "hiq", PIN);
        expect((ok as any).member?.id).toBe("m-phone");
        expect((ok as any).member?.storeId).toBe("store-a");
        // 틀린 PIN 은 예전처럼 거절
        await expect(hiqService.login("01000000009", "hiq", "0000")).rejects.toThrow("INVALID_PASSWORD");
    });

    it("번호의 계정이 어디에도 없으면 예전처럼 새 회원(가입 화면으로)", async () => {
        const r = await hiqService.login("01055550000", "hiq");
        expect((r as any).isNew).toBe(true);
        expect((r as any).redirectTo).toContain("/register?phone=01055550000&store=hiq-id");
    });

    it("매장 전용 입구(?store=)의 로그인은 건드리지 않는다 — 그 매장 회원이 아니면 새 회원이다", async () => {
        const r = await hiqService.login("01000000009", "noowner");
        expect((r as any).isNew).toBe(true);
        // 자기 매장 입구로는 예전 그대로 들어온다
        const own = await hiqService.login("01000000009", "c00012", PIN);
        expect((own as any).member?.id).toBe("m-phone");
    });

    it("고르는 규칙은 소셜 로그인과 같다 — 본 사이트(hiq) → 글로벌 → 가장 오래된 것", () => {
        const picked = pickLoginMember([
            { member: { id: "a" } as any, storeSlug: "c00012", createdAt: new Date("2026-01-01") },
            { member: { id: "b" } as any, storeSlug: "hiq", createdAt: new Date("2026-06-01") },
        ]);
        expect((picked as any)?.id).toBe("b");
    });
});
