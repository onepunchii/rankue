import { describe, it, expect } from "vitest";
import { cleanCoord, nearestWeather, sameSpot, spotKm, weatherLine } from "./fishingSpot";
import type { IndexSpot } from "./fishingPort";

const spot = (name: string, lat: number, lng: number): IndexSpot => ({ name, lat, lng, fish: {}, wave: [0.5, 1], wind: [4, 6], wtemp: [17, 18], tide: "7물" });

describe("조과의 자리", () => {
    it("좌표는 한국 안에서만, 약 1m 까지", () => {
        expect(cleanCoord(34.123456, 127.654321)).toEqual({ lat: 34.12346, lng: 127.65432 });
        expect(cleanCoord("35.1", "129.0")).toEqual({ lat: 35.1, lng: 129 });
        expect(cleanCoord(37.5, 0)).toBeNull();
        expect(cleanCoord(null, 127)).toBeNull();
        expect(cleanCoord(Number.NaN, 127)).toBeNull();
        expect(cleanCoord(undefined, undefined)).toBeNull();
    });
    it("가까운 지수 지점의 바다 — 40km 밖이면 적지 않는다", () => {
        const spots = [spot("여수", 34.74, 127.74), spot("통영", 34.85, 128.43)];
        const w = nearestWeather(spots, 34.76, 127.76);
        expect(w?.point).toBe("여수");
        expect(w!.km).toBeLessThan(5);
        expect(nearestWeather(spots, 37.5, 127.0)).toBeNull();
        expect(nearestWeather([], 34.7, 127.7)).toBeNull();
    });
    it("같은 자리는 100m 안 — 좌표가 없는 기록은 빼고, 자기 자신도 뺀다", () => {
        const a = { id: "a", lat: 34.7, lng: 127.7 };
        const b = { id: "b", lat: 34.7005, lng: 127.7 };
        const c = { id: "c", lat: 34.71, lng: 127.7 };
        const d = { id: "d", lat: null, lng: null };
        expect(spotKm(a.lat, a.lng, b.lat, b.lng) * 1000).toBeLessThan(100);
        expect(sameSpot([a, b, c, d], a).map((x) => x.id)).toEqual(["b"]);
        expect(sameSpot([a, b], d)).toEqual([]);
    });
    it("바다 한 줄", () => {
        expect(weatherLine({ point: "여수", km: 2, wave: [0.5, 1], wind: [4, 4], wtemp: [17, 18], tide: "7물" })).toBe("수온 17~18° · 파고 0.5~1m · 바람 4m/s · 7물");
        expect(weatherLine(null)).toBeNull();
        expect(weatherLine({ point: "x", km: 1, wave: null, wind: null, wtemp: null, tide: null })).toBeNull();
    });
});
