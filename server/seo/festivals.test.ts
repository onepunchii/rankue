import { describe, expect, it, vi } from "vitest";

vi.mock("../prerender.js", () => ({
    page: (p: { title: string; body: string; canonical: string; image?: { url: string } }) => `<title>${p.title}</title><link rel="canonical" href="${p.canonical}"><meta property="og:image" content="${p.image?.url ?? ""}">${p.body}`,
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { FESTIVALS_RE, festivalSitemapParts, renderFestivals } from "./festivals";
import type { FestivalRow } from "../../shared/festivals";

const row = (o: Partial<FestivalRow>): FestivalRow => ({ id: "1", title: "축제", start: "20261024", end: "20261025", addr: null, region: "강원", lat: 37.7, lng: 128.9, cat: null, image: null, lic: null, mod: null, ...o });
const all = [row({ id: "825295", title: "평창효석문화제", image: "https://tong.visitkorea.or.kr/a.jpg" }), row({ id: "2", title: "강릉커피축제" })];
const none = async () => null;

/** 전국 축제 검색용 화면 · 사이트맵의 그림(2026-10-21 오너: "축제 및 둘레길 사이트맵에 이미지 … 잘 적용한 사이트맵으로") */
describe("전국 축제 — 검색용 화면", () => {
    it("종목마다의 축제 주소도 같은 글 · 정본은 /festivals 하나", async () => {
        for (const p of ["/festivals", "/festivals/825295", "/golf/festivals", "/hiking/festivals/825295", "/fishing/festivals/"]) expect(FESTIVALS_RE.test(p), p).toBe(true);
        for (const p of ["/billiards/festivals", "/golf/festivalsx", "/festivals/abc"]) expect(FESTIVALS_RE.test(p), p).toBe(false);
        const golf = (await renderFestivals("/golf/festivals", all, "20261021", none))!;
        expect(golf.tag).toBe("festivals:hub");
        expect(golf.html).toContain('<link rel="canonical" href="https://www.rankue.co.kr/festivals">');
        expect(golf.html).toMatch(/og:image" content="https:\/\/www\.rankue\.co\.kr\/og-hub\/festivals\.jpg\?v=\d+"/);
        expect(golf.html).toMatch(/<\/h1>\n {2}<img src="https:\/\/www\.rankue\.co\.kr\/og-hub\/festivals\.jpg\?v=\d+" width="1200" height="1200"/);
        expect(await renderFestivals("/fishing/festivals/9", all, "20261021", none)).toBeNull();
    });
    it("사이트맵 — 허브는 허브 카드, 축제는 우리 카드 + 관광공사 사진(있을 때)", () => {
        const parts = festivalSitemapParts(all, "20261021").map((x) => JSON.parse(x) as { loc: string; image?: string; images?: string[] });
        expect(parts[0]).toMatchObject({ loc: "https://www.rankue.co.kr/festivals", image: expect.stringMatching(/\/og-hub\/festivals\.jpg\?v=\d+$/) });
        expect(parts.every((p) => !!p.image)).toBe(true);
        const one = parts.find((p) => p.loc.endsWith("/festivals/825295"))!;
        expect(one.image).toMatch(/\/og\/festival\/825295\.png\?v=\d+$/);
        expect(one.images).toEqual(["https://tong.visitkorea.or.kr/a.jpg"]);
        expect(parts.find((p) => p.loc.endsWith("/festivals/2"))!.images).toBeUndefined();
    });
});
