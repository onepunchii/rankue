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
        expect(read("vercel.json")).toContain("|fishing(?:/(?:spots(?:/(?:region|type)/[^/]+)?|spot/[^/]+|sea(?:/[^/]+)?|port/[^/]+|tide(?:/[^/]+)?|fish(?:/[^/]+)?|closed))?)/?\"");
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
    // 2026-11-04: 시도 낚시터 화면(16곳)의 tag 에 한글이 실려 X-Prerender 가 죽고, 봇은 '당구 점수판 랭큐'를 받았다
    it("시도 · 종류 · 낚시터 화면의 tag 는 ASCII 뿐(X-Prerender 머리에 실린다)", async () => {
        for (const p of ["/fishing", "/fishing/spots", `/fishing/spots/region/${encodeURIComponent("강원")}`, "/fishing/spots/region/강원", "/fishing/spots/type/reservoir", `/fishing/spot/${(place as { id: string }).id}`]) {
            const r = await renderFishingSpots(p, [place]);
            expect(r, p).not.toBeNull();
            expect(r!.tag, p).toMatch(/^[\x20-\x7e]+$/);
        }
        const r = await renderFishingSpots("/fishing/spots/region/강원", [place]);
        expect(r!.html).toContain("강원");
        expect(r!.html).not.toContain("당구 점수판");
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

describe("낚시터 화면을 고유하게(2026-11-04) — 요약 · 오늘 물때 · 대상 어종 규칙 · 같은 종류", () => {
    const sea = { id: "202234500001000003", name: "미조방파제", kind: "바다", sido: "경상남도", sigungu: "남해군", lat: 34.71, lng: 128.04, species: ["감성돔", "볼락"], fee: null, tel: null, address: null, dataDate: null } as never;
    const sea2 = { ...(sea as object), id: "202234500001000004", name: "상주방파제", lat: 34.72, lng: 127.99 } as never;
    it("받은 사실로 지은 한 줄 · 오늘 물때(받았을 때만) · 감성돔 금지체장 · 같은 시도 같은 종류", async () => {
        const r = await renderFishingSpots("/fishing/spot/202234500001000003", [sea, sea2], {
            tideToday: async () => ({ name: "미조항", path: "/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD", km: 0.9, day: "2026-11-04", tideName: "11물", turns: [{ min: 326, cm: 205, kind: "high" }, { min: 671, cm: 87, kind: "low" }] }),
        });
        expect(r!.html).toContain("미조방파제는 경남 남해에 있는 바다 낚시터예요. 대상 어종은 감성돔 · 볼락이고, 요금은 등록돼 있지 않아요. 가장 가까운 낚시터는 4.6km 떨어진 상주방파제예요.");
        expect(r!.html).toContain("오늘 물때 — 미조항(0.9km)");
        expect(r!.html).toContain("11월 4일 11물 · 만조 05:26 · 간조 11:11");
        expect(r!.html).toContain('href="/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD"');
        expect(r!.html).toContain("대상 어종의 금어기 · 금지체장");
        expect(r!.html).toContain("금지체장 25센티미터 이하");
        const fee = await renderFishingSpots("/fishing/spot/202234500001000004", [sea, { ...(sea2 as object), fee: 10000 } as never], { tideToday: async () => null });
        expect(fee!.html).toMatch(/요금은 [^<]*원으로 등록돼 있어요/);
        // 물때를 받지 못하면 그 칸은 항구 링크로만
        const r2 = await renderFishingSpots("/fishing/spot/202234500001000003", [sea, sea2], { tideToday: async () => null });
        expect(r2!.html).not.toContain("오늘 물때 — ");
    });
});
