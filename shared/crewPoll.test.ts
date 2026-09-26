import { describe, it, expect } from "vitest";
import { isPollClosed, voterPercent, uniqueLeaderId, normalizePollOptions, checkPollEndTime, POLL_LIMITS } from "./crewPoll.js";
import { countdown, kstEndOfDay, kstInputToDate, dateToKstInput } from "./crewTime.js";

const NOW = Date.UTC(2026, 8, 26, 5, 0); // 2026-09-26 14:00 KST

describe("isPollClosed — endTime 이 정본", () => {
    it("status 가 active 여도 마감 시각이 지나면 닫힘", () => {
        expect(isPollClosed({ status: "active", endTime: new Date(NOW - 1000) }, NOW)).toBe(true);
        expect(isPollClosed({ status: "active", endTime: new Date(NOW + 1000) }, NOW)).toBe(false);
    });
    it("일찍 마감(status closed)은 마감 시각과 무관하게 닫힘", () => {
        expect(isPollClosed({ status: "closed", endTime: new Date(NOW + 86400000) }, NOW)).toBe(true);
    });
    it("마감 없는 옛 투표는 열림, 문자열 시각도 읽는다", () => {
        expect(isPollClosed({ status: "active", endTime: null }, NOW)).toBe(false);
        expect(isPollClosed({ endTime: new Date(NOW - 1).toISOString() }, NOW)).toBe(true);
    });
});

describe("voterPercent — 분모는 투표한 사람 수", () => {
    it("복수 선택: 10명 모두 고른 선택지는 100%", () => {
        expect(voterPercent(10, 10)).toBe(100);
        expect(voterPercent(5, 10)).toBe(50);
    });
    it("0명·0표는 0%", () => {
        expect(voterPercent(0, 0)).toBe(0);
        expect(voterPercent(3, 0)).toBe(0);
    });
});

describe("uniqueLeaderId", () => {
    it("동점이면 1위 없음, 0표도 없음", () => {
        expect(uniqueLeaderId([{ id: "a", voteCount: 2 }, { id: "b", voteCount: 2 }])).toBeNull();
        expect(uniqueLeaderId([{ id: "a", voteCount: 0 }, { id: "b", voteCount: 0 }])).toBeNull();
        expect(uniqueLeaderId([{ id: "a", voteCount: 1 }, { id: "b", voteCount: 3 }, { id: "c", voteCount: 2 }])).toBe("b");
    });
});

describe("normalizePollOptions", () => {
    it("공백 정리·빈 칸 제거", () => {
        expect(normalizePollOptions(["  토요일  ", "", "일요일   저녁"])).toEqual({ ok: true, options: ["토요일", "일요일 저녁"] });
    });
    it("개수 2~10", () => {
        expect(normalizePollOptions(["하나", " "])).toEqual({ ok: false, reason: "count" });
        expect(normalizePollOptions(Array.from({ length: 11 }, (_, i) => `안${i}`))).toEqual({ ok: false, reason: "count" });
        expect(normalizePollOptions("x")).toEqual({ ok: false, reason: "count" });
    });
    it("길이·중복(대소문자 무시)", () => {
        expect(normalizePollOptions(["a".repeat(POLL_LIMITS.optionMax + 1), "b"])).toEqual({ ok: false, reason: "tooLong" });
        expect(normalizePollOptions(["Yes", "yes"])).toEqual({ ok: false, reason: "duplicate" });
    });
});

describe("checkPollEndTime", () => {
    it("지난 시각·너무 먼 시각·틀린 형식 거절", () => {
        expect(checkPollEndTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toEqual({ ok: false, reason: "past" });
        expect(checkPollEndTime(new Date(NOW + 61 * 86400000).toISOString(), NOW)).toEqual({ ok: false, reason: "tooFar" });
        expect(checkPollEndTime("not a date", NOW)).toEqual({ ok: false, reason: "invalid" });
    });
    it("없으면 마감 없는 투표로 허용", () => {
        expect(checkPollEndTime(undefined, NOW)).toEqual({ ok: true, endTime: null });
    });
});

describe("KST 마감 기본값", () => {
    it("n일 뒤 23:59 KST", () => {
        const d = kstEndOfDay(NOW, 3);
        expect(d.toISOString()).toBe("2026-09-29T14:59:00.000Z");
        expect(dateToKstInput(d)).toEqual({ date: "2026-09-29", time: "23:59" });
    });
    it("KST 자정 직후(UTC 로는 전날)에도 KST 날짜 기준", () => {
        const justAfterMidnightKst = Date.UTC(2026, 8, 26, 15, 30); // 09-27 00:30 KST
        expect(kstEndOfDay(justAfterMidnightKst, 0).toISOString()).toBe("2026-09-27T14:59:00.000Z");
    });
    it("입력칸 값 ↔ 시각 왕복, 없는 날짜는 null", () => {
        expect(kstInputToDate("2026-10-01", "09:30")?.toISOString()).toBe("2026-10-01T00:30:00.000Z");
        expect(kstInputToDate("2026-02-31", "09:30")).toBeNull();
        expect(kstInputToDate("2026-10-01", "")).toBeNull();
    });
});

describe("countdown", () => {
    it("일·시간·분(올림)", () => {
        expect(countdown(NOW + (26 * 60 + 5) * 60_000, NOW)).toEqual({ closed: false, days: 1, hours: 2, minutes: 5 });
        expect(countdown(NOW + 30_000, NOW)).toEqual({ closed: false, days: 0, hours: 0, minutes: 1 });
    });
    it("지나면 closed, 없으면 null", () => {
        expect(countdown(NOW, NOW)?.closed).toBe(true);
        expect(countdown(null, NOW)).toBeNull();
    });
});
