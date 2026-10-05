import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { searchNearby } from "./naverLocal";
import { NEARBY_KINDS, isNearbyKind, naverMapSearchUrl, nearbyQuery, plainText } from "../../shared/golfAround";

// 골프장 상세 '근처'(네이버 지역 검색). 약관(저장·캐싱·가공 금지)을 코드가 지키는지가 시험의 절반이다.
const ok = (items: any[]) => ({ ok: true, status: 200, json: async () => ({ total: items.length, items }) });
const calls = () => (globalThis.fetch as any).mock.calls;

beforeEach(() => {
    process.env.NAVER_HUB_CLIENT_ID = "id"; process.env.NAVER_HUB_CLIENT_SECRET = "secret";
    vi.stubGlobal("fetch", vi.fn(async () => ok([
        { title: "<b>가</b>나다 식당", category: "한식>육류,고기요리", roadAddress: "경기도 용인시 처인구 모현읍 능원로 1", address: "경기도 용인시 처인구 모현읍 1-1", mapx: "1272471996", mapy: "373246504", link: "" },
        { title: "촌&amp;흙사랑", category: "음식점>한식", roadAddress: "", address: "경기도 용인시 처인구 모현읍 2-2" },
        { title: "", category: "x", roadAddress: "y" },
    ])));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.NAVER_HUB_CLIENT_ID; delete process.env.NAVER_HUB_CLIENT_SECRET; });

describe("검색어 — 실측으로 고른 꼴", () => {
    it('"{골프장} 근처 맛집|카페|숙소"', () => {
        expect(nearbyQuery("레이크사이드CC", "food")).toBe("레이크사이드CC 근처 맛집");
        expect(nearbyQuery("해비치CC 제주", "cafe")).toBe("해비치CC 제주 근처 카페");
        expect(nearbyQuery("용평CC", "stay")).toBe("용평CC 근처 숙소");
        expect([...NEARBY_KINDS]).toEqual(["food", "cafe", "stay"]);
    });
    it("종류는 셋 중 하나만 — 아무 말이나 검색어로 받지 않는다", () => {
        expect(isNearbyKind("food")).toBe(true);
        for (const v of ["맛집", "", null, undefined, 1, "food ", "golf", ["food"]]) expect(isNearbyKind(v)).toBe(false);
    });
    it("네이버 지도 주소 · 글자 다듬기(강조 태그·엔티티만)", () => {
        expect(naverMapSearchUrl("레이크사이드CC 근처 맛집")).toBe(`https://map.naver.com/p/search/${encodeURIComponent("레이크사이드CC 근처 맛집")}`);
        expect(plainText("<b>촌</b>&amp;흙사랑 &lt;본점&gt; &quot;A&quot;")).toBe('촌&흙사랑 <본점> "A"');
        expect(plainText(null)).toBe("");
    });
});

describe("searchNearby", () => {
    it("정확도순 다섯 곳 · 인증 헤더 — 그리고 순서를 바꾸지 않는다", async () => {
        const r = await searchNearby("레이크사이드CC", "food");
        const [url, init] = calls()[0];
        const u = new URL(String(url));
        expect(u.origin + u.pathname).toBe("https://naverapihub.apigw.ntruss.com/search/v1/local");
        expect(u.searchParams.get("query")).toBe("레이크사이드CC 근처 맛집");
        expect(u.searchParams.get("display")).toBe("5");
        expect(u.searchParams.get("sort")).toBe("random");
        expect(init.headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "secret" });
        expect(r).toEqual({
            ok: true, query: "레이크사이드CC 근처 맛집",
            items: [
                { name: "가나다 식당", category: "한식>육류,고기요리", address: "경기도 용인시 처인구 모현읍 능원로 1" },
                { name: "촌&흙사랑", category: "음식점>한식", address: "경기도 용인시 처인구 모현읍 2-2" }, // 도로명이 없으면 지번
            ],
        });
    });
    it("좌표·가게 주소(link)는 내보내지 않는다 — 화면에 쓰지 않는 것은 들고 다니지 않는다", async () => {
        const r = await searchNearby("레이크사이드CC", "food");
        expect(r.ok && Object.keys(r.items[0])).toEqual(["name", "category", "address"]);
    });
    it("키가 없으면 부르지 않는다", async () => {
        delete process.env.NAVER_HUB_CLIENT_SECRET;
        expect(await searchNearby("레이크사이드CC", "food")).toEqual({ ok: false, reason: "nokey" });
        expect(calls()).toHaveLength(0);
    });
    it("한도 초과·오류·이상한 응답은 이유로 돌려준다(던지지 않는다)", async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
        expect(await searchNearby("a", "food")).toEqual({ ok: false, reason: "quota" });
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
        expect(await searchNearby("a", "food")).toEqual({ ok: false, reason: "error" });
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ nope: 1 }) });
        expect(await searchNearby("a", "food")).toEqual({ ok: false, reason: "error" });
        (globalThis.fetch as any).mockRejectedValueOnce(new Error("timeout"));
        expect(await searchNearby("a", "food")).toEqual({ ok: false, reason: "error" });
    });
    it("결과가 없으면 빈 목록(성공)", async () => {
        (globalThis.fetch as any).mockResolvedValueOnce(ok([]));
        expect(await searchNearby("a", "stay")).toEqual({ ok: true, query: "a 근처 숙소", items: [] });
    });
});

describe("약관 — 저장·캐싱·가공 금지를 코드로", () => {
    const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
    const service = read("server/services/naverLocal.ts");
    const routes = read("server/routes/modules/golfCourses.ts");
    const route = routes.slice(routes.indexOf('router.get("/:slug/nearby"'), routes.indexOf("// ── 날씨(2026-10-05)"));

    it("서비스는 DB 도 메모리도 쓰지 않는다 — 순서를 바꾸는 코드도 없다", () => {
        expect(service).not.toMatch(/from "\.\.\/db\.js"|db\.execute|new Map\(|\.sort\(|\.reverse\(/);
    });
    it("라우트는 no-store 로 답하고, 검색어를 손님에게서 받지 않는다(골프장 이름 + 종류 셋)", () => {
        expect(route).toContain('res.set("Cache-Control", "no-store")');
        expect(route).toContain("searchNearby(page.name, kind)");
        expect(route).toContain("isNearbyKind(req.query.kind)");
        expect(route).not.toMatch(/req\.query\.(q|query)\b/);
    });
    it("검색엔진용 화면에는 싣지 않는다", () => {
        expect(read("server/prerender.ts")).not.toMatch(/naverLocal|golfAround|searchNearby/);
    });
});
