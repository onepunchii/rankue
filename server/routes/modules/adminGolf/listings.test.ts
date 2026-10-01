import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { readFileSync } from "fs";
import path from "path";
import type { AddressInfo } from "net";

/**
 * 2026-10-01 골프 관리 — 조인·부킹 라우터. 저장소·알림은 가짜로 바꿔 **운영 DB 를 건드리지 않고** 쓰기 흐름을 확인한다:
 *  가리기·보이기는 신고 큐와 같은 칸·같은 처리 기록, 지우기는 신청자를 먼저 읽고(cascade) 글쓴이 없이 지운다.
 */
const ID = "74988c46-9e72-4f90-b3d3-700050d87cdb";
const OWNER = "e5be3a7c-8f96-49a5-af4f-1f4176612d8f";
const TEE = "2026-10-05T22:40:00.000Z";

const booking = (over: Record<string, unknown> = {}) => ({
    id: ID, ownerId: OWNER, listingType: "JOIN", courseName: "파인밸리CC", isBlind: false, blindName: null,
    region: "강원", datetime: new Date(TEE), greenFee: 20000, comment: "같이 쳐요", isBlinded: false, blindReason: null,
    managerPhone: "010-0000-0000", ...over,
});

const calls: string[] = [];
const golf = {
    getGolfBooking: vi.fn(),
    listJoinApplicants: vi.fn(),
    activeRequesterIds: vi.fn(async () => { calls.push("activeRequesterIds"); return [{ memberId: "m-1", status: "accepted" }, { memberId: "m-2", status: "applied" }, { memberId: OWNER, status: "applied" }]; }),
    deleteGolfBooking: vi.fn(async (..._a: unknown[]) => { calls.push("deleteGolfBooking"); return true; }),
};
const admin = {
    setReportTargetBlinded: vi.fn(async () => true),
    closeReports: vi.fn(async () => 2),
    logModerationAction: vi.fn(async () => undefined),
};
const chat = { deleteRoom: vi.fn(async () => undefined) };
const send = vi.fn(async () => undefined);
const adminLog = vi.fn();
const repo = { list: vi.fn(async () => ({ items: [], total: 0 })), detail: vi.fn(), urgentLog: vi.fn(async () => [{ postId: ID }]) };

vi.mock("../../../db.js", () => ({ db: {} }));
vi.mock("../../../storage/index.js", () => ({ storage: { golf, admin, chat } }));
vi.mock("../../../services/notificationService.js", () => ({ notificationService: { sendAndSaveNotification: send } }));
vi.mock("../../../middleware/adminAuth.js", () => ({ adminLog }));
vi.mock("../../../storage/adminGolfListings.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../storage/adminGolfListings.js")>()),
    adminGolfListings: repo,
}));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./listings.js");
    const app = express();
    app.use(express.json());
    app.use("/l", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => { vi.clearAllMocks(); calls.length = 0; });

const post = (p: string, body: unknown) => fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("읽기", () => {
    it("/urgent 는 /:id 에 잡히지 않는다", async () => {
        const r = await fetch(`${base}/l/urgent`);
        expect(r.status).toBe(200);
        expect((await r.json()).data).toEqual({ days: 7, items: [{ postId: ID }] });
        expect(repo.urgentLog).toHaveBeenCalledWith(7);
    });
    it("목록 질의는 거르기로 풀어서 넘긴다", async () => {
        await fetch(`${base}/l?when=all&flag=hidden&q=%EB%82%A8%EC%84%9C%EC%9A%B8`);
        expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ when: "all", flag: "hidden", q: "남서울", limit: 50 }));
    });
    it("신청자는 고른 칸만 — 저장소가 칸을 늘려도 전화번호 같은 것은 새지 않는다", async () => {
        repo.detail.mockResolvedValueOnce({ id: ID });
        golf.listJoinApplicants.mockResolvedValueOnce([{ memberId: "m-1", name: "김민수", status: "applied", headcount: 1, appliedAt: TEE, changedAt: TEE, cancelCount: 2, noShowCount: 1, phone: "010-1111-2222" }]);
        const r = await fetch(`${base}/l/${ID}/applicants`);
        const body = await r.json();
        expect(body.data.applicants[0]).toMatchObject({ memberId: "m-1", name: "김민수", cancelCount: 2, noShowCount: 1 });
        expect(JSON.stringify(body)).not.toContain("010-1111-2222");
    });
    it("없는 글·잘못된 id 는 404", async () => {
        repo.detail.mockResolvedValueOnce(null);
        expect((await fetch(`${base}/l/${ID}/applicants`)).status).toBe(404);
        expect((await fetch(`${base}/l/not-a-uuid/applicants`)).status).toBe(404);
    });
});

