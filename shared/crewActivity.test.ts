import { describe, it, expect } from "vitest";
import {
    ACTIVITY_ONGOING_HOURS, upcomingActivityCutoff, activityPhase, activityCapacity, isActivityFull,
    activityCategoryLabelKey, splitTourTrailer, tourEndDate, withTourTrailer, isPollClosed, kstShortDateTime,
} from "./crewActivity";

const NOW = new Date("2026-09-26T10:00:00.000Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3600_000);

describe("정모 진행 창", () => {
    it("시작 전은 다가오는, 시작 뒤 창 안은 진행 중, 그 뒤는 지난", () => {
        expect(activityPhase(h(1), NOW)).toBe("upcoming");
        expect(activityPhase(h(-1), NOW)).toBe("ongoing");
        expect(activityPhase(h(-(ACTIVITY_ONGOING_HOURS - 0.01)), NOW)).toBe("ongoing");
        expect(activityPhase(h(-ACTIVITY_ONGOING_HOURS), NOW)).toBe("past");
        expect(activityPhase(h(-48), NOW)).toBe("past");
        expect(activityPhase(null, NOW)).toBe("upcoming");
    });

    it("서버 목록 기준 시각 = 지금 − 창", () => {
        expect(upcomingActivityCutoff(NOW).toISOString()).toBe(h(-ACTIVITY_ONGOING_HOURS).toISOString());
    });

    it("정원 null·0 은 제한 없음 — 서버(999)와 같은 뜻", () => {
        expect(activityCapacity(null)).toBeNull();
        expect(activityCapacity(0)).toBeNull();
        expect(activityCapacity("8")).toBe(8);
        expect(isActivityFull(50, null)).toBe(false);
        expect(isActivityFull(8, 8)).toBe(true);
        expect(isActivityFull(7, 8)).toBe(false);
    });

    it("종류 라벨 키", () => {
        expect(activityCategoryLabelKey("GOLF_TOUR")).toBe("categorySelector.golfTour");
        expect(activityCategoryLabelKey("REGULAR_BILLIARDS")).toBe("billiardsCategorySelector.regularLabel");
        expect(activityCategoryLabelKey(null)).toBeNull();
        expect(activityCategoryLabelKey("UNKNOWN")).toBeNull();
    });
});

describe("투어 종료일 꼬리", () => {
    it("꼬리를 떼고 종료일을 읽는다(옛 이모지 라벨 포함)", () => {
        expect(splitTourTrailer("제주 2박3일\n\n---\n📅 일정: 10/3 ~ 10/5")).toEqual({ body: "제주 2박3일", endMonth: 10, endDay: 5 });
        expect(splitTourTrailer("Trip\n\n---\nSchedule: 12/30 ~ 1/2")).toEqual({ body: "Trip", endMonth: 1, endDay: 2 });
        expect(splitTourTrailer("그냥 메모")).toEqual({ body: "그냥 메모", endMonth: null, endDay: null });
        expect(splitTourTrailer(null)).toEqual({ body: "", endMonth: null, endDay: null });
    });

    it("예전 버그로 여러 번 붙은 꼬리도 전부 뗀다", () => {
        const stacked = "메모\n\n---\n📅 일정: 10/3 ~ 10/4\n\n---\n📅 일정: 10/3 ~ 10/5";
        expect(splitTourTrailer(stacked)).toEqual({ body: "메모", endMonth: 10, endDay: 5 });
    });

    it("해를 넘기는 투어는 다음 해", () => {
        const start = new Date(2026, 11, 30);
        expect(tourEndDate(start, 1, 2)?.getFullYear()).toBe(2027);
        expect(tourEndDate(new Date(2026, 9, 3), 10, 5)?.getDate()).toBe(5);
        expect(tourEndDate(start, null, null)).toBeUndefined();
    });

    it("저장할 땐 꼬리를 한 번만 붙인다", () => {
        const start = new Date(2026, 9, 3);
        const end = new Date(2026, 9, 5);
        const once = withTourTrailer("메모", "일정", start, end);
        expect(once).toBe("메모\n\n---\n일정 10/3 ~ 10/5");
        expect(withTourTrailer(once, "일정", start, end)).toBe(once);
        expect(withTourTrailer(once, "일정", start, undefined)).toBe("메모");
        expect(withTourTrailer("", "일정", start, end)).toBe("---\n일정 10/3 ~ 10/5");
    });
});

describe("투표 마감", () => {
    it("isClosed 를 먼저 믿고, 없으면 마감 시각", () => {
        expect(isPollClosed({ isClosed: true, endTime: h(5) }, NOW)).toBe(true);
        expect(isPollClosed({ endTime: h(-1), status: "active" }, NOW)).toBe(true);
        expect(isPollClosed({ endTime: h(1), status: "active" }, NOW)).toBe(false);
        expect(isPollClosed({ status: "active" }, NOW)).toBe(false);
        expect(isPollClosed(null, NOW)).toBe(false);
    });
});

describe("알림 시각", () => {
    it("한국 시각 M/d HH:mm", () => {
        expect(kstShortDateTime("2026-09-26T10:30:00.000Z")).toBe("9/26 19:30");
        expect(kstShortDateTime("2026-09-26T15:05:00.000Z")).toBe("9/27 00:05");
        expect(kstShortDateTime(null)).toBe("");
    });
});
