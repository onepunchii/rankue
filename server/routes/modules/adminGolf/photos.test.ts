// 골프 관리 · 라운드 사진 라우터(2026-10-01) — 입력 검사와 '신고 큐와 같은 실행기'로 넘기는지만 본다. DB·알림은 가짜.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const m = vi.hoisted(() => ({ apply: vi.fn(), get: vi.fn(), list: vi.fn(), log: vi.fn() }));
vi.mock("../../../services/moderation.js", () => ({ applyModerationAction: m.apply }));
vi.mock("../../../storage/index.js", () => ({ storage: { golfPhotos: { get: m.get } } }));
vi.mock("../../../storage/adminGolfPhotos.js", () => ({ listAdminGolfPhotos: m.list, parsePhotoListQuery: (q: unknown) => ({ parsed: q }) }));
vi.mock("../../../middleware/adminAuth.js", () => ({ adminLog: m.log }));

import router from "./photos";

const ID = "555c77f1-54e8-4d07-a309-d514ba959693";
let base = "";
let server: ReturnType<express.Express["listen"]>;

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.signedCookies = { hiq_partner_auth: "admin-profile" }; next(); });
    app.use("/photos", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/photos`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    m.get.mockResolvedValue({ id: ID, sessionId: "round-1", memberId: "a1" });
    m.apply.mockResolvedValue({ ok: true, closed: 1 });
});

const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as any, cache: res.headers.get("cache-control") };
};

describe("GET / 목록", () => {
    it("주소창 조건을 그대로 넘기고, 캐시에 남기지 않는다", async () => {
        m.list.mockResolvedValue({ items: [], counts: { public: 0, hidden: 0, appealed: 0, all: 0 }, total: 0, hasMore: false, offset: 0, limit: 48 });
        const r = await call("GET", "/?filter=appealed&course=%EB%8F%99%EA%B0%95");
        expect(r.status).toBe(200);
        expect(r.cache).toBe("no-store");
        expect(m.list).toHaveBeenCalledWith({ parsed: { filter: "appealed", course: "동강" } });
    });
});

describe("쓰기 — 신고 큐와 같은 실행기(applyModerationAction)로", () => {
    it("가리기: golf_photo · blind · 신고 없이도(allowUnreported) · 처리한 운영자를 쿠키에서", async () => {
        const r = await call("POST", `/${ID}/hide`, { hidden: true });
        expect(r.status).toBe(200);
        expect(r.json.data).toEqual({ id: ID, action: "blind", closedReports: 1 });
        expect(m.apply).toHaveBeenCalledWith({
            targetType: "golf_photo", targetId: ID, action: "blind", adminProfileId: "admin-profile", allowUnreported: true, note: null,
        });
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf_photo_hide", expect.objectContaining({ id: ID, action: "blind" }));
    });
    it("다시 보이기는 unblind", async () => {
        await call("POST", `/${ID}/hide`, { hidden: false });
        expect(m.apply.mock.calls[0][0].action).toBe("unblind");
    });
    it("hidden 이 참/거짓이 아니면 400", async () => {
        expect((await call("POST", `/${ID}/hide`, { hidden: "yes" })).status).toBe(400);
        expect(m.apply).not.toHaveBeenCalled();
    });
    it("이의제기 판정: approve/reject 만, 메모는 다듬어 처리 기록으로", async () => {
        await call("POST", `/${ID}/appeal`, { decision: "approve", note: "  얼굴이 작게 나옴  " });
        expect(m.apply).toHaveBeenCalledWith(expect.objectContaining({ action: "appeal_approve", note: "얼굴이 작게 나옴", allowUnreported: true }));
        await call("POST", `/${ID}/appeal`, { decision: "reject" });
        expect(m.apply).toHaveBeenLastCalledWith(expect.objectContaining({ action: "appeal_reject", note: null }));
        expect((await call("POST", `/${ID}/appeal`, { decision: "maybe" })).status).toBe(400);
        expect((await call("POST", `/${ID}/appeal`, { decision: "reject", note: 5 })).status).toBe(400);
        expect(m.apply).toHaveBeenCalledTimes(2);
    });
    it("지우기는 delete", async () => {
        const r = await call("DELETE", `/${ID}`);
        expect(r.status).toBe(200);
        expect(m.apply.mock.calls[0][0]).toMatchObject({ action: "delete", targetType: "golf_photo" });
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf_photo_delete", expect.anything());
    });
    it("주소가 uuid 가 아니거나 이미 없는 사진이면 404 — 실행기를 부르지 않는다", async () => {
        expect((await call("POST", "/not-a-uuid/hide", { hidden: true })).status).toBe(404);
        m.get.mockResolvedValue(null);
        const r = await call("DELETE", `/${ID}`);
        expect(r.status).toBe(404);
        expect(r.json.message).toContain("사진을 찾을 수 없습니다");
        expect(m.apply).not.toHaveBeenCalled();
    });
    it("실행기가 거절하면(최신 상태로 다시 보니 할 수 없는 조치) 그 상태·문장 그대로, 감사 로그는 남기지 않는다", async () => {
        m.apply.mockResolvedValue({ ok: false, status: 409, message: "지금 할 수 없는 조치입니다. 목록을 새로고침해 주세요." });
        const r = await call("POST", `/${ID}/hide`, { hidden: false });
        expect(r.status).toBe(409);
        expect(r.json.message).toBe("지금 할 수 없는 조치입니다. 목록을 새로고침해 주세요.");
        expect(m.log).not.toHaveBeenCalled();
    });
});
