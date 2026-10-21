import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 크루 둘러보기(2026-10-21) — 크루원이 한 명도 없는 크루(혼자 남은 크루장이 탈퇴한 크루)는 목록 · 인기 · 내 주변에서 뺀다 */
describe("크루 둘러보기", () => {
    it("크루원 0명인 크루는 빼고(HAVING), 크루를 지우지는 않는다", () => {
        const repo = readFileSync(resolve(__dirname, "../server/storage/crew.repo.ts"), "utf8");
        expect(repo).toContain(".having(sql`count(${hiqCrewMembers.id}) filter (where ${hiqCrewMembers.role} <> 'pending') > 0`)");
        const user = readFileSync(resolve(__dirname, "../server/storage/user.repo.ts"), "utf8");
        expect(user).toContain("if (!successor) continue;");   // 탈퇴는 크루를 지우지 않는다 — 그래서 목록에서 거른다
    });
});
