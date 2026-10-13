import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSearchResultKey } from "./searchResultKeys";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("기기에 남기면 안 되는 답 — 네이버 검색 결과", () => {
    it("골프장 근처 · 투어 소식은 남기지 않고, 다른 답은 그대로 남긴다", () => {
        expect(isSearchResultKey(["/api/hiq/golf-courses", "nearby", "lakeside", "food"])).toBe(true);
        expect(isSearchResultKey(["/api/hiq/golf-courses", "nearby", "lakeside", "dish:막국수"])).toBe(true);
        expect(isSearchResultKey(["/api/hiq/tour-news", "pba"])).toBe(true);
        expect(isSearchResultKey(["/api/hiq/tour-news/pba"])).toBe(true);
        expect(isSearchResultKey(["/api/hiq/hiking/mountains/설악산/nearby?kind=food"])).toBe(true);
        expect(isSearchResultKey(["/api/hiq/golf-courses/lakeside/nearby"])).toBe(true);
        // 골프장 목록 · 상세 · 날씨, 산의 상세는 네이버 결과가 아니다
        expect(isSearchResultKey(["/api/hiq/golf-courses"])).toBe(false);
        expect(isSearchResultKey(["/api/hiq/golf-courses", "detail", "lakeside"])).toBe(false);
        expect(isSearchResultKey(["/api/hiq/golf-courses", "weather", "lakeside"])).toBe(false);
        expect(isSearchResultKey(["/api/hiq/hiking/mountains/설악산"])).toBe(false);
        expect(isSearchResultKey(["/api/hiq/me"])).toBe(false);
        expect(isSearchResultKey([])).toBe(false);
    });
    it("고정: 저장 거르개가 이 규칙을 쓰고, 화면의 열쇠가 규칙과 같은 꼴이다", () => {
        const qc = read("client/src/lib/queryClient.ts");
        expect(qc).toContain("if (isSearchResultKey(query.queryKey)) return false;");
        // 이미 기기에 남아 있던 네이버 결과를 버리려고 저장 판을 올렸다
        expect(qc).toContain('buster: "RANKUE_CACHE_v2.8",');
        expect(read("client/src/golf/lib/courseApi.ts")).toMatch(/queryKey: \[COURSES_KEY, "nearby", slug,/);
        expect(read("client/src/components/hiq/TourNews.tsx")).toContain('const KEY = "/api/hiq/tour-news";');
        // 등산의 근처 맛집은 저장되는 길(useQuery)을 아예 거치지 않는다
        expect(read("client/src/hiking/components/MountainNearbyPlaces.tsx")).not.toMatch(/useQuery\(/);
    });
});
