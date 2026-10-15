import { describe, it, expect } from "vitest";
import { kakaoMapLink, locationMessage } from "./hikingShare";

describe("내 위치 보내기", () => {
    it("카카오맵 링크 — 이름의 쉼표는 지우고, 좌표는 소수 다섯째 자리", () => {
        expect(kakaoMapLink("북한산, 백운대", 37.658912345, 126.977812345)).toBe(`https://map.kakao.com/link/map/${encodeURIComponent("북한산 백운대")},37.65891,126.97781`);
    });
    it("한국 시각 · 산 이름 · 링크, 지점번호가 있으면 덧붙인다", () => {
        const at = Date.UTC(2026, 9, 15, 1, 5);
        const m = locationMessage({ mountain: "북한산", lat: 37.6589, lng: 126.9778, atMs: at, gridNo: "다사 5432 6789" });
        expect(m.split("\n")).toEqual([`[랭큐 등산] 북한산 산행 중 · 10:05 위치`, kakaoMapLink("북한산 내 위치", 37.6589, 126.9778), "국가지점번호 다사 5432 6789"]);
        expect(locationMessage({ mountain: "북한산", lat: 37.6, lng: 126.9, atMs: at }).split("\n")).toHaveLength(2);
    });
});
