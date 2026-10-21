import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** 회원 사진 크게 보기(2026-10-21 오너: "어드민에 회원에 프로필 사진 누르면 크게 볼 수 있게") — 관리자 화면은 vitest 범위 밖이라 소스로 고정 */
describe("관리자 — 회원 사진 크게 보기", () => {
    const utils = read("client/src/pages/admin/adminUtils.tsx");
    it("회원 목록(폰 · 넓은 화면) · 회원 상세의 사진이 누르면 크게", () => {
        expect(read("client/src/pages/admin/MembersView.tsx").match(/<MemberAvatar [^>]*\bzoom\b/g)?.length).toBe(2);
        expect(read("client/src/pages/admin/MemberDetailSheet.tsx")).toMatch(/<MemberAvatar [^>]*\bzoom\b/);
    });
    it("폰 목록은 사진을 줄 단추 밖에 둔다 — 단추 안에 단추를 넣지 않는다", () => {
        const v = read("client/src/pages/admin/MembersView.tsx");
        const li = v.slice(v.indexOf('<li key={m.id} className="flex items-center">'));
        expect(li.indexOf("<MemberAvatar")).toBeLessThan(li.indexOf("<button onClick={() => onOpenId(m.id)}"));
    });
    it("누름만 막는다(Esc · 바깥 누름은 Radix 가 document 에서 듣는다) · Radix Dialog 라 '뒤로'가 먼저 닫는다 · 자르지 않는다", () => {
        expect(utils).toContain('<span className="shrink-0 inline-flex" onClick={(e) => e.stopPropagation()}>');
        expect(utils).not.toMatch(/onKeyDown=\{stop\}|onPointerDown=\{stop\}/);
        expect(utils).toContain("<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>");
        expect(utils).toMatch(/rounded-2xl object-contain/);
        // 사진이 깨졌으면 크게 보기 단추도 없다
        expect(utils).toContain("if (!zoom || !src || broken) return face;");
    });
});
