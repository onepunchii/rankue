import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiqService } from "./hiqService.js";

/**
 * 카카오·구글 계정의 프로필 사진을 내 프로필 사진으로 — **지금 사진이 없을 때만**
 * (2026-10-07 오너: "내가 수동 프로필 사진 업로드 전까지 프로필 사진 쓰면 좋고").
 *  - 직접 올린 사진은 건드리지 않는다. 한 번 채운 뒤에는 제공자 쪽 사진이 바뀌어도 따라가지 않는다.
 *  - 가입할 때뿐 아니라, 사진 없이 쓰던 기존 회원이 다시 로그인할 때도 채운다.
 *  - 어떤 실패도 로그인을 막지 않는다.
 * 사진을 받아 저장하는 쪽(주소 검사 · 2.5초 · 2MB · 메타 정보 제거)은 server/lib/providerAvatar.test.ts 가 본다.
 * DB 에 붙지 않는다(.env 는 운영 DB 다) — 저장소를 메모리 가짜로 바꾼다. 아래 sub·주소는 시험용으로 지어낸 값이다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[], reads: 0, profileFails: false };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: keyof typeof col, sub: string) { return state.profiles.find((p) => p[col[provider]] === sub); },
            async getLoginMemberByProfileId(profileId: string) { return state.members.find((m) => m.profileId === profileId); },
        },
        async getMemberById(id: string) { state.reads++; return state.members.find((m) => m.id === id); },
        async getProfile(id: string) { if (state.profileFails) throw new Error("connection terminated"); return state.profiles.find((p) => p.id === id); },
        async updateProfile(id: string, data: any) { const p = state.profiles.find((x) => x.id === id); if (p) Object.assign(p, data); return p; },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async getStoreBySlug(slug: string) { return { id: `${slug}-store`, slug, ownerId: null }; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, ...data }; state.members.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage, copy: vi.fn() };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));
// 주소 검사(providerAvatarUrl)는 진짜를 쓰고, 사진을 받아 저장하는 것만 가짜로 바꾼다
vi.mock("../lib/providerAvatar.js", async (original) => ({ ...(await original<typeof import("../lib/providerAvatar.js")>()), copyProviderAvatar: mem.copy }));

const GOOGLE_PIC = "https://lh3.googleusercontent.com/a-/ALV-Uexample=s96-c";
const KAKAO_PIC = "https://k.kakaocdn.net/dn/example/img_640x640.jpg";
const OURS = "https://store.public.blob.vercel-storage.com/hiq/profile/m-old-abc.jpg";
const UPLOADED = "https://store.public.blob.vercel-storage.com/hiq/profile/m-photo-mine.webp";

const profile = (id: string) => mem.state.profiles.find((p) => p.id === id);

beforeEach(() => {
    const s = mem.state;
    s.reads = 0;
    s.profileFails = false;
    s.profiles = [
        { id: "p-old", googleSub: "g-old", kakaoSub: null, appleSub: null, nickname: "기존", profileImageUrl: null },
        { id: "p-photo", googleSub: "g-photo", kakaoSub: null, appleSub: null, nickname: "사진 있음", profileImageUrl: UPLOADED },
    ];
    s.members = [
        { id: "m-old", profileId: "p-old", storeId: "global-store", phone: "social:google:g-old", name: "기존" },
        { id: "m-photo", profileId: "p-photo", storeId: "global-store", phone: "social:google:g-photo", name: "사진 있음" },
        { id: "m-bare", profileId: null, storeId: "global-store", phone: "01000000003", name: "프로필 없음" },
    ];
    mem.copy.mockReset().mockResolvedValue(OURS);
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("adoptProviderAvatar — 지금 사진이 없을 때만", () => {
    it("사진이 없는 프로필이면 사본을 넣는다 — 적히는 것은 제공자의 주소가 아니라 우리 저장소의 주소", async () => {
        await hiqService.adoptProviderAvatar("m-old", GOOGLE_PIC);
        expect(mem.copy).toHaveBeenCalledTimes(1);
        expect(mem.copy).toHaveBeenCalledWith("m-old", GOOGLE_PIC);
        expect(profile("p-old").profileImageUrl).toBe(OURS);
    });

    it("직접 올린 사진이 있으면 건드리지 않는다 — 사진을 받으러 가지도 않는다", async () => {
        await hiqService.adoptProviderAvatar("m-photo", GOOGLE_PIC);
        expect(mem.copy).not.toHaveBeenCalled();
        expect(profile("p-photo").profileImageUrl).toBe(UPLOADED);
    });

    it("한 번 채운 뒤에는 다시 받지 않는다 — 제공자 쪽 사진이 바뀌어도 따라가지 않는다", async () => {
        await hiqService.adoptProviderAvatar("m-old", GOOGLE_PIC);
        mem.copy.mockResolvedValue("https://store.public.blob.vercel-storage.com/hiq/profile/m-old-new.jpg");
        await hiqService.adoptProviderAvatar("m-old", "https://lh3.googleusercontent.com/a-/ALV-Uchanged=s96-c");
        expect(mem.copy).toHaveBeenCalledTimes(1);
        expect(profile("p-old").profileImageUrl).toBe(OURS);
    });

    it("사진이 안 왔거나(애플 · 동의 안 함) 받아도 되는 주소가 아니면 DB 도 읽지 않는다", async () => {
        for (const v of [null, undefined, "", "https://example.com/a.jpg", "https://t1.kakaocdn.net/account_images/default_profile.jpeg", 12]) {
            await hiqService.adoptProviderAvatar("m-old", v);
        }
        expect(mem.state.reads).toBe(0);
        expect(mem.copy).not.toHaveBeenCalled();
        expect(profile("p-old").profileImageUrl).toBeNull();
    });

    it("없는 회원 · 프로필이 없는 회원이면 아무것도 하지 않는다", async () => {
        await hiqService.adoptProviderAvatar("nope", KAKAO_PIC);
        await hiqService.adoptProviderAvatar("m-bare", KAKAO_PIC);
        expect(mem.copy).not.toHaveBeenCalled();
    });

    it("사진을 못 받았으면(null) 프로필을 그대로 둔다", async () => {
        mem.copy.mockResolvedValue(null);
        await hiqService.adoptProviderAvatar("m-old", KAKAO_PIC);
        expect(profile("p-old").profileImageUrl).toBeNull();
    });

    it("DB 오류 · 저장 오류가 나도 던지지 않는다 — 로그인·연결은 이미 끝난 일이다", async () => {
        mem.state.profileFails = true;
        await expect(hiqService.adoptProviderAvatar("m-old", KAKAO_PIC)).resolves.toBeUndefined();
        mem.state.profileFails = false;
        mem.copy.mockRejectedValue(new Error("blob store unavailable"));
        await expect(hiqService.adoptProviderAvatar("m-old", KAKAO_PIC)).resolves.toBeUndefined();
        expect(profile("p-old").profileImageUrl).toBeNull();
    });
});

describe("socialLogin — 가입할 때도, 다시 로그인할 때도 채운다", () => {
    it("새로 가입하면 그 계정의 사진이 프로필 사진이 된다", async () => {
        const out = await hiqService.socialLogin("kakao", { sub: "900001", email: null, name: "새 회원", picture: KAKAO_PIC });
        expect(out.isNew).toBe(true);
        expect(mem.copy).toHaveBeenCalledWith(out.member.id, KAKAO_PIC);
        expect(profile(out.member.profileId).profileImageUrl).toBe(OURS);
    });

    it("사진 없이 쓰던 기존 회원은 다음 로그인에 채워진다", async () => {
        const out = await hiqService.socialLogin("google", { sub: "g-old", email: null, name: "기존", picture: GOOGLE_PIC });
        expect(out.isNew).toBe(false);
        expect(out.member.id).toBe("m-old");
        expect(profile("p-old").profileImageUrl).toBe(OURS);
    });

    it("직접 사진을 올린 회원은 로그인해도 그대로다", async () => {
        await hiqService.socialLogin("google", { sub: "g-photo", email: null, name: "사진 있음", picture: GOOGLE_PIC });
        expect(mem.copy).not.toHaveBeenCalled();
        expect(profile("p-photo").profileImageUrl).toBe(UPLOADED);
    });

    it("사진이 없는 로그인(애플 · 사진 동의 안 한 카카오)은 예전과 같다", async () => {
        const out = await hiqService.socialLogin("apple", { sub: "a-new", email: null, name: null });
        expect(out.isNew).toBe(true);
        expect(mem.copy).not.toHaveBeenCalled();
        expect(profile(out.member.profileId).profileImageUrl ?? null).toBeNull();
    });

    it("사진을 받다가 실패해도 로그인은 된다", async () => {
        mem.copy.mockRejectedValue(new Error("fetch failed"));
        const out = await hiqService.socialLogin("google", { sub: "g-old", email: null, name: "기존", picture: GOOGLE_PIC });
        expect(out.member.id).toBe("m-old");
        expect(out.redirectTo).toBe("/dashboard");
    });
});
