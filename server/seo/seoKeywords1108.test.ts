/**
 * 키워드 보강(2026-11-08 — 네이버 검색어 트렌드 12개월 실측 → 오너 "추천한거 다 진행").
 * P0: 전국 물때표 허브 · 도시 이름 물때 주소 · 쭈꾸미 · 산 제목의 날씨 · 축제 달 · 시도 · 종류 묶음 · 지난 축제 사이트맵 정리.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 — 모양만 본다(fishingSea.test 와 같은 방식)
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));
const doc = (html: string) => JSON.parse(html) as { title: string; desc: string; body: string; jsonLd: unknown[] };
import { renderFishingSea, FISHING_SEA_RE, type FishingSeaDeps } from "./fishingSea";
import { renderFestivals, FESTIVALS_RE, festivalSitemapParts } from "./festivals";
import { tideAlias, tideHubFaq, tideHubSeo, tideTodaySentence } from "../../shared/fishingTidePoints";
import { fishBySlug, fishPageSeo, tierLine } from "../../shared/fishingFishPages";
import { mountainSeo } from "../../shared/hikingPage";
import { festivalGroupPaths, festivalInSitemap, festivalsOfMonth, festivalsOfTheme, FESTIVAL_THEMES } from "../../shared/festivalHubs";
import type { FestivalRow } from "../../shared/festivals";

const read = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");
const none: FishingSeaDeps = { sea: async () => null, fcst: async () => null, port: async () => null, places: async () => [] };
const tp = (name: string, area = "south-east") => ({ code: `SO_${name.length}`, name, lat: 34.7, lng: 128.0, area, port: { code: "DT_0014", name: "통영", km: 9 } });

describe("전국 물때표 허브 /fishing/tide", () => {
    it("주소 — 봇 라우트(vercel.json) · 프리렌더 · 앱 라우트 · 사이트맵", () => {
        for (const p of ["/fishing/tide", "/fishing/tide/", "/fishing/tide/%EC%9D%B8%EC%B2%9C"]) expect(FISHING_SEA_RE.test(p)).toBe(true);
        expect(read("vercel.json")).toContain("|tide(?:/[^/]+)?|");
        expect(read("client/src/App.tsx")).toContain('<Route path="/fishing/tide">');
        expect(read("server/prerender.ts")).toContain("if (r.status === 301 && r.location) return res.redirect(301, r.location);");
    });
    it("허브 — 오늘 물때 한 줄 · 바다마다 항구 + 포구 · 섬 · 묻고 답하기(FAQPage)", async () => {
        const deps = { ...none, tidePoints: () => [tp("미조항"), tp("상왕등도", "west-south")] };
        const r = await renderFishingSea("/fishing/tide", deps, Date.parse("2026-11-08T03:00:00Z"));
        expect(r?.status).toBe(200);
        const d = doc(r!.html);
        expect(d.title).toBe("전국 물때표 — 오늘 물때 · 항구 51곳 · 포구 · 섬 2곳 만조 · 간조 | 랭큐 낚시");
        expect(d.body).toContain('href="/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD"');
        expect(d.body).toContain('href="/fishing/port/%EC%9D%B8%EC%B2%9C"');
        expect(JSON.stringify(d.jsonLd)).toContain('"@type":"FAQPage"');
        expect(d.body).toContain("물때는 음력 날짜로 세요. 서해는 7물때");
    });
    it("도시 이름 주소 → 같은 이름의 항구 · 지점(301), 모르는 이름은 404", async () => {
        const deps = { ...none, tidePoints: () => [tp("강릉항"), tp("미조항")] };
        const inch = await renderFishingSea("/fishing/tide/%EC%9D%B8%EC%B2%9C", deps);
        expect(inch).toMatchObject({ status: 301, location: "https://www.rankue.co.kr/fishing/port/%EC%9D%B8%EC%B2%9C" });
        const gn = await renderFishingSea(`/fishing/tide/${encodeURIComponent("강릉")}`, deps);
        expect(gn?.location).toBe(`https://www.rankue.co.kr/fishing/tide/${encodeURIComponent("강릉항")}`);
        expect(await renderFishingSea(`/fishing/tide/${encodeURIComponent("서울")}`, deps)).toBeNull();
        // 규칙: 같은 이름 · '항' 붙이기 / 떼기만
        expect(tideAlias("여수항", [], ["여수"])).toEqual({ kind: "port", name: "여수" });
        expect(tideAlias("동해", [], ["동해항"])).toEqual({ kind: "port", name: "동해항" });
        expect(tideAlias("미조항", ["미조항"], [])).toBeNull();
        expect(read("server/routes/modules/fishing.ts")).toContain("return sendSuccess(res, { redirect: al.kind === \"port\" ? fishingPortPath(al.name) : fishingTidePath(al.name) });");
        expect(read("client/src/fishing/spots/SeaPages.tsx")).toContain("if (redirect) setLocation(redirect, { replace: true });");
    });
    it("오늘 물때 문장 · 묻고 답하기는 사이트의 같은 말", () => {
        expect(tideTodaySentence("2026-11-08")).toMatch(/^오늘 11월 8일\(일\) 물때는 서해 .+, 남해 · 동해 · 제주 .+이에요\.$/);
        expect(tideHubFaq("2026-11-08").map((f) => f.q)).toEqual(["오늘 물때는 몇 물인가요?", "물때는 어떻게 세나요?", "만조 · 간조 시각은 어디 자료인가요?"]);
        expect(tideHubSeo(51, 107).title).toContain("포구 · 섬 107곳");
    });
});

describe("어종 — '쭈꾸미' · 겹친 단계 글", () => {
    it("검색 이름으로도 같은 장 · 제목 · 설명에 같이", () => {
        const f = fishBySlug("쭈꾸미");
        expect(f?.name).toBe("주꾸미");
        const seo = fishPageSeo(f!, 1);
        expect(seo.title.startsWith("주꾸미(쭈꾸미) 낚시 — ")).toBe(true);
        expect(seo.h1).toBe("주꾸미 낚시");
    });
    it("이름이 곧 값인 단계는 한 번만('10수 10수' 사고)", () => {
        expect(tierLine(fishBySlug("주꾸미")!)).toBe("10수 · 30수 · 50수 · 100수");
        expect(tierLine(fishBySlug("감성돔")!)).toContain("3짜 30cm");
    });
});

describe("산 제목의 '날씨'", () => {
    const base = { slug: "seorak", name: "설악산", heightM: 1708, sido: "강원", sigungu: "양양군", courses: 9, minKm: 0.9, maxKm: 12, subtitle: null };
    it("좌표가 있고 공식 목록에 든 산만 '최단' 대신 '날씨'", () => {
        expect(mountainSeo({ ...base, lists: ["kfs100"], lat: 38.1 }).title).toBe("설악산 등산코스 9개 · 날씨 · 높이 1,708m | 랭큐 등산");
        expect(mountainSeo({ ...base, lists: [], lat: 38.1 }).title).toBe("설악산 등산코스 9개 · 최단 0.9km · 높이 1,708m | 랭큐 등산");
        expect(mountainSeo({ ...base, lists: ["kfs100"], lat: null }).title).toContain("최단 0.9km");
    });
    it("검색용 화면의 예보 — 목록의 산만 그 자리에서 받는다", () => {
        const p = read("server/prerender.ts");
        // 제목에 '날씨'를 단 산만 그 자리에서 받는다 — 나머지는 받아 둔 것만
        expect(p).toContain("getCourseWeather({ lat: at.lat, lng: at.lng }, { fetch: mountainTitleWeather(d) })");
        expect(read("server/seo/hiking.ts")).toContain("${weatherSection(d.name, wx, nowMs)}");
    });
});

describe("축제 — 달 · 시도 · 종류 묶음 · 사이트맵", () => {
    const f = (id: string, title: string, start: string, end: string, region = "부산"): FestivalRow => ({ id, title, start, end, addr: null, region, lat: 35, lng: 129, cat: null, image: null, lic: null, mod: null });
    const all = [
        f("1", "부산불꽃축제", "20261114", "20261114"),
        f("2", "진해군항제 벚꽃", "20260327", "20260405", "경남"),
        f("3", "서천 해넘이 해돋이 2024", "20241231", "20250101", "충남"),
        f("4", "국화 전시회", "20261020", "20261110", "서울"),
    ];
    const today = "20261108";
    it("주소 — 봇 라우트 · 앱 라우트", () => {
        for (const p of ["/festivals/month/11", "/festivals/region/%EB%B6%80%EC%82%B0", "/festivals/theme/%EB%B6%88%EA%BD%83"]) expect(FESTIVALS_RE.test(p)).toBe(true);
        expect(FESTIVALS_RE.test("/festivals/month")).toBe(false);
        expect(read("vercel.json")).toContain("festivals(?:/[0-9]+|/(?:month|region|theme)/[^/]+)?|about");
        expect(read("client/src/App.tsx")).toContain('<Route path="/festivals/:kind/:key">');
    });
    it("달 — 그 달에 걸친 축제(이번 달이면 올해, 지난 달은 내년 → 없으면 올해 지난 축제)", () => {
        expect(festivalsOfMonth(all, 11, today).items.map((x) => x.id)).toEqual(["4", "1"]);
        const mar = festivalsOfMonth(all, 3, today);
        expect(mar).toMatchObject({ year: 2026, past: true });
        expect(mar.items.map((x) => x.id)).toEqual(["2"]);
    });
    it("종류는 이름에 그 말이 든 것만", () => {
        const fire = FESTIVAL_THEMES.find((x) => x.slug === "불꽃")!;
        expect(festivalsOfTheme(all, fire, today).live.map((x) => x.id)).toEqual(["1"]);
    });
    it("검색용 화면 — 제목 · 목록 · 없는 묶음 404", async () => {
        const r = await renderFestivals("/festivals/region/%EB%B6%80%EC%82%B0", all, today, async () => null);
        expect(doc(r!.html).title).toBe("부산 축제 2026 — 지금 · 곧 열리는 1곳 날짜 · 장소 | 랭큐");
        expect(doc(r!.html).body).toContain('href="/festivals/1"');
        const m = await renderFestivals("/festivals/month/11", all, today, async () => null);
        expect(doc(m!.html).title).toBe("11월 축제 2026 — 전국 2곳 날짜 · 장소 · 지역 | 랭큐");
        expect(await renderFestivals("/festivals/month/13", all, today, async () => null)).toBeNull();
        expect(await renderFestivals(`/festivals/theme/${encodeURIComponent("빛")}`, all, today, async () => null)).toBeNull();
    });
    it("사이트맵 — 묶음은 축제가 있는 것만, 끝난 지 90일 넘은 축제는 뺀다", () => {
        expect(festivalGroupPaths(all, today)).toContain("/festivals/month/11");
        expect(festivalInSitemap(all[2], today)).toBe(false);
        const locs = festivalSitemapParts(all, today).join("\n");
        expect(locs).not.toContain("/festivals/3\"");
        expect(locs).toContain("/festivals/month/11");
    });
});

describe("P1 — 매장 대회 · 선수 제목 · 단풍 · 매장 사진 사이트맵", () => {
    it("매장 대회 검색용 화면 — SportsEvent · 매장으로 잇기 · 참가자 이름 없음", async () => {
        const { renderStoreCup, STORE_CUP_RE } = await import("./storeCup");
        expect(STORE_CUP_RE.test("/store-cup/c0000000-0000-4000-8000-000000000001")).toBe(true);
        const r = renderStoreCup({
            cup: { id: "c0000000-0000-4000-8000-000000000001", title: "11월 3쿠션 매장 대회", description: null, status: "recruiting", gameType: "3c", maxPlayers: 16, bestOf: 3, recruitEnd: "2026-11-18T14:00:00Z", startAt: "2026-11-20T10:00:00Z", prize: null, entryFee: 10000 },
            store: { name: "한솔대대전용", listingCode: "C01184", address: "경기 화성시 병점동", region: "경기" }, players: 4, champion: null,
        });
        const d = doc(r.html);
        expect(d.title).toBe("11월 3쿠션 매장 대회 — 한솔대대전용 당구 대회 · 11월 20일 (금) | 랭큐");
        const ld = JSON.stringify(d.jsonLd);
        expect(ld).toContain('"@type":"SportsEvent"');
        expect(ld).toContain('"priceCurrency":"KRW"');
        expect(d.body).toContain('href="/stores/C01184"');
        expect(read("vercel.json")).toContain("|(?:store|club|r|i|store-cup)/[^/]+|");
        expect(read("server/sitemap.ts")).toContain("storeCupInSitemap({ status: r.status, updatedAt: r.updated_at })");
    });
    it("매장 대회 사이트맵 — 끝난 지 30일까지, 취소는 안 올린다", async () => {
        const { storeCupInSitemap } = await import("../../shared/storeCup");
        const now = Date.parse("2026-11-08T00:00:00Z");
        expect(storeCupInSitemap({ status: "recruiting", updatedAt: null }, now)).toBe(true);
        expect(storeCupInSitemap({ status: "ended", updatedAt: "2026-10-20T00:00:00Z" }, now)).toBe(true);
        expect(storeCupInSitemap({ status: "ended", updatedAt: "2026-09-01T00:00:00Z" }, now)).toBe(false);
        expect(storeCupInSitemap({ status: "canceled", updatedAt: null }, now)).toBe(false);
    });
    it("PBA 상위 20위는 '경기 결과 · 순위', 나머지는 그대로", async () => {
        const { pbaPlayerTitleKo } = await import("../../shared/pbaMeta");
        expect(pbaPlayerTitleKo("김가영", "LPBA", "5억원", { season: 2026, rank: 1 })).toBe("김가영 경기 결과 · 순위 — LPBA 상금랭킹 1위 · 통산 상금 5억원 | 랭큐");
        expect(pbaPlayerTitleKo("양교천", "PBA", "330만원", { season: 2026, rank: 120 })).toBe("양교천 상금·연봉 — PBA 통산 상금 330만원 | 랭큐");
        expect(read("server/prerender.ts")).toContain("PP.playerTitle(name, p.league, prizeStr, pbaLatestSeasonRank(p.seasons))");
    });
    it("매장 사이트맵에 사장님 사진", () => {
        expect(read("server/sitemap.ts")).toContain("...(own?.images.length ? { images: own.images } : {})");
    });
});
