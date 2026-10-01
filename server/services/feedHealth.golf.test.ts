// 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자" — 골프 랭킹 수집 판정(화면·알림 공용).
import { describe, it, expect } from "vitest";
import {
    judgeGolfFeed, isGolfTourSeason, golfEditionLimitDays, summarize,
    GOLF_SYNC_LIMIT_HOURS, GOLF_WORLD_LIMIT_DAYS, GOLF_TOUR_LIMIT_DAYS, type GolfFeedRow,
} from "./feedHealth";

const H = 3_600_000, D = 86_400_000;
const NOW = Date.parse("2026-10-01T08:30:00Z");   // 한국 10/1 17:30
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const row = (over: Partial<GolfFeedRow> = {}): GolfFeedRow => ({
    tour: "owgr", edition: "2026-09-27", ingestedAt: ago(2.5 * D), lastSyncAt: ago(11 * H), ...over,
});

describe("골프 랭킹 수집 판정", () => {
    it("최근에 들어왔고 어젯밤 수집도 됐으면 정상", () => {
        const h = judgeGolfFeed(row(), NOW);
        expect(h.state).toBe("ok");
        expect(h.alert).toBe(false);
        expect(h.limitDays).toBe(GOLF_WORLD_LIMIT_DAYS);
        expect(h.editionAgeDays).toBe(2.5);
        expect(h.syncAgeHours).toBe(11);
        expect(h.reason).toBe("");
        expect(h.detail).toContain("2026-09-27");
    });

    it("세계 랭킹: 새 회차가 9일을 넘으면 늦음 + 알림 대상(딱 9일은 아직 정상)", () => {
        expect(judgeGolfFeed(row({ ingestedAt: ago(9 * D) }), NOW).state).toBe("ok");
        const late = judgeGolfFeed(row({ ingestedAt: ago(9.2 * D) }), NOW);
        expect(late.state).toBe("late");
        expect(late.alert).toBe(true);
        expect(late.reason).toBe(`새 회차가 ${GOLF_WORLD_LIMIT_DAYS}일 넘게 없음`);
        expect(late.detail).toContain("9일째");
        expect(late.detail).toContain("2026-09-27");   // 알림 본문엔 회차까지
        expect(judgeGolfFeed(row({ tour: "rolex", ingestedAt: ago(12 * D) }), NOW).alert).toBe(true);
    });

    it("롤렉스는 회차 라벨이 미래여도(다음 주 월요일) 들어온 때로 잰다", () => {
        const h = judgeGolfFeed(row({ tour: "rolex", edition: "2026-10-05", ingestedAt: ago(2.5 * D) }), NOW);
        expect(h.state).toBe("ok");
        expect(h.editionAgeDays).toBe(2.5);
    });

    it("투어 랭킹: 시즌엔 16일 넘으면 늦음이지만 알림은 안 보낸다(대회 일정 탓이 흔하다)", () => {
        expect(judgeGolfFeed(row({ tour: "kpga", ingestedAt: ago(10.4 * D) }), NOW).state).toBe("ok");
        const late = judgeGolfFeed(row({ tour: "klpga", ingestedAt: ago(17 * D) }), NOW);
        expect(late.limitDays).toBe(GOLF_TOUR_LIMIT_DAYS);
        expect(late.state).toBe("late");
        expect(late.alert).toBe(false);
    });

    it("투어 랭킹: 비시즌(12~3월)엔 회차 날짜를 재지 않는다", () => {
        const jan = Date.parse("2027-01-20T03:00:00Z");
        const h = judgeGolfFeed({ tour: "kpga", edition: "2026-11-09", ingestedAt: new Date(jan - 70 * D).toISOString(), lastSyncAt: new Date(jan - 10 * H).toISOString() }, jan);
        expect(h.limitDays).toBeNull();
        expect(h.state).toBe("ok");
        // 세계 랭킹은 비시즌이 없다
        expect(golfEditionLimitDays("owgr", jan)).toBe(GOLF_WORLD_LIMIT_DAYS);
    });

    it("마지막 수집이 30시간을 넘으면 멈춤 — 늦음보다 먼저, 투어 랭킹도 알림 대상", () => {
        const h = judgeGolfFeed(row({ tour: "kpga", lastSyncAt: ago(31 * H), ingestedAt: ago(20 * D) }), NOW);
        expect(h.state).toBe("stopped");
        expect(h.alert).toBe(true);
        expect(h.detail).toContain("31시간");
        expect(h.detail).toContain(`${GOLF_SYNC_LIMIT_HOURS}시간`);
        expect(h.reason).toBe(`${GOLF_SYNC_LIMIT_HOURS}시간 넘게 수집이 안 됨`);
        expect(judgeGolfFeed(row({ lastSyncAt: ago(30 * H) }), NOW).state).toBe("ok");
        expect(judgeGolfFeed(row({ lastSyncAt: ago(3.5 * D) }), NOW).detail).toContain("3일");
    });

    it("기록이 없으면 멈춤", () => {
        expect(judgeGolfFeed(row({ edition: null, ingestedAt: null }), NOW)).toMatchObject({ state: "stopped", alert: true, reason: "회차가 하나도 없음", detail: "회차가 하나도 없음" });
        expect(judgeGolfFeed(row({ lastSyncAt: null }), NOW)).toMatchObject({ state: "stopped", reason: "수집 기록 없음", detail: "수집 기록 없음" });
        expect(judgeGolfFeed(row({ lastSyncAt: "말도 안 되는 값" }), NOW).state).toBe("stopped");
    });

    it("시즌 경계는 한국 날짜로 — 4/1 0시에 시작, 12/1 0시에 끝", () => {
        expect(isGolfTourSeason(Date.parse("2026-03-31T14:59:59Z"))).toBe(false);   // 한국 3/31 23:59
        expect(isGolfTourSeason(Date.parse("2026-03-31T15:00:00Z"))).toBe(true);    // 한국 4/1 0:00
        expect(isGolfTourSeason(Date.parse("2026-11-30T14:59:59Z"))).toBe(true);    // 한국 11/30 23:59
        expect(isGolfTourSeason(Date.parse("2026-11-30T15:00:00Z"))).toBe(false);   // 한국 12/1 0:00
    });

    it("알림 요약에 골프가 같은 꼴로 실린다", () => {
        expect(summarize([{ feed: "golf", scope: "owgr", kind: "source-error", detail: "마지막 수집 2일 전(기준 30시간)" }]))
            .toBe("GOLF owgr: 출처 오류(마지막 수집 2일 전(기준 30시간))");
    });
});
