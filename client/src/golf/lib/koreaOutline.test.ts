import { describe, it, expect } from "vitest";
import { KOREA_MAP_PATHS } from "../data/koreaMapData";
import { OUTLINE_FIT, OUTLINE_GROUP, OUTLINE_TO_DOT, latLngToOutline, outlineToDot, outlineToLatLng } from "./koreaOutline";
import { mapX, mapY } from "../../../../shared/golfDotMap";
import { GOLF_REGIONS } from "../../../../shared/golfCourse";

// 윤곽선 지도를 점 지도에 겹치는 맞춤값 — 윤곽선의 경계 상자를 위경도로 되돌려 실제 지리와 맞는지 본다.
// (윤곽선 path 는 상대 좌표 m … z 뿐이다 — 그래서 여기서 바로 점으로 풀 수 있다.)
function points(d: string): [number, number][] {
    const out: [number, number][] = [];
    let x = 0, y = 0;
    for (const sub of d.split(/[mM]/).map((s) => s.trim()).filter(Boolean)) {
        const nums = sub.replace(/[zZ]/g, " ").trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) { x += nums[i]; y += nums[i + 1]; out.push([x, y]); }
    }
    return out;
}
function geoBox(id: string) {
    const ll = points(KOREA_MAP_PATHS[id]).map(([x, y]) => outlineToLatLng(x, y));
    return { s: Math.min(...ll.map((p) => p.lat)), n: Math.max(...ll.map((p) => p.lat)), w: Math.min(...ll.map((p) => p.lng)), e: Math.max(...ll.map((p) => p.lng)) };
}

describe("윤곽선 자료", () => {
    it("시도 17개 — 전부 여섯 지역 묶음 가운데 하나에 든다", () => {
        const ids = Object.keys(KOREA_MAP_PATHS);
        expect(ids).toHaveLength(17);
        for (const id of ids) expect(GOLF_REGIONS as readonly string[], id).toContain(OUTLINE_GROUP[id]);
        expect(Object.keys(OUTLINE_GROUP).sort()).toEqual([...ids].sort());
        expect(new Set(Object.values(OUTLINE_GROUP)).size).toBe(6);
    });
    it("path 는 상대 좌표 m … z 뿐이다(이 시험이 그렇게 푼다)", () => {
        for (const d of Object.values(KOREA_MAP_PATHS)) expect(d.replace(/[mz\s\d.,-]/g, "")).toBe("");
    });
});

describe("맞춤값 — 윤곽선을 위경도로 되돌리면 실제 지리다", () => {
    it("가로·세로 눈금 비가 점 지도와 같다(위도 36° 코사인) — 늘이고 옮기기만 하면 겹친다", () => {
        expect(OUTLINE_FIT.ax / -OUTLINE_FIT.ay).toBeCloseTo(0.81, 1);
        expect(OUTLINE_TO_DOT).toMatch(/^matrix\(0\.86\d+ 0 0 0\.85\d+ -1[12]\.\d+ 1[34]\.\d+\)$/);
    });
    it("제주 본섬 — 동경 126.1~127.0, 북위 33.1~33.6", () => {
        const b = geoBox("Jeju");
        expect(b.w).toBeGreaterThan(126.05); expect(b.w).toBeLessThan(126.25);
        expect(b.e).toBeGreaterThan(126.85); expect(b.e).toBeLessThan(127.05);
        expect(b.s).toBeGreaterThan(33.05); expect(b.s).toBeLessThan(33.3);
        expect(b.n).toBeGreaterThan(33.45); expect(b.n).toBeLessThan(33.7);
    });
    it("강원 북단은 38.6° 언저리, 동쪽 끝은 129.4° 언저리", () => {
        const b = geoBox("Gangwon");
        expect(b.n).toBeGreaterThan(38.5); expect(b.n).toBeLessThan(38.75);
        expect(b.e).toBeGreaterThan(129.2); expect(b.e).toBeLessThan(129.5);
    });
    it("도시들이 제 윤곽선의 경계 상자 안에 있다 — 서울·부산·대구·광주·대전", () => {
        const city: Record<string, [number, number]> = { Seoul: [37.5665, 126.978], Busan: [35.1796, 129.0756], Daegu: [35.8714, 128.6014], Gwangju: [35.1595, 126.8526], Daejeon: [36.3504, 127.3845] };
        for (const [id, [lat, lng]] of Object.entries(city)) {
            const b = geoBox(id);
            expect(lat, `${id} 위도`).toBeGreaterThan(b.s); expect(lat, `${id} 위도`).toBeLessThan(b.n);
            expect(lng, `${id} 경도`).toBeGreaterThan(b.w); expect(lng, `${id} 경도`).toBeLessThan(b.e);
        }
    });
    it("세 변환이 서로 맞는다 — 위경도 → 그림 → 점 지도 = 위경도 → 점 지도", () => {
        for (const [lat, lng] of [[37.4834, 126.4688], [33.25, 126.41], [38.2, 128.59], [34.8, 126.4]] as [number, number][]) {
            const [x, y] = latLngToOutline(lat, lng);
            const [dx, dy] = outlineToDot(x, y);
            expect(dx).toBeCloseTo(mapX(lng), 1);
            expect(dy).toBeCloseTo(mapY(lat), 1);
            const back = outlineToLatLng(x, y);
            expect(back.lat).toBeCloseTo(lat, 6); expect(back.lng).toBeCloseTo(lng, 6);
        }
    });
});
