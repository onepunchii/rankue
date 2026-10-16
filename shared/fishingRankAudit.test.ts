import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RANK_REVIEW_FACTOR, rankReview } from "./fishingRankAudit";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("랭킹 점검 — 다시 볼 것은 이미 있는 단계로만", () => {
    it("길이: 벵에돔(맨 위 5짜 50cm)은 1.6배인 80cm 까지 보통, 넘으면 표시", () => {
        expect(RANK_REVIEW_FACTOR.cm).toBe(1.6);
        expect(rankReview("벵에돔", 80)).toBeNull();
        expect(rankReview("벵에돔", 81)?.text).toContain("맨 위 단계(5짜)");
        expect(rankReview("벵에돔", 400)?.text).toContain("8배");
    });
    it("마릿수 · 무게는 퍼짐이 커 3배 — 주꾸미 100수 · 문어 5킬로", () => {
        expect(rankReview("주꾸미", 300)).toBeNull();
        expect(rankReview("주꾸미", 999)).not.toBeNull();
        expect(rankReview("문어", 15)).toBeNull();
        expect(rankReview("문어", 16)).not.toBeNull();
    });
    it("랭킹이 없는 어종(자유 입력) · 값 없음은 보지 않는다", () => {
        expect(rankReview("임연수", 400)).toBeNull();
        expect(rankReview("벵에돔", null)).toBeNull();
    });
});

describe("랭킹에서 빼기 — 위반 처리가 아니다", () => {
    const fishing = read("server/routes/modules/fishing.ts"), admin = read("server/routes/modules/adminFishing.ts");
    it("랭킹 · 어종 칩은 뺀 기록을 세지 않는다(일지 · 수족관은 그대로)", () => {
        expect(fishing).toMatch(/is_public and hidden_at is null and rank_void is null group by species/);
        expect(fishing).toMatch(/c\.is_public and c\.hidden_at is null and c\.rank_void is null and c\.species/);
        expect(fishing).not.toMatch(/where member_id = \$\{memberId\} and hidden_at is null and rank_void/);
    });
    it("빼기는 까닭을 받고, 올린 사람에게 낚시 알림함으로 다시 적으라는 안내", () => {
        const fn = admin.slice(admin.indexOf('router.post("/catches/:id/rank-void"'));
        expect(fn).toMatch(/if \(!reason\) return sendError\(res, 400/);
        expect(fn).toMatch(/category: "FISHING", type: "MODERATION", params: \{ url: "\/fishing\/log" \}/);
    });
    it("마이그레이션은 칸 하나를 더하기만 한다", () => {
        const body = read("migrations/fishing_catches_v7.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toEqual(["alter table fishing_catches add column if not exists rank_void jsonb;"]);
    });
});
