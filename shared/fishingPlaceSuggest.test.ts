import { describe, expect, it } from "vitest";
import { PLACE_PORT_KM, PLACE_SPOT_KM, kmBetween, nearestPlaceName, placeSuggestions, recentPlaces } from "./fishingPlaceSuggest";

const PORTS = [{ name: "부산", lat: 35.0961, lng: 129.0353, sub: "항구" }, { name: "여수", lat: 34.7472, lng: 127.7656, sub: "항구" }];
const SPOTS = [
    { name: "기장 대변항 방파제", lat: 35.2237, lng: 129.2312, sub: "부산 기장군" },
    { name: "여수 국동항", lat: 34.7350, lng: 127.7270, sub: "전남 여수시" },
    { name: "단봉낚시터", lat: 37.4699, lng: 129.1218, sub: "강원 동해시" },
];

describe("다녀온 곳 — 적는 동안 고르기", () => {
    it("비었으면 전에 적은 곳만", () => {
        expect(placeSuggestions("", { recent: ["여수 국동항", "부산 근처"], ports: PORTS, spots: SPOTS }).map((x) => x.kind)).toEqual(["recent", "recent"]);
    });
    it("전에 적은 곳 → 항구 → 낚시터, 같은 이름은 한 번, 띄어쓰기는 상관없이", () => {
        const got = placeSuggestions("여수", { recent: ["여수 국동항"], ports: PORTS, spots: SPOTS });
        expect(got.map((x) => `${x.kind}:${x.name}`)).toEqual(["recent:여수 국동항", "port:여수"]);
        expect(placeSuggestions("대변항", { recent: [], ports: PORTS, spots: SPOTS })[0]).toEqual({ name: "기장 대변항 방파제", kind: "spot", sub: "부산 기장군" });
        // 시군구로도 찾는다
        expect(placeSuggestions("동해시", { recent: [], ports: PORTS, spots: SPOTS })[0].name).toBe("단봉낚시터");
    });
    it("여섯 곳까지", () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ name: `방파제 ${i}` }));
        expect(placeSuggestions("방파제", { recent: [], ports: [], spots: many })).toHaveLength(6);
    });
});

describe("지금 자리로 채우기", () => {
    it(`${PLACE_SPOT_KM}km 안의 낚시터가 있으면 그 이름`, () => {
        expect(nearestPlaceName({ lat: 34.7360, lng: 127.7290 }, PORTS, SPOTS)).toMatchObject({ name: "여수 국동항", kind: "spot" });
    });
    it(`낚시터가 멀면 ${PLACE_PORT_KM}km 안의 항구 '근처'`, () => {
        expect(nearestPlaceName({ lat: 35.10, lng: 129.06 }, PORTS, SPOTS)).toMatchObject({ name: "부산 근처", kind: "port" });
    });
    it("둘 다 멀면 null(지어 채우지 않는다)", () => {
        expect(nearestPlaceName({ lat: 36.5, lng: 127.5 }, PORTS, SPOTS)).toBeNull();
    });
    it("거리 어림 — 위도 1도 111km", () => {
        expect(Math.round(kmBetween({ lat: 35, lng: 129 }, { lat: 36, lng: 129 }))).toBe(111);
    });
});

describe("전에 적은 곳", () => {
    it("최근 것부터 · 같은 이름 한 번 · 빈 칸은 건너뜀", () => {
        expect(recentPlaces([{ place: "여수 국동항" }, { place: "" }, { place: "여수  국동항" }, { place: "부산 근처" }, { place: null }])).toEqual(["여수 국동항", "부산 근처"]);
    });
});

describe("화면 — 오늘 내 앞바다 · 다녀온 곳(FishingPage)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const src = readFileSync(resolve(__dirname, "../client/src/fishing/FishingPage.tsx"), "utf8");
    it("내 위치 — 기기에 남기는 것은 '켰다'는 표시뿐(좌표는 저장하지 않는다), 한 번 켜면 다음엔 묻지 않고 받는다", () => {
        const hook = src.slice(src.indexOf("function useFishingMe("), src.indexOf("function MySeaCard("));
        expect(hook).toContain('keep(FISHING_ME_KEY, "1")');
        expect(hook).not.toMatch(/setItem\([^)]*(lat|lng|fix|JSON)/);
        expect(hook).toContain('if (localStorage.getItem(FISHING_ME_KEY) === "1") void get(false);');
    });
    it("카드 — 가장 가까운 항구 · 그 바다의 특보 · 파고 · 바람 · 수온 · 물때, 나가도 된다고 말하지 않고 해경 · 선장 안내", () => {
        const card = src.slice(src.indexOf("function MySeaCard("), src.indexOf("function FishMapHome("));
        expect(card).toContain("nearestPort(loc.me.lat, loc.me.lng)");
        expect(card).toContain("seaHeadline(area)");
        expect(card).toContain("{SEA_CAUTION}");
        expect(card).not.toMatch(/나가도 (돼|좋)/);
        // 홈의 표지 바로 밑, 지도와 같은 위치를 쓴다
        expect(src).toContain("<MySeaCard today={today} loc={loc}");
        expect(src).toContain("<FishMapHome loc={loc}");
    });
    it("조과 적기 — 고르기는 전에 적은 곳 → 항구 → 낚시터, '지금 자리로'는 칸이 비었을 때만 채운다", () => {
        expect(src).toContain("placeSuggestions(place, { recent, ports: PORT_POINTS, spots: spotPoints })");
        const at = src.indexOf("const takeHere = async () => {");
        const take = src.slice(at, src.indexOf("const [error, setError]", at));
        expect(take.indexOf("if (!place.trim()) {")).toBeGreaterThan(-1);
        expect(take.indexOf("if (!place.trim()) {")).toBeLessThan(take.indexOf("nearestPlaceName(c, PORT_POINTS, pts)"));
        expect(take).toContain("if (t) setTideSea(t);");
    });
});
