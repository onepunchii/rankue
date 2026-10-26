/**
 * 관리자 회원 정보의 나이대(2026-10-26 오너 "어드민에 년생으로 되어 있는데 우리 다 나이대라 어드민도 나이대로").
 * 상세의 '출생연도' 칸 → 나이대 여섯 칸, 엑셀의 '출생연도' 열 → '나이대'. 고른 나이대가 없으면 출생연도로 읽은 나이대를 보인다(ageBandOf).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ageBandOf } from "./profileBasics";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("관리자 — 출생연도 대신 나이대", () => {
    it("상세는 나이대 여섯 칸(다시 누르면 비운다) · 바뀐 것만 ageBand 로 보낸다 · 출생연도 칸은 없다", () => {
        const sheet = read("client/src/pages/admin/MemberDetailSheet.tsx");
        expect(sheet).toContain('data-testid="admin-age-band"');
        expect(sheet).toContain('if (form.ageBand !== orig.ageBand) body.ageBand = form.ageBand || null;');
        expect(sheet).not.toContain(">출생연도<");
        expect(sheet).not.toContain("body.birthYear");
    });
    it("엑셀은 '나이대' 열", () => {
        const view = read("client/src/pages/admin/MembersView.tsx");
        expect(view).toContain('"나이대": AGE_LABEL[');
        expect(view).not.toContain('"출생연도":');
    });
    it("서버 — 나이대 값만 받고, 목록이 나이대를 싣는다", () => {
        expect(read("server/routes/modules/admin.ts")).toContain('if (b.ageBand !== null && !isAgeBand(b.ageBand)) return sendError(res, 400, "나이대 값이 올바르지 않습니다");');
        expect(read("server/storage/admin.repo.ts")).toContain("ageBand: hiqMembers.ageBand,");
    });
    it("고른 나이대가 먼저, 없으면 출생연도로(관리 화면도 같은 셈)", () => {
        expect(ageBandOf({ ageBand: "30s", birthYear: 1960 }, 2026)).toBe("30s");
        expect(ageBandOf({ ageBand: null, birthYear: 1985 }, 2026)).toBe("40s");
        expect(ageBandOf({ ageBand: null, birthYear: null }, 2026)).toBeNull();
    });
});
