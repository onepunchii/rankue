import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISHING_SPOTS_PATH, dedupePlaces, placeDupKey, fishingRegionPath, fishingSpotPath, fishingTypePath, isPlaceId, nearbyPlaces, nearestPort, placeCounts, placeFeeText, placeKind, placeSeo, sigunguShort, speciesKey, type PublicPlace } from "./fishingPlaces";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const P = (o: Partial<PublicPlace>): PublicPlace => ({ id: "202234500001000003", name: "무태낚시터", kind: "저수지", sido: "대구광역시", sigungu: "북구", address: "대구광역시 북구 연경동", lat: 35.935, lng: 128.608, species: ["잉어", "향어"], fee: "30000", tel: null, dataDate: "2024-01-01", ...o });

describe("전국 낚시터 공개 페이지(2026-10-18)", () => {
    it("주소 · 종류 · 요금 · 어종 이름 다듬기", () => {
        expect(fishingSpotPath("202234500001000003")).toBe("/fishing/spot/202234500001000003");
        expect(fishingRegionPath("경기")).toBe("/fishing/spots/region/%EA%B2%BD%EA%B8%B0");
        expect(fishingTypePath("reservoir")).toBe("/fishing/spots/type/reservoir");
        expect(isPlaceId("202234500001000003")).toBe(true);
        expect(isPlaceId("../etc")).toBe(false);
        expect(placeKind("기타").short).toBe("기타");
        expect(placeKind(null).id).toBe("etc");
        expect(placeFeeText("30000")).toBe("30,000원");
        expect(placeFeeText("주간기준 25,000원/인당")).toBe("주간기준 25,000원/인당");
        expect(placeFeeText("0")).toBeNull();
        expect(placeFeeText("1일 10000원")).toBe("1일 10,000원");
        // 붙어 온 값은 띄움만(2026-10-19)
        expect(placeFeeText("3시간 44,000원6시간 66,000원8시간 77,000원")).toBe("3시간 44,000원 · 6시간 66,000원 · 8시간 77,000원");
        expect(placeFeeText("성인20,000원,청소년10,000원")).toBe("성인20,000원, 청소년10,000원");
        expect(placeFeeText("50,000원/일")).toBe("50,000원/일");
        expect(placeFeeText("40,000")).toBe("40,000원");
        expect(speciesKey("볼락류")).toBe("볼락");
        expect(sigunguShort("고양시덕양구")).toBe("고양");
        expect(sigunguShort("북구")).toBe("북구");
    });
    it("가까운 낚시터는 40km 안 · 자기 자신은 빼고 · 좌표가 없으면 같은 시군", () => {
        const a = P({ id: "1000001" }), b = P({ id: "1000002", lat: 35.94, lng: 128.61 }), far = P({ id: "1000003", lat: 37.5, lng: 127 }), nc = P({ id: "1000004", lat: null, lng: null });
        expect(nearbyPlaces([a, b, far, nc], a).map((x) => x.id)).toEqual(["1000002"]);
        expect(nearbyPlaces([a, b, nc], nc).map((x) => x.id)).toEqual(["1000001", "1000002"]);
    });
    it("가까운 항구는 바다 낚시터만", () => {
        const ports = [{ code: "DT_1", name: "부산", lat: 35.1, lng: 129.03 }];
        expect(nearestPort(ports, P({ kind: "저수지", lat: 35.1, lng: 129.0 }))).toBeNull();
        expect(nearestPort(ports, P({ kind: "바다", lat: 35.1, lng: 129.0 }))?.code).toBe("DT_1");
    });
    it("제목은 받은 칸으로만 — 어종이 없으면 어종을 적지 않는다", () => {
        expect(placeSeo(P({})).title).toBe("무태낚시터 — 대구 북구 저수지 낚시터 · 잉어 · 향어 | 랭큐 낚시");
        expect(placeSeo(P({ species: [] })).title).toBe("무태낚시터 — 대구 북구 저수지 낚시터 | 랭큐 낚시");
        expect(placeCounts([P({}), P({ id: "2", kind: "바다", sido: "경기도" })]).kind.map(([k]) => k).sort()).toEqual(["reservoir", "sea"]);
    });
    it("어종 칸은 묶음 이름까지 한 칸 — 붕어 + 붕어류 = 붕어, 한 곳이 둘 다 적어도 한 번(2026-10-19)", () => {
        const sp = placeCounts([
            P({ id: "1", species: ["붕어", "잉어"] }), P({ id: "2", species: ["붕어류"] }), P({ id: "3", species: ["붕어", "붕어류"] }),
            P({ id: "4", species: ["돔류"] }), P({ id: "5", species: ["돔류", "우럭"] }),
        ]).species;
        expect(sp).toContainEqual(["붕어", 3]);
        expect(sp).toContainEqual(["돔류", 2]);
        expect(sp.map(([f]) => f)).not.toContain("붕어류");
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain("p.species.some((f) => speciesKey(f) === fishKey)");
    });
    it("공개 길은 로그인 없이 · 검색용 화면 · 사이트맵 · 봇 라우트가 같은 주소를 쓴다", () => {
        const r = read("server/routes/modules/fishing.ts");
        expect(r).toContain('router.get("/spots", asyncHandler(');
        expect(r).toContain('router.get("/spots/:id", asyncHandler(');
        expect(read("server/sitemap.ts")).toContain('"hiking", "fishing"] as const;');
        expect(read("server/prerender.ts")).toContain("app.get(FISHING_SPOTS_RE, async (req, res, next) => {");
        expect(read("vercel.json")).toContain("|fishing(?:/(?:spots(?:/(?:region|type)/[^/]+)?|spot/[^/]+|");
        expect(read("client/src/App.tsx")).toContain('<Route path="/fishing/spot/:id">');
        expect(FISHING_SPOTS_PATH).toBe("/fishing/spots");
    });
});

