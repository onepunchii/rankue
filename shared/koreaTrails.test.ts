import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    TRAIL_ROUTES, TRAIL_TOTAL_COURSES, TRAIL_TOTAL_KM, parseTrailCourseName, trailCardInput, trailCoursePath, trailCourseSeo, trailTimeShort, trailTimeText, travelerPoint, type TrailCourseDetail,
} from "./koreaTrails";
import { HUB_CARD_NAMES, hubCardName, trailCardUrl } from "./ogCards";
import { sportForPath } from "./sportRoute";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const asset = JSON.parse(read("server/assets/trails/korea-trails.json")) as { routes: { id: string }[]; courses: TrailCourseDetail[] };

/** 국토종주 — 코리아둘레길(2026-10-21, 오너 결정: 걸어서 · 등산 안에). 두루누비 공개 자료(170코스)만 — 지어 채우지 않는다 */
describe("코리아둘레길 — 규칙", () => {
    it("길 넷의 전체 코스 · 거리는 두루누비 길 소개 그대로(284코스 · 4,530km)", () => {
        expect(TRAIL_ROUTES.map((r) => r.name)).toEqual(["해파랑길", "남파랑길", "서해랑길", "DMZ 평화의 길"]);
        expect(TRAIL_TOTAL_COURSES).toBe(284);
        expect(TRAIL_TOTAL_KM).toBe(4530);
    });
    it("코스 이름 — 번호 · 가지 번호 · 붙은 말(괄호 안의 숫자를 번호로 읽지 않는다)", () => {
        expect(parseTrailCourseName("남파랑길 1코스")).toEqual({ no: 1, sub: null, tags: [], key: "1" });
        expect(parseTrailCourseName("DMZ 평화의 길 3-1코스(우회로)")).toEqual({ no: 3, sub: 1, tags: ["우회로"], key: "3-1" });
        expect(parseTrailCourseName("DMZ 평화의 길 8코스 (예약노선)")).toMatchObject({ no: 8, tags: ["예약노선"] });
        expect(parseTrailCourseName("서해랑길 64-3(지선3코스)")).toEqual({ no: 64, sub: 3, tags: ["지선"], key: "64-3" });
        expect(parseTrailCourseName("코스 없음")).toBeNull();
    });
    it("시간 · 시점/종점 · 주소 · 제목", () => {
        expect(trailTimeText(390)).toBe("6시간 30분");
        expect(trailTimeShort(390)).toBe("6시간 반");
        expect(trailTimeShort(420)).toBe("7시간");
        expect(travelerPoint("- 시점 : 오륙도해맞이공원 (부산 남구 오륙도로 137)\n- 종점 : 부산역 (부산 동구)", "시점")).toBe("오륙도해맞이공원");
        expect(travelerPoint("- 종점 : 부산역 (부산 동구)", "종점")).toBe("부산역");
        expect(trailCoursePath("dmz", "3-1")).toBe("/hiking/trails/dmz/3-1");
        expect(sportForPath("/hiking/trails/dmz/3-1")).toBe("HIKING");
        const s = trailCourseSeo({ route: "haeparang", key: "1", name: "해파랑길 1코스", km: 17, minutes: 390, level: 2, startName: null, endName: null, sigun: "부산 남구" });
        expect(s.title).toBe("해파랑길 1코스 — 17km · 6시간 30분 · 보통 · 부산 남구 | 랭큐 등산");
        expect(s.desc).not.toContain("undefined");
    });
});

describe("코리아둘레길 — 받은 자료(server/assets/trails)", () => {
    it("두루누비 공개 170코스 · 길 넷 · 길마다 · 코스 주소가 겹치지 않는다", () => {
        expect(asset.courses.length).toBe(170);
        expect(asset.routes.map((r) => r.id).sort()).toEqual(["dmz", "haeparang", "namparang", "seohaerang"]);
        const keys = new Set(asset.courses.map((c) => `${c.route}/${c.key}`));
        expect(keys.size).toBe(asset.courses.length);
        for (const r of TRAIL_ROUTES) expect(asset.courses.filter((c) => c.route === r.id).length).toBeLessThanOrEqual(r.total);
    });
    it("코스마다 선 · 시작/끝 · 거리 — 선의 길이가 적힌 거리와 크게 다르지 않다(겹친 GPX 토막은 하나만)", () => {
        for (const c of asset.courses) {
            expect(c.line.length, c.name).toBeGreaterThan(10);
            expect(c.coarse.length, c.name).toBeGreaterThan(1);
            expect(c.start[0] > 33 && c.start[0] < 38.7 && c.start[1] > 124.5 && c.start[1] < 130).toBe(true);
            const lineKm = c.line[c.line.length - 1][3];
            expect(lineKm / c.km, c.name).toBeGreaterThan(0.6);
            expect(lineKm / c.km, c.name).toBeLessThan(1.45);
            expect([1, 2, 3, null]).toContain(c.level);
        }
    });
});

