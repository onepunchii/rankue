import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// notifyListingAlerts(관심 골프장 → 지역 알림)의 **보내기**를 시험한다 — DB 는 차례대로 내주는 가짜 행, 알림은 호출만 센다.
// 판정(조건·묶기·문구)은 golfCourseWatch.test.ts.
const h = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn(), save: vi.fn() }));
vi.mock("../db.js", () => ({ db: { execute: h.execute } }));
vi.mock("../storage/index.js", () => ({ storage: { createNotification: h.save } }));
vi.mock("./notificationService.js", () => ({ notificationService: { sendAndSaveNotification: h.send } }));

import { notifyListingAlerts } from "./golfCourseWatch";

// 2026-09-24(목) 10:00 KST — 푸시가 울리는 시간
const NOW = Date.parse("2026-09-24T01:00:00Z");
const listing = {
    id: "j1", courseId: "74", listingType: "JOIN", joinType: "FIELD", costMode: "SPLIT", greenFee: 0,
    datetime: new Date(NOW + 2 * 86400_000).toISOString(),
    slots: [{ role: "HOST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "GUEST", gender: "ANY" }],
};
const page = { slug: "에이치원클럽", name: "에이치원클럽", region: "경기", city: "이천시", course_ids: [74] };

/** db.execute 가 부르는 순서: 관심(감시 행 → 24시간 기록) → 지역(골프장 → 구독 행 → 24시간 기록) */
function script(o: { watchers?: any[]; subs?: any[]; courseHistory?: any[]; areaHistory?: any[] }) {
    h.execute.mockReset();
    const push = (rows: any[]) => h.execute.mockResolvedValueOnce({ rows });
    push(o.watchers ?? []);
    if (o.watchers?.length) push(o.courseHistory ?? []);
    push([page]);
    push(o.subs ?? []);
    if (o.subs?.length) push(o.areaHistory ?? []);
}
const watcher = (id: string) => ({ member_id: id, slug: page.slug, filters: null, name: page.name, course_ids: [74] });
const sub = (id: string, over: Record<string, unknown> = {}) => ({ member_id: id, region: "경기", cities: [], filters: {}, ...over });
const sentTo = () => h.send.mock.calls.map(([n]) => `${n.memberId}:${n.params.watchSlug}`).sort();

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    h.send.mockReset(); h.save.mockReset();
    h.send.mockResolvedValue(undefined); h.save.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe("notifyListingAlerts — 관심 골프장 + 지역 알림 보내기", () => {
    it("그 골프장을 관심 등록한 사람은 관심 알림 한 통만 — 같은 글로 지역 알림이 또 가지 않는다", async () => {
        script({ watchers: [watcher("A")], subs: [sub("A"), sub("B")] });
        const r = await notifyListingAlerts("owner", [listing]);
        expect(sentTo()).toEqual(["A:에이치원클럽", "B:@경기"]);
        expect(r).toEqual({ pushed: 2, inboxOnly: 0 });
        // 지역 알림은 관심 알림으로 세어지고(watchSlug) 방송 도배 방지에 걸리지 않게 ownerId 를 싣지 않는다
        const area = h.send.mock.calls.map(([n]) => n).find((n) => n.memberId === "B");
        expect(area).toMatchObject({ category: "GOLF", type: "GOLF_URGENT", pref: "golf", title: "⛳ 경기 조인이 올라왔어요" });
        expect(area.params).toMatchObject({ watchSlug: "@경기", watchArea: "경기", n: 1, pushed: true });
        expect(area.params.ownerId).toBeUndefined();
    });

    it("관심 등록한 사람이 없어도 지역 알림은 간다", async () => {
        script({ subs: [sub("B")] });
        await notifyListingAlerts("owner", [listing]);
        expect(sentTo()).toEqual(["B:@경기"]);
    });

    it("시군을 고른 사람에겐 그 시군 글만", async () => {
        script({ subs: [sub("B", { cities: ["용인시"] }), sub("C", { cities: ["이천시"] })] });
        await notifyListingAlerts("owner", [listing]);
        expect(sentTo()).toEqual(["C:@경기"]);
    });

    it("밤(21~08시)엔 울리지 않고 알림함에만 남긴다", async () => {
        vi.setSystemTime(Date.parse("2026-09-24T13:30:00Z")); // 22:30 KST
        script({ subs: [sub("B")] });
        const r = await notifyListingAlerts("owner", [{ ...listing, datetime: new Date(Date.parse("2026-09-24T13:30:00Z") + 2 * 86400_000).toISOString() }]);
        expect(h.send).not.toHaveBeenCalled();
        expect(h.save).toHaveBeenCalledTimes(1);
        expect(h.save.mock.calls[0][0].params).toMatchObject({ watchSlug: "@경기", pushed: false });
        expect(r).toEqual({ pushed: 0, inboxOnly: 1 });
    });

    it("방금 긴급 방송을 받은 사람은 지역 알림도 조용히(알림함에만)", async () => {
        script({ subs: [sub("B")] });
        await notifyListingAlerts("owner", [listing], { silent: new Set(["B"]) });
        expect(h.send).not.toHaveBeenCalled();
        expect(h.save).toHaveBeenCalledTimes(1);
    });

    it("두 알림을 한 번에 기다린다 — 푸시가 멎어도 응답은 6초에서 끊긴다(차례로 기다리면 12초)", async () => {
        script({ watchers: [watcher("A")], subs: [sub("B")] });
        h.send.mockImplementation(() => new Promise(() => {})); // 끝나지 않는 푸시
        let done = false;
        const p = notifyListingAlerts("owner", [listing]).then((r) => { done = true; return r; });
        await vi.advanceTimersByTimeAsync(5900);
        expect(done).toBe(false);
        expect(h.send).toHaveBeenCalledTimes(2); // 기다리는 동안 둘 다 이미 출발해 있다
        await vi.advanceTimersByTimeAsync(200);
        expect(done).toBe(true);
        expect(await p).toEqual({ pushed: 2, inboxOnly: 0 });
    });

    it("관심 알림이 터져도 지역 알림은 간다(서로를 막지 않는다)", async () => {
        h.execute.mockReset();
        h.execute.mockRejectedValueOnce(new Error("boom"));
        h.execute.mockResolvedValueOnce({ rows: [page] }).mockResolvedValueOnce({ rows: [sub("B")] }).mockResolvedValueOnce({ rows: [] });
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = await notifyListingAlerts("owner", [listing]);
        err.mockRestore();
        expect(sentTo()).toEqual(["B:@경기"]);
        expect(r).toEqual({ pushed: 1, inboxOnly: 0 });
    });

    it("비공개 글은 어느 알림도 만들지 않는다(DB 도 안 읽는다)", async () => {
        h.execute.mockReset();
        const r = await notifyListingAlerts("owner", [{ ...listing, isBlind: true }]);
        expect(h.execute).not.toHaveBeenCalled();
        expect(r).toEqual({ pushed: 0, inboxOnly: 0 });
    });
});

describe("받는 사람 고르기 — 쿼리", () => {
    const src = readFileSync(path.resolve(process.cwd(), "server/services/golfCourseWatch.ts"), "utf8");

    it("글쓴이와 차단 관계인 사람은 두 알림 모두에서 빠진다(어느 쪽이 걸었든)", () => {
        expect(src).toContain('notBlocked(sql.raw("w.member_id"), ownerId)');
        expect(src).toContain('notBlocked(sql.raw("a.member_id"), ownerId)');
        const fn = src.slice(src.indexOf("const notBlocked"), src.indexOf("/**", src.indexOf("const notBlocked")));
        expect(fn).toContain("b.blocker_id = ${col} and b.blocked_id = ${ownerId}::uuid");
        expect(fn).toContain("b.blocker_id = ${ownerId}::uuid and b.blocked_id = ${col}");
    });

    it("지역 알림은 글쓴이 본인과 탈퇴 회원에게 가지 않는다", () => {
        const q = src.slice(src.indexOf("from golf_area_alerts a join hiq_members m"), src.indexOf("if (!subRows.length)"));
        expect(q).toContain("a.member_id <> ${ownerId}::uuid");
        expect(q).toContain("m.name <> '탈퇴회원'");
    });
});
