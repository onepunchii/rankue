import { describe, expect, it } from "vitest";
import {
    ONSITE_MAX_ACCURACY_M, countsOnSite, distanceBucket, haversineKm, judgeCheckin, roundTooFast, sessionOnSite,
} from "./golfOnSite";

// 골프장(가상) — 위도만 움직이면 거리 = 6371km × 라디안 차이(자오선 위라 정확하다)
const course = { lat: 37.2, lng: 127.3 };
const kmNorth = (km: number) => ({ lat: course.lat + (km / 6371) * (180 / Math.PI), lng: course.lng });

describe("judgeCheckin — 위치 한 번", () => {
    it("2km 경계: 1.999km 는 현장, 2.001km 는 아니다", () => {
        expect(haversineKm(course, kmNorth(1.999))).toBeCloseTo(1.999, 6);
        expect(judgeCheckin(kmNorth(1.999), course)).toEqual({ verified: true, bucket: "<2km", reason: "ok" });
        expect(judgeCheckin(kmNorth(2.001), course)).toEqual({ verified: false, bucket: "2-10km", reason: "far" });
    });
    it("정확히 2km 는 현장 쪽(경계 포함)", () => {
        expect(distanceBucket(2)).toBe("<2km");
        expect(distanceBucket(2.0000001)).toBe("2-10km");
        expect(distanceBucket(10)).toBe("2-10km");
        expect(distanceBucket(10.5)).toBe(">10km");
    });
    it("먼 곳은 구간만 남긴다(좌표 없음)", () => {
        const r = judgeCheckin(kmNorth(42), course);
        expect(r).toEqual({ verified: false, bucket: ">10km", reason: "far" });
        expect(Object.keys(r)).not.toContain("lat");
    });
    it("골프장 좌표가 없으면 인증할 수 없다", () => {
        expect(judgeCheckin(kmNorth(0.1), null)).toEqual({ verified: false, bucket: "no-course", reason: "no-course" });
    });
    it("위치를 못 잡으면 no-fix", () => {
        expect(judgeCheckin(null, course)).toEqual({ verified: false, bucket: "no-fix", reason: "no-fix" });
    });
    it("흐린 위치(IP 위치 등)는 골프장 옆이라도 판단하지 않는다 — 휴대폰 대략적 위치는 통과", () => {
        expect(judgeCheckin({ ...kmNorth(0.5), accuracy: ONSITE_MAX_ACCURACY_M + 1 }, course)).toEqual({ verified: false, bucket: "no-fix", reason: "coarse" });
        expect(judgeCheckin({ ...kmNorth(0.5), accuracy: 2000 }, course).verified).toBe(true);
        expect(judgeCheckin({ ...kmNorth(0.5), accuracy: null }, course).verified).toBe(true);
    });
});

describe("roundTooFast — 30분 규칙", () => {
    const start = new Date("2026-10-01T00:00:00Z");
    it("시작 29분 59초 만에 18홀을 다 적으면 너무 빠르다", () => {
        expect(roundTooFast(start, new Date(start.getTime() + 29 * 60_000 + 59_000))).toBe(true);
    });
    it("30분이면 통과", () => {
        expect(roundTooFast(start, new Date(start.getTime() + 30 * 60_000))).toBe(false);
        expect(roundTooFast(start.toISOString(), new Date(start.getTime() + 4 * 3600_000).toISOString())).toBe(false);
    });
    it("시각을 모르면 판단하지 않는다", () => {
        expect(roundTooFast(null, start)).toBe(false);
        expect(roundTooFast(start, null)).toBe(false);
        expect(roundTooFast("엉뚱한 값", start)).toBe(false);
    });
});

describe("sessionOnSite — 경기 한 판", () => {
    const start = "2026-10-01T00:00:00Z";
    const slow = "2026-10-01T04:10:00Z"; // 4시간 10분
    const base = { memberIds: ["host", "friend"], courseKnown: true, startedAt: start, holesDoneAt: slow };

    it("동반자 규칙: 한 명만 현장이면 참가자 전원 인증", () => {
        const v = sessionOnSite({ ...base, checkins: [
            { memberId: "host", verified: false, bucket: "no-fix" },
            { memberId: "friend", verified: true, bucket: "<2km" },
        ] });
        expect(v).toEqual({ onSite: true, reason: "ok" });
    });
    it("경기에 없는 번호의 확인은 세지 않는다", () => {
        const v = sessionOnSite({ ...base, checkins: [{ memberId: "stranger", verified: true, bucket: "<2km" }] });
        expect(v).toEqual({ onSite: false, reason: "no-checkin" });
    });
    it("30분 규칙: 현장이어도 18홀을 30분 안에 다 적으면 인증하지 않는다", () => {
        const v = sessionOnSite({ ...base, holesDoneAt: "2026-10-01T00:12:00Z", checkins: [{ memberId: "host", verified: true, bucket: "<2km" }] });
        expect(v).toEqual({ onSite: false, reason: "too-fast" });
    });
    it("골프장 좌표가 없는 곳은 확인이 있어도 기록 도장", () => {
        const v = sessionOnSite({ ...base, courseKnown: false, checkins: [{ memberId: "host", verified: true, bucket: "<2km" }] });
        expect(v).toEqual({ onSite: false, reason: "no-course" });
    });
    it("이유: 확인 없음 · 멀었음 · 위치 못 잡음", () => {
        expect(sessionOnSite({ ...base, checkins: [] }).reason).toBe("no-checkin");
        expect(sessionOnSite({ ...base, checkins: [{ memberId: "host", verified: false, bucket: ">10km" }] }).reason).toBe("far");
        expect(sessionOnSite({ ...base, checkins: [{ memberId: "host", verified: false, bucket: "no-fix" }] }).reason).toBe("no-fix");
    });
});

describe("countsOnSite — 도장을 세는 기록인가", () => {
    it("옛 기록(NULL·필드 없음)은 인증으로 센다 — 오늘 이전 도장은 그대로", () => {
        expect(countsOnSite(null)).toBe(true);
        expect(countsOnSite(undefined)).toBe(true);
    });
    it("현장 인증은 세고, 인증 안 된 기록(false)만 뺀다", () => {
        expect(countsOnSite(true)).toBe(true);
        expect(countsOnSite(false)).toBe(false);
    });
});
