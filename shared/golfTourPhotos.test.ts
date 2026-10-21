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
        const c = readFileSync(resolve(__dirname, "../client/src/components/TourPhotos.tsx"), "utf8");
        expect(c).not.toContain("object-cover");
        expect(c).toContain("사진 한국관광공사");
        expect(readFileSync(resolve(__dirname, "../server/routes/modules/golfCourses.ts"), "utf8")).toContain("tourPhotos: GOLF_TOUR_PHOTOS[p.slug]?.photos ?? [],");
    });
});

import { MOUNTAIN_TOUR_PHOTOS } from "../server/data/mountainTourPhotos";
describe("산 사진(한국관광공사, 2026-10-21)", () => {
    it("같은 규칙(제1 · 3유형 · https · 넷까지) · 상세 응답 · 표지 밑에 같은 사진 줄", () => {
        const all = Object.values(MOUNTAIN_TOUR_PHOTOS);
        expect(all.length).toBeGreaterThan(150);
        for (const x of all) for (const p of x.photos) { expect(["Type1", "Type3"]).toContain(p.lic); expect(p.url.startsWith("https://")).toBe(true); }
        expect(all.every((x) => x.photos.length >= 1 && x.photos.length <= 4)).toBe(true);
        expect(readFileSync(resolve(__dirname, "../server/routes/modules/hiking.ts"), "utf8")).toContain("tourPhotos: MOUNTAIN_TOUR_PHOTOS[d.slug]?.photos ?? []");
        expect(readFileSync(resolve(__dirname, "../client/src/hiking/pages/MountainPage.tsx"), "utf8")).toContain("<TourPhotos key={`tour:${d.slug}`} photos={d.tourPhotos}");
    });
});

import { FISHING_TOUR_PHOTOS } from "../server/data/fishingTourPhotos";
describe("낚시터 사진(한국관광공사, 2026-10-21)", () => {
    it("같은 규칙 · 열쇠는 '시도|시군구|이름' · 상세 응답 · 표지 밑 사진 줄", () => {
        const all = Object.entries(FISHING_TOUR_PHOTOS);
        expect(all.length).toBeGreaterThan(80);
        for (const [k, x] of all) { expect(k.split("|").length).toBe(3); for (const p of x.photos) { expect(["Type1", "Type3"]).toContain(p.lic); expect(p.url.startsWith("https://")).toBe(true); } }
        expect(readFileSync(resolve(__dirname, "../server/routes/modules/fishing.ts"), "utf8")).toContain("FISHING_TOUR_PHOTOS[`${place.sido ?? \"\"}|${place.sigungu ?? \"\"}|${place.name}`]?.photos ?? []");
        expect(readFileSync(resolve(__dirname, "../client/src/fishing/spots/SpotsPages.tsx"), "utf8")).toContain("<TourPhotos key={`tour:${p.id}`} photos={data?.tourPhotos}");
    });
});

describe("검색용 화면에도 같은 사진(2026-10-21)", () => {
    it("골프장 · 산 · 낚시터 — figure + 출처, 구조화 데이터 image", () => {
        const pre = readFileSync(resolve(__dirname, "../server/prerender.ts"), "utf8");
        expect(pre).toContain("const tour = GOLF_TOUR_PHOTOS[slug]?.photos ?? [];");
        expect(pre).toContain("image: tour.length ? [golfCourseCardUrl(ORIGIN, slug), ...tour.slice(0, 3).map((t) => t.url)] : golfCourseCardUrl(ORIGIN, slug),");
        expect(readFileSync(resolve(__dirname, "../server/seo/hiking.ts"), "utf8")).toContain("tourFigures(d.name, MOUNTAIN_TOUR_PHOTOS[d.slug]?.photos ?? [])");
        expect(readFileSync(resolve(__dirname, "../server/seo/fishing.ts"), "utf8")).toContain("tourFigures(pl.name, tourOf(pl))");
    });
});

describe("등산 홈 '오늘의 명산'(2026-10-21)", () => {
    it("100대 명산(+플러스) 중 사진 있는 산에서 날마다 여덟 · 화면은 셋 미만이면 칸 없음 · 자르지 않음", () => {
        const h = readFileSync(resolve(__dirname, "../server/routes/modules/hiking.ts"), "utf8");
        expect(h).toContain('router.get("/featured-photos"');
        expect(h).toContain('m.lists.some((l) => l === "kfs100" || l === "kfs100plus") && MOUNTAIN_TOUR_PHOTOS[m.slug]?.photos.length');
        const c = readFileSync(resolve(__dirname, "../client/src/hiking/components/FeaturedPhotos.tsx"), "utf8");
        expect(c).toContain("if (items.length < 3) return null;");
        expect(c).not.toContain("object-cover");
        expect(readFileSync(resolve(__dirname, "../client/src/hiking/pages/HikingHome.tsx"), "utf8")).toContain("<FeaturedPhotos />");
    });
});
