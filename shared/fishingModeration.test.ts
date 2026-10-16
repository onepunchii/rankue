import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rankRows } from "./fishingRank";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const routes = read("server/routes/modules/fishing.ts");

describe("낚시 조과 신고 · 가림(공개 전 필수, 2026-10-17)", () => {
    it("남이 보는 길은 가려진 조과를 뺀다 — 랭킹 어종 칩 · 랭킹 · 정출판 · 크루 수족관 · 수족관 물고기", () => {
        expect(routes).toMatch(/from fishing_catches where is_public and hidden_at is null group by species/);
        expect(routes).toMatch(/where c\.is_public and c\.hidden_at is null and c\.species = \$\{fish\.name\}/);
        expect(routes).toMatch(/and \(c\.hidden_at is null or c\.member_id = \$\{viewerId\}\) \$\{notBlockedBy\(viewerId\)\}/);
        expect(routes).toMatch(/c\.member_id = m\.id::text and c\.hidden_at is null\) as species/);
        expect(routes).toMatch(/from fishing_catches where member_id = \$\{memberId\} and hidden_at is null`/);
    });
    it("보는 사람이 차단한 회원의 조과는 랭킹 · 정출판에서 빠진다", () => {
        expect(routes).toMatch(/b\.blocker_id = \$\{viewerId\}::uuid and b\.blocked_id::text = c\.member_id/);
        expect(routes).toMatch(/c\.\$\{col\} is not null \$\{notBlockedBy\(req\.userId\)\}/);
    });
    it("내 조과를 지우면 사진 파일도 지운다", () => {
        const del = routes.slice(routes.indexOf('router.delete("/catches/:id"'));
        expect(del).toMatch(/returning id, photo_url, thumb_url[\s\S]*await deleteBlobs\(/);
    });
    it("신고는 볼 수 있었던 사람만 — 공개 조과는 누구나, 정출 조과는 그 크루원만", () => {
        const s = read("server/storage/fishingCatches.ts");
        const fn = s.slice(s.indexOf("export async function reportableAuthor"));
        expect(fn).toMatch(/if \(c\.isPublic\) return c\.memberId;\s*if \(!c\.crewId\) return null;/);
        expect(fn).toMatch(/role <> 'pending'/);
        expect(read("server/routes/modules/community.ts")).toMatch(/case "fishing_catch":\s*return storage\.fishingCatches\.reportableAuthor\(id, reporterId\);/);
    });
    it("운영자 목록은 남이 볼 수 있었던 조과만 — 나만 보는 기록은 훑지 않는다", () => {
        expect(read("server/storage/adminFishingCatches.ts")).toMatch(/\(c\.is_public OR c\.trip_id IS NOT NULL OR c\.hidden_at IS NOT NULL\)/);
    });
    it("랭킹 줄은 신고 · 차단 메뉴가 쓸 조과 · 회원을 싣는다(내 줄은 메뉴가 없다)", () => {
        const rows = rankRows([{ id: "c1", member_id: "m1", name: "가", value: 50, day: "2026-10-01", thumb_url: null }, { id: "c2", member_id: "me", name: "나", value: 40, day: "2026-10-02", thumb_url: null }], "me");
        expect(rows.map((r) => [r.catchId, r.memberId, r.mine])).toEqual([["c1", "m1", false], ["c2", "me", true]]);
        expect(read("client/src/fishing/FishingRanking.tsx")).toMatch(/\{!r\.mine && r\.catchId \? \(\s*<UgcActionMenu targetType="fishing_catch"/);
    });
    it("마이그레이션은 칸 셋을 더하기만 한다", () => {
        const body = read("migrations/fishing_catches_v6.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toHaveLength(3);
        for (const l of body) expect(l).toMatch(/^alter table fishing_catches add column if not exists \w+\s+(timestamp|text);$/);
    });
});