describe("POST /:id/hide", () => {
    it("가리기 — 신고 큐와 같은 칸·기록, 안 닫힌 신고는 '조치', 글쓴이에게 골프 알림(사유는 싣지 않는다)", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking());
        const r = await post(`/l/${ID}/hide`, { hidden: true, reason: "  연락처 노출  " });
        expect(r.status).toBe(200);
        expect((await r.json()).data).toEqual({ hidden: true, closedReports: 2, notified: true });
        expect(admin.setReportTargetBlinded).toHaveBeenCalledWith("golf_booking", ID, true, "연락처 노출");
        expect(admin.closeReports).toHaveBeenCalledWith("golf_booking", ID, "actioned");
        expect(admin.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ targetType: "golf_booking", targetId: ID, action: "blind", authorMemberId: OWNER, note: null }));
        expect(adminLog).toHaveBeenCalledWith(expect.anything(), "golf.listing.hide", expect.objectContaining({ id: ID }));
        const n = (send.mock.calls[0] as any[])[0];
        expect(n).toMatchObject({ memberId: OWNER, category: "GOLF", type: "MODERATION", params: { url: "/golf/my-bookings?tab=join&role=mine" } });
        expect(n.body.key).toBe("notif.golfListing.hiddenByAdmin.body");
        expect(JSON.stringify(n)).not.toContain("연락처 노출");
    });
    it("사유를 안 적으면 기본 문구", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking());
        await post(`/l/${ID}/hide`, { hidden: true });
        expect(admin.setReportTargetBlinded).toHaveBeenCalledWith("golf_booking", ID, true, "운영자가 가렸습니다");
    });
    it("보이기 — 신고는 '기각'으로 닫고 글로 가는 링크", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking({ isBlinded: true, listingType: "BOOKING" }));
        const r = await post(`/l/${ID}/hide`, { hidden: false });
        expect(r.status).toBe(200);
        expect(admin.setReportTargetBlinded).toHaveBeenCalledWith("golf_booking", ID, false, null);
        expect(admin.closeReports).toHaveBeenCalledWith("golf_booking", ID, "dismissed");
        expect(admin.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "unblind" }));
        expect((send.mock.calls[0] as any[])[0].params.url).toBe(`/golf/booking-list/${ID}?view=BOOKING`);
    });
    it("이미 그 상태면 409 — 알림·기록을 두 번 남기지 않는다", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking({ isBlinded: true }));
        expect((await post(`/l/${ID}/hide`, { hidden: true })).status).toBe(409);
        expect(admin.setReportTargetBlinded).not.toHaveBeenCalled();
        expect(admin.logModerationAction).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });
    it("hidden 이 불리언이 아니면 400, 없는 글은 404", async () => {
        expect((await post(`/l/${ID}/hide`, { hidden: "yes" })).status).toBe(400);
        golf.getGolfBooking.mockResolvedValueOnce(undefined);
        expect((await post(`/l/${ID}/hide`, { hidden: true })).status).toBe(404);
    });
    it("글쓴이가 없는 옛 글은 알림 없이 처리", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking({ ownerId: null }));
        const r = await post(`/l/${ID}/hide`, { hidden: true });
        expect((await r.json()).data.notified).toBe(false);
        expect(send).not.toHaveBeenCalled();
    });
});

