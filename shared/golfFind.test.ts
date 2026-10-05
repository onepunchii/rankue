import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
    FIND_FEATURES, FIND_NOTE, findDescription, findFaq, findFeature, findHeading, findPath, findRegionCounts, findTitle, hasFindTag, isFindKey, isFindRegion,
} from "./golfFind";
import { GOLF_REGIONS } from "./golfCourse";

// 조건으로 찾는 골프장 목록(2인 플레이·노캐디·3인 플레이). 글은 화면과 검색엔진용 화면이 같이 쓴다.
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");

describe("조건", () => {
    it("셋 — 찾는 사람이 많은 순(2인 → 노캐디 → 3인), 태그는 자료의 낱말 그대로", () => {
        expect(FIND_FEATURES.map((f) => [f.key, f.tag])).toEqual([["2people", "2인가능"], ["nocaddie", "노캐디"], ["3people", "3인가능"]]);
        // 허브의 특징 칩·골프장 줄이 쓰는 낱말과 같아야 걸러진다
        const hub = read("client/src/golf/pages/GolfCourseHub.tsx");
        for (const f of FIND_FEATURES) expect(hub).toContain(`["${f.tag}"`);
    });
    it("주소에 실리는 값만 받는다", () => {
        for (const f of FIND_FEATURES) expect(isFindKey(f.key)).toBe(true);
        for (const v of ["2인가능", "노캐디", "", null, undefined, 2, "NOCADDIE", "nocaddie ", "__proto__", "constructor"]) expect(isFindKey(v)).toBe(false);
        for (const r of GOLF_REGIONS) expect(isFindRegion(r)).toBe(true);
        for (const v of ["서울", "용인", "", null, undefined]) expect(isFindRegion(v)).toBe(false);
    });
    it("태그가 있는 곳만 — 자료가 없는 곳(null·빈 배열)은 걸리지 않는다", () => {
        const f = findFeature("nocaddie");
        expect(hasFindTag({ play: ["3인가능", "노캐디"] }, f)).toBe(true);
        for (const c of [{ play: [] }, { play: null }, {}, { play: ["2인가능"] }]) expect(hasFindTag(c, f)).toBe(false);
    });
});

describe("주소·제목·설명", () => {
    it("주소 — 전국과 지역(한글은 인코딩)", () => {
        expect(findPath("2people")).toBe("/golf/find/2people");
        expect(findPath("nocaddie", "경기")).toBe(`/golf/find/nocaddie/${encodeURIComponent("경기")}`);
        expect(findPath("3people", null)).toBe("/golf/find/3people");
    });
    it("제목 — 찾는 말이 그대로 들어 있다", () => {
        expect(findTitle({ key: "2people", count: 57 })).toBe("전국 2인 플레이 가능 골프장 57곳 — 지역별 목록 | 랭큐 골프");
        expect(findTitle({ key: "nocaddie", region: "경기", count: 21 })).toBe("경기·수도권 노캐디 골프장 21곳 | 랭큐 골프");
        expect(findHeading("3people", "제주")).toBe("제주 3인 플레이 가능 골프장");
        for (const f of FIND_FEATURES) expect(findTitle({ key: f.key, count: 100 }).length).toBeLessThanOrEqual(45);
    });
    it("설명 — 같은 뜻의 말(2인 라운딩·셀프 라운드)을 곁들이고 160자 안", () => {
        expect(findDescription({ key: "2people", count: 57 })).toContain("2인 플레이(2인 라운딩)가 되는 골프장 57곳");
        expect(findDescription({ key: "nocaddie", region: "강원", count: 9 })).toContain("강원에서 노캐디(셀프 라운드)가 되는 골프장 9곳");
        for (const f of FIND_FEATURES) for (const r of [null, ...GOLF_REGIONS]) expect(findDescription({ key: f.key, region: r, count: 118 }).length).toBeLessThanOrEqual(160);
    });
});

describe("글", () => {
    it("되는 날·요금을 단정하지 않는다 — 조건마다 '확인'을 말하고, 금액은 없다", () => {
        for (const f of FIND_FEATURES) {
            expect(f.points.join(" ")).toMatch(/골프장마다 달라요/);
            expect(f.points.join(" ")).toMatch(/확인해요/);
            expect([f.lead, ...f.points, f.join ?? ""].join(" ")).not.toMatch(/\d[\d,]*\s*(원|만원|만 원)/);
        }
        expect(FIND_NOTE).toContain("확인한 곳만");
    });
    it("2인·3인은 조인으로 잇고, 노캐디는 잇지 않는다", () => {
        expect(findFeature("2people").join).toBeTruthy();
        expect(findFeature("3people").join).toBeTruthy();
        expect(findFeature("nocaddie").join).toBeUndefined();
    });
    it("자주 묻는 것 — 숫자는 받은 개수 그대로, 0곳인 지역은 적지 않는다", () => {
        const byRegion = [{ region: "경기", count: 12 }, { region: "강원", count: 0 }, { region: "제주", count: 3 }];
        const faq = findFaq({ key: "2people", count: 15, byRegion });
        expect(faq).toHaveLength(2);
        expect(faq[0].q).toBe("2인 플레이가 되는 골프장은 어디인가요?");
        expect(faq[0].a).toContain("전국 15곳이에요(경기·수도권 12곳, 제주 3곳)");
        expect(faq[0].a).not.toContain("강원");
        expect(faq[1].a).toContain("수수료는 없어요");
        expect(findFaq({ key: "nocaddie", count: 77, byRegion: [] })[0]).toMatchObject({ q: "노캐디로 칠 수 있는 골프장은 어디인가요?" });
        expect(findFaq({ key: "nocaddie", count: 77, byRegion: [] })[0].a).toContain("전국 77곳이에요.");
        expect(findFaq({ key: "3people", count: 5, byRegion: [] })[1].q).toContain("세 명");
    });
    it("지역별 개수 — 지역 순서대로, 0곳도 싣는다", () => {
        const got = findRegionCounts([{ region: "경기" }, { region: "제주" }, { region: "경기" }]);
        expect(got.map((r) => r.region)).toEqual([...GOLF_REGIONS]);
        expect(got.find((r) => r.region === "경기")!.count).toBe(2);
        expect(got.find((r) => r.region === "강원")!.count).toBe(0);
    });
});

describe("봇이 여기까지 오는 길 — 넷이 같은 경로를 안다", () => {
    it("vercel.json 봇 라우트 · 프리렌더 정규식 · 화면 라우트 · 사이트맵", () => {
        const vercel = JSON.parse(read("vercel.json")).routes.find((x: any) => String(x.src).includes("billiards/terms"));
        const re = new RegExp(`^${vercel.src}$`);
        for (const p of ["/golf/find/2people", "/golf/find/nocaddie/", `/golf/find/3people/${encodeURIComponent("경기")}`]) expect(re.test(p), p).toBe(true);
        expect(re.test("/golf/find")).toBe(false);
        expect(re.test("/golf/find/a/b/c")).toBe(false);
        const pre = read("server/prerender.ts");
        expect(pre).toContain("(?:course|courses|booking|join|urgent|find)");
        expect(pre).toContain('if (kind === "find") return renderGolfFind(s, rest, now);');
        const app = read("client/src/App.tsx");
        expect(app).toContain('<Route path="/golf/find/:key" component={GolfFindRoute} />');
        expect(app).toContain('<Route path="/golf/find/:key/:region" component={GolfFindRoute} />');
        expect(read("server/sitemap.ts")).toContain("findPath(f.key, r.region)");
    });
});
