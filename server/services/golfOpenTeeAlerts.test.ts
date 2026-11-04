import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 서비스 파일이 DB·알림 모듈을 임포트한다 — 순수 함수만 시험하므로 빈 껍데기로 막는다.
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../storage/index.js", () => ({ storage: {} }));
vi.mock("./notificationService.js", () => ({ notificationService: {} }));

import { OPEN_TEE_FRESH_MS, OPEN_TEE_GAP_MIN, matchesOpenTee, openTeeAlertText, planOpenTeeAlerts, type FreshTee, type OpenTeeWatcher } from "./golfOpenTeeAlerts";

// 2026-11-05(목) 10:00 KST = 01:00Z
const NOW = Date.parse("2026-11-05T01:00:00Z");
const MIN = 60_000;
const tee = (over: Partial<FreshTee> = {}): FreshTee => ({ slug: "블루원용인CC", day: "2026-11-07", time: "07:12", course: "레이크", price: 150000, firstSeenMs: NOW - 10 * MIN, ...over });
const w = (over: Partial<OpenTeeWatcher> = {}): OpenTeeWatcher => ({ memberId: "m1", slug: "블루원용인CC", name: "블루원용인CC", filters: null, ...over });
const plan = (tees: FreshTee[], watchers: OpenTeeWatcher[], last: [string, number][] = [], pushed: [string, number][] = []) =>
    planOpenTeeAlerts({ tees, watchers, lastAlertMs: new Map(last), todayPushed: new Map(pushed), nowMs: NOW });

describe("관심 조건 — 남은 티는 부킹이다", () => {
    it("종류: 빈 조건 · 부킹 · 긴급·취소티는 받고, 조인만 고른 사람은 받지 않는다", () => {
        expect(matchesOpenTee(tee(), null, NOW)).toBe(true);
        expect(matchesOpenTee(tee(), { kinds: ["booking"] }, NOW)).toBe(true);
        expect(matchesOpenTee(tee(), { kinds: ["urgent"] }, NOW)).toBe(true);
        expect(matchesOpenTee(tee(), { kinds: ["join"] }, NOW)).toBe(false);
    });
    it("주중/주말 · 부 · 그린피 상한은 관심 알림의 판정 그대로(11/7 은 토요일, 07:12 는 1부)", () => {
        expect(matchesOpenTee(tee(), { days: ["weekend"] }, NOW)).toBe(true);
        expect(matchesOpenTee(tee(), { days: ["weekday"] }, NOW)).toBe(false);
        expect(matchesOpenTee(tee(), { parts: ["1"] }, NOW)).toBe(true);
        expect(matchesOpenTee(tee(), { parts: ["3"] }, NOW)).toBe(false);
        expect(matchesOpenTee(tee(), { maxFee: 120000 }, NOW)).toBe(false);
        expect(matchesOpenTee(tee({ price: null }), { maxFee: 120000 }, NOW)).toBe(true);
    });
});

