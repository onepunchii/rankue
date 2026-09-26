import { describe, it, expect } from "vitest";
import { crewSeed, crewColors, crewInitial, coverBalls, daysTogether, meetupWhen, crewPopularity, CREW_PALETTE } from "./crewBrand";

describe("크루 자동 브랜드", () => {
    it("같은 크루는 늘 같은 색·같은 공 배치", () => {
        expect(crewSeed("abc")).toBe(crewSeed("abc"));
        expect(crewColors("c1")).toEqual(crewColors("c1"));
        expect(coverBalls("c1")).toEqual(coverBalls("c1"));
    });
    it("여러 크루가 팔레트의 여러 색으로 흩어진다", () => {
        const used = new Set(Array.from({ length: 40 }, (_, i) => crewColors(`crew-${i}`)[0]));
        expect(used.size).toBeGreaterThanOrEqual(5);
        expect(used.size).toBeLessThanOrEqual(CREW_PALETTE.length);
    });
    it("공 셋은 오른쪽 영역 안에, 서로 겹치지 않게", () => {
        for (let i = 0; i < 30; i++) {
            const balls = coverBalls(`x${i}`);
            expect(balls.map((b) => b.id)).toEqual(["red", "yellow", "white"]);
            for (const b of balls) {
                expect(b.x).toBeGreaterThanOrEqual(0.45);
                expect(b.x).toBeLessThanOrEqual(0.92);
                expect(b.y).toBeGreaterThanOrEqual(0.28);
                expect(b.y).toBeLessThanOrEqual(0.83);
            }
        }
    });
    it("첫 글자·함께한 날", () => {
        expect(crewInitial(" 불꽃 크루")).toBe("불");
        expect(crewInitial("abc")).toBe("A");
        expect(crewInitial("")).toBe("?");
        const now = Date.parse("2026-09-26T00:00:00Z");
        expect(daysTogether("2026-09-26T00:00:00Z", now)).toBe(1);
        expect(daysTogether("2026-09-16T00:00:00Z", now)).toBe(11);
        expect(daysTogether(null, now)).toBeNull();
        expect(daysTogether("2027-01-01", now)).toBeNull();
    });
});

describe("다음 정모 한 낱말·인기 점수", () => {
    const now = Date.parse("2026-09-26T05:00:00Z"); // KST 14:00
    it("오늘·내일은 KST 날짜로, 그 뒤는 월/일, 7일 넘으면 없음", () => {
        expect(meetupWhen("2026-09-26T12:00:00Z", now)?.kind).toBe("today");      // KST 21:00 같은 날
        expect(meetupWhen("2026-09-26T16:00:00Z", now)?.kind).toBe("tomorrow");   // KST 다음날 01:00
        expect(meetupWhen("2026-09-30T11:00:00Z", now)).toEqual({ kind: "date", month: 9, day: 30 });
        expect(meetupWhen("2026-10-10T11:00:00Z", now)).toBeNull();
        expect(meetupWhen(null, now)).toBeNull();
        expect(meetupWhen("2026-09-26T04:00:00Z", now)?.kind).toBe("today");      // 한 시간 전 시작 — 진행 중
    });
    it("정모가 많은 크루가 인원만 많은 크루보다 앞", () => {
        expect(crewPopularity({ memberCount: 10, pulse: { activities30: 4, upcomingWeek: true } }))
            .toBeGreaterThan(crewPopularity({ memberCount: 40, pulse: { activities30: 0 } }));
        expect(crewPopularity({ memberCount: 5 })).toBe(2.5);
    });
});
