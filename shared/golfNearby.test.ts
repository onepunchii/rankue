import { describe, it, expect } from "vitest";
import { parseLatLng, sortByDistance } from "./golfNearby";

describe("golfNearby", () => {
    it("거리가 있는 곳을 가까운 순으로 먼저, 좌표 없는 곳은 뒤에 원래 순서대로", () => {
        const list = [
            { name: "가", distance: undefined }, { name: "나", distance: 120 }, { name: "다", distance: undefined },
            { name: "라", distance: 3.2 }, { name: "마", distance: 40 }, { name: "바", distance: null },
        ];
        expect(sortByDistance(list).map((c) => c.name)).toEqual(["라", "마", "나", "가", "다", "바"]);
    });
    it("예전 비교(없으면 0)로는 가나다순 앞쪽이 먼저 나오던 모양 — 좌표 있는 곳이 드문드문일 때도 가까운 곳이 맨 앞", () => {
        const list = Array.from({ length: 50 }, (_, i) => ({ name: `c${i}`, distance: i % 3 === 0 ? 100 - i : undefined }));
        const out = sortByDistance(list);
        expect(out[0].name).toBe("c48");
        expect(out.slice(0, 17).every((c) => c.distance != null)).toBe(true);
    });
    it("parseLatLng — 숫자·범위·0,0 은 위치 없음", () => {
        expect(parseLatLng("37.5", "127.0")).toEqual({ lat: 37.5, lng: 127 });
        expect(parseLatLng(undefined, "127")).toBeNull();
        expect(parseLatLng("abc", "127")).toBeNull();
        expect(parseLatLng(0, 0)).toBeNull();
        expect(parseLatLng(91, 10)).toBeNull();
    });
});
