import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABROAD_REGIONS, HIKING_ABROAD, HIKING_ABROAD_SEO, hikingAbroad, hikingAbroadPath, hikingAbroadSeo } from "./hikingAbroad";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const ALL_TEXT = JSON.stringify(HIKING_ABROAD);

describe("해외 명산 투어판 — 자료", () => {
    it("코스마다 주소가 하나 — 로마자 id, 겹치지 않는다", () => {
        expect(HIKING_ABROAD.length).toBeGreaterThanOrEqual(8);
        expect(new Set(HIKING_ABROAD.map((c) => c.id)).size).toBe(HIKING_ABROAD.length);
        for (const c of HIKING_ABROAD) {
            expect(c.id).toMatch(/^[a-z0-9]+$/);
            expect(hikingAbroadPath(c.id)).toBe(`/hiking/abroad/${c.id}`);
            expect(hikingAbroad(c.id)).toBe(c);
        }
        expect(hikingAbroad("없는코스")).toBeUndefined();
    });
    it("권역은 정해진 것만, 빈 권역은 없다", () => {
        for (const c of HIKING_ABROAD) expect(ABROAD_REGIONS.some((r) => r.id === c.region), c.id).toBe(true);
        for (const r of ABROAD_REGIONS) expect(HIKING_ABROAD.some((c) => c.region === r.id), r.name).toBe(true);
    });
    it("좌표와 높이가 말이 된다", () => {
        for (const c of HIKING_ABROAD) {
            expect(Math.abs(c.lat), c.id).toBeLessThanOrEqual(90);
            expect(Math.abs(c.lng), c.id).toBeLessThanOrEqual(180);
            expect(c.top.m, c.id).toBeGreaterThan(0);
            expect(c.peakM, c.id).toBeGreaterThanOrEqual(c.top.m);
        }
    });
    it("칸이 다 차 있고, 출처는 https · 위키 말고 하나 이상", () => {
        for (const c of HIKING_ABROAD) {
            expect(c.season.length, c.id).toBeGreaterThan(0);
            expect(c.permits.length, c.id).toBeGreaterThan(0);
            expect(c.access.length, c.id).toBeGreaterThan(0);
            expect(c.highlights.length, c.id).toBeGreaterThanOrEqual(2);
            expect(c.highlights.length, c.id).toBeLessThanOrEqual(4);
            expect(c.cautions.length, c.id).toBeGreaterThan(0);
            for (const s of c.sources) expect(s.url, c.id).toMatch(/^https:\/\//);
            expect(c.sources.some((s) => !s.url.includes("wikipedia.org")), c.id).toBe(true);
        }
    });
    it("싣지 않는 것 — 상품 가격(원) · 빨리/밤새 오르기를 부추기는 말", () => {
        expect(ALL_TEXT).not.toMatch(/\d[\d,]*\s*원(?![가-힣])|만원/);
        expect(ALL_TEXT).not.toMatch(/야간 산행|최단 시간|기록 단축|빨리 오르/);
    });
    it("검색 제목과 설명", () => {
        expect(HIKING_ABROAD_SEO.desc).toContain(String(HIKING_ABROAD.length));
        for (const c of HIKING_ABROAD) expect(hikingAbroadSeo(c).desc.length, c.id).toBeLessThanOrEqual(150);
    });
});

describe("해외 명산 투어판 — 새 공개 주소", () => {
    it("검색용 화면 · 사이트맵 · 화면 라우트 · 봇 경로", () => {
        const seo = read("server/seo/hiking.ts");
        expect(seo).toContain("if (p === HIKING_ABROAD_PATH) return abroad();");
        expect(seo).toContain("...HIKING_ABROAD.map((c) => page(hikingAbroadPath(c.id)");
        const app = read("client/src/App.tsx");
        for (const p of ["/hiking/abroad", "/hiking/abroad/:id"]) expect(app, p).toContain(`<Route path="${p}"`);
        expect(read("vercel.json")).toContain("|/abroad(?:/[^/]+)?)?)/?");
        const src = /export const HIKING_RE = \/(.+)\/;/.exec(seo)?.[1] ?? "";
        const re = new RegExp(src);
        for (const p of ["/hiking/abroad", "/hiking/abroad/", "/hiking/abroad/fuji"]) expect(re.test(p), p).toBe(true);
        expect(re.test("/hiking/abroad/fuji/x")).toBe(false);
    });
    it("검색용 화면 — 목록 · 코스 · '확인 필요' 표시 · 구조화 자료", () => {
        const seo = read("server/seo/hiking.ts");
        expect(seo).toContain('if (am) { const c = hikingAbroad(decodeURIComponent(am[1])); return c ? abroadCourse(c) : null; }');
        expect(seo).toContain('f.check ? " (확인 필요)" : ""');
        expect(seo).toContain('"@type": "TouristAttraction"');
    });
});