describe("누구에게 — 한 사람 · 한 골프장 세 시간에 한 통, 그 사이 티는 다음 통에", () => {
    it("관심 등록한 사람에게 그 골프장의 새 티를 이른 순으로 묶어 한 통", () => {
        const out = plan([tee({ time: "09:00" }), tee({ time: "07:12" }), tee({ slug: "다른CC" })], [w(), w({ memberId: "m2" })]);
        expect(out).toHaveLength(2);
        expect(out[0].tees.map((t) => t.time)).toEqual(["07:12", "09:00"]);
        expect(out.every((a) => a.push)).toBe(true);
    });
    it("세 시간 안에 받았으면 건너뛰고, 지난 알림 뒤에 처음 본 티만 싣는다", () => {
        expect(plan([tee()], [w()], [["m1|블루원용인CC", NOW - (OPEN_TEE_GAP_MIN - 1) * MIN]])).toEqual([]);
        const out = plan([tee({ time: "07:12", firstSeenMs: NOW - 200 * MIN }), tee({ time: "08:00", firstSeenMs: NOW - 30 * MIN })], [w()], [["m1|블루원용인CC", NOW - 190 * MIN]]);
        expect(out[0].tees.map((t) => t.time)).toEqual(["08:00"]);
    });
    it("지난 티 · 너무 오래전에 나온 티는 싣지 않는다", () => {
        expect(plan([tee({ day: "2026-11-05", time: "09:00" })], [w()])).toEqual([]);
        expect(plan([tee({ firstSeenMs: NOW - OPEN_TEE_FRESH_MS - MIN })], [w()])).toEqual([]);
    });
    it("하루 상한을 넘으면 알림함에만 — 이른 티가 든 골프장부터 울린다", () => {
        const out = plan([tee({ slug: "A", day: "2026-11-08" }), tee({ slug: "B", day: "2026-11-06" })], [w({ slug: "A", name: "A" }), w({ slug: "B", name: "B" })], [], [["m1", 19]]);
        expect(out.map((a) => [a.slug, a.push])).toEqual([["B", true], ["A", false]]);
    });
});

describe("문구", () => {
    it("한 개 · 여러 개, 딥링크는 그 골프장 페이지", () => {
        const one = openTeeAlertText({ slug: "블루원용인CC", name: "블루원용인CC", tees: [tee()] }, NOW);
        expect(one.title).toBe("⛳ 블루원용인CC 취소티가 나왔어요");
        expect(one.body).toBe("11/7(토) 1부 07:12 · 레이크 · 15만원 · 공식 사이트 예약");
        expect(one.url).toContain("/golf/course/");
        const many = openTeeAlertText({ slug: "블루원용인CC", name: "블루원용인CC", tees: [tee({ time: "07:12" }), tee({ time: "07:20", price: 140000 }), tee({ day: "2026-11-08", time: "06:40" }), tee({ day: "2026-11-08", time: "06:48" })] }, NOW);
        expect(many.title).toBe("⛳ 블루원용인CC 취소티 4개가 나왔어요");
        expect(many.body).toBe("11/7(토) 07:12, 07:20, 11/8(일) 06:40 외 1개 · 최저 14만원");
    });
});

describe("고정: 크론 · 조용한 시간", () => {
    const src = readFileSync(resolve(__dirname, "golfOpenTeeAlerts.ts"), "utf8");
    it("남은 티 크론이 받은 뒤 부른다", () => {
        const cron = readFileSync(resolve(__dirname, "../routes/modules/cron.ts"), "utf8");
        const h = cron.slice(cron.indexOf("async function handleGolfOpenTees("), cron.indexOf('router.get("/golf-open-tees"'));
        expect(h.indexOf("await collectOpenTees(")).toBeGreaterThan(0);
        expect(h.indexOf("await alertOpenTeeWatchers()")).toBeGreaterThan(h.indexOf("await collectOpenTees("));
    });
    it("조용한 시간에는 보내지 않고(모아 둔다), 탈퇴 회원 · 관심 없는 골프장은 묻지 않는다", () => {
        expect(src).toContain('if (hour < WATCH_PUSH_FROM_HOUR || hour >= WATCH_PUSH_UNTIL_HOUR) return { skipped: "조용한 시간(21 ~ 08시) — 아침에 모아 보낸다" };');
        expect(src).toContain("and m.name <> '탈퇴회원'");
        expect(src).toContain("and exists (select 1 from golf_course_watches w where w.slug = t.slug)");
        expect(src).toContain('type: "GOLF_URGENT", params');
    });
    it("받는 곳이 아닌 골프장의 관심 단추는 취소티를 약속하지 않는다", () => {
        const sheet = readFileSync(resolve(__dirname, "../../client/src/golf/components/course/WatchSheet.tsx"), "utf8");
        expect(sheet).toContain('{teeSource(slug) ? "관심 등록하고 취소티 알림 받기" : "관심 등록하고 조인 · 부킹 알림 받기"}');
    });
});
