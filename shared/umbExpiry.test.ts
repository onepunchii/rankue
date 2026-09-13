import { describe, it, expect } from "vitest";
import { eventDateOf, expiringEvents, projectedRank, EXPIRY_DAYS } from "./umbExpiry.js";

describe("eventDateOf", () => {
    it("월드컵 라벨 끝의 ISO 날짜", () => {
        expect(eventDateOf("UMB / CEB World Cup - PORTO (PT) 2026-07-18")?.toISOString()).toBe("2026-07-18T00:00:00.000Z");
    });
    it("세계선수권의 '14/18 Oct. 2025' 는 마지막 날", () => {
        expect(eventDateOf("UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)")?.toISOString()).toBe("2025-10-18T00:00:00.000Z");
    });
    it("날짜가 없으면 null — 대륙·국가선수권", () => {
        expect(eventDateOf("Confederal Championships")).toBeNull();
        expect(eventDateOf("National Championships 2024 / 2025")).toBeNull();
    });
});

describe("expiringEvents", () => {
    const labels = new Map([
        ["A", "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12"],   // +395일 = 2026-11-11
        ["B", "UMB / CEB World Cup - PORTO (PT) 2026-07-18"],     // +395일 = 2027-08-17 (지평선 밖)
        ["C", "Confederal Championships"],                       // 날짜 없음
        ["D", "UMB / ACBC World Cup - GWANGJU (KR) 2025-11-09"],  // +395일 = 2026-12-09
    ]);
    const now = new Date("2026-09-13T00:00:00Z");
    it("빠지는 순서로, 누적 잔여 포인트와 함께", () => {
        const rows = expiringEvents({ A: 26, B: 26, C: 80, D: 18 }, labels, 150, 180, now);
        expect(rows.map((r) => r.colKey)).toEqual(["A", "D"]);
        expect(rows[0].expiresAround.slice(0, 10)).toBe("2026-11-11");
        expect(rows.map((r) => r.pointsAfter)).toEqual([124, 106]);
    });
    it("지평선 밖·날짜 없음·패널티는 뺀다", () => {
        expect(expiringEvents({ B: 26, C: 80, M: -16 }, labels, 90, 180, now)).toEqual([]);
    });
    it("예상 시점을 이미 넘긴 것도 넣는다 — 곧 빠진다는 뜻", () => {
        const old = new Map([["Z", "UMB / CEB World Cup - VEGHEL (NL) 2024-10-26"]]);
        expect(expiringEvents({ Z: 8 }, old, 8, 180, now)).toHaveLength(1);
    });
    it("중앙값 395일을 쓴다", () => { expect(EXPIRY_DAYS).toBe(395); });
});

describe("projectedRank", () => {
    it("나보다 점수가 큰 사람 수 + 1", () => {
        expect(projectedRank(100, [499, 239, 101, 89, 100])).toBe(4);   // 동점은 위로 치지 않는다
        expect(projectedRank(600, [499, 239])).toBe(1);
        expect(projectedRank(0, [])).toBe(1);
    });
});
