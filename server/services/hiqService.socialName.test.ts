import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiqService } from "./hiqService.js";

/**
 * 소셜 가입의 이름(2026-10-06 검토 — '랭큐 운영팀' 사칭).
 * 운영 주체로 보이는 이름은 가입(POST /register)·프로필 수정(PATCH /me)의 이름 필터가 거절한다. 그런데 구글·애플 가입(POST /social)의
 * 표시 이름은 **화면이 보내는 글자**이고 그 필터를 거치지 않는다 — 새 구글 계정 하나와 요청 한 번이면 그 이름을 가질 수 있었다.
 * 그래서 가입 저장 직전(hiqService.socialLogin)에 후보에서 뺀다. 가입은 막지 않는다: 다음 후보 → 기본 이름.
 *
 * DB 에 붙지 않는다(.env 는 운영 DB 다) — 저장소를 메모리 가짜로 바꾼다. 아래 sub·메일·이름은 시험용으로 지어낸 글자다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[] };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: "google" | "apple" | "kakao", sub: string) { return state.profiles.find((p) => p[col[provider]] === sub); },
            async getLoginMemberByProfileId(profileId: string) { return state.members.find((m) => m.profileId === profileId); },
        },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async getStoreBySlug(slug: string) { return { id: `${slug}-store`, slug }; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, ...data }; state.members.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));

beforeEach(() => {
    mem.state.profiles = [];
    mem.state.members = [];
});

/** 방금 가입한 사람의 이름 — 프로필 닉네임과 회원 이름이 같은 값으로 저장된다 */
const savedName = () => {
    const p = mem.state.profiles[mem.state.profiles.length - 1];
    const m = mem.state.members[mem.state.members.length - 1];
    expect(m.name).toBe(p.nickname);
    return m.name as string;
};

describe("hiqService.socialLogin — 운영 주체로 보이는 이름은 가입 이름이 되지 않는다", () => {
    it("화면이 보낸 표시 이름이 '랭큐 운영팀 메시지'면 버리고 다음 후보(제공자가 준 이름)를 쓴다", async () => {
        const r = await hiqService.socialLogin("google", { sub: "g-1", email: "someone@example.com", name: "김당구" }, "랭큐 운영팀 메시지");
        expect(r.isNew).toBe(true);
        expect(savedName()).toBe("김당구");
    });

    it("제공자가 준 이름까지 걸리면 메일 앞부분, 그것도 걸리면 기본 이름 — 가입은 막지 않는다", async () => {
        await hiqService.socialLogin("google", { sub: "g-2", email: "kim.dang9@example.com", name: "Rankue Team" }, "랭큐 운영자");
        expect(savedName()).toBe("kim.dang9");
        const r = await hiqService.socialLogin("apple", { sub: "a-1", email: "rankue.official@example.com", name: "랭 큐 운영팀" }, "관리자");
        expect(r.isNew).toBe(true);
        expect(savedName()).toBe("Player");
        // 저장된 어느 이름에도 예약 낱말이 없다
        for (const m of mem.state.members) expect(m.name).not.toMatch(/랭큐|운영|관리자|rankue/i);
    });

    it("띄어쓰기·전각·보이지 않는 글자로 돌아가도 같다", async () => {
        for (const [i, name] of ["랭 큐 운 영 팀", "ＲＡＮＫＵＥ Support", "랭\u200B큐 운영팀", "랭\u3164큐"].entries()) {
            await hiqService.socialLogin("google", { sub: `g-x${i}`, email: null, name: null }, name);
            expect(savedName(), JSON.stringify(name)).toBe("Player");
        }
    });

    it("평범한 이름은 예전 그대로다 — 후보 순서(화면 이름 → 제공자 이름 → 메일 앞부분 → 기본 이름)도 그대로", async () => {
        await hiqService.socialLogin("apple", { sub: "a-2", email: "someone@example.com", name: "Provider Name" }, "Kim");
        expect(savedName()).toBe("Kim");
        await hiqService.socialLogin("google", { sub: "g-3", email: "someone@example.com", name: "Provider Name" });
        expect(savedName()).toBe("Provider Name");
        await hiqService.socialLogin("google", { sub: "g-4", email: "someone@example.com", name: null });
        expect(savedName()).toBe("someone");
        await hiqService.socialLogin("google", { sub: "g-5", email: null, name: null });
        expect(savedName()).toBe("Player");
    });

    it("카카오의 기본 이름은 서버가 붙이는 값이라 그대로 쓴다('랭큐회원') — 회원이 고른 이름이 아니다", async () => {
        await hiqService.socialLogin("kakao", { sub: "k-1", email: null, name: null });
        expect(savedName()).toBe("랭큐회원");
        // 카카오 닉네임이 예약 이름이면 버리고 기본 이름으로 시작한다(라우트도 같은 일을 한 번 더 한다)
        await hiqService.socialLogin("kakao", { sub: "k-2", email: null, name: "랭큐 운영팀" });
        expect(savedName()).toBe("랭큐회원");
    });

    it("이미 가입한 사람의 로그인에서는 이름을 건드리지 않는다", async () => {
        await hiqService.socialLogin("google", { sub: "g-6", email: null, name: "김당구" });
        const again = await hiqService.socialLogin("google", { sub: "g-6", email: null, name: "랭큐 운영팀" }, "랭큐 운영팀");
        expect(again.isNew).toBe(false);
        expect(mem.state.profiles).toHaveLength(1);
        expect(mem.state.members).toHaveLength(1);
        expect(savedName()).toBe("김당구");
    });
});
