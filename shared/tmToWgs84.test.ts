import { describe, expect, it } from "vitest";
import { tm5174ToWgs84 } from "./tmToWgs84";

/** EPSG:5174 → WGS84(2026-10-19 — 당구장업 인허가 자료를 받으면 우리 매장 1,195곳 좌표와 견줘 정확도를 더 적는다) */
describe("인허가 좌표 바꾸기", () => {
    it("원점은 북위 38° · 동경 127.00289°(Bessel) → WGS84 에서 북으로 300m 남짓 · 서로 200m 남짓(동경측지계 차이)", () => {
        const p = tm5174ToWgs84(200000, 500000)!;
        expect(p.lat).toBeCloseTo(38.00275, 3);
        expect(p.lng).toBeCloseTo(127.00078, 3);
    });
    it("동쪽 · 남쪽으로 갈수록 경도 · 위도가 그만큼 움직인다(50km ≈ 0.45° · 0.57°)", () => {
        const o = tm5174ToWgs84(200000, 500000)!, p = tm5174ToWgs84(250000, 450000)!;
        expect(p.lat).toBeLessThan(o.lat);
        expect(p.lng - o.lng).toBeGreaterThan(0.5);
        expect(p.lng - o.lng).toBeLessThan(0.6);
        expect(o.lat - p.lat).toBeGreaterThan(0.43);
        expect(o.lat - p.lat).toBeLessThan(0.47);
    });
    it("빈 값 · 한반도 밖은 null", () => {
        expect(tm5174ToWgs84(NaN, 1)).toBeNull();
        expect(tm5174ToWgs84(800000, 500000)).toBeNull();
        expect(tm5174ToWgs84(-5, 500000)).toBeNull();
    });
});
