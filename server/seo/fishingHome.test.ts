/**
 * 낚시 첫 화면(/fishing)을 검색이 읽게(2026-10-26 오너 "낚시 사이트맵 잘 되어 있는지 — 검색이 안 되는 것 같은데").
 * 봇 라우트가 /fishing/… 만 잡아서 첫 화면은 기본 당구 셸(제목 '당구 점수판 랭큐', canonical 은 홈)을 받았고 사이트맵에도 없었다.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 검색용 화면의 틀(page · esc · hubNav)과 사이트맵 한 줄(entry)은 가짜로 — 서로 import 하는 모양이라 진짜를 부르면 순서가 엉킨다(fishingSea.test 와 같다)
vi.mock("../prerender.js", () => ({
    esc: (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    page: (o: { title: string; canonical: string; body: string }) => `<title>${o.title}</title>\n<link rel="canonical" href="${o.canonical}" />\n${o.body}`,
    hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, o: { changefreq?: string } = {}) => `<url><loc>${loc}</loc><changefreq>${o.changefreq ?? ""}</changefreq></url>` }));
const { FISHING_SPOTS_RE, fishingSitemapParts, renderFishingSpots } = await import("./fishing");
const { fishingHomeSeo } = await import("../../shared/fishingPlaces");

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const place = { id: "202542110001000001", name: "단봉낚시터", kind: "저수지", sido: "강원특별자치도", sigungu: "동해시", lat: 37.47, lng: 129.12, species: ["붕어"], fee: null } as never;

describe("낚시 첫 화면 — 검색용 화면 · 봇 라우트 · 사이트맵", () => {
    it("주소 — /fishing 을 잡고 비슷한 다른 주소는 안 잡는다", () => {
        for (const p of ["/fishing", "/fishing/", "/fishing/spots", "/fishing/spot/1234567"]) expect(FISHING_SPOTS_RE.test(p), p).toBe(true);
        for (const p of ["/fishings", "/fishing/x", "/fishing/spots/a/b/c"]) expect(FISHING_SPOTS_RE.test(p), p).toBe(false);
        // vercel 봇 라우트도 첫 화면을 같이(없으면 봇이 당구 셸을 받는다)
        expect(read("vercel.json")).toContain("|fishing(?:/(?:spots(?:/(?:region|type)/[^/]+)?|spot/[^/]+|sea(?:/[^/]+)?|port/[^/]+|fish(?:/[^/]+)?|closed))?)/?\"");
    });
    it("검색용 화면 — 낚시 제목 · 자기 주소 canonical · 낚시터 · 물때 · 어종으로 가는 길", async () => {
        const r = await renderFishingSpots("/fishing", [place]);
        expect(r?.tag).toBe("fishing:home");
        const seo = fishingHomeSeo(1, 51);
        expect(r!.html).toContain(`<title>${seo.title}</title>`);
        expect(r!.html).toContain('<link rel="canonical" href="https://www.rankue.co.kr/fishing" />');
        for (const href of ["/fishing/spots", "/fishing/sea", "/fishing/fish", "/fishing/closed", "/fishing/port/"]) expect(r!.html).toContain(`href="${href}`);
        expect(r!.html).not.toContain("당구 점수판");
        // 표가 비면 화면에 맡긴다(자료 탓일 수 있다)
        expect(await renderFishingSpots("/fishing", [])).toBeNull();
    });
    it("제목은 사실만 — '추천 · 초보' 같은 말 없이, 화면과 같은 함수", () => {
        const seo = fishingHomeSeo(861, 51);
        expect(seo.title).toBe("랭큐 낚시 — 오늘 바다 · 물때 · 전국 낚시터 861곳 · 조과 기록");
        expect(seo.title).not.toMatch(/추천|초보|최고/);
        const home = read("client/src/fishing/spots/GuestHome.tsx");
        expect(home).toContain("const homeSeo = fishingHomeSeo(FISHING_PLACE_COUNT, FISHING_PORTS.length);");
        expect(home).toContain("path: FISHING_HOME_PATH");
    });
    it("사이트맵 맨 앞에 첫 화면(매일 바뀐다)", () => {
        const parts = fishingSitemapParts([place], "2026-10-26");
        expect(parts[0]).toContain("<loc>https://www.rankue.co.kr/fishing</loc>");
        expect(parts[0]).toContain("<changefreq>daily</changefreq>");
    });
});
