import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISHING_SPOTS_PATH, fishingRegionPath, fishingSpotPath, fishingTypePath, isPlaceId, nearbyPlaces, nearestPort, placeCounts, placeFeeText, placeKind, placeSeo, sigunguShort, speciesKey, type PublicPlace } from "./fishingPlaces";

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
    it("공개 길은 로그인 없이 · 검색용 화면 · 사이트맵 · 봇 라우트가 같은 주소를 쓴다", () => {
        const r = read("server/routes/modules/fishing.ts");
        expect(r).toContain('router.get("/spots", asyncHandler(');
        expect(r).toContain('router.get("/spots/:id", asyncHandler(');
        expect(read("server/sitemap.ts")).toContain('"hiking", "fishing"] as const;');
        expect(read("server/prerender.ts")).toContain("app.get(FISHING_SPOTS_RE, async (req, res, next) => {");
        expect(read("vercel.json")).toContain("|fishing/(?:spots(?:/(?:region|type)/[^/]+)?|spot/[^/]+|");
        expect(read("client/src/App.tsx")).toContain('<Route path="/fishing/spot/:id">');
        expect(FISHING_SPOTS_PATH).toBe("/fishing/spots");
    });
});
