import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLF_TOUR_PHOTOS } from "../server/data/golfTourPhotos";

/** 골프장 사진(2026-10-21) — 한국관광공사 TourAPI · 공공누리 제1 · 3유형만 · https · 한 곳에 넷까지 · 자르지 않는다(3유형 변경 금지) */
describe("골프장 사진(한국관광공사)", () => {
    const all = Object.values(GOLF_TOUR_PHOTOS);
    it("자료: 유형 · 주소 · 개수", () => {
        expect(all.length).toBeGreaterThan(100);
        for (const x of all) {
            expect(x.photos.length).toBeGreaterThan(0);
            expect(x.photos.length).toBeLessThanOrEqual(4);
            for (const p of x.photos) {
                expect(["Type1", "Type3"]).toContain(p.lic);
                expect(p.url.startsWith("https://")).toBe(true);
            }
        }
    });
    it("화면: 자르지 않는다(object-cover 없음) · 출처 표시 · 상세 응답에 실린다", () => {
        const c = readFileSync(resolve(__dirname, "../client/src/golf/components/course/detail/TourPhotos.tsx"), "utf8");
        expect(c).not.toContain("object-cover");
        expect(c).toContain("사진 한국관광공사");
        expect(readFileSync(resolve(__dirname, "../server/routes/modules/golfCourses.ts"), "utf8")).toContain("tourPhotos: GOLF_TOUR_PHOTOS[p.slug]?.photos ?? [],");
    });
});
