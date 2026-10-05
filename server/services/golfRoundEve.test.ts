import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// DB·푸시·날씨는 막는다 — 누구에게 무엇을 한 번만 보내는지만 본다
const m = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn(), summary: vi.fn(), brief: vi.fn() }));
vi.mock("../db.js", () => ({ db: { execute: m.execute } }));
vi.mock("./notificationService.js", () => ({ notificationService: { sendAndSaveNotification: m.send } }));
vi.mock("../routes/modules/golfCourses.js", () => ({ loadGolfCourseSummary: m.summary }));
vi.mock("./golfWeather.js", () => ({ roundBriefAt: m.brief }));

import { eveRecipients, pgTextArray, runGolfRoundEve, utcMs } from "./golfRoundEve.js";

const kst = (y: number, mo: number, d: number, hh: number, mm = 0) => Date.UTC(y, mo - 1, d, hh - 9, mm);
const NOW = kst(2026, 10, 5, 19, 0);
const BRIEF = { teeHour: 7, verdict: "라베 날씨", tone: "good", gear: ["선크림·모자"], pop: 0, wind: 3, startTmp: 17, endTmp: 20, minTmp: 17, maxTmp: 20, hours: [], frontCount: 3, wet: null, dusk: false };
const page = { slug: "가CC", name: "가CC", region: "강원", city: "춘천시", lat: 37.8, lng: 127.7 };
const row = (o: Record<string, unknown>) => ({ id: "L1", datetime: "2026-10-05 22:12:00", course_id: "12", course_name: "가CC", venue_name: null, listing_type: "JOIN", join_type: "FIELD", owner_id: "host", accepted: ["a", "b"], ...o });
/** 첫 조회는 내일 글, 둘째 조회는 이미 보낸 알림 */
const db = (rounds: unknown[], sent: unknown[] = []) => { m.execute.mockReset(); m.execute.mockResolvedValueOnce({ rows: rounds }).mockResolvedValueOnce({ rows: sent }); };

beforeEach(() => {
    m.send.mockReset().mockResolvedValue(undefined);
    m.summary.mockReset().mockResolvedValue({ byCourseId: new Map([[12, page]]) });
    m.brief.mockReset().mockResolvedValue({ brief: BRIEF, sun: null, base: "202610051700" });
});

describe("누가 내일 치나", () => {
    it("조인은 올린 사람 + 확정된 사람, 부킹은 확정된 사람만(올린 사람은 파는 쪽이다)", () => {
        expect(eveRecipients({ listingType: "JOIN", ownerId: "host", accepted: ["a", "b"] }).sort()).toEqual(["a", "b", "host"]);
        expect(eveRecipients({ listingType: "BOOKING", ownerId: "seller", accepted: ["a"] })).toEqual(["a"]);
        expect(eveRecipients({ listingType: "BOOKING", ownerId: "seller", accepted: [] })).toEqual([]);
        expect(eveRecipients({ listingType: "JOIN", ownerId: "host", accepted: ["host"] })).toEqual(["host"]); // 겹치면 한 번
    });
    it("시간대 없는 UTC 글자를 UTC 로 읽는다(9시간 함정) · text[] 는 배열이든 글자든", () => {
        expect(utcMs("2026-10-05 22:12:00")).toBe(Date.UTC(2026, 9, 5, 22, 12));
        expect(utcMs("2026-10-05T22:12:00Z")).toBe(Date.UTC(2026, 9, 5, 22, 12));
        expect(utcMs(new Date(Date.UTC(2026, 9, 5, 22, 12)))).toBe(Date.UTC(2026, 9, 5, 22, 12));
        expect(pgTextArray(["a", null, "b"])).toEqual(["a", "b"]);
        expect(pgTextArray('{a,"b",NULL}')).toEqual(["a", "b"]);
        expect(pgTextArray("{}")).toEqual([]);
        expect(pgTextArray(null)).toEqual([]);
    });
});

