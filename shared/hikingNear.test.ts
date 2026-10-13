import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_REGIONS } from "./hikingMountains";
import { NEAR_MAX_KM, POINT_FAMOUS, POINT_KFS, bearingDeg, compass8, nearKmText, nearRadiusKm, nearSpot, nearestMountains, toMountainPoint, type MountainPoint } from "./hikingNear";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** 주석을 뺀 코드 — 설명 글의 낱말이 고정 시험에 걸리지 않게 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 서울 시청 근처에서 본 산들(자리는 어림값)
const ME = { lat: 37.5665, lng: 126.978 };
const P: MountainPoint[] = [
    ["bukhansan", "북한산", 37.6587, 126.9779, 836, POINT_FAMOUS | POINT_KFS, 12, 0],
    ["inwangsan", "인왕산", 37.5849, 126.9577, 338, 0, 3, 0],
    ["gwanaksan", "관악산", 37.4452, 126.9638, 632, POINT_FAMOUS | POINT_KFS, 9, 0],
    ["namsan", "남산", 37.5512, 126.9882, 270, 0, 2, 0],
    ["hallasan", "한라산", 33.3617, 126.5292, 1947, POINT_FAMOUS | POINT_KFS, 0, 7],
    ["dobongsan", "도봉산", 37.6988, 127.0155, 740, POINT_FAMOUS | POINT_KFS, 7, 0],
];

describe("내 근처의 산", () => {
    it("가까운 순으로 — 명산만 고를 수도 있고, 먼 산(한라산)은 근처가 아니다", () => {
        const all = nearestMountains(P, ME, { limit: 10 });
        expect(all.map((m) => m.name)).toEqual(["남산", "인왕산", "북한산", "관악산", "도봉산"]);
        expect(all[0].km).toBeGreaterThan(1.5); expect(all[0].km).toBeLessThan(2.5);
        const famous = nearestMountains(P, ME, { limit: 2, famousOnly: true });
        expect(famous.map((m) => m.name)).toEqual(["북한산", "관악산"]);
        expect(famous[0].famous && famous[0].kfs).toBe(true);
        expect(nearestMountains(P, ME, { limit: 10 }).some((m) => m.name === "한라산")).toBe(false);
        expect(NEAR_MAX_KM).toBeLessThanOrEqual(150);
        expect(nearestMountains(P, ME, { limit: 0 })).toEqual([]);
        // 나라 밖(도쿄)에서 열면 아무 산도 근처가 아니다
        expect(nearestMountains(P, { lat: 35.68, lng: 139.76 }, { limit: 5 })).toEqual([]);
    });
    it("방향 — 북한산은 북쪽, 관악산은 남쪽, 동쪽 · 서쪽도 맞다", () => {
        expect(compass8(bearingDeg(ME.lat, ME.lng, 37.6587, 126.9779))).toBe("북");
        expect(compass8(bearingDeg(ME.lat, ME.lng, 37.4452, 126.9638))).toBe("남");
        expect(compass8(bearingDeg(37, 127, 37, 128))).toBe("동");
        expect(compass8(bearingDeg(37, 127, 37, 126))).toBe("서");
        expect(compass8(bearingDeg(37, 127, 38, 128))).toBe("북동");
        expect(compass8(359)).toBe("북"); expect(compass8(-10)).toBe("북"); expect(compass8(720 + 181)).toBe("남");
    });
    it("거리의 말", () => {
        expect(nearKmText(0.04)).toBe("100m");
        expect(nearKmText(0.84)).toBe("800m");
        expect(nearKmText(1.94)).toBe("1.9km");
        expect(nearKmText(9.96)).toBe("10.0km");
        expect(nearKmText(12.4)).toBe("12km");
        expect(nearKmText(NaN)).toBe("");
    });
    it("판의 반지름 — 가장 먼 산이 판 안쪽에 들어오는 눈금, 판 위의 자리는 위가 북", () => {
        expect(nearRadiusKm([1.2, 3.9])).toBe(5);
        expect(nearRadiusKm([4.5])).toBe(10);
        expect(nearRadiusKm([14, 16.9])).toBe(20);
        expect(nearRadiusKm([200])).toBe(120);
        expect(nearRadiusKm([])).toBe(2);
        const north = nearSpot({ km: 5, bearing: 0 }, 10);
        expect(north[0]).toBeCloseTo(0, 6); expect(north[1]).toBeCloseTo(-0.5, 6);
        const east = nearSpot({ km: 10, bearing: 90 }, 10);
        expect(east[0]).toBeCloseTo(1, 6); expect(east[1]).toBeCloseTo(0, 6);
        // 판 밖의 산은 가장자리로 당긴다
        const far = nearSpot({ km: 99, bearing: 180 }, 10);
        expect(far[1]).toBeCloseTo(1, 6);
    });
    it("자리 표의 한 줄 — 자리를 모르는 산은 뺀다, 표시는 명산 · 100대 명산", () => {
        expect(toMountainPoint({ slug: "a", name: "가", lat: null, lng: 127, heightM: 100, tier: 3, lists: [], courses: 0 })).toBeNull();
        expect(toMountainPoint({ slug: "a", name: "가", lat: 37.123456, lng: 127.987654, heightM: null, tier: 1, lists: ["kfs100"], courses: 4 }))
            .toEqual(["a", "가", 37.1235, 127.9877, null, POINT_FAMOUS | POINT_KFS, 4, -1]);
        // 권역은 순번으로 싣고, 읽을 때 id 로 되돌린다
        const g = toMountainPoint({ slug: "g", name: "설악산", lat: 38.12, lng: 128.47, heightM: 1708, tier: 1, lists: ["kfs100"], courses: 3, region: HIKING_REGIONS[1].id })!;
        expect(g[7]).toBe(1);
        expect(nearestMountains([g], { lat: 38.1, lng: 128.4 }, { limit: 1 })[0].region).toBe(HIKING_REGIONS[1].id);
        expect(toMountainPoint({ slug: "b", name: "나", lat: 37, lng: 127, heightM: 500, tier: 2, lists: ["kfs100plus"], courses: 0 })?.[5]).toBe(0);
    });
});

describe("고정: 내 위치는 서버로 가지 않는다", () => {
    it("자리 표를 주는 길은 요청의 값을 읽지 않는다(누구에게나 같은 답 · 공개 캐시)", () => {
        const route = code(read("server/routes/modules/hiking.ts"));
        const a = route.indexOf('router.get("/points"');
        expect(a).toBeGreaterThan(-1);
        const body = route.slice(a, route.indexOf("router.", a + 10));
        expect(body).toContain("PUBLIC_CACHE");
        expect(body).not.toMatch(/req\.(query|body|params)/);
    });
    it("화면은 내 위치를 주소 · 본문에 싣지 않고, 기기에도 적어 두지 않는다", () => {
        const ui = code(read("client/src/hiking/components/NearMe.tsx"));
        expect(ui).toContain("nearestMountains(");
        expect(ui).not.toMatch(/apiRequest|fetch\(/);
        // 기기에 남기는 것은 '켰다'는 표시 하나뿐
        expect(ui).not.toMatch(/setItem\([^)]*(lat|lng|fix)/);
        expect(ui).toContain('data-track-as="hiking-near-on"');
    });
});
