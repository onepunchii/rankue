/**
 * 2026-10-06 — 탈퇴 때 신청자 알림. 탈퇴하면 그 회원의 조인·부킹 글이 가려지는데(user.repo deleteAccount), 글 내리기와 달리
 * 대기·확정 신청자에게 아무 말도 가지 않았다. 확정자는 '내 신청'에서 글이 사라지고 연락처가 비워진 것을 티타임까지 몰랐다.
 *
 * DB·저장소·알림은 가짜다(운영 DB 를 건드리지 않는다). 서버를 띄우지 않고 라우터의 핸들러를 직접 부른다(handoff.test.ts 와 같은 방식).
 *
 *  (가) 누구에게: 앞으로의 글의 대기·확정 신청자만 — 지난 글·가려진 글·신청자 없는 글·글쓴이 본인은 뺀다.
 *  (나) 무엇을: 글 내리기(DELETE /golf/bookings/:id)와 **같은 함수·같은 문구**.
 *  (다) 언제: 가려지기 전에 읽고, 탈퇴가 끝난 뒤에 보낸다. 읽기·알림이 실패하거나 늦어도 탈퇴는 그대로 끝난다.
 *  (라) 채팅방: 글 내리기는 방을 닫을 뿐 시스템 메시지를 남기지 않는다 — 탈퇴도 만들지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";

const ME = "11111111-1111-4111-8111-111111111111";        // 탈퇴하는 회원(글쓴이)
const R1 = "22222222-2222-4222-8222-222222222222";        // 확정자
const R2 = "33333333-3333-4333-8333-333333333333";        // 대기자
const BOOKING = "aaaaaaaa-0000-4000-8000-000000000001";
const OWNER_PHONE = "fixture-phone";

const m = vi.hoisted(() => {
    const log: string[] = [];
    const send = vi.fn(async (_p: any): Promise<unknown> => undefined);
    const repoDb = { where: [] as unknown[], limit: [] as number[], rows: [] as any[], selects: 0 };
    const db = {
        select: () => {
            repoDb.selects++;
            return { from: () => ({ innerJoin: () => ({ where: (cond: unknown) => {
                repoDb.where.push(cond);
                return { orderBy: () => ({ limit: async (n: number) => { repoDb.limit.push(n); return repoDb.rows; } }) };
            } }) }) };
        },
    };
    const storage = {
        golf: { upcomingListingsWithRequesters: vi.fn() },
        deleteAccount: vi.fn(),
        golfPhotos: { deleteAllByMember: vi.fn() },
        // 글 내리기(DELETE /bookings/:id)가 쓰는 것
        activeRequesterIds: vi.fn(), getGolfBooking: vi.fn(), getMemberById: vi.fn(), getProfile: vi.fn(), deleteGolfBooking: vi.fn(),
        chat: { deleteRoom: vi.fn(async () => undefined), addMessage: vi.fn() },
    };
    return { log, send, repoDb, db, storage };
});
vi.mock("../../db.js", () => ({ db: m.db, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: m.storage, getRecentOpponents: vi.fn(), searchUsers: vi.fn() }));
vi.mock("../../services/notificationService.js", () => ({ notificationService: { sendAndSaveNotification: m.send } }));
// Blob 삭제는 절대 실제로 나가지 않게 — 순서만 적는다
vi.mock("../../utils/blob.js", () => ({
    deleteBlobs: async () => { m.log.push("deleteBlobs"); },
    isOnOwnBlobHost: () => true, isOwnedBlobUrl: () => false, ownBlobHost: () => null,
}));
vi.mock("./auth.js", () => ({ attemptKey: () => "k", checkRateLimit: async () => ({ ok: true }), registerFailure: async () => undefined, clearAttempts: async () => undefined }));
vi.mock("../../middleware/terms.js", () => ({
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    recordTermsAcceptance: async () => undefined,
}));

import memberRouter from "./member.js";
import golfRouter, { notifyListingTakenDown } from "./golf.js";
import { GolfRepository, groupUpcomingRequesters } from "../../storage/golf.repo.js";

const TEE = new Date("2026-12-24T22:40:00.000Z"); // 한국 시각 12/25 07:40
const booking = (over: Record<string, unknown> = {}) => ({
    id: BOOKING, ownerId: ME, listingType: "JOIN", courseName: "남서울CC", isBlind: false, blindName: null, datetime: TEE, isBlinded: false, ...over,
});

type Out = { status: number; body: any; cleared: string[] };
function call(router: unknown, method: "delete", path: string, opts: { me?: string; params?: Record<string, string> } = {}): Promise<Out> {
    const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`시험에 없는 길: ${method.toUpperCase()} ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<Out>((done, fail) => {
        const out: Out = { status: 200, body: undefined, cleared: [] };
        const res: any = {
            locals: { locale: "ko" }, headersSent: false,
            set() { return res; },
            status(code: number) { out.status = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; m.log.push("respond"); done(out); return res; },
            clearCookie(name: string) { out.cleared.push(name); m.log.push(`clearCookie:${name}`); return res; },
        };
        const req: any = { params: opts.params ?? {}, query: {}, body: {}, headers: {}, signedCookies: opts.me ? { hiq_user_id: opts.me } : {} };
        let i = 0;
        const next = (err?: unknown) => {
            if (err) { fail(err); return; }
            const handle = handlers[i++];
            if (!handle) { fail(new Error("응답 없이 끝남")); return; }
            try { handle(req, res, next); } catch (e) { fail(e); }
        };
        next();
    });
}
const withdraw = () => call(memberRouter, "delete", "/me", { me: ME });
const payloads = () => m.send.mock.calls.map((c) => c[0]);

const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
afterAll(() => errorLog.mockRestore());
afterEach(() => { vi.useRealTimers(); });
beforeEach(() => {
    m.log.length = 0;
    m.repoDb.where.length = 0; m.repoDb.limit.length = 0; m.repoDb.rows = []; m.repoDb.selects = 0;
    m.send.mockReset().mockImplementation(async (p: any) => { m.log.push(`send:${p.memberId}`); });
    m.storage.golf.upcomingListingsWithRequesters.mockReset().mockImplementation(async () => { m.log.push("read"); return []; });
    m.storage.deleteAccount.mockReset().mockImplementation(async () => { m.log.push("deleteAccount"); return { profileImageUrl: null }; });
    m.storage.golfPhotos.deleteAllByMember.mockReset().mockImplementation(async () => { m.log.push("deletePhotos"); return []; });
    m.storage.activeRequesterIds.mockReset();
    m.storage.getGolfBooking.mockReset();
    // 번호는 '있다'는 것만 쓰인다(글 내리기의 권한 확인) — 실제 번호 꼴을 적지 않는다
    m.storage.getMemberById.mockReset().mockResolvedValue({ id: ME, phone: OWNER_PHONE, profileId: null });
    m.storage.deleteGolfBooking.mockReset().mockResolvedValue(true);
    m.storage.chat.deleteRoom.mockClear();
    m.storage.chat.addMessage.mockReset();
});

describe("(가) 누구에게 — 앞으로의 글의 대기·확정 신청자", () => {
    const NOW = Date.parse("2026-10-06T03:00:00.000Z");
    const b = (id: string, datetime: Date | string) => ({ id, datetime, courseName: id });
    const row = (bk: { id: string; datetime: Date | string }, memberId: string, status: string) => ({ booking: bk, memberId, status });
    const future = b("future", new Date(NOW + 86_400_000));
    const soon = b("soon", new Date(NOW + 1));
    const justNow = b("now", new Date(NOW));
    const past = b("past", new Date(NOW - 3_600_000));
    const broken = b("broken", "날짜 아님");
    const text = b("text", "2026-12-24T22:40:00.000Z");

    const table: [string, ReturnType<typeof row>[], { id: string; who: [string, string][] }[]][] = [
        ["줄이 없다(신청자 없는 글은 애초에 안 나온다)", [], []],
        ["앞으로의 글 · 확정 1 + 대기 1", [row(future, R1, "accepted"), row(future, R2, "applied")], [{ id: "future", who: [[R1, "accepted"], [R2, "applied"]] }]],
        ["1밀리초 뒤도 앞으로의 글", [row(soon, R1, "applied")], [{ id: "soon", who: [[R1, "applied"]] }]],
        ["지금 이 순간의 티타임은 지난 글", [row(justNow, R1, "accepted")], []],
        ["지난 글(읽기는 하루 여유를 두지만 여기서 버린다)", [row(past, R1, "accepted")], []],
        ["못 읽는 시각은 버린다", [row(broken, R1, "accepted")], []],
        ["글자로 온 시각도 읽는다", [row(text, R1, "applied")], [{ id: "text", who: [[R1, "applied"]] }]],
        ["글이 여럿 — 지난 글만 빠지고 받은 순서 그대로",
            [row(soon, R2, "applied"), row(past, R1, "accepted"), row(future, R1, "accepted"), row(soon, R1, "accepted")],
            [{ id: "soon", who: [[R2, "applied"], [R1, "accepted"]] }, { id: "future", who: [[R1, "accepted"]] }]],
    ];
    it.each(table)("묶기: %s", (_name, rows, expected) => {
        const out = groupUpcomingRequesters(rows, NOW);
        expect(out.map((g) => ({ id: g.booking.id, who: g.requesters.map((r) => [r.memberId, r.status]) }))).toEqual(expected);
    });

    it("묶인 글은 읽은 글 그대로다(알림 문구에 쓸 이름·시각·종류가 들어 있다)", () => {
        const [g] = groupUpcomingRequesters([row(future, R1, "accepted")], NOW);
        expect(g.booking).toBe(future);
    });

    it("읽기: 내 글 · 안 가려진 글 · 대기·확정 · 글쓴이 본인 제외 — 한 번의 질의, Date 는 넘기지 않는다", async () => {
        const repo = new GolfRepository();
        const far = new Date(Date.now() + 5 * 86_400_000);
        m.repoDb.rows = [row(b("x", far), R1, "accepted"), row(b("x", far), R2, "applied"), row(b("old", new Date(Date.now() - 3_600_000)), R1, "accepted")];
        const out = await repo.upcomingListingsWithRequesters(ME);
        expect(out.map((g) => [g.booking.id, g.requesters.map((r) => r.memberId)])).toEqual([["x", [R1, R2]]]);
        expect(m.repoDb.selects).toBe(1);
        expect(m.repoDb.limit).toEqual([3000]);
        const q = new PgDialect().sqlToQuery(m.repoDb.where[0] as any);
        const where = q.sql.replace(/\s+/g, " ");
        expect(where).toContain('"golf_bookings"."owner_id" = $1');
        expect(where).toContain('"golf_bookings"."is_blinded" = $2');
        expect(where).toContain(`"golf_bookings"."datetime" > now() - interval '1 day'`);
        expect(where).toContain('"golf_join_requests"."status" in ($3, $4)');
        expect(where).toContain('"golf_join_requests"."member_id" <> $5');
        expect(q.params).toEqual([ME, false, "applied", "accepted", ME]);
        expect(q.params.some((p) => p instanceof Date)).toBe(false);
    });

    it("읽기: 회원 id 꼴이 아니면 묻지 않는다", async () => {
        expect(await new GolfRepository().upcomingListingsWithRequesters("social:1234")).toEqual([]);
        expect(m.repoDb.selects).toBe(0);
    });
});

describe("(나) 무엇을 — 글 내리기와 같은 함수·같은 문구", () => {
    const requesters = [{ memberId: R1, status: "accepted" }, { memberId: R2, status: "applied" }];

    it("조인: 확정자에게는 다시 찾으라는 말까지, 대기자에게는 내려갔다는 말만", async () => {
        await notifyListingTakenDown(booking(), requesters);
        expect(payloads()).toEqual([
            { memberId: R1, title: "조인 글이 내려갔어요", body: "남서울CC 12/25 07:40 글을 올린 분이 내렸어요. 확정됐던 자리라 다시 찾아보셔야 해요.", category: "GOLF", type: "JOIN", pref: "golf", params: { url: "/golf/booking-list?view=JOIN" } },
            { memberId: R2, title: "조인 글이 내려갔어요", body: "남서울CC 12/25 07:40 글을 올린 분이 내렸어요.", category: "GOLF", type: "JOIN", pref: "golf", params: { url: "/golf/booking-list?view=JOIN" } },
        ]);
    });

    it("부킹 · 비공개 글: 대기자에게는 가명, 확정자에게는 이미 알려 준 실명", async () => {
        await notifyListingTakenDown(booking({ listingType: "BOOKING", isBlind: true, blindName: "수도권 명문" }), requesters);
        expect(payloads().map((p) => [p.memberId, p.title, p.body, p.params.url])).toEqual([
            [R1, "부킹 글이 내려갔어요", "남서울CC 12/25 07:40 글을 올린 분이 내렸어요. 확정됐던 자리라 다시 찾아보셔야 해요.", "/golf/booking-list?view=BOOKING"],
            [R2, "부킹 글이 내려갔어요", "수도권 명문 12/25 07:40 글을 올린 분이 내렸어요.", "/golf/booking-list?view=BOOKING"],
        ]);
    });

    it("글이 없거나 알릴 사람이 없으면 아무것도 보내지 않는다", async () => {
        await notifyListingTakenDown(null, requesters);
        await notifyListingTakenDown(undefined, requesters);
        await notifyListingTakenDown(booking(), []);
        expect(m.send).not.toHaveBeenCalled();
    });

    it("던지지 않는다 — 한 사람에게 못 보내도 나머지는 간다", async () => {
        m.send.mockImplementation(async (p: any) => { if (p.memberId === R1) throw new Error("push down"); m.log.push(`send:${p.memberId}`); });
        await expect(notifyListingTakenDown(booking(), requesters)).resolves.toBeUndefined();
        expect(m.send).toHaveBeenCalledTimes(2);
        expect(m.log).toEqual([`send:${R2}`]);
    });

    it("글 내리기·탈퇴·직접 호출 — 세 길의 알림이 글자까지 같다", async () => {
        const before = booking({ isBlind: true, blindName: "수도권 명문" });
        await notifyListingTakenDown(before, requesters);
        const direct = payloads();
        expect(direct).toHaveLength(2);

        // 글 내리기
        m.send.mockClear();
        m.storage.activeRequesterIds.mockResolvedValue(requesters);
        m.storage.getGolfBooking.mockResolvedValue(before);
        const del = await call(golfRouter, "delete", "/bookings/:id", { me: ME, params: { id: BOOKING } });
        expect(del.status).toBe(200);
        expect(m.storage.deleteGolfBooking).toHaveBeenCalledWith(BOOKING, OWNER_PHONE, ME);
        expect(payloads()).toEqual(direct);

        // 탈퇴
        m.send.mockClear();
        m.storage.golf.upcomingListingsWithRequesters.mockResolvedValue([{ booking: before, requesters }]);
        const out = await withdraw();
        expect(out.status).toBe(200);
        expect(payloads()).toEqual(direct);
    });

    it("탈퇴했다는 사실은 싣지 않는다 — 문구는 한 곳에만 있다", () => {
        const golf = readFileSync(resolve(__dirname, "golf.ts"), "utf8");
        const member = readFileSync(resolve(__dirname, "member.ts"), "utf8");
        const fn = golf.slice(golf.indexOf("export async function notifyListingTakenDown("), golf.indexOf("\n}\n", golf.indexOf("export async function notifyListingTakenDown(")));
        expect(fn).toContain("글을 올린 분이 내렸어요.");
        expect(fn).not.toContain("탈퇴");
        expect(golf.split("글이 내려갔어요\"").length - 1).toBe(2); // 조인·부킹 제목 한 번씩 — 이 함수 안에서만
        expect(golf.split("await notifyListingTakenDown(before, requesters);").length - 1).toBe(1);
        // 탈퇴 라우트는 문구를 따로 만들지 않고 그 함수를 부른다
        expect(member).toContain('import { notifyListingTakenDown } from "./golf.js";');
        const me = member.slice(member.indexOf('router.delete("/me", requireAuth'), member.indexOf("\n}));", member.indexOf('router.delete("/me", requireAuth')));
        expect(me).toContain("notifyListingTakenDown(booking, requesters)");
        expect(me).not.toContain("sendAndSaveNotification");
        expect(me).not.toContain("내려갔어요");
    });
});

describe("(다) 언제 — 가려지기 전에 읽고, 탈퇴가 끝난 뒤에 보낸다", () => {
    const one = () => [{ booking: booking(), requesters: [{ memberId: R1, status: "accepted" }, { memberId: R2, status: "applied" }] }];

    it("순서: 읽기 → 탈퇴 → 개인 자료 삭제 → 알림 → 쿠키 삭제 → 응답", async () => {
        m.storage.golf.upcomingListingsWithRequesters.mockImplementation(async () => { m.log.push("read"); return one(); });
        const out = await withdraw();
        expect(out.status).toBe(200);
        expect(out.body).toEqual({ success: true, data: { success: true } });
        expect(m.storage.golf.upcomingListingsWithRequesters).toHaveBeenCalledWith(ME);
        expect(m.storage.deleteAccount).toHaveBeenCalledWith(ME);
        expect(m.log).toEqual([
            "read", "deleteAccount", "deleteBlobs", "deletePhotos", "deleteBlobs",
            `send:${R1}`, `send:${R2}`,
            "clearCookie:hiq_user_id", "clearCookie:hiq_partner_auth", "respond",
        ]);
    });

    it("알릴 글이 없으면 예전과 같다 — 알림 없음", async () => {
        const out = await withdraw();
        expect(out.status).toBe(200);
        expect(m.send).not.toHaveBeenCalled();
        expect(m.log).toEqual(["read", "deleteAccount", "deleteBlobs", "deletePhotos", "deleteBlobs", "clearCookie:hiq_user_id", "clearCookie:hiq_partner_auth", "respond"]);
    });

    it("읽기가 실패해도 탈퇴는 끝난다(알림만 못 간다)", async () => {
        m.storage.golf.upcomingListingsWithRequesters.mockRejectedValue(new Error("db down"));
        const out = await withdraw();
        expect(out.status).toBe(200);
        expect(m.storage.deleteAccount).toHaveBeenCalledTimes(1);
        expect(out.cleared).toEqual(["hiq_user_id", "hiq_partner_auth"]);
        expect(m.send).not.toHaveBeenCalled();
    });

    it("탈퇴가 실패하면 알리지 않는다 — 글은 그대로 있다", async () => {
        m.storage.golf.upcomingListingsWithRequesters.mockResolvedValue(one());
        m.storage.deleteAccount.mockRejectedValue(new Error("회원을 찾을 수 없습니다"));
        const out = await withdraw();
        expect(out.status).toBe(500);
        expect(m.send).not.toHaveBeenCalled();
        expect(out.cleared).toEqual([]);
    });

    it("알림이 실패해도 탈퇴는 성공이다", async () => {
        m.storage.golf.upcomingListingsWithRequesters.mockResolvedValue(one());
        m.send.mockRejectedValue(new Error("push down"));
        const out = await withdraw();
        expect(out.status).toBe(200);
        expect(m.send).toHaveBeenCalledTimes(2);
        expect(out.cleared).toEqual(["hiq_user_id", "hiq_partner_auth"]);
    });

    it("알림이 끝나지 않아도 6초 뒤에는 응답한다 — 계정은 지워졌는데 응답이 못 나가는 일이 없게", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        m.storage.golf.upcomingListingsWithRequesters.mockResolvedValue(one());
        m.send.mockImplementation(() => new Promise(() => {})); // 끝나지 않는 푸시
        let done: Out | null = null;
        const pending = withdraw().then((o) => { done = o; return o; });
        await vi.advanceTimersByTimeAsync(5999);
        expect(done).toBeNull();
        expect(m.storage.deleteAccount).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        const out = await pending;
        expect(out.status).toBe(200);
        expect(out.cleared).toEqual(["hiq_user_id", "hiq_partner_auth"]);
    });

    it("소스: 읽기는 deleteAccount 앞, 알림은 그 뒤 — 둘 다 실패를 삼킨다", () => {
        const member = readFileSync(resolve(__dirname, "member.ts"), "utf8");
        const at = member.indexOf('router.delete("/me", requireAuth');
        const me = member.slice(at, member.indexOf("\n}));", at));
        const read = me.indexOf("await storage.golf.upcomingListingsWithRequesters(req.userId!)");
        const del = me.indexOf("await storage.deleteAccount(req.userId!)");
        const notify = me.indexOf("notifyListingTakenDown(booking, requesters)");
        expect(read).toBeGreaterThan(-1);
        expect(read).toBeLessThan(del);
        expect(del).toBeLessThan(notify);
        expect(me.slice(read, del)).toContain(".catch((e) => {");
        expect(me.slice(notify)).toContain(".catch((e) =>");
        expect(notify).toBeLessThan(me.indexOf("res.clearCookie('hiq_user_id'"));
        expect(member).toContain("const WITHDRAW_NOTICE_WAIT_MS = 6000;");
        // 가리는 일(user.repo)은 그대로다 — 이 시험이 지키는 것은 알림뿐
        const userRepo = readFileSync(resolve(__dirname, "../../storage/user.repo.ts"), "utf8");
        expect(userRepo).toContain("isBlinded: true,");
    });
});

describe("(라) 채팅방 — 글 내리기가 남기는 시스템 메시지는 없다. 탈퇴도 만들지 않는다", () => {
    it("글 내리기는 방을 닫을 뿐이다", async () => {
        m.storage.activeRequesterIds.mockResolvedValue([{ memberId: R1, status: "accepted" }]);
        m.storage.getGolfBooking.mockResolvedValue(booking());
        await call(golfRouter, "delete", "/bookings/:id", { me: ME, params: { id: BOOKING } });
        expect(m.storage.chat.deleteRoom).toHaveBeenCalledWith(`listing:${BOOKING}`);
        expect(m.storage.chat.addMessage).not.toHaveBeenCalled();
    });

    it("탈퇴는 방에 손대지 않는다(글이 지워지지 않고 가려져, 방과 대화 기록이 남는다)", async () => {
        m.storage.golf.upcomingListingsWithRequesters.mockResolvedValue([{ booking: booking(), requesters: [{ memberId: R1, status: "accepted" }] }]);
        await withdraw();
        expect(m.storage.chat.deleteRoom).not.toHaveBeenCalled();
        expect(m.storage.chat.addMessage).not.toHaveBeenCalled();
    });
});
