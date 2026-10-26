/**
 * 구글 전용 사이트맵(2026-10-26 오너 "구글만 사이트맵 가능하면 그렇게 하자 — 네이버는 지금 잘 들어와").
 * 지키는 것: 네이버가 보는 /sitemap.xml · robots.txt 는 그대로, 구글 전용은 서치콘솔에만(robots 에 적지 않는다).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const sm = read("server/sitemap.ts");

describe("구글 전용 사이트맵", () => {
    it("네이버 쪽은 그대로 — robots.txt 에는 기존 인덱스 한 줄만, 기존 인덱스에 구글 전용이 섞이지 않는다", () => {
        const robots = read("client/public/robots.txt");
        expect(robots).toContain("Sitemap: https://www.rankue.co.kr/sitemap.xml");
        expect(robots).not.toContain("sitemap-google");
        const idx = sm.slice(sm.indexOf("export function generateSitemapIndex("), sm.indexOf("async function coreParts("));
        expect(idx).toContain("/sitemap-${s}.xml");
        expect(idx).not.toContain("google");
    });
    it("주소 — /sitemap-google.xml(인덱스) · /sitemap-google-<섹션>.xml, vercel 라우트가 하이픈 둘을 받는다", () => {
        const v = JSON.parse(read("vercel.json")) as { routes: { src: string }[] };
        const route = v.routes.find((r) => r.src.startsWith("/sitemap"))!;
        const re = new RegExp(`^${route.src}$`);
        for (const p of ["/sitemap.xml", "/sitemap-google.xml", "/sitemap-google-hiking.xml", "/sitemap-google-golf-courses.xml", "/sitemap-golf-hubs.xml"]) expect(re.test(p), p).toBe(true);
        expect(sm).toContain('if (req.params.section === "google") return send(res, generateGoogleSitemapIndex());');
        expect(sm).toContain("SITEMAP_SECTIONS.map((s) => `  <sitemap>\\n    <loc>${ORIGIN}/sitemap-google-${s}.xml</loc>");
    });
    it("거르는 기준 — 산은 1 · 2단계와 소개 글 있는 산, 축제는 안 끝난 것, 낚시터는 사진 있는 곳. 나머지 섹션은 그대로", () => {
        const g = sm.slice(sm.indexOf("const GOOGLE_FILTERED"), sm.indexOf("export function generateGoogleSitemapIndex("));
        expect(g).toContain("!(m.tier <= 2 || m.hasGuide)");
        expect(g).toContain("f.end < today");
        expect(g).toContain("!fishingSpotHasPhotos(p)");
        expect(Object.keys({ hiking: 1, festivals: 1, fishing: 1 }).every((k) => g.includes(`  ${k}: async () => {`))).toBe(true);
        expect(sm).toContain("return urlset(await (GOOGLE_FILTERED[section] ?? SECTION_PARTS[section])());");
    });
});
