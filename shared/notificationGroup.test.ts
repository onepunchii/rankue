import { describe, expect, it } from "vitest";
import { NOTIF_GROUPS, NOTIF_GROUP_TYPES, isRoomBroadcast, notifGroup } from "./notificationGroup";

describe("notifGroup", () => {
    it("MATCH 는 방송(rooms=1)이면 공지, 아니면 내 차례", () => {
        // 옛 행 2,023개 — '멀티방이 열렸어요'
        expect(notifGroup("MATCH", { url: "/online-game?rooms=1" })).toBe("notice");
        // '당신 차례예요'
        expect(notifGroup("MATCH", { url: "/online-game?match=abc" })).toBe("turn");
        expect(notifGroup("MATCH", null)).toBe("turn");
        expect(notifGroup("MATCH", {})).toBe("turn");
    });

    it("모르는 type 은 공지로 떨어진다(던지지 않는다)", () => {
        expect(notifGroup("WHAT_IS_THIS", null)).toBe("notice");
        expect(notifGroup("", null)).toBe("notice");
        expect(notifGroup(null, null)).toBe("notice");
        expect(notifGroup(undefined, undefined)).toBe("notice");
    });

    it("대소문자가 섞여도 같은 결과", () => {
        expect(notifGroup("match", { url: "/online-game?rooms=1" })).toBe("notice");
        expect(notifGroup("match", null)).toBe("turn");
        expect(notifGroup("BROADCAST", null)).toBe("notice");
        expect(notifGroup("broadcast", null)).toBe("notice");
        expect(notifGroup("chat", null)).toBe("chat");
        expect(notifGroup("Post_Comment", null)).toBe("crew");
    });

    it("네 묶음이 실제 발송처 type 을 다 받는다", () => {
        expect(notifGroup("CHALLENGE", null)).toBe("turn");
        expect(notifGroup("FRIEND", null)).toBe("turn");
        expect(notifGroup("JOIN", { url: "/golf/booking-list?view=JOIN" })).toBe("turn");
        expect(notifGroup("POLL", null)).toBe("turn");
        expect(notifGroup("POLL_REMINDER", null)).toBe("turn");
        expect(notifGroup("SETTLEMENT", null)).toBe("turn");
        expect(notifGroup("GOLF_URGENT", null)).toBe("turn");
        expect(notifGroup("ACTIVITY_REMINDER", null)).toBe("turn");
        expect(notifGroup("CHAT", { url: "/chat/crew/abc" })).toBe("chat");
        expect(notifGroup("TOURNAMENT", null)).toBe("crew");
        expect(notifGroup("ACTIVITY", null)).toBe("crew");
        expect(notifGroup("COMMUNITY", null)).toBe("crew");
        expect(notifGroup("CREW", null)).toBe("crew");
        expect(notifGroup("POST_COMMENT", null)).toBe("crew");
        expect(notifGroup("SYSTEM", null)).toBe("crew");
        expect(notifGroup("NOTICE", null)).toBe("notice");
        expect(notifGroup("PLAYER_RANK", null)).toBe("notice");
        expect(notifGroup("MODERATION", null)).toBe("notice");
        expect(notifGroup("suggestion_new", null)).toBe("notice");
        expect(notifGroup("suggestion_reply", null)).toBe("notice");
        expect(notifGroup("partner_approved", null)).toBe("notice");
    });

    it("params 가 무엇이든 와도 죽지 않는다(jsonb)", () => {
        expect(notifGroup("MATCH", '{"url":"/online-game?rooms=1"}')).toBe("notice");
        expect(notifGroup("MATCH", "/online-game?rooms=1")).toBe("notice");
        expect(notifGroup("MATCH", "{not json")).toBe("turn");
        expect(notifGroup("MATCH", [1, 2, 3])).toBe("turn");
        expect(notifGroup("MATCH", 42)).toBe("turn");
        expect(notifGroup("MATCH", { url: 7 })).toBe("turn");
    });
});

describe("isRoomBroadcast", () => {
    it("쿼리의 rooms=1 만 방송이다", () => {
        expect(isRoomBroadcast({ url: "/online-game?rooms=1" })).toBe(true);
        expect(isRoomBroadcast({ url: "/online-game?rooms=1&room=abc" })).toBe(true);
        expect(isRoomBroadcast({ url: "/online-game?tab=x&rooms=1#top" })).toBe(true);
        expect(isRoomBroadcast({ url: "/online-game" })).toBe(false);
        expect(isRoomBroadcast({ url: "/online-game?rooms=0" })).toBe(false);
        // 값이 아니라 키 이름이 걸리는 일이 없게
        expect(isRoomBroadcast({ url: "/online-game?mushrooms=1" })).toBe(false);
        expect(isRoomBroadcast({ url: "/rooms=1" })).toBe(false);
        expect(isRoomBroadcast(null)).toBe(false);
        expect(isRoomBroadcast(undefined)).toBe(false);
    });
});

describe("NOTIF_GROUP_TYPES", () => {
    it("묶음은 넷이고 한 type 이 두 묶음에 들어가지 않는다", () => {
        expect(NOTIF_GROUPS).toEqual(["turn", "chat", "crew", "notice"]);
        const all = NOTIF_GROUPS.flatMap((g) => NOTIF_GROUP_TYPES[g].map((t) => t.toUpperCase()));
        expect(new Set(all).size).toBe(all.length);
    });

    it("목록에 적힌 type 은 적힌 묶음으로 간다", () => {
        for (const g of NOTIF_GROUPS) {
            for (const t of NOTIF_GROUP_TYPES[g]) {
                expect(notifGroup(t, null)).toBe(g);
            }
        }
    });
});
