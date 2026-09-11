import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 없이 발송 흐름만 본다 — storage 와 실제 발송(pushNative)은 가짜로 바꾼다.
const m = vi.hoisted(() => ({
    getMemberById: vi.fn(),
    createNotification: vi.fn(),
    getProfile: vi.fn(),
    updatePushToken: vi.fn(),
    clearPushToken: vi.fn(),
    sendPushNative: vi.fn(),
}));
vi.mock("../storage/index.js", () => ({
    storage: {
        getMemberById: m.getMemberById,
        createNotification: m.createNotification,
        getProfile: m.getProfile,
        updatePushToken: m.updatePushToken,
        users: { clearPushToken: m.clearPushToken },
    },
}));
vi.mock("./pushNative.js", () => ({ sendPushNative: m.sendPushNative }));

import { notificationService, pushOptionsFor } from "./notificationService";

const chat = {
    memberId: "m1", title: "💬 [크루] 새 메시지", body: "철수: 안녕", category: "BILLIARDS", type: "CHAT",
    params: { url: "/crew/c1/chat", crewId: "c1", tab: "chat" },
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    m.getMemberById.mockResolvedValue({ id: "m1", profileId: "p1" });
    m.createNotification.mockResolvedValue(undefined);
    m.getProfile.mockResolvedValue({ id: "p1", pushToken: "fcm:T1" });
    m.clearPushToken.mockResolvedValue(true);
});

describe("푸시 결과 처리", () => {
    it("죽은 토큰은 방금 실패한 그 토큰일 때만 NULL 로 비운다('' 로 덮어쓰지 않는다)", async () => {
        m.sendPushNative.mockResolvedValue({ result: "dead", platform: "fcm", reason: "FCM 404 UNREGISTERED" });
        await notificationService.sendAndSaveNotification(chat);
        expect(m.clearPushToken).toHaveBeenCalledWith("m1", "fcm:T1");
        expect(m.updatePushToken).not.toHaveBeenCalled();
    });

    it("설정 오류·일시 장애·env 없음이면 토큰을 건드리지 않는다", async () => {
        for (const result of ["config", "failed", "noenv"] as const) {
            m.sendPushNative.mockResolvedValueOnce({ result, platform: "fcm", reason: "x" });
            await notificationService.sendAndSaveNotification(chat);
        }
        expect(m.clearPushToken).not.toHaveBeenCalled();
        expect(m.updatePushToken).not.toHaveBeenCalled();
    });

    it("토큰이 없으면(NULL) 알림함에만 남기고 보내지 않는다", async () => {
        m.getProfile.mockResolvedValue({ id: "p1", pushToken: null });
        await notificationService.sendAndSaveNotification(chat);
        expect(m.createNotification).toHaveBeenCalledTimes(1);
        expect(m.sendPushNative).not.toHaveBeenCalled();
    });

    it("크루 채팅은 크루 단위로 바꿔 끼우고, 종목값을 tag 로 쓰지 않는다", async () => {
        m.sendPushNative.mockResolvedValue({ result: "ok", platform: "fcm" });
        await notificationService.sendAndSaveNotification(chat);
        const [token, payload] = m.sendPushNative.mock.calls[0];
        expect(token).toBe("fcm:T1");
        expect(payload).toMatchObject({ url: "/crew/c1/chat", tag: "chat:c1", group: "crew:c1" });
        expect(JSON.stringify(payload)).not.toContain("BILLIARDS");
    });
});

describe("알림 종류별 푸시 옵션", () => {
    it("크루 채팅 말고는 tag(덮어쓰기)가 없다", () => {
        expect(pushOptionsFor("ACTIVITY", { url: "/crew/c1/home", crewId: "c1", tab: "home" }, "/crew/c1/home")).toEqual({ group: "crew:c1" });
        expect(pushOptionsFor("CHALLENGE", { crewId: "c1" }, "/crew/c1/home")).toEqual({ group: "crew:c1" });
        expect(pushOptionsFor("broadcast", { url: "/admin/dashboard" }, "/admin/dashboard")).toEqual({});
        expect(pushOptionsFor("MATCH", undefined, "/history")).toEqual({});
    });

    it("멀티방 방송은 새 안내로 바꿔 끼우고 30분 뒤엔 버린다, 다른 대전 알림은 2시간", () => {
        expect(pushOptionsFor("MATCH", { url: "/online-game?rooms=1" }, "/online-game?rooms=1")).toEqual({ tag: "room-open", ttlSec: 1800 });
        expect(pushOptionsFor("MATCH", { url: "/online-game?match=abc" }, "/online-game?match=abc")).toEqual({ ttlSec: 7200 });
        expect(pushOptionsFor("MATCH", {}, "/online-gamex")).toEqual({});
    });

    it("커뮤니티 글 알림은 글 단위로 묶는다", () => {
        expect(pushOptionsFor("COMMUNITY", { url: "/community/p9" }, "/community/p9")).toEqual({ group: "community:p9" });
        expect(pushOptionsFor("COMMUNITY", { url: "/community" }, "/community")).toEqual({});
    });
});
