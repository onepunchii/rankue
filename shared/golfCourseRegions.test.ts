import { describe, it, expect } from "vitest";
import { COURSES } from "../client/src/golf/data/golfCourses.js";
import { resolveGolfRegionCode } from "./golfRegions.js";
import { golfRegionCodeByCourseId, GOLF_COURSE_REGION_COUNT } from "./golfCourseRegions.js";

/**
 * 접어 둔 표가 원장·규칙과 어긋나지 않는지 본다.
 * 어긋나면 `npx tsx scripts/gen-golf-course-regions.ts` 로 다시 만들면 된다.
 */
describe("golfCourseRegions (자동 생성 표)", () => {
    it("원장의 모든 골프장이 표에 있고, 규칙을 다시 돌린 값과 같다", () => {
        const mismatched: string[] = [];
        for (const c of COURSES as any[]) {
            const expected = resolveGolfRegionCode(c.region, c.address);
            const got = golfRegionCodeByCourseId(c.id);
            if (expected !== got) mismatched.push(`${c.id} ${c.name}: 표=${got} 규칙=${expected}`);
        }
        expect(mismatched).toEqual([]);
    });

    it("골프장 수가 원장과 같다", () => {
        expect(GOLF_COURSE_REGION_COUNT).toBe((COURSES as any[]).length);
    });

    it("경기 골프장이 남/북/동/서로 실제로 갈린다 — 한 덩어리로 뭉치면 필터가 죽는다", () => {
        const buckets = new Map<string, number>();
        for (const c of COURSES as any[]) {
            if (!String(c.region ?? "").includes("경기")) continue;
            const code = golfRegionCodeByCourseId(c.id) ?? "(없음)";
            buckets.set(code, (buckets.get(code) ?? 0) + 1);
        }
        // 넷 다 실제 골프장을 갖고 있어야 한다
        for (const id of ["kyunggi_south", "kyunggi_north", "kyunggi_east", "incheon_west"]) {
            expect(buckets.get(id) ?? 0).toBeGreaterThan(0);
        }
        // 시·군을 못 가른 '경기' 덩어리가 대다수면 안 된다
        const any = buckets.get("kyunggi") ?? 0;
        const total = [...buckets.values()].reduce((a, b) => a + b, 0);
        expect(any / total).toBeLessThan(0.05);
    });

    it("모르는 course_id 는 null", () => {
        expect(golfRegionCodeByCourseId(999999)).toBeNull();
        expect(golfRegionCodeByCourseId("abc")).toBeNull();
        expect(golfRegionCodeByCourseId(null)).toBeNull();
    });
});
