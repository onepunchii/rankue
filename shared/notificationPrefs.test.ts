import { describe, it, expect } from "vitest";
import { fullPrefs, isPushAllowed, normalizePrefs, prefKeyFor, PREF_KEYS } from "./notificationPrefs.js";

describe("prefKeyFor", () => {
    it("온라인게임은 내 대전과 방 방송을 가른다", () => {
        expect(prefKeyFor("BILLIARDS", "SIM_MATCH")).toBe("sim");
        expect(prefKeyFor("BILLIARDS", "SIM_ROOM")).toBe("rooms");
    });
    it("크루 것들은 crew 로", () => {
        for (const t of ["TOURNAMENT", "ACTIVITY", "POLL_REMINDER", "SETTLEMENT", "CHAT", "POST_COMMENT", "COMMUNITY"]) {
            expect(prefKeyFor("BILLIARDS", t)).toBe("crew");
        }
    });
    it("점수판 경기·친구는 game 으로", () => {
        expect(prefKeyFor("BILLIARDS", "MATCH")).toBe("game");
        expect(prefKeyFor("BILLIARDS", "FRIEND")).toBe("game");
    });
    it("모르는 것은 공지로 본다 — 끌 수 있는 쪽이 기본", () => {
        expect(prefKeyFor("admin", "broadcast")).toBe("notice");
        expect(prefKeyFor(null, null)).toBe("notice");
    });
});

describe("isPushAllowed", () => {
    it("설정이 없으면 전부 켜짐", () => {
        for (const k of PREF_KEYS) expect(isPushAllowed(null, k)).toBe(true);
        expect(isPushAllowed({}, "rooms")).toBe(true);
    });
    it("끈 것만 막는다", () => {
        expect(isPushAllowed({ rooms: false }, "rooms")).toBe(false);
        expect(isPushAllowed({ rooms: false }, "sim")).toBe(true);
    });
    it("망가진 값은 켜짐으로 본다", () => {
        expect(isPushAllowed("어쩌구", "sim")).toBe(true);
        expect(isPushAllowed([1, 2], "sim")).toBe(true);
        expect(isPushAllowed({ sim: "no" }, "sim")).toBe(true);
    });
});

describe("normalizePrefs / fullPrefs", () => {
    it("모르는 키는 버린다", () => {
        expect(normalizePrefs({ rooms: false, 해킹: true })).toEqual({ rooms: false });
    });
    it("화면에는 다섯 칸이 모두 온다", () => {
        expect(fullPrefs({ rooms: false })).toEqual({ sim: true, rooms: false, crew: true, game: true, notice: true });
    });
});
