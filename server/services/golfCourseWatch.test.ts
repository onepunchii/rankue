import { describe, it, expect, vi } from "vitest";

// 서비스 파일이 DB·알림 모듈을 임포트한다 — 순수 함수만 시험하므로 빈 껍데기로 막는다.
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../storage/index.js", () => ({ storage: {} }));
vi.mock("./notificationService.js", () => ({ notificationService: {} }));

import {
    isAlertable, matchesWatch, planWatchAlerts, alertText, dayText, seatsLeft, isKstWeekend,
    type WatchListing, type Watcher, type SentHistory,
} from "./golfCourseWatch";

// 2026-09-24(목) 10:00 KST = 01:00Z
const NOW = Date.parse("2026-09-24T01:00:00Z");
/** 한국 시각 문자열 → ISO(UTC) */
const kst = (s: string) => new Date(Date.parse(`${s}+09:00`)).toISOString();

const booking = (over: Partial<WatchListing> = {}): WatchListing => ({
    id: "b1", courseId: "74", listingType: "BOOKING", datetime: kst("2026-09-27T06:34:00"), greenFee: 230000, costMode: null, ...over,
});
const join = (over: Partial<WatchListing> = {}): WatchListing => ({
    id: "j1", courseId: "74", listingType: "JOIN", joinType: "FIELD", costMode: "FIXED", greenFee: 120000,
    datetime: kst("2026-09-27T06:34:00"),
    slots: [{ role: "HOST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "GUEST", gender: "ANY" }],
    ...over,
});

describe("isAlertable", () => {
    it("비공개·가려진·지난·골프장 없는 글은 알리지 않는다", () => {
        expect(isAlertable(booking(), NOW)).toBe(true);
        expect(isAlertable(booking({ isBlind: true }), NOW)).toBe(false);
        expect(isAlertable(booking({ isBlinded: true }), NOW)).toBe(false);
        expect(isAlertable(booking({ datetime: kst("2026-09-24T09:00:00") }), NOW)).toBe(false);
        expect(isAlertable(join({ courseId: "venue" }), NOW)).toBe(false);
    });
});

describe("matchesWatch", () => {
    it("빈 조건은 전부 통과", () => {
        expect(matchesWatch(booking(), {}, NOW)).toBe(true);
        expect(matchesWatch(booking(), null, NOW)).toBe(true);
    });
    it("종류 — 긴급은 조인의 한 갈래", () => {
        const urgent = join({ greenFee: 20000, datetime: kst("2026-09-24T15:00:00") });
        expect(matchesWatch(booking(), { kinds: ["join"] }, NOW)).toBe(false);
        expect(matchesWatch(join(), { kinds: ["join"] }, NOW)).toBe(true);
        expect(matchesWatch(join(), { kinds: ["urgent"] }, NOW)).toBe(false);
        expect(matchesWatch(urgent, { kinds: ["urgent"] }, NOW)).toBe(true);
        expect(matchesWatch(urgent, { kinds: ["join"] }, NOW)).toBe(true);
    });
    it("주중·주말은 한국 날짜로 — 토요일 06:34 KST 는 UTC 로는 금요일", () => {
        const sat = booking({ datetime: kst("2026-09-26T06:34:00") });
        expect(new Date(sat.datetime).getUTCDay()).toBe(5);
        expect(isKstWeekend(sat.datetime)).toBe(true);
        expect(matchesWatch(sat, { days: ["weekend"] }, NOW)).toBe(true);
        expect(matchesWatch(sat, { days: ["weekday"] }, NOW)).toBe(false);
        expect(matchesWatch(booking({ datetime: kst("2026-09-25T06:34:00") }), { days: ["weekday"] }, NOW)).toBe(true);
    });
    it("부 — 1부 ~11시 · 2부 11~15시 · 3부 15시~", () => {
        expect(matchesWatch(booking({ datetime: kst("2026-09-27T10:59:00") }), { parts: ["1"] }, NOW)).toBe(true);
        expect(matchesWatch(booking({ datetime: kst("2026-09-27T11:00:00") }), { parts: ["1"] }, NOW)).toBe(false);
        expect(matchesWatch(booking({ datetime: kst("2026-09-27T16:00:00") }), { parts: ["2", "3"] }, NOW)).toBe(true);
    });
    it("그린피 상한 — 금액 없음·1/N 은 통과", () => {
        expect(matchesWatch(booking({ greenFee: 230000 }), { maxFee: 200000 }, NOW)).toBe(false);
        expect(matchesWatch(booking({ greenFee: 200000 }), { maxFee: 200000 }, NOW)).toBe(true);
        expect(matchesWatch(booking({ greenFee: 0 }), { maxFee: 100000 }, NOW)).toBe(true);
        expect(matchesWatch(booking({ greenFee: null }), { maxFee: 100000 }, NOW)).toBe(true);
        expect(matchesWatch(join({ costMode: "SPLIT", greenFee: 0 }), { maxFee: 100000 }, NOW)).toBe(true);
    });
    it("남은 자리 — 조인만 본다", () => {
        expect(seatsLeft(join())).toBe(2);
        expect(matchesWatch(join(), { minSeats: 2 }, NOW)).toBe(true);
        expect(matchesWatch(join(), { minSeats: 3 }, NOW)).toBe(false);
        expect(matchesWatch(join({ seatsLeft: 3 }), { minSeats: 3 }, NOW)).toBe(true);
        expect(matchesWatch(booking(), { minSeats: 4 }, NOW)).toBe(true);
    });
});

describe("planWatchAlerts", () => {
    const w = (memberId: string, slug = "에이치원클럽", filters: Watcher["filters"] = null): Watcher => ({ memberId, slug, name: "에이치원클럽", filters });
    const none = new Map<string, SentHistory>();

    it("한 번에 여러 글이면 한 사람·한 골프장에 한 통, 이른 티부터", () => {
        const a = booking({ id: "a", datetime: kst("2026-09-28T07:00:00") });
        const b = booking({ id: "b", datetime: kst("2026-09-27T06:00:00") });
        const plan = planWatchAlerts({ listings: [{ slug: "에이치원클럽", listing: a }, { slug: "에이치원클럽", listing: b }], watchers: [w("m1")], history: none, nowMs: NOW });
        expect(plan).toHaveLength(1);
        expect(plan[0].listings.map((l) => l.id)).toEqual(["b", "a"]);
    });
    it("조건에 맞는 글만 담고, 하나도 없으면 안 보낸다", () => {
        const plan = planWatchAlerts({
            listings: [{ slug: "에이치원클럽", listing: booking() }, { slug: "에이치원클럽", listing: join() }],
            watchers: [w("m1", "에이치원클럽", { kinds: ["join"] }), w("m2", "에이치원클럽", { maxFee: 50000 })],
            history: none, nowMs: NOW,
        });
        expect(plan).toHaveLength(1);
        expect(plan[0].memberId).toBe("m1");
        expect(plan[0].listings.map((l) => l.id)).toEqual(["j1"]);
    });
    it("비공개 글은 빠진다", () => {
        const plan = planWatchAlerts({ listings: [{ slug: "에이치원클럽", listing: booking({ isBlind: true }) }], watchers: [w("m1")], history: none, nowMs: NOW });
        expect(plan).toHaveLength(0);
    });
    it("20분 안에 같은 골프장으로 울린 적이 있으면 알림함에만(버리지 않는다) — 다른 골프장은 울린다", () => {
        const history = new Map<string, SentHistory>([["m1", { today: 1, recentSlugs: new Set(["에이치원클럽"]) }]]);
        const plan = planWatchAlerts({
            listings: [{ slug: "에이치원클럽", listing: booking() }, { slug: "안양", listing: booking({ id: "x", courseId: "5" }) }],
            watchers: [w("m1"), w("m1", "안양")], history, nowMs: NOW,
        });
        expect(plan.map((p) => [p.slug, p.push])).toEqual(expect.arrayContaining([["에이치원클럽", false], ["안양", true]]));
        expect(plan).toHaveLength(2);
    });
    it("방금 긴급 방송 푸시를 받은 사람은 두 번 울리지 않는다", () => {
        const plan = planWatchAlerts({ listings: [{ slug: "에이치원클럽", listing: join() }], watchers: [w("m1"), w("m2")], history: none, nowMs: NOW, silent: new Set(["m1"]) });
        expect(plan.find((p) => p.memberId === "m1")?.push).toBe(false);
        expect(plan.find((p) => p.memberId === "m2")?.push).toBe(true);
    });
    it("하루 상한 — 남은 만큼만, 이른 티가 든 골프장부터", () => {
        const history = new Map<string, SentHistory>([["m1", { today: 19, recentSlugs: new Set() }]]);
        const plan = planWatchAlerts({
            listings: [
                { slug: "늦은곳", listing: booking({ id: "late", courseId: "1", datetime: kst("2026-09-30T07:00:00") }) },
                { slug: "이른곳", listing: booking({ id: "early", courseId: "2", datetime: kst("2026-09-25T07:00:00") }) },
            ],
            watchers: [w("m1", "늦은곳"), w("m1", "이른곳")], history, nowMs: NOW,
        });
        // 상한을 넘은 곳도 알림함엔 남는다 — 울리는 건 이른 티가 든 골프장부터 남은 만큼만
        expect(plan.map((p) => [p.slug, p.push])).toEqual([["이른곳", true], ["늦은곳", false]]);
        const full = planWatchAlerts({ listings: [{ slug: "이른곳", listing: booking() }], watchers: [w("m1", "이른곳")], history: new Map([["m1", { today: 20, recentSlugs: new Set<string>() }]]), nowMs: NOW });
        expect(full.map((p) => p.push)).toEqual([false]);
    });
});

describe("alertText", () => {
    it("한 건 — 조인", () => {
        const t = alertText({ memberId: "m", slug: "에이치원클럽", name: "에이치원클럽", listings: [join()] }, NOW);
        expect(t.title).toBe("⛳ 에이치원클럽 조인 자리가 났어요");
        expect(t.body).toBe("9/27(일) 1부 06:34 · 조인 2자리 · 12만원");
        expect(t.url).toBe("/golf/booking-list/j1?date=2026-09-27&view=JOIN");
    });
    it("한 건 — 부킹 티타임·1/N('취소티' 는 한 뜻으로만 — 검색어일 뿐 알림 말이 아니다)", () => {
        const t = alertText({ memberId: "m", slug: "s", name: "안양CC", listings: [booking({ datetime: kst("2026-09-25T13:10:00") })] }, NOW);
        expect(t.title).toBe("⛳ 안양CC 부킹 티타임이 나왔어요");
        expect(t.body).toBe("내일 2부 13:10 · 부킹 · 23만원");
        expect(t.url).toBe("/golf/booking-list/b1?date=2026-09-25&view=BOOKING");
        const s = alertText({ memberId: "m", slug: "s", name: "안양CC", listings: [join({ costMode: "SPLIT", greenFee: 0 })] }, NOW);
        expect(s.body).toBe("9/27(일) 1부 06:34 · 조인 2자리 · 1/N");
    });
    it("한 건 — 긴급", () => {
        const t = alertText({ memberId: "m", slug: "s", name: "안양CC", listings: [join({ greenFee: 20000, datetime: kst("2026-09-24T15:00:00") })] }, NOW);
        expect(t.title).toBe("⛳ 안양CC 긴급 조인이 떴어요");
        expect(t.body).toBe("오늘 3부 15:00 · 조인 2자리 · 2만원");
    });
    it("여러 건 — 골프장 페이지로, 이른 티 셋 + 외 N건 + 최저가", () => {
        const ls = [
            booking({ id: "1", datetime: kst("2026-09-27T06:34:00"), greenFee: 230000 }),
            booking({ id: "2", datetime: kst("2026-09-27T06:41:00"), greenFee: 210000 }),
            booking({ id: "3", datetime: kst("2026-09-28T07:00:00"), greenFee: 250000 }),
            booking({ id: "4", datetime: kst("2026-09-28T07:07:00"), greenFee: 250000 }),
        ];
        const t = alertText({ memberId: "m", slug: "에이치원클럽", name: "에이치원클럽", listings: ls }, NOW);
        expect(t.title).toBe("⛳ 에이치원클럽 티타임 4건이 올라왔어요");
        expect(t.body).toBe("9/27(일) 06:34, 06:41, 9/28(월) 07:00 외 1건 · 최저 21만원");
        expect(t.url).toBe(`/golf/course/${encodeURIComponent("에이치원클럽")}`);
        expect(t.teeAt).toBe(new Date(kst("2026-09-27T06:34:00")).toISOString());
    });
    it("날짜 — 한국 날짜 기준 오늘·내일", () => {
        // 23:30 KST(=14:30Z) 에서 다음날 06:00 은 '내일'
        const late = Date.parse("2026-09-24T14:30:00Z");
        expect(dayText(kst("2026-09-25T06:00:00"), late)).toBe("내일");
        expect(dayText(kst("2026-09-24T23:50:00"), late)).toBe("오늘");
    });
});