describe("같은 낚시터 묶기(2026-10-19 — 1,151줄 = 861곳, 음성 생극낚시터가 12줄)", () => {
    const a = P({ id: "202344700001000021", name: "생극낚시터", address: "충청북도 음성군 생극면 오신로 399-16", dataDate: "2023-04-20", fee: "20000", tel: "043-000-0000" });
    const b = P({ id: "202644700001000161", name: "생극낚시터 ", address: "충청북도 음성군 생극면  오신로 399-16", dataDate: "2026-05-21", fee: null, tel: null, species: ["붕어"] });
    const c = P({ id: "202644700001000999", name: "생극낚시터", address: "충청북도 음성군 다른길 1", dataDate: "2026-05-21" });
    it("이름 · 주소가 같으면 한 곳(띄어쓰기 무시), 주소가 다르면 다른 곳", () => {
        expect(placeDupKey({ ...b, name: b.name.trim() })).toBe(placeDupKey(a));
        expect(placeDupKey(c)).not.toBe(placeDupKey(a));
    });
    it("가장 새 줄이 대표, 대표의 빈 칸만 옛 줄에서 채운다 · 옛 번호는 대표로", () => {
        const { list, alias } = dedupePlaces([a, { ...b, name: b.name.trim() }, c]);
        expect(list).toHaveLength(2);
        const one = list.find((x) => x.id === b.id)!;
        expect(one.species).toEqual(["붕어"]);
        expect(one.fee).toBe("20000");
        expect(one.dataDate).toBe("2026-05-21");
        expect(alias.get(a.id)).toBe(b.id);
        expect(alias.has(c.id)).toBe(false);
    });
    it("가까운 낚시터에 같은 곳이 되풀이되지 않는다", () => {
        const twin = P({ id: "202244500001000004", dataDate: "2025-01-01" });
        const near = P({ id: "202244500001000010", name: "행복낚시터", address: "대구광역시 북구 다른동", lat: 35.94 });
        const { list } = dedupePlaces([P({}), twin, near, P({ id: "202244500001000011", name: "행복낚시터", address: "대구광역시 북구 다른동", lat: 35.94, dataDate: "2022-01-01" })]);
        const me = list.find((x) => x.name === "무태낚시터")!;
        expect(nearbyPlaces(list, me).map((x) => x.name)).toEqual(["행복낚시터"]);
    });
    it("옛 번호로 온 검색엔진은 301, 화면은 주소를 바꾼다 · 앱 안 찾기도 묶은 목록", () => {
        const pre = read("server/prerender.ts");
        expect(pre).toContain("canonicalPlaceId(old[1])");
        expect(pre).toContain("res.redirect(301, fishingSpotPath(canon))");
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain("if (p && p.id !== id) setLocation(fishingSpotPath(p.id), { replace: true })");
        const route = read("server/routes/modules/fishing.ts");
        const places = route.slice(route.indexOf('router.get("/places"'), route.indexOf("수족관 꾸미기"));
        expect(places).toContain("await allPlaces()");
        expect(places).not.toContain("from fishing_places");
    });
});
