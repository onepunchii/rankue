import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FESTIVE_TRAIL_AHEAD_DAYS, festiveTrails } from "./trailFestivals";
import type { TourFestival } from "./tourFestivals";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const course = (route: string, key: string, pts: [number, number][]) => ({ route: route as "haeparang", key, name: `해파랑길 ${key}코스`, km: 10, minutes: 240, coarse: pts });
const fest = (o: Partial<TourFestival>): TourFestival => ({ id: "1", title: "축제", start: "20261024", end: "20261025", addr: "강원특별자치도 강릉시", lat: 37.77, lng: 128.95, ...o });
const A = course("haeparang", "39", [[37.77, 128.95], [37.8, 128.9]]);
const B = course("haeparang", "40", [[37.9, 128.8], [37.95, 128.75]]);

/** 축제가 열리는 둘레길(2026-10-21) — 둘레길 허브의 한 줄 */
describe("축제가 열리는 둘레길", () => {
    it("코스 선 5km 안 · 축제마다 가장 가까운 코스 · 거리는 소수 하나", () => {
        const out = festiveTrails([A, B], [fest({ id: "a", lat: 37.775, lng: 128.95 })], "20261021");
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ key: "39", festival: { id: "a", state: "soon" }, dist: 0.6 });
        expect(festiveTrails([A, B], [fest({ lat: 37.6, lng: 129.2 })], "20261021")).toEqual([]);
    });
    it("도심 축제는 3km · 끝난 축제와 30일 넘어 열리는 축제는 빼고 · 지금 열리는 것 먼저 · 코스마다 하나", () => {
        const near4 = fest({ id: "m", addr: "부산광역시 남구", lat: 37.806, lng: 128.95 });
        expect(festiveTrails([A], [near4], "20261021")).toEqual([]);
        expect(festiveTrails([A], [fest({ end: "20261020", start: "20261001" })], "20261021")).toEqual([]);
        expect(festiveTrails([A], [fest({ start: "20261201", end: "20261202" })], "20261021")).toEqual([]);
        expect(FESTIVE_TRAIL_AHEAD_DAYS).toBe(30);
        const out = festiveTrails([A], [fest({ id: "soon", start: "20261022", end: "20261023" }), fest({ id: "now", start: "20261015", end: "20261030" })], "20261021");
        expect(out.map((x) => x.festival.id)).toEqual(["now"]);
        expect(out[0].festival.state).toBe("now");
    });
    it("허브 API 와 화면 — 축제를 못 읽으면 빈 줄 · 구역이 없다", () => {
        const route = read("server/routes/modules/trails.ts");
        expect(route).toContain("const festive = festiveTrails(courses, await tourFestivals().catch(() => []), kstYmd());");
        const hub = read("client/src/hiking/trails/TrailsHub.tsx");
        expect(hub).toContain("{!!data.festive?.length && (");
        expect(hub).toContain('title="축제가 열리는 둘레길"');
    });
});
