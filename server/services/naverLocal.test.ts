import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { searchNearby, searchNearbyWord } from "./naverLocal";
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
        // 처음 셋(맛집·카페·숙소)의 열쇠는 그대로다 — 옛 화면이 ?kind=food|cafe|stay 로 부른다
        for (const k of ["food", "cafe", "stay"]) expect(NEARBY_KINDS).toContain(k);
        expect(NEARBY_KINDS[0]).toBe("food");
    });
    it("종류는 정해 둔 칩 가운데 하나만 — 아무 말이나 검색어로 받지 않는다", () => {
        for (const k of NEARBY_KINDS) expect(isNearbyKind(k)).toBe(true);
        for (const v of ["맛집", "해장국", "", null, undefined, 1, "food ", "golf", ["food"], "__proto__", "constructor"]) expect(isNearbyKind(v)).toBe(false);
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
    it("이 동네 대표 메뉴 — 낱말 하나로 같은 꼴의 검색어(부르는 쪽이 사전에서 꺼낸 낱말)", async () => {
        const r = await searchNearbyWord("라비에벨CC", "닭갈비");
        const u = new URL(String(calls()[0][0]));
        expect(u.searchParams.get("query")).toBe("라비에벨CC 근처 닭갈비");
        expect(u.searchParams.get("display")).toBe("5");
        expect(u.searchParams.get("sort")).toBe("random");
        expect(r.ok && r.query).toBe("라비에벨CC 근처 닭갈비");
        expect(r.ok && r.items).toHaveLength(2);
    });
    it("결과가 없으면 빈 목록(성공)", async () => {
        (globalThis.fetch as any).mockResolvedValueOnce(ok([]));
        expect(await searchNearby("a", "stay")).toEqual({ ok: true, query: "a 근처 숙소", items: [] });
    });
});

