import { describe, expect, it } from "vitest";
import { checkSubAdminRequest, subAdminBlockedMessage, type SubAdminInput } from "./subAdmin.js";

/**
 * 관리자(보기 전용) 임명·해제를 받아도 되는가(2026-10-07 오너: "회원관리에 부관리자 설정할 수 있는 버튼 … 내가 임명을 하면").
 * 아래 id·sub 는 시험용으로 지어낸 값이다.
 */
const ok = (over: Partial<SubAdminInput> = {}): SubAdminInput => ({
    actorRole: "super_admin", actorProfileId: "p-me", on: true,
    member: { profileId: "p-target" },
    profile: { id: "p-target", role: "user", status: "active", kakaoSub: "k-1", googleSub: null, appleSub: null },
    ...over,
});

describe("checkSubAdminRequest", () => {
    it("슈퍼관리자가 소셜 로그인이 연결된 일반 회원을 임명한다 · 관리자를 해제한다", () => {
        expect(checkSubAdminRequest(ok())).toEqual({ ok: true });
        expect(checkSubAdminRequest(ok({ profile: { id: "p-target", role: "user", googleSub: "g-1" } }))).toEqual({ ok: true });
        expect(checkSubAdminRequest(ok({ profile: { id: "p-target", role: "user", appleSub: "a-1" } }))).toEqual({ ok: true });
        expect(checkSubAdminRequest(ok({ on: false, profile: { id: "p-target", role: "admin", kakaoSub: "k-1" } }))).toEqual({ ok: true });
    });

    it("슈퍼관리자가 아니면 못 한다 — 관리자(보기 전용)도, 일반 회원도, 역할을 모를 때도", () => {
        for (const actorRole of ["admin", "user", "store_owner", "booking_manager", null, undefined, ""]) {
            expect(checkSubAdminRequest(ok({ actorRole })), String(actorRole)).toMatchObject({ ok: false, status: 403 });
        }
    });

    it("on 이 true·false 가 아니면 400", () => {
        for (const on of [undefined, null, "true", 1, 0, {}]) expect(checkSubAdminRequest(ok({ on })), String(on)).toMatchObject({ ok: false, status: 400 });
    });

    it("없는 회원 · 로그인 계정이 없는 회원 · 계정이 사라진 회원", () => {
        expect(checkSubAdminRequest(ok({ member: null }))).toMatchObject({ ok: false, status: 404 });
        expect(checkSubAdminRequest(ok({ member: { profileId: null } }))).toMatchObject({ ok: false, status: 409 });
        expect(checkSubAdminRequest(ok({ profile: null }))).toMatchObject({ ok: false, status: 404 });
    });

    it("자기 자신은 안 된다 — 임명도 해제도(슈퍼관리자가 스스로를 건드리는 사고를 막는다)", () => {
        expect(checkSubAdminRequest(ok({ member: { profileId: "p-me" } }))).toMatchObject({ ok: false, status: 409 });
        expect(checkSubAdminRequest(ok({ on: false, member: { profileId: "p-me" } }))).toMatchObject({ ok: false, status: 409 });
    });

    it("소셜 로그인이 하나도 연결되지 않은 일반 회원은 임명하지 않는다 — 임명하면 그 사람이 로그인하지 못한다", () => {
        const r = checkSubAdminRequest(ok({ profile: { id: "p-target", role: "user", googleSub: null, appleSub: null, kakaoSub: null } }));
        expect(r).toMatchObject({ ok: false, status: 409, code: "SUB_ADMIN_NEEDS_SOCIAL" });
        expect(!r.ok && r.message).toContain("PIN");
        // 해제는 소셜 연결과 무관하다
        expect(checkSubAdminRequest(ok({ on: false, profile: { id: "p-target", role: "admin" } }))).toEqual({ ok: true });
    });

    it("정지된 계정은 임명하지 않는다(해제는 된다)", () => {
        expect(checkSubAdminRequest(ok({ profile: { id: "p-target", role: "user", status: "banned", kakaoSub: "k-1" } }))).toMatchObject({ ok: false, status: 409 });
        expect(checkSubAdminRequest(ok({ on: false, profile: { id: "p-target", role: "admin", status: "banned" } }))).toEqual({ ok: true });
    });

    it("사장님·부킹매니저·슈퍼관리자는 여기서 통과시키고 역할을 바꾸는 문장이 거른다 — 그 안내 문구", () => {
        expect(checkSubAdminRequest(ok({ profile: { id: "p-target", role: "store_owner" } }))).toEqual({ ok: true });
        expect(subAdminBlockedMessage("store_owner")).toContain("사장님");
        expect(subAdminBlockedMessage("booking_manager")).toContain("부킹매니저");
        expect(subAdminBlockedMessage("super_admin")).toContain("슈퍼관리자");
        expect(subAdminBlockedMessage("weird")).toContain("weird");
        expect(subAdminBlockedMessage(null)).toContain("-");
    });
});
