import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cityLabel, cityShort } from "./golfCourse";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** 화면용 짧은 지역 이름(2026-10-21 — 88CC 의 가까운 골프장 '강남300 · 광주 9.1km'가 광주광역시로 읽혔다) */
describe("골프 — 지역 이름 줄이기", () => {
    it("경기 '광주시'는 '경기 광주' · 나머지는 '시 · 군'만 뗀다", () => {
        expect(cityLabel("광주시")).toBe("경기 광주");
        expect(cityLabel("용인시")).toBe("용인");
        expect(cityLabel("가평군")).toBe("가평");
        expect(cityLabel(null)).toBe("");
    });
    it("주소 · 거르기는 cityShort 그대로 — 허브 주소 /golf/courses/경기/광주 가 깨지지 않게", () => {
        expect(cityShort("광주시")).toBe("광주");
        expect(read("client/src/golf/pages/GolfCourseHub.tsx")).toContain("cityShort(c.city) === city");
        // 여러 지역이 섞인 목록만 화면용 이름을 쓴다
        for (const p of ["client/src/golf/components/course/detail/NearbyCourses.tsx", "client/src/golf/components/course/list/CourseRow.tsx", "client/src/golf/components/course/list/WatchedCourses.tsx", "client/src/golf/components/course/list/HubListingRow.tsx"]) {
            expect(read(p), p).toContain("cityLabel(");
        }
    });
});
