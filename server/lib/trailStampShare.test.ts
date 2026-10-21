import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAIL_STAMP_SHARE_TTL_SEC, signTrailStampShare, trailStampCardPath, verifyTrailStampShare } from "./trailStampShare";
import { signStampShare } from "./stampShare";

/**
 * 코리아둘레길 코스 도장 카드(2026-10-21) — 서명된 주소로만 열리는 개인 카드. 그림은 내 기계에서 그려 눈으로 봤다(해파랑 1 · DMZ 3-1).
 * ① 주소의 서명 ② 카드가 열리는 조건(서명 먼저 · 받은 도장 · 탈퇴하면 닫힘) ③ 공유 주소는 본인의 받은 도장만.
 */
const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
const C1 = "T_CRS_MNG0000004239", C2 = "T_CRS_MNG0000004378";
const NOW = 1_800_000_000;
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("코스 도장 카드 — 주소의 서명", () => {
    const old = process.env.COOKIE_SECRET;
    beforeEach(() => { process.env.COOKIE_SECRET = "test-secret-for-trail-stamp-share"; });
    afterEach(() => { if (old === undefined) delete process.env.COOKIE_SECRET; else process.env.COOKIE_SECRET = old; });

    it("그 회원 · 그 코스 · 30일 안에서만 열린다", () => {
        const s = signTrailStampShare(A, C1, NOW)!;
        expect(s.exp).toBe(NOW + TRAIL_STAMP_SHARE_TTL_SEC);
        expect(verifyTrailStampShare(A, C1, s.token, NOW)).toBe(true);
        expect(verifyTrailStampShare(A, C1, s.token, NOW + TRAIL_STAMP_SHARE_TTL_SEC + 1)).toBe(false);
        expect(verifyTrailStampShare(B, C1, s.token, NOW)).toBe(false);
        expect(verifyTrailStampShare(A, C2, s.token, NOW)).toBe(false);
    });
    it("고친 값 · 모양이 틀린 값 · 골프 도장첩 카드의 서명은 거절한다(열쇠가 용도마다 다르다)", () => {
        const s = signTrailStampShare(A, C1, NOW)!;
        const [exp, sig] = s.token.split(".");
        expect(verifyTrailStampShare(A, C1, `${exp}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, NOW)).toBe(false);
        expect(verifyTrailStampShare(A, C1, `${(parseInt(exp, 36) + 86_400).toString(36)}.${sig}`, NOW)).toBe(false);
        for (const bad of [undefined, 1, "", "x", `${exp}`, `${exp}.short`]) expect(verifyTrailStampShare(A, C1, bad, NOW)).toBe(false);
        expect(signTrailStampShare("not-a-uuid", C1, NOW)).toBeNull();
        expect(signTrailStampShare(A, "../etc", NOW)).toBeNull();
        const golf = signStampShare(A, "gangwon", NOW)!;
        expect(verifyTrailStampShare(A, C1, golf.token, NOW)).toBe(false);
    });
    it("비밀이 없으면 공유를 막는다", () => {
        delete process.env.COOKIE_SECRET;
        expect(signTrailStampShare(A, C1, NOW)).toBeNull();
        expect(verifyTrailStampShare(A, C1, "a.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", NOW)).toBe(false);
    });
    it("카드 주소 꼴", () => {
        expect(trailStampCardPath(A, C1, "k.t")).toBe(`/og/trail-stamp/${A}/${C1}.png?t=k.t`);
    });
});

describe("코스 도장 카드 — 열리는 조건", () => {
    const og = read("server/ogImage.ts");
    const route = og.slice(og.indexOf('app.get("/og/trail-stamp/:memberId/:courseId.png"'), og.indexOf("// 축제 카드(2026-10-21)"));
    const build = og.slice(og.indexOf("export async function buildTrailStampCard("), og.indexOf("// ── 골프 발자국"));
    it("서명을 먼저 본다 — 틀리면 아무것도 읽지 않고 404 · 색인 · 리퍼러 막기", () => {
        const check = route.indexOf("if (!verifyTrailStampShare(memberId, courseId, req.query.t)) return notFound();");
        expect(check).toBeGreaterThan(0);
        expect(check).toBeLessThan(route.indexOf("buildTrailStampCard(memberId, courseId)"));
        expect(route).toContain('"X-Robots-Tag", "noindex, nofollow, noimageindex"');
        expect(route).toContain('"Cache-Control", "private, max-age=600"');
    });
    it("받은 도장만 · 탈퇴하면 닫힌다", () => {
        expect(build).toContain('if (!m || m.phone?.startsWith("del-")) return null;');
        expect(build).toContain("const st = stamps.find((x) => x.courseId === courseId);");
        expect(build).toContain("if (!st) return null;");
    });
    it("공유 주소는 본인의 받은 도장만 · 캐시하지 않는다", () => {
        const r = read("server/routes/modules/trails.ts");
        const share = r.slice(r.indexOf('router.get("/:route/:key/share"'), r.indexOf("/** 코스 한 곳"));
        expect(share).toContain("...requireHikingAccess");
        expect(share).toContain("if (!mine) return sendError(res, 404,");
        expect(share).toContain('res.set("Cache-Control", "no-store");');
    });
});
