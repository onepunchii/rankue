import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { STORE_SELLER_ROLES, bookingManagerState, bookingManagerSwitch } from "./adminMemberGolf";

const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");

describe("부킹매니저 스위치 상태 — 역할 칸이 하나라 user ↔ booking_manager 만 오간다", () => {
    it("일반 회원은 꺼져 있고 켤 수 있다", () => {
        expect(bookingManagerState("user")).toEqual({ kind: "user", isStoreSeller: false, canToggle: true });
    });

    it("부킹매니저는 켜져 있고 끌 수 있다", () => {
        expect(bookingManagerState("booking_manager")).toEqual({ kind: "manager", isStoreSeller: true, canToggle: true });
    });

    it("매장 사장님·슈퍼관리자는 이미 매장 판매자 — 바꾸면 그 권한을 덮어쓰므로 손대지 않는다", () => {
        expect(bookingManagerState("store_owner")).toEqual({ kind: "store_owner", isStoreSeller: true, canToggle: false });
        expect(bookingManagerState("super_admin")).toEqual({ kind: "staff", isStoreSeller: true, canToggle: false });
    });

    // 2026-10-07 오너: "해당 부관리자는 볼 수만 있어" — 관리자(admin)는 관리자 콘솔을 보기만 하는 역할이다. 매장 판매자가 아니다
    it("관리자(보기 전용)는 매장 판매자가 아니다 — 역할 칸을 쓰고 있어 부킹매니저로 바꿀 수도 없다", () => {
        expect(bookingManagerState("admin")).toEqual({ kind: "staff", isStoreSeller: false, canToggle: false });
    });

    it("로그인 계정이 없거나 모르는 역할이면 바꾸지 않는다", () => {
        expect(bookingManagerState(null)).toEqual({ kind: "no_account", isStoreSeller: false, canToggle: false });
        expect(bookingManagerState(undefined)).toEqual({ kind: "no_account", isStoreSeller: false, canToggle: false });
        expect(bookingManagerState(" user")).toMatchObject({ kind: "other", canToggle: false });
    });

    it("켜기는 user → booking_manager, 끄기는 booking_manager → user", () => {
        expect(bookingManagerSwitch(true)).toEqual({ from: "user", to: "booking_manager" });
        expect(bookingManagerSwitch(false)).toEqual({ from: "booking_manager", to: "user" });
    });
});

describe("다른 파일과 같은 규칙인가(소스로 지킨다)", () => {
    it("STORE 판매자 역할 목록이 부킹 등록 라우트(golf.ts BOOKING_WRITER_ROLES)와 같다", () => {
        const m = /const BOOKING_WRITER_ROLES = \[([^\]]*)\]/.exec(read("server/routes/modules/golf.ts"));
        expect(m).not.toBeNull();
        const roles = [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
        expect([...roles].sort()).toEqual([...STORE_SELLER_ROLES].sort());
    });

    it("역할 칸에 booking_manager 가 있다(스키마 enum)", () => {
        expect(read("shared/schema.ts")).toMatch(/role: text\("role", \{ enum: \[[^\]]*"booking_manager"[^\]]*\] \}\)/);
    });

    it("역할은 '지금 값이 from 일 때만' 바꾼다 — 조건 없이 덮어쓰면 그 사이 승인된 사장님 권한이 지워진다", () => {
        const repo = read("server/storage/adminMemberGolf.ts");
        const i = repo.indexOf("export async function setBookingManagerRole");
        const block = repo.slice(i, repo.indexOf("\n}\n", i));
        expect(block).toContain(".where(and(eq(profiles.id, profileId), eq(profiles.role, from)))");
    });
});