describe("DELETE /:id", () => {
    it("신청자를 먼저 읽고(cascade) 글쓴이 없이 지운다 · 채팅방 · 처리 기록 · 알림(글쓴이 1 + 신청자 2)", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking({ isBlind: true, blindName: "강원 A", listingType: "BOOKING" }));
        const r = await fetch(`${base}/l/${ID}`, { method: "DELETE" });
        expect(r.status).toBe(200);
        expect((await r.json()).data).toEqual({ deleted: true, requesters: 3, closedReports: 2, notified: 3 });
        expect(calls).toEqual(["activeRequesterIds", "deleteGolfBooking"]);
        expect(golf.deleteGolfBooking).toHaveBeenCalledWith(ID);
        expect(chat.deleteRoom).toHaveBeenCalledWith(`listing:${ID}`);
        expect(admin.closeReports).toHaveBeenCalledWith("golf_booking", ID, "actioned");
        const log = (admin.logModerationAction.mock.calls[0] as any[])[0];
        expect(log).toMatchObject({ action: "delete", authorMemberId: OWNER });
        expect(log.note).toContain("파인밸리CC(가명 강원 A)");
        expect(adminLog).toHaveBeenCalledWith(expect.anything(), "golf.listing.delete", expect.objectContaining({ id: ID, requesters: 3 }));
        const to = send.mock.calls.map((c: any[]) => c[0].memberId);
        expect(to).toEqual([OWNER, "m-1", "m-2"]);   // 글쓴이가 신청자 명단에 있어도 한 번만
        const waiting = (send.mock.calls[2] as any[])[0];
        expect(waiting.body.params.course).toBe("강원 A");   // 대기자에게는 가명
        expect((send.mock.calls[1] as any[])[0].body.params.course).toBe("파인밸리CC");   // 확정자는 실명
    });
    it("없는 글은 404 이고 아무것도 지우지 않는다", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(undefined);
        expect((await fetch(`${base}/l/${ID}`, { method: "DELETE" })).status).toBe(404);
        expect(golf.deleteGolfBooking).not.toHaveBeenCalled();
    });
    it("지운 뒤 기록이 실패해도 '지웠다'고 답한다(다시 누르게 하지 않는다)", async () => {
        golf.getGolfBooking.mockResolvedValueOnce(booking());
        admin.logModerationAction.mockRejectedValueOnce(new Error("db down"));
        const r = await fetch(`${base}/l/${ID}`, { method: "DELETE" });
        expect(r.status).toBe(200);
    });
});

describe("소스 지킴", () => {
    const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
    // 주석 줄을 지운 코드 — 경계는 실제 코드 이름으로 잡는다(주석을 경계로 쓰면 안 된다)
    const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

    it("매니저 전화번호는 운영자 목록 코드 어디에도 없다", () => {
        expect(code("server/storage/adminGolfListings.ts")).not.toMatch(/managerPhone|manager_phone/);
        expect(code("server/routes/modules/adminGolf/listings.ts")).not.toMatch(/managerPhone|manager_phone/);
    });

    it("자동 가림 알림(community.ts): 골프 글은 골프 알림, 커뮤니티 안내(당구·이의제기)는 그 밖의 글만", () => {
        const src = code("server/routes/modules/community.ts");
        const i = src.indexOf("if (result.autoBlinded && result.authorId) {");
        expect(i).toBeGreaterThan(-1);
        const block = src.slice(i, src.indexOf('router.post("/appeals"', i));
        expect(block).toContain('if (targetType === "golf_booking") {');
        expect(block).toContain('golfListingNotice("autoHidden", booking)');
        const golfAt = block.indexOf('golfListingNotice("autoHidden"');
        const elseAt = block.indexOf("} else {");
        expect(golfAt).toBeGreaterThan(-1);
        expect(elseAt).toBeGreaterThan(golfAt);
        expect(block.indexOf('category: "BILLIARDS"')).toBeGreaterThan(elseAt);
    });
});
