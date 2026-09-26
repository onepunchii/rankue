import { describe, it, expect } from "vitest";
import { kstDayDiff, meetupDday, meetupRsvp, nextMeetup } from "./crewChat";

describe("크루 채팅 정모 띠·카드", () => {
    const now = Date.parse("2026-09-26T05:00:00Z"); // KST 14:00
    it("한국 날짜로 며칠 뒤", () => {
        expect(kstDayDiff("2026-09-26T14:00:00Z", now)).toBe(0);  // KST 23:00 같은 날
        expect(kstDayDiff("2026-09-26T15:30:00Z", now)).toBe(1);  // KST 다음날 00:30
        expect(kstDayDiff("2026-09-29T10:00:00Z", now)).toBe(3);
        expect(kstDayDiff(null, now)).toBeNull();
        expect(kstDayDiff("nope", now)).toBeNull();
    });
    it("D-day — 오늘·진행 중은 today", () => {
        expect(meetupDday("2026-09-26T10:00:00Z", now)).toEqual({ kind: "today" });
        expect(meetupDday("2026-09-26T03:00:00Z", now)).toEqual({ kind: "today" });
        expect(meetupDday("2026-09-29T10:00:00Z", now)).toEqual({ kind: "dday", n: 3 });
    });
    it("참석 수는 joined 만, 정원 없음은 마감 없음", () => {
        const a = { id: "a", activityDate: "2026-09-29T10:00:00Z", maxParticipants: 2, participants: [{ memberId: "m1", status: "joined" }, { memberId: "m2", status: "waiting" }] };
        const at = new Date(now);
        expect(meetupRsvp(a, "m1", at)).toMatchObject({ count: 1, cap: 2, joined: true, full: false, phase: "upcoming" });
        expect(meetupRsvp({ ...a, participants: [...a.participants, { memberId: "m3", status: "joined" }] }, "m9", at)).toMatchObject({ count: 2, full: true, joined: false });
        expect(meetupRsvp({ ...a, maxParticipants: null }, null, at)).toMatchObject({ cap: null, full: false });
    });
    it("띠에는 지나지 않은 것 중 가장 이른 정모", () => {
        const at = new Date(now);
        const list = [
            { id: "late", activityDate: "2026-10-03T10:00:00Z" },
            { id: "past", activityDate: "2026-09-25T10:00:00Z" },
            { id: "ongoing", activityDate: "2026-09-26T03:00:00Z" }, // 2시간 전 시작 — 진행 중
            { id: "soon", activityDate: "2026-09-28T10:00:00Z" },
        ];
        expect(nextMeetup(list, at)?.id).toBe("ongoing");
        expect(nextMeetup(list.filter((a) => a.id !== "ongoing"), at)?.id).toBe("soon");
        expect(nextMeetup([], at)).toBeNull();
        expect(nextMeetup(undefined, at)).toBeNull();
    });
});