describe("코리아둘레길 — 이어 붙인 곳", () => {
    it("공개 API · 화면 · 검색용 화면 · 봇 경로 · 사이트맵 · 입구", () => {
        expect(read("server/routes/index.ts")).toContain('router.use("/trails", trailsRouter);');
        const app = read("client/src/App.tsx");
        for (const p of ["/hiking/trails", "/hiking/trails/:route", "/hiking/trails/:route/:key"]) expect(app).toContain(`<Route path="${p}"`);
        expect(read("server/prerender.ts")).toContain("app.get(TRAILS_RE,");
        expect(read("vercel.json")).toContain("|hiking/trails(?:/[^/]+){0,2}|");
        expect(read("server/sitemap.ts")).toContain("trailsSitemapParts(trailCourses(), trailsMade())");
        expect(read("server/sitemap.ts")).toContain('SITEMAP_SECTIONS = ["core", "festivals", "trails", ');
        expect(read("client/src/hiking/pages/HikingHub.tsx")).toContain("<TrailsEntry />");
        expect(read("client/src/pages/hiq/menu.tsx")).toContain('setLocation("/hiking/trails")');
        // 등산의 코스 지도를 그대로 — 글만 둘레길에 맞게
        expect(read("client/src/hiking/trails/TrailCoursePage.tsx")).toContain('words={{ wide: "앞 · 뒤 코스까지"');
    });
});

describe("코리아둘레길 — 카드(미리보기 1200 정사각)", () => {
    const one = asset.courses.find((c) => c.route === "haeparang" && c.key === "1")!;
    it("코스 카드의 글 — 길 이름 · 코스 · 거리 · 시간 · 난이도 · 지역 · 그 코스의 선", () => {
        expect(trailCardInput(one)).toMatchObject({ route: "해파랑길", name: "1코스", facts: "17km · 6시간 반 · 보통", place: "부산 남구" });
        expect(trailCardInput(one).line.length).toBeGreaterThan(10);
        expect(trailCardUrl("https://www.rankue.co.kr", "dmz", "3-1")).toMatch(/^https:\/\/www\.rankue\.co\.kr\/og\/trail\/dmz\/3-1\.png\?v=\d+$/);
    });
    it("허브 카드 — 둘레길 주소가 '전국 명산' 카드로 나가지 않는다 · 축제는 종목 주소 모두 축제 카드", () => {
        expect(hubCardName("/hiking/trails")).toBe("trails");
        expect(hubCardName("/hiking/trails/seohaerang")).toBe("trails-seohaerang");
        expect(hubCardName("/hiking/trails/seohaerang/12")).toBe("trails-seohaerang");
        expect(hubCardName("/hiking")).not.toMatch(/^trails/);
        for (const p of ["/festivals", "/golf/festivals", "/hiking/festivals/1", "/fishing/festivals"]) expect(hubCardName(p), p).toBe("festivals");
        for (const n of ["festivals", "trails", ...TRAIL_ROUTES.map((r) => `trails-${r.id}`)]) expect(HUB_CARD_NAMES, n).toContain(n);
    });
    it("서버 — 카드 길 · 검색용 화면 · 앱 화면이 같은 주소", () => {
        expect(read("server/ogImage.ts")).toContain('app.get("/og/trail/:route/:key.png"');
        expect(read("server/seo/trails.ts")).toContain("url: trailCardUrl(ORIGIN, c.route, c.key), width: 1200, height: 1200");
        expect(read("client/src/hiking/trails/TrailCoursePage.tsx")).toContain('image: trailCardUrl("https://www.rankue.co.kr", c.route, c.key)');
        // 두루누비 선만 — 시도 윤곽선(화면에서만 쓰는 자료)은 카드에 싣지 않는다
        expect(read("server/services/trailCard.ts")).not.toMatch(/sido|outline|provinces/i);
    });
});
