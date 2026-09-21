import { describe, it, expect } from "vitest";
import { distanceKm, formatDistance, isKoreaCoord, normalizeSlots, openSlotCount, slotsFromLegacy, JOIN_OPTIONS } from "./golfJoin";

describe("골프 조인 자리(slot) 규칙", () => {
    it("첫 자리는 호스트, 모집 자리가 하나는 있어야 하고, 2~4자리", () => {
        const ok = normalizeSlots([{ role: "HOST", gender: "M" }, { role: "GUEST", gender: "F" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "M" }]);
        expect(ok).not.toBeNull();
        expect(openSlotCount(ok!)).toBe(2);
        expect(normalizeSlots([{ role: "HOST", gender: "M" }])).toBeNull();                                   // 혼자
        expect(normalizeSlots([{ role: "HOST", gender: "M" }, { role: "GUEST", gender: "F" }])).toBeNull();     // 모집 자리 없음
        expect(normalizeSlots([{ role: "OPEN", gender: "ANY" }, { role: "HOST", gender: "M" }])).toBeNull();    // 호스트가 첫 자리가 아님
        expect(normalizeSlots([{ role: "HOST", gender: "M" }, { role: "HOST", gender: "F" }, { role: "OPEN", gender: "ANY" }])).toBeNull(); // 호스트 둘
        expect(normalizeSlots(Array.from({ length: 5 }, (_, i) => ({ role: i === 0 ? "HOST" : "OPEN", gender: "ANY" })))).toBeNull();
        expect(normalizeSlots([{ role: "HOST", gender: "X" }, { role: "OPEN", gender: "ANY" }])).toBeNull();
        expect(normalizeSlots("nope")).toBeNull();
    });

    it("옛 글은 모집 인원·조건으로 자리를 만든다", () => {
        expect(slotsFromLegacy(2, "남성").map((s) => `${s.role}:${s.gender}`)).toEqual(["HOST:ANY", "OPEN:M", "OPEN:M"]);
        expect(slotsFromLegacy(3, "여성")[1].gender).toBe("F");
        expect(slotsFromLegacy(3, "부부/커플")[1].gender).toBe("ANY");
        expect(slotsFromLegacy(null, null)).toHaveLength(4);
        expect(slotsFromLegacy(9, null)).toHaveLength(4);   // 3자리 상한
    });

    it("옵션 칩은 id 가 겹치지 않고 종목 표시가 있다", () => {
        expect(new Set(JOIN_OPTIONS.map((o) => o.id)).size).toBe(JOIN_OPTIONS.length);
        for (const o of JOIN_OPTIONS) expect(o.types.length).toBeGreaterThan(0);
    });
});

describe("거리", () => {
    it("서울시청 ↔ 부산시청 ≈ 325 km, 같은 점은 0", () => {
        const d = distanceKm(37.5663, 126.9779, 35.1798, 129.0750);
        expect(d).toBeGreaterThan(315);
        expect(d).toBeLessThan(335);
        expect(distanceKm(37.5, 127, 37.5, 127)).toBe(0);
    });

    it("표시 형식", () => {
        expect(formatDistance(0.32)).toBe("300m");
        expect(formatDistance(0.01)).toBe("50m");
        expect(formatDistance(2.34)).toBe("2.3km");
        expect(formatDistance(23.4)).toBe("23km");
        expect(formatDistance(Number.NaN)).toBe("");
    });

    it("한국 밖·뒤바뀐 좌표는 거른다", () => {
        expect(isKoreaCoord(37.5, 127)).toBe(true);
        expect(isKoreaCoord(127, 37.5)).toBe(false);
        expect(isKoreaCoord("37.5", 127)).toBe(false);
        expect(isKoreaCoord(null, null)).toBe(false);
    });
});