describe("runGolfRoundEve", () => {
    it("보낼 시간이 아니면 아무것도 읽지 않는다(매시 불린다)", async () => {
        db([row({})]);
        const r = await runGolfRoundEve(kst(2026, 10, 5, 12, 0));
        expect(r).toMatchObject({ due: false, rounds: 0, sent: 0 });
        expect(m.execute).not.toHaveBeenCalled();
        expect(m.send).not.toHaveBeenCalled();
    });
    it("저녁 7시 — 내일 치는 사람 모두에게 한 줄 평과 그 라운드 주소", async () => {
        db([row({})]);
        const r = await runGolfRoundEve(NOW);
        expect(r).toMatchObject({ due: true, ymd: "20261006", rounds: 1, players: 3, sent: 3, already: 0, failed: 0, dry: false });
        expect(m.send.mock.calls.map((c) => c[0].memberId).sort()).toEqual(["a", "b", "host"]);
        const a = m.send.mock.calls[0][0];
        expect(a).toMatchObject({
            title: "내일 07:12 가CC 라운드", category: "GOLF", type: "JOIN",
            params: { url: `/golf/course/${encodeURIComponent("가CC")}?d=20261006&t=7`, reminderKey: "golf-eve:L1", teeAt: "2026-10-05T22:12:00.000Z" },
        });
        expect(a.body).toContain("라베 날씨");
        expect(a.body).toContain("챙길 것 선크림·모자");
        // 내일(한국 날짜) 하루를 UTC 글자로 물었다
        const q = JSON.stringify(m.execute.mock.calls[0][0]);
        expect(q).toContain("2026-10-05 15:00:00");
        expect(q).toContain("2026-10-06 15:00:00");
    });
    it("이미 받은 사람은 건너뛴다 — 19시·20시 두 번 돌아도 한 번만 간다", async () => {
        db([row({})], [{ member_id: "a", k: "golf-eve:L1" }, { member_id: "host", k: "golf-eve:L1" }]);
        const r = await runGolfRoundEve(kst(2026, 10, 5, 20, 0));
        expect(r).toMatchObject({ players: 3, sent: 1, already: 2 });
        expect(m.send.mock.calls.map((c) => c[0].memberId)).toEqual(["b"]);
    });
    it("부킹 글은 올린 사람에게 보내지 않고, 치는 사람이 없는 글은 세지 않는다", async () => {
        db([row({ id: "B1", listing_type: "BOOKING", owner_id: "seller", accepted: ["buyer"] }), row({ id: "B2", listing_type: "BOOKING", owner_id: "seller", accepted: [] })]);
        const r = await runGolfRoundEve(NOW);
        expect(r).toMatchObject({ rounds: 1, players: 1, sent: 1 });
        expect(m.send.mock.calls[0][0].memberId).toBe("buyer");
    });
    it("스크린·골프장을 모르는 글·예보가 없는 글 — 날씨 없이 준비물만 권하고 내 예약으로 보낸다", async () => {
        db([row({ id: "S1", join_type: "SCREEN", course_name: "예시 스크린" }), row({ id: "V1", course_id: "v:abc", venue_name: "동네 파크골프장", join_type: "PARK", accepted: [] })]);
        await runGolfRoundEve(NOW);
        const screen = m.send.mock.calls.find((c) => c[0].params.reminderKey === "golf-eve:S1")![0];
        expect(screen).toMatchObject({ title: "내일 07:12 예시 스크린 라운드", body: "내일 라운드예요. 준비물을 한 번 챙겨 보세요.", params: { url: "/golf/my-bookings" } });
        const venue = m.send.mock.calls.find((c) => c[0].params.reminderKey === "golf-eve:V1")![0];
        expect(venue.title).toBe("내일 07:12 동네 파크골프장 라운드");
        expect(m.brief).not.toHaveBeenCalled();
        // 골프장은 알지만 예보가 없는 날
        db([row({})]); m.send.mockClear(); m.brief.mockResolvedValue(null);
        await runGolfRoundEve(NOW);
        expect(m.send.mock.calls[0][0]).toMatchObject({ body: "내일 라운드예요. 준비물을 한 번 챙겨 보세요.", params: { url: `/golf/course/${encodeURIComponent("가CC")}?d=20261006&t=7` } });
    });
    it("점검(dry) — 보내지 않고 무엇이 갈지만. 회원 id 는 싣지 않는다", async () => {
        db([row({})], [{ member_id: "a", k: "golf-eve:L1" }]);
        const r = await runGolfRoundEve(kst(2026, 10, 5, 12, 0), { dry: true, force: true });
        expect(m.send).not.toHaveBeenCalled();
        expect(r).toMatchObject({ due: false, dry: true, rounds: 1, players: 3, sent: 0, already: 1 });
        expect(r.preview).toEqual([{ title: "내일 07:12 가CC 라운드", body: expect.stringContaining("라베 날씨"), url: expect.stringContaining("d=20261006&t=7"), to: 2 }]);
        expect(JSON.stringify(r)).not.toMatch(/"host"|"a"|"b"/);
    });
    it("한 사람에게 보내다 실패해도 나머지는 간다", async () => {
        db([row({})]);
        m.send.mockRejectedValueOnce(new Error("push down"));
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = await runGolfRoundEve(NOW);
        expect(r).toMatchObject({ sent: 2, failed: 1 });
        err.mockRestore();
    });
});

describe("길", () => {
    const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
    it("매시 리마인더 크론에 얹혀 돈다 — 크론 항목은 늘리지 않는다", () => {
        const cron = read("server/routes/modules/cron.ts");
        expect(cron.match(/golfEve: await golfEveQuietly\(\)/g)).toHaveLength(2); // GET·POST
        expect(cron).toContain('router.get("/golf-round-eve"');
        const crons = JSON.parse(read("vercel.json")).crons.map((c: { path: string }) => c.path);
        expect(crons).toContain("/api/cron/reminders");
        expect(crons.some((p: string) => p.includes("golf-round-eve"))).toBe(false);
    });
    it("골프장 글의 가려진 것·이름 가린 것은 묻지 않고, 조인·부킹 알림 설정을 탄다", () => {
        const src = read("server/services/golfRoundEve.ts");
        expect(src).toContain("b.is_blinded = false and coalesce(b.is_blind, false) = false");
        expect(src).toContain("r.status = 'accepted'");
        expect(src).toContain('category: "GOLF", type: "JOIN"');
    });
    it("공유 카드 — 그림 라우트와, 주소에 라운드가 실리면 미리보기 그림을 그 카드로", () => {
        const og = read("server/ogImage.ts");
        expect(og).toContain('app.get("/og/golf-round/:slug.png"');
        expect(og).toContain("parseRoundRef(req.query.d, req.query.t)");
        const pre = read("server/prerender.ts");
        expect(pre).toContain("renderGolfCourse(s, rest[0], now, parseRoundRef(query.d, query.t))");
        expect(pre).toContain("image: roundImage ??");
        expect(pre).toContain("renderGolfPath(req.path, req.query as Record<string, unknown>)");
    });
});