describe("이름을 바꿔 다시 묻기 — 'SKY72 골프클럽(바다코스)'는 그대로는 0건이다(2026-10-05 오너 신고)", () => {
    const item = (title: string, lat: number, lng: number) => ({ title, category: "음식점>한식", roadAddress: `${title} 주소`, mapx: String(Math.round(lng * 1e7)), mapy: String(Math.round(lat * 1e7)) });
    const HERE = { lat: 37.4834, lng: 126.4688, radiusKm: 15 };
    const near = (t: string) => item(t, 37.49, 126.47), far = (t: string) => item(t, 35.1, 129.0);
    const queries = () => calls().map((c: any[]) => new URL(String(c[0])).searchParams.get("query"));
    const seq = (...answers: any[][]) => { const f = globalThis.fetch as any; f.mockReset(); for (const a of answers) f.mockResolvedValueOnce(ok(a)); };

    it("첫 이름이 0건이면 다음 이름으로 — 답을 낸 검색어를 돌려준다", async () => {
        seq([], [near("가"), near("나")]);
        const r = await searchNearbyWord({ names: [{ name: "SKY72 골프클럽" }, { name: "SKY72CC" }, { name: "인천 공항동로", area: true }], at: HERE }, "한우");
        expect(queries()).toEqual(["SKY72 골프클럽 근처 한우", "SKY72CC 근처 한우"]); // 답이 나면 더 묻지 않는다
        expect(r).toEqual({ ok: true, query: "SKY72CC 근처 한우", items: [{ name: "가", category: "음식점>한식", address: "가 주소" }, { name: "나", category: "음식점>한식", address: "나 주소" }] });
    });
    it("엉뚱한 동네의 답은 통째로 버리고 다시 묻는다 — 한 줄씩 거르지 않는다", async () => {
        seq([far("부산1"), far("부산2"), far("부산3"), near("여기")], [near("가"), far("멀리"), near("나")]);
        const r = await searchNearbyWord({ names: [{ name: "가든CC" }, { name: "가든 골프장" }], at: HERE }, "맛집");
        // 첫 답은 넷 중 하나만 가까워 버렸다. 둘째 답은 셋 중 둘이 가까워 쓴다 — 먼 것('멀리')도 그대로, 순서도 그대로.
        expect(r.ok && r.items.map((x) => x.name)).toEqual(["가", "멀리", "나"]);
        expect(r.ok && r.query).toBe("가든 골프장 근처 맛집");
    });
    it("주소로 만든 이름의 답은 거리로 의심하지 않는다(우리 좌표가 틀린 골프장이 있다)", async () => {
        seq([], [far("가"), far("나")]);
        const r = await searchNearbyWord({ names: [{ name: "써미트CC" }, { name: "진안 부귀면", area: true }], at: HERE }, "맛집");
        expect(r.ok && r.items).toHaveLength(2);
        expect(r.ok && r.query).toBe("진안 부귀면 근처 맛집");
    });
    it("자리를 모르면 거리로 가리지 않는다 · 한 곳뿐인 답은 그 한 곳이 가까우면 쓴다", async () => {
        seq([far("가")]);
        expect((await searchNearbyWord({ names: [{ name: "가CC" }, { name: "나CC" }], at: null }, "맛집") as any).items).toHaveLength(1);
        seq([near("하나")]);
        expect((await searchNearbyWord({ names: [{ name: "강화 선두리" }], at: HERE }, "맛집") as any).items).toHaveLength(1);
        seq([far("하나")], []);
        expect(await searchNearbyWord({ names: [{ name: "가CC" }, { name: "나CC" }], at: HERE }, "맛집")).toEqual({ ok: true, query: "가CC 근처 맛집", items: [] });
    });
    it("다 물어도 없으면 빈 목록 — 검색어는 첫 이름의 것(화면이 지도에서 찾아보기로 쓴다)", async () => {
        seq([], [], []);
        const r = await searchNearbyWord({ names: [{ name: "베르힐CC 영종" }, { name: "베르힐CC" }, { name: "인천 한상중앙로", area: true }], at: HERE }, "맛집");
        expect(queries()).toHaveLength(3);
        expect(r).toEqual({ ok: true, query: "베르힐CC 영종 근처 맛집", items: [] });
    });
    it("첫 물음이 막히면 그 까닭을 알리고, 다시 묻다가 막히면 '못 찾음'으로 끝낸다", async () => {
        const f = globalThis.fetch as any;
        f.mockReset(); f.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
        expect(await searchNearbyWord({ names: [{ name: "가" + "CC" }, { name: "나CC" }] }, "맛집")).toEqual({ ok: false, reason: "quota" });
        expect(calls()).toHaveLength(1);
        f.mockReset(); f.mockResolvedValueOnce(ok([])).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(ok([near("가")]));
        expect(await searchNearbyWord({ names: [{ name: "가CC" }, { name: "나CC" }, { name: "다CC" }] }, "맛집")).toEqual({ ok: true, query: "가CC 근처 맛집", items: [] });
        expect(calls()).toHaveLength(2);
    });
    it("좌표는 재는 데만 쓰고 내보내지 않는다", async () => {
        seq([near("가"), near("나")]);
        const r = await searchNearbyWord({ names: [{ name: "가CC" }], at: HERE }, "맛집");
        expect(r.ok && Object.keys(r.items[0])).toEqual(["name", "category", "address"]);
        expect(JSON.stringify(r)).not.toMatch(/mapx|mapy|37\.49/);
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
    it("라우트는 no-store 로 답하고, 검색어를 손님에게서 받지 않는다(골프장 이름 + 정해 둔 칩)", () => {
        expect(route).toContain('res.set("Cache-Control", "no-store")');
        expect(route).toContain("searchNearby(target, kind)");
        expect(route).toContain("names: nearbySearchNames(page)"); // 이름은 우리 자료(이름·별칭·주소)에서만 만든다
        expect(route).toContain("isNearbyKind(req.query.kind)");
        expect(route).not.toMatch(/req\.query\.(q|query)\b/);
    });
    it("검색엔진용 화면에는 싣지 않는다", () => {
        expect(read("server/prerender.ts")).not.toMatch(/naverLocal|golfAround|searchNearby/);
    });
});
