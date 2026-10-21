import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    TRAIL_ROUTES, TRAIL_TOTAL_COURSES, TRAIL_TOTAL_KM, parseTrailCourseName, fillTrailEndNames, summaryEnds, trailCardInput, trailCoursePath, trailCourseSeo, trailTimeShort, trailTimeText, travelerPoint, type TrailCourseDetail,
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

describe("코리아둘레길 — 시작 · 끝 이름(두루누비 요약의 말 · 이어진 코스)", () => {
    it("요약에서 — '에서 출발해 … 에 이르는' · '을 출발해 … 까지' · '부터 … 까지' · '로 향하는' · 시작이 없으면 끝만", () => {
        expect(summaryEnds("- 해파랑길 세 번째 코스로 기장읍 대변리와 임랑리를 잇는 길\n- 대변항에서 출발해 봉대산 봉수대와 기장군청, 일광해변을 지나 임랑 해변에 이르는 구간")).toEqual({ start: "대변항", end: "임랑 해변" });
        expect(summaryEnds("- 진하해변을 출발해 덕하역까지 구간")).toEqual({ start: "진하해변", end: "덕하역" });
        expect(summaryEnds("- 인제 피스빌리지부터 진부령 미술관까지 이어지는 길이다.")).toEqual({ start: "인제 피스빌리지", end: "진부령 미술관" });
        expect(summaryEnds("- 금강산 건봉사를 출발해 통일안보공원으로 향하는 코스다.")).toEqual({ start: "금강산 건봉사", end: "통일안보공원" });
        expect(summaryEnds("- 풍산교에서 출발해 평화의댐이 있는 국제평화아트파크까지 걷는 길이다.")).toEqual({ start: "풍산교", end: "국제평화아트파크" });
        expect(summaryEnds("- 미포, 청사포, 구덕포를 거쳐 송정해변을 지나 대변항에 이르는 코스")).toEqual({ start: null, end: "대변항" });
        // 동네 이름 한 마디는 지점이 아니다 · 못 읽으면 지어내지 않는다
        expect(summaryEnds("- 보성군에서 고흥군까지 이어지는 코스").start).toBeNull();
        expect(summaryEnds("- 숲길과 해변을 두루 걷는 길")).toEqual({ start: null, end: null });
    });
    it("자료 170코스 모두 이름이 있다 — '시점 :' 줄이 있던 코스는 그대로, 앞 코스의 끝은 좌표가 가까울 때만", () => {
        const filled = fillTrailEndNames(asset.courses);
        expect(filled.every((c) => c.startName && c.endName)).toBe(true);
        asset.courses.forEach((c, i) => { if (c.startName) expect(filled[i].startName).toBe(c.startName); });
        const at = (r: string, k: string) => filled.find((c) => c.route === r && c.key === k)!;
        expect([at("haeparang", "1").startName, at("haeparang", "1").endName]).toEqual(["오륙도 해맞이공원", "해운대"]);
        expect(at("haeparang", "2").startName).toBe("해운대");
        expect(at("dmz", "34").endName).toBe("통일전망대");
        expect(filled.some((c) => /^(?:해|하여) /.test(`${c.startName} ${c.endName}`) || / (?:해|하여) /.test(` ${c.endName}`))).toBe(false);
        expect(read("server/storage/koreaTrails.ts")).toContain("courses: fillTrailEndNames(raw.courses)");
    });
});
