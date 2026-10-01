import { describe, it, expect } from "vitest";
import { fullPrefs, isPushAllowed, normalizePrefs, prefKeyFor, prefsForSport, PREF_KEYS } from "./notificationPrefs.js";

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
    it("골프는 골프 칸들 중에서 성격으로 — 당구 칸으로는 가지 않는다(2026-10-01 오너)", () => {
        expect(prefKeyFor("GOLF", "JOIN")).toBe("golf_join");
        expect(prefKeyFor("GOLF", "GOLF_URGENT")).toBe("golf_urgent");
        expect(prefKeyFor("GOLF", "GOLF_URGENT", { watchSlug: "남서울cc", url: "/golf/course/x" })).toBe("golf_watch");
        expect(prefKeyFor("GOLF", "CHAT")).toBe("golf_chat");
        expect(prefKeyFor("GOLF", "ACTIVITY_REMINDER")).toBe("golf_crew");   // 당구였다면 crew
        expect(prefKeyFor("GOLF", "POLL_REMINDER")).toBe("golf_crew");
        expect(prefKeyFor("GOLF", "PLAYER_RANK")).toBe("golf_players");
        expect(prefKeyFor("GOLF", "MATCH")).toBe("golf_notice");            // 당구였다면 game
        expect(prefKeyFor("GOLF", "FRIEND")).toBe("golf_notice");
        expect(prefKeyFor("BILLIARDS", "ACTIVITY_REMINDER")).toBe("crew");
    });
    it("관심 선수 순위 변동은 players 로(2026-09-13 오너 제안 7번)", () => {
        expect(prefKeyFor("BILLIARDS", "PLAYER_RANK")).toBe("players");
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
    it("화면에는 모든 칸이 온다", () => {
        expect(fullPrefs({ rooms: false })).toEqual({
            sim: true, rooms: false, crew: true, game: true, players: true, notice: true,
            golf_join: true, golf_urgent: true, golf_watch: true, golf_chat: true, golf_crew: true, golf_players: true, golf_notice: true,
        });
    });
    it("종목으로 묶어 준다 — 골프를 성격별로 쪼갤 자리다", () => {
        expect(prefsForSport("BILLIARDS").map((p) => p.key)).toEqual(["sim", "rooms", "crew", "game", "players", "notice"]);
        expect(prefsForSport("GOLF").map((p) => p.key)).toEqual(["golf_join", "golf_urgent", "golf_watch", "golf_chat", "golf_crew", "golf_players", "golf_notice"]);
    });
});

describe("옛 골프 한 칸(golf) 이어받기 — 2026-10-01 성격별로 쪼갬", () => {
    it("예전에 골프를 통째로 껐으면 새 칸도 모두 꺼진 채다", () => {
        const old = { golf: false };
        for (const p of prefsForSport("GOLF")) expect(isPushAllowed(old, p.key)).toBe(false);
        expect(isPushAllowed(old, "golf")).toBe(false);          // 옛 pref:"golf" 로 보내는 곳
        expect(isPushAllowed(old, "crew")).toBe(true);           // 당구 칸은 그대로
        expect(Object.values(fullPrefs(old)).filter((v) => !v)).toHaveLength(7);
    });
    it("새 칸을 켠 값이 이긴다 — 그 칸만 켜진다", () => {
        const p = { golf: false, golf_join: true };
        expect(isPushAllowed(p, "golf_join")).toBe(true);
        expect(isPushAllowed(p, "golf_urgent")).toBe(false);
    });
    it("한 칸만 끄면 그 칸만 꺼진다", () => {
        const p = { golf_urgent: false };
        expect(isPushAllowed(p, "golf_urgent")).toBe(false);
        expect(isPushAllowed(p, "golf_watch")).toBe(true);
        expect(isPushAllowed(p, "golf")).toBe(true);
    });
    it("저장 값에서 옛 golf 키는 읽되 화면 목록엔 없다", () => {
        expect(normalizePrefs({ golf: false, golf_chat: false })).toEqual({ golf: false, golf_chat: false });
        expect("golf" in fullPrefs({ golf: false })).toBe(false);
    });
});
